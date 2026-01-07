require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const rulesManager = require('./lib/rulesManager');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const heuristicsManager = require('./lib/heuristicsManager');

const app = express();
const PORT = process.env.PORT || 3001;

// ========== DATABASE SETUP ==========
const db = new sqlite3.Database(process.env.DATABASE_URL || './guardianlink.db');

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    extension_token TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  )`);

  // Scan history
  db.run(`CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    scan_result TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Extension sessions (for real-time sync)
  db.run(`CREATE TABLE IF NOT EXISTS extension_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    extension_token TEXT UNIQUE,
    device_info TEXT,
    last_activity DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// ========== MIDDLEWARE ==========
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3002",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3002"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));
app.use(express.json());

// Load rules (whitelist / blacklist) into memory
try {
  rulesManager.load();
  console.log(`Rules loaded: ${rulesManager.count()} entries`);
} catch (err) {
  console.error('Failed to load rules:', err);
}

// Load heuristic rules
try {
  heuristicsManager.load();
  console.log(`Heuristics loaded: ${heuristicsManager.getAll().rules.length} rules`);
} catch (err) {
  console.error('Failed to load heuristics:', err);
}

// Rate limiting middleware
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.RATE_LIMIT || 100,
  message: 'Too many requests'
});
app.use('/api/', limiter);

// JWT verification middleware
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'development_secret');
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Extension token verification
function verifyExtensionToken(req, res, next) {
  const token = req.headers['x-extension-token'];
  
  if (!token) {
    return res.status(401).json({ error: 'No extension token' });
  }
  
  db.get('SELECT user_id FROM extension_sessions WHERE extension_token = ?', [token], (err, row) => {
    if (err || !row) {
      return res.status(401).json({ error: 'Invalid extension token' });
    }
    req.userId = row.user_id;
    next();
  });
}

// ========== AUTHENTICATION ENDPOINTS ==========

// Register user
app.post('/api/auth/register', async (req, res) => {
  const { email, username, password } = req.body;
  
  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Email, username, and password required' });
  }
  
  const userId = crypto.randomUUID();
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  
  db.run(
    'INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)',
    [userId, email, username, passwordHash],
    function(err) {
      if (err) {
        return res.status(400).json({ error: 'User already exists' });
      }
      
      const token = jwt.sign({ id: userId, email }, process.env.JWT_SECRET || 'development_secret');
      res.json({ token, userId, email, username });
    }
  );
});

// ========== HEALTH CHECK ==========

// Health check endpoint for frontend
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0',
    components: {
      database: 'connected',
      cache: 'enabled'
    }
  });
});

// ========== AUTHENTICATION ENDPOINTS ==========

// Login user
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  
  db.get(
    'SELECT id, email, username FROM users WHERE email = ? AND password_hash = ?',
    [email, passwordHash],
    (err, row) => {
      if (err || !row) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Update last login
      db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
      
      const token = jwt.sign({ id: row.id, email: row.email }, process.env.JWT_SECRET || 'development_secret');
      res.json({ token, userId: row.id, email: row.email, username: row.username });
    }
  );
});

// ========== EXTENSION ENDPOINTS ==========

// Connect extension to user account (after user logs in on website)
app.post('/api/extension/register', verifyToken, (req, res) => {
  const extensionToken = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const { deviceInfo } = req.body;
  
  db.run(
    'INSERT INTO extension_sessions (id, user_id, extension_token, device_info, last_activity) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [sessionId, req.userId, extensionToken, JSON.stringify(deviceInfo)],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to register extension' });
      }
      
      // Also store in users table for quick lookup
      db.run('UPDATE users SET extension_token = ? WHERE id = ?', [extensionToken, req.userId]);
      
      res.json({
        extensionToken,
        sessionId,
        message: 'Extension registered successfully'
      });
    }
  );
});

// Verify extension is connected to user
app.get('/api/extension/verify', verifyExtensionToken, (req, res) => {
  db.get('SELECT email, username FROM users WHERE id = ?', [req.userId], (err, row) => {
    if (err || !row) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    res.json({
      authenticated: true,
      userId: req.userId,
      email: row.email,
      username: row.username
    });
  });
});

// ========== SCANNING ENDPOINTS ==========

// VirusTotal URL scan
async function scanWithVirusTotal(url) {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  
  try {
    // First, submit the URL for scanning
    const submitResponse = await fetch('https://www.virustotal.com/api/v3/urls', {
      method: 'POST',
      headers: {
        'x-apikey': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `url=${encodeURIComponent(url)}`
    });
    
    const submitData = await submitResponse.json();
    
    if (submitData.error) {
      console.error('VirusTotal submit error:', submitData.error);
      return { error: submitData.error.message, score: 0, maxScore: 25 };
    }
    
    // Get the analysis ID
    const analysisId = submitData.data?.id;
    
    if (!analysisId) {
      return { error: 'No analysis ID returned', score: 0, maxScore: 25 };
    }
    
    let analysisData;
    let attempts = 0;

    while (true) {
      const res = await fetch(
        `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
        { headers: { 'x-apikey': apiKey } }
      );

      analysisData = await res.json();
      const status = analysisData?.data?.attributes?.status;

      if (status === 'completed') break;

      await new Promise(r => setTimeout(r, 3000));
      attempts++;
    }

    if (!analysisData || analysisData.data?.attributes?.status !== 'completed') {
      return {
        error: 'VirusTotal analysis timeout',
        score: 0,
        maxScore: 25,
        status: 'danger'
      };
    }
    
    const attributes = analysisData.data?.attributes || {};
    const stats = attributes.stats || {};
    const results = attributes.results || {};

    const isMaliciousByAnyAV = Object.values(results).some(
      engine => engine.category === 'malicious'
    );

    if (isMaliciousByAnyAV) {
      return {
        malicious: stats.malicious || 1,
        suspicious: stats.suspicious || 0,
        harmless: stats.harmless || 0,
        undetected: stats.undetected || 0,
        total:
          (stats.malicious || 0) +
          (stats.suspicious || 0) +
          (stats.harmless || 0) +
          (stats.undetected || 0),
        score: 0,
        maxScore: 25,
        status: 'danger',
        mandate: 'malicious'
      };
    }

    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const harmless = stats.harmless || 0;
    const undetected = stats.undetected || 0;
    const total = malicious + suspicious + harmless + undetected;
    
    // Calculate score (higher is better)
    let score = 25;
    if (malicious > 0) {
      score = Math.max(0, 25 - (malicious * 5));
    } else if (suspicious > 0) {
      score = Math.max(10, 25 - (suspicious * 3));
    }
    
    return {
      malicious,
      suspicious,
      harmless,
      undetected,
      total,
      score,
      maxScore: 25,
      status: malicious > 0 ? 'danger' : suspicious > 0 ? 'warning' : 'safe'
    };
  } catch (error) {
    console.error('VirusTotal error:', error);
    return { error: error.message, score: 0, maxScore: 25 };
  }
}

// AbuseIPDB check (for domain IP)
async function checkWithAbuseIPDB(domain) {
  const apiKey = process.env.ABUSEIPDB_API_KEY;
  
  try {
    // First resolve domain to IP using DNS lookup
    const dns = require('dns').promises;
    let ip;
    
    try {
      const hostname = new URL(domain.startsWith('http') ? domain : `https://${domain}`).hostname;
      const addresses = await dns.lookup(hostname);
      ip = addresses.address;
    } catch (dnsError) {
      console.error('DNS lookup error:', dnsError);
      return { error: 'Could not resolve domain', score: 15, maxScore: 15, status: 'warning' };
    }
    
    const response = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`, {
      headers: {
        'Key': apiKey,
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.errors) {
      console.error('AbuseIPDB error:', data.errors);
      return { error: data.errors[0]?.detail, score: 0, maxScore: 15 };
    }
    
    const abuseScore = data.data?.abuseConfidenceScore || 0;
    const totalReports = data.data?.totalReports || 0;
    
    // Calculate our score (higher is better, so invert abuse score)
    let score = Math.round(15 * (1 - abuseScore / 100));
    
    return {
      ip,
      abuseConfidenceScore: abuseScore,
      totalReports,
      countryCode: data.data?.countryCode,
      isp: data.data?.isp,
      score,
      maxScore: 15,
      status: abuseScore > 50 ? 'danger' : abuseScore > 20 ? 'warning' : 'safe'
    };
  } catch (error) {
    console.error('AbuseIPDB error:', error);
    return { error: error.message, score: 0, maxScore: 15 };
  }
}

// SSL Certificate check
async function checkSSL(url) {
  try {
    const https = require('https');
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    
    if (urlObj.protocol !== 'https:') {
      return { 
        valid: false, 
        error: 'Not using HTTPS', 
        score: 0, 
        maxScore: 15,
        status: 'danger'
      };
    }
    
    return new Promise((resolve) => {
      const req = https.request({
        hostname: urlObj.hostname,
        port: 443,
        method: 'HEAD',
        timeout: 10000
      }, (res) => {
        const cert = res.socket.getPeerCertificate();
        
        if (!cert || Object.keys(cert).length === 0) {
          resolve({ 
            valid: false, 
            error: 'No certificate found', 
            score: 0, 
            maxScore: 15,
            status: 'danger'
          });
          return;
        }
        
        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const isValid = now >= validFrom && now <= validTo;
        const daysUntilExpiry = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));
        
        let score = 15;
        let status = 'safe';
        
        if (!isValid) {
          score = 0;
          status = 'danger';
        } else if (daysUntilExpiry < 30) {
          score = 10;
          status = 'warning';
        }
        
        resolve({
          valid: isValid,
          issuer: cert.issuer?.O || 'Unknown',
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          daysUntilExpiry,
          score,
          maxScore: 15,
          status
        });
      });
      
      req.on('error', (error) => {
        resolve({ 
          valid: false, 
          error: error.message, 
          score: 0, 
          maxScore: 15,
          status: 'danger'
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ 
          valid: false, 
          error: 'Connection timeout', 
          score: 5, 
          maxScore: 15,
          status: 'warning'
        });
      });
      
      req.end();
    });
  } catch (error) {
    return { 
      valid: false, 
      error: error.message, 
      score: 0, 
      maxScore: 15,
      status: 'danger'
    };
  }
}

// Domain age check using WHOIS-like heuristics
async function checkDomainAge(url) {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const domain = urlObj.hostname;

    // If hostname is an IP literal, treat as highly suspicious
    const isIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(domain) || /^\[[0-9a-f:]+\]$/.test(domain);
    if (isIp) {
      return {
        domain,
        score: 0,
        maxScore: 10,
        status: 'danger',
        warnings: ['Hostname is an IP address literal - suspicious']
      };
    }

    // We'll use a simple heuristic based on domain characteristics
    // In production, you'd want to use a WHOIS API
    const suspiciousPatterns = [
      /\d{4,}/, // Long numbers
      /-{2,}/, // Multiple hyphens
      /[a-z]{20,}/, // Very long words
      /\.(tk|ml|ga|cf|gq)$/i, // Free TLD domains often used for phishing
    ];

    let score = 10;
    let status = 'safe';
    const warnings = [];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(domain)) {
        score -= 3;
        warnings.push(`Suspicious pattern detected: ${pattern.source}`);
      }
    }

    // If WHOIS data available via fetchWhois elsewhere, prefer that
    // The caller may pass a whois object into heuristicsManager for domain-age checks.

    if (score < 7) status = 'warning';
    if (score < 4) status = 'danger';

    return {
      domain,
      score: Math.max(0, score),
      maxScore: 10,
      status,
      warnings
    };
  } catch (error) {
    return { error: error.message, score: 5, maxScore: 10, status: 'warning' };
  }
}

// WHOIS lookup (optional -- requires WHOIS_API_KEY in .env)
async function fetchWhois(url) {
  const apiKey = process.env.WHOIS_API_KEY;
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const domain = urlObj.hostname;
    if (!apiKey) return { error: 'WHOIS API key not configured' };

    const whoisUrl = `https://www.whoisxmlapi.com/whoisserver/WhoisService?domainName=${encodeURIComponent(domain)}&apiKey=${apiKey}&outputFormat=JSON`;
    const res = await fetch(whoisUrl, { timeout: 10000 });
    const data = await res.json();

    const parsed = data.WhoisRecord || {};
    const parsedDates = parsed.registryDataParsed || parsed.registryData || {};
    const created = parsedDates.createdDateNormalized || parsed.createdDate || null;
    let createdTs = null;
    if (created) {
      const d = new Date(created);
      if (!isNaN(d)) createdTs = d.getTime();
    }

    return {
      domain,
      raw: data,
      createdDate: created,
      createdDateTimestamp: createdTs
    };
  } catch (error) {
    console.error('WHOIS error:', error.message);
    return { error: error.message };
  }
}

// Content analysis
async function analyzeContent(url) {
  try {
    const response = await fetch(url.startsWith('http') ? url : `https://${url}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GuardianLink/1.0; Security Scanner)'
      }
    });

    const html = await response.text();
    const lowerHtml = html.toLowerCase();

    let score = 15;
    let status = 'safe';
    const findings = [];

    // Expanded phishing indicators
    const phishingKeywords = [
      'verify your account',
      'confirm your identity',
      'suspended account',
      'unusual activity',
      'update payment',
      'click here immediately',
      'login',
      'sign in',
      'username',
      'password',
      'bank'
    ];

    for (const keyword of phishingKeywords) {
      if (lowerHtml.includes(keyword)) {
        score -= 3;
        findings.push(`Suspicious phrase: "${keyword}"`);
      }
    }

    // Detect explicit password inputs
    if (/<input[^>]*type=["']?password["']?/i.test(html)) {
      score -= 5;
      findings.push('Password input detected');
    }

    // Detect meta refresh redirect
    if (/<meta[^>]*http-equiv=["']?refresh["']?/i.test(html)) {
      score -= 3;
      findings.push('Meta refresh redirect detected');
    }

    // Detect JS redirects
    if (/(window\.location|document\.location|location\.href|location.replace|location.assign)/i.test(html)) {
      score -= 3;
      findings.push('JavaScript redirect detected');
    }

    // Detect obfuscated script patterns (simple heuristics)
    if (/(eval\(|unescape\(|atob\(|btoa\()/.test(html) || /%[0-9a-f]{2}/i.test(html)) {
      score -= 2;
      findings.push('Potential obfuscated content detected');
    }

    // Check for hidden forms (improved)
    if (/<input[^>]*type=["']?hidden["']?/i.test(html) && /password/i.test(html)) {
      score -= 4;
      findings.push('Hidden password-related field detected');
    }

    // Check for external form submissions (keeps prior behaviour)
    const formMatch = html.match(/<form[^>]*action=["']([^"']+)["']/gi);
    if (formMatch) {
      const urlHost = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
      for (const form of formMatch) {
        const actionMatch = form.match(/action=["']([^"']+)["']/i);
        if (actionMatch && actionMatch[1].startsWith('http')) {
          try {
            const formHost = new URL(actionMatch[1]).hostname;
            if (formHost !== urlHost) {
              score -= 4;
              findings.push(`External form submission to: ${formHost}`);
            }
          } catch {}
        }
      }
    }

    if (score < 10) status = 'warning';
    if (score < 5) status = 'danger';

    return {
      score: Math.max(0, score),
      maxScore: 15,
      status,
      findings
    };
  } catch (error) {
    return { error: error.message, score: 10, maxScore: 15, status: 'warning' };
  }
}

// Google Safe Browsing check
async function checkWithGoogleSafeBrowsing(url) {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ Google Safe Browsing API key not configured');
    return { 
      error: 'API key not configured', 
      score: 10, 
      maxScore: 15,
      status: 'warning',
      available: false 
    };
  }
  
  try {
    const response = await fetch('https://safebrowsing.googleapis.com/v4/threatMatches:find?key=' + apiKey, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client: {
          clientId: 'guardianlink',
          clientVersion: '2.0'
        },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['WINDOWS', 'LINUX', 'MAC', 'ALL_PLATFORMS'],
          threatEntries: [
            { url: url }
          ]
        }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('Google Safe Browsing error:', data.error);
      return { 
        error: data.error.message, 
        score: 10, 
        maxScore: 15,
        status: 'warning'
      };
    }

    // If matches found, it's dangerous
    if (data.matches && data.matches.length > 0) {
      const threats = data.matches.map(m => m.threatType).join(', ');
      return {
        safe: false,
        threats: threats,
        matchCount: data.matches.length,
        score: 0,
        maxScore: 15,
        status: 'danger',
        details: data.matches
      };
    }

    // No threats found
    return {
      safe: true,
      threats: 'none',
      matchCount: 0,
      score: 15,
      maxScore: 15,
      status: 'safe'
    };
  } catch (error) {
    console.error('Google Safe Browsing check error:', error);
    return { 
      error: error.message, 
      score: 10, 
      maxScore: 15,
      status: 'warning'
    };
  }
}

// Redirect chain analysis
async function analyzeRedirects(url) {
  try {
    const redirects = [];
    let currentUrl = url.startsWith('http') ? url : `https://${url}`;
    let maxRedirects = 10;

    while (maxRedirects > 0) {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        timeout: 5000
      });

      const location = response.headers.get('location');
      if (location && (response.status >= 300 && response.status < 400)) {
        redirects.push({
          from: currentUrl,
          to: location,
          status: response.status
        });
        currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href;
        maxRedirects--;
      } else {
        break;
      }
    }

    let score = 10;
    let status = 'safe';

    if (redirects.length > 3) {
      score -= 3;
      status = 'warning';
    }

    if (redirects.length > 5) {
      score -= 4;
      status = 'danger';
    }

    // Check for suspicious redirect destinations and IP destinations
    for (const redirect of redirects) {
      try {
        const toHost = new URL(redirect.to).hostname;
        if (toHost.includes('bit.ly') || toHost.includes('tinyurl') || toHost.includes('t.co')) {
          score -= 2;
          redirect.suspicious = 'known shortener';
        }
        if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(toHost) || /^\[[0-9a-f:]+\]$/.test(toHost)) {
          score -= 3;
          redirect.suspicious = 'redirects to IP host';
        }
      } catch {}
    }

    // Fetch final destination content to detect meta/JS redirects not using Location header
    try {
      const finalResp = await fetch(currentUrl, { timeout: 8000, redirect: 'follow' });
      const finalHtml = await finalResp.text();
      if (/<meta[^>]*http-equiv=["']?refresh["']?/i.test(finalHtml)) {
        score -= 3;
      }
      if (/(window\.location|document\.location|location\.href|location.replace|location.assign)/i.test(finalHtml)) {
        score -= 3;
      }
    } catch (e) {
      // ignore final content issues
    }

    if (score < 7) status = 'warning';
    if (score < 4) status = 'danger';

    return {
      redirectCount: redirects.length,
      redirects,
      score: Math.max(0, score),
      maxScore: 10,
      status
    };
  } catch (error) {
    return { error: error.message, score: 5, maxScore: 10, status: 'warning' };
  }
}

// Headers security check
async function checkSecurityHeaders(url) {
  try {
    const response = await fetch(url.startsWith('http') ? url : `https://${url}`, {
      timeout: 10000
    });
    
    const headers = response.headers;
    let score = 0;
    const maxScore = 10;
    const findings = [];
    
    const securityHeaders = {
      'strict-transport-security': 2,
      'x-content-type-options': 1,
      'x-frame-options': 1,
      'x-xss-protection': 1,
      'content-security-policy': 3,
      'referrer-policy': 1,
      'permissions-policy': 1
    };
    
    for (const [header, points] of Object.entries(securityHeaders)) {
      if (headers.get(header)) {
        score += points;
        findings.push(`✓ ${header}`);
      } else {
        findings.push(`✗ Missing ${header}`);
      }
    }
    
    score = Math.min(score, maxScore);
    let status = 'safe';
    if (score < 7) status = 'warning';
    if (score < 4) status = 'danger';
    
    return {
      score,
      maxScore,
      status,
      findings
    };
  } catch (error) {
    return { error: error.message, score: 0, maxScore: 10, status: 'warning' };
  }
}

// Main scan endpoint (with user auth)
app.post('/api/scan', verifyToken, async (req, res) => {
  const { url, source } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Phase 1: Whitelist check (fast)
  const whitelistMatch = rulesManager.isWhitelisted(url);
  if (whitelistMatch) {
    console.log(`Whitelist hit for ${url} (source: ${whitelistMatch.source || 'local'}) - skipping checks`);
    const results = {
      url,
      timestamp: new Date().toISOString(),
      phases: {
        whitelist: { name: 'Whitelist Check', score: 100, maxScore: 100, status: 'safe', reason: 'Whitelisted domain', evidence: whitelistMatch }
      },
      totalScore: 100,
      maxTotalScore: 100,
      percentage: 100,
      overallStatus: 'safe'
    };
    return res.json(results);
  }

  // Phase 2: Local blacklist (fast)
  const blacklistMatch = rulesManager.isBlacklisted(url);
  if (blacklistMatch) {
    console.log(`Local blacklist hit for ${url} (source: ${blacklistMatch.source || 'local'}) - blocked`);
    const results = {
      url,
      timestamp: new Date().toISOString(),
      phases: {
        localBlacklist: { name: 'Local Blacklist', score: 0, maxScore: 100, status: 'danger', reason: 'Blacklisted', evidence: blacklistMatch }
      },
      totalScore: 0,
      maxTotalScore: 100,
      percentage: 0,
      overallStatus: 'danger'
    };
    return res.json(results);
  }
  
  const scanId = crypto.randomUUID();
  
  console.log(`\n🔍 Scan ${scanId} started for: ${url} (from ${source || 'website'})`);
  
  // Store scan as pending
  db.run(
    'INSERT INTO scans (id, user_id, url, status) VALUES (?, ?, ?, ?)',
    [scanId, req.userId, url, 'pending'],
    (err) => {
      if (err) console.error('Failed to log scan:', err);
    }
  );
  
  const results = {
    scanId,
    url,
    timestamp: new Date().toISOString(),
    phases: {},
    source: source || 'website'
  };
  
try {
  const [
    virusTotal,
    abuseIPDB,
    ssl,
    domainAge,
    content,
    redirects,
    securityHeaders,
    whois,
    googleSafeBrowsing
  ] = await Promise.all([
    scanWithVirusTotal(url),
    checkWithAbuseIPDB(url),
    checkSSL(url),
    checkDomainAge(url),
    analyzeContent(url),
    analyzeRedirects(url),
    checkSecurityHeaders(url),
    fetchWhois(url),
    checkWithGoogleSafeBrowsing(url)
  ]);

  results.phases = {
    virusTotal: { name: 'VirusTotal Analysis', ...virusTotal },
    abuseIPDB: { name: 'AbuseIPDB Check', ...abuseIPDB },
    ssl: { name: 'SSL Certificate', ...ssl },
    domainAge: { name: 'Domain Analysis', ...domainAge },
    content: { name: 'Content Analysis', ...content },
    redirects: { name: 'Redirect Analysis', ...redirects },
    securityHeaders: { name: 'Security Headers', ...securityHeaders },
    whois: { name: 'WHOIS Lookup', ...whois },
    googleSafeBrowsing: { name: 'Google Safe Browsing', ...googleSafeBrowsing }
  };

  
  // Add WHOIS data (if available)
  results.phases.whois = { name: 'WHOIS Lookup', ...whois };

  // Evaluate heuristics against the gathered context
  const heuristicsResult = heuristicsManager.evaluate(url, {
    ssl,
    content,
    abuseIPDB,
    redirects,
    securityHeaders,
    whois,
    domain: (() => { try { return new URL(url).hostname; } catch { return url; } })()
  });

  results.phases.heuristics = { name: 'Heuristic Rules', ...heuristicsResult };
  
    // Calculate total score
    let totalScore = 0;
    let maxTotalScore = 0;
    
    for (const phase of Object.values(results.phases)) {
      totalScore += phase.score || 0;
      maxTotalScore += phase.maxScore || 0;
    }
    
    results.totalScore = totalScore;
    results.maxTotalScore = maxTotalScore;
    results.percentage = Math.round((totalScore / maxTotalScore) * 100);
    
    // Determine overall status
    if (results.percentage >= 80) {
      results.overallStatus = 'safe';
    } else if (results.percentage >= 50) {
      results.overallStatus = 'warning';
    } else {
      results.overallStatus = 'danger';
    }
    
    // Store completed scan
    db.run(
      'UPDATE scans SET status = ?, scan_result = ? WHERE id = ?',
      ['completed', JSON.stringify(results), scanId],
      (err) => {
        if (err) console.error('Failed to save scan result:', err);
      }
    );
    
    console.log(`✅ Scan complete. Score: ${results.percentage}% (${results.overallStatus})`);
    
    res.json(results);
  } catch (error) {
    console.error('Scan error:', error);
    db.run('UPDATE scans SET status = ? WHERE id = ?', ['failed', scanId]);
    res.status(500).json({ error: 'Scan failed', scanId });
  }
});

// Scan history for authenticated user
app.get('/api/scans', verifyToken, (req, res) => {
  const limit = req.query.limit || 50;
  
  db.all(
    'SELECT id, url, status, created_at, scan_result FROM scans WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [req.userId, limit],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch scans' });
      }
      
      // Parse JSON results
      const scans = rows.map(row => ({
        ...row,
        scan_result: row.scan_result ? JSON.parse(row.scan_result) : null
      }));
      
      res.json(scans);
    }
  );
});

// Get specific scan details
app.get('/api/scans/:scanId', verifyToken, (req, res) => {
  const { scanId } = req.params;
  
  db.get(
    'SELECT id, url, status, created_at, scan_result FROM scans WHERE id = ? AND user_id = ?',
    [scanId, req.userId],
    (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Scan not found' });
      }
      
      res.json({
        ...row,
        scan_result: row.scan_result ? JSON.parse(row.scan_result) : null
      });
    }
  );
});

// Real-time scan endpoint (from extension)
app.post('/api/scan/realtime', verifyExtensionToken, async (req, res) => {
  const { url, source } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  const scanId = crypto.randomUUID();
  
  console.log(`\n🔍 Extension scan ${scanId} for: ${url}`);
  
  // Store extension scan
  db.run(
    'INSERT INTO scans (id, user_id, url, status) VALUES (?, ?, ?, ?)',
    [scanId, req.userId, url, 'pending'],
    (err) => {
      if (err) console.error('Failed to log extension scan:', err);
    }
  );
  
  const results = {
    scanId,
    url,
    timestamp: new Date().toISOString(),
    source: 'extension'
  };
  
  try {
    // Quick analysis for extension (with timeouts)
    const timeout = (promise, ms) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
    ]);
    
    const [virusTotal, abuseIPDB] = await Promise.allSettled([
      timeout(scanWithVirusTotal(url), 3000),
      timeout(checkWithAbuseIPDB(url), 3000)
    ]);
    
    results.virusTotal = virusTotal.status === 'fulfilled' ? virusTotal.value : { error: 'Timeout' };
    results.abuseIPDB = abuseIPDB.status === 'fulfilled' ? abuseIPDB.value : { error: 'Timeout' };
    
    // Calculate quick risk score
    let riskScore = 50; // Neutral
    
    if (results.virusTotal.malicious > 0) riskScore -= 25;
    if (results.virusTotal.suspicious > 0) riskScore -= 10;
    if (results.abuseIPDB.abuseConfidenceScore > 50) riskScore -= 15;
    
    results.riskScore = Math.max(0, Math.min(100, riskScore));
    results.verdict = riskScore < 30 ? 'BLOCK' : riskScore < 60 ? 'WARN' : 'ALLOW';
    
    // Store result
    db.run(
      'UPDATE scans SET status = ?, scan_result = ? WHERE id = ?',
      ['completed', JSON.stringify(results), scanId],
      (err) => {
        if (err) console.error('Failed to save extension scan:', err);
      }
    );
    
    res.json(results);
  } catch (error) {
    console.error('Extension scan error:', error);
    db.run('UPDATE scans SET status = ? WHERE id = ?', ['failed', scanId]);
    res.status(500).json({ error: 'Scan failed', scanId, verdict: 'ALLOW' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    hasVirusTotalKey: !!process.env.VIRUSTOTAL_API_KEY,
    hasAbuseIPDBKey: !!process.env.ABUSEIPDB_API_KEY,
    hasWhoisKey: !!process.env.WHOIS_API_KEY,
    rulesCount: rulesManager.count(),
    database: 'connected',
    heuristicsCount: (heuristicsManager.getAll().rules || []).length
  });
});

// Rules management endpoints (basic)
app.get('/api/rules', (req, res) => {
  res.json({ status: 'ok', rules: rulesManager.getAll() });
});

// Heuristics listing for review
app.get('/api/heuristics', (req, res) => {
  res.json({ status: 'ok', heuristics: heuristicsManager.getAll() });
});

// Heuristics validation (checks for duplicates / unknown condition keys)
app.get('/api/heuristics/validate', (req, res) => {
  try {
    const problems = heuristicsManager.validate();
    res.json({ status: 'ok', problems });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.post('/api/rules/reload', (req, res) => {
  try {
    rulesManager.load();
    res.json({ status: 'ok', count: rulesManager.count() });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🛡️  Guardian Link Backend Server v2.0                   ║
║                                                           ║
║   Server running on: http://localhost:${PORT}               ║
║                                                           ║
║   Endpoints:                                              ║
║   - POST /api/auth/register          - Register user      ║
║   - POST /api/auth/login             - Login              ║
║   - POST /api/extension/register     - Register extension ║
║   - GET  /api/extension/verify       - Verify connection  ║
║   - POST /api/scan                   - Scan URL (website) ║
║   - POST /api/scan/realtime          - Scan (extension)   ║
║   - GET  /api/scans                  - Get scan history   ║
║   - GET  /api/health                 - Check status       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  console.log('API Keys configured:');
  console.log(`  VirusTotal: ${process.env.VIRUSTOTAL_API_KEY ? '✓' : '✗'}`);
  console.log(`  AbuseIPDB:  ${process.env.ABUSEIPDB_API_KEY ? '✓' : '✗'}`);
  console.log('  JWT Auth:   ✓');
  console.log('  Database:   ✓');
  console.log('');
});
