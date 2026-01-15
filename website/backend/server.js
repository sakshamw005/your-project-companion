require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const rulesManager = require('./lib/rulesManager');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const crypto = require('crypto');
const heuristicsManager = require('./lib/heuristicsManager');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust only the first proxy hop (Render's reverse proxy)
// This safely gets the real client IP while preventing IP spoofing
app.set('trust proxy', 1);

// ========== SCAN RESULTS CACHE ==========
const scanResults = new Map(); // Store scan results by scanId
const scanStartTimes = new Map(); // Track when scans started

// ========== DATABASE SETUP ==========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/guardianlink'
});

// Helper function to convert SQLite ? placeholders to PostgreSQL $1, $2, etc
function convertSqlPlaceholders(sql) {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

// Wrapper for compatibility with callback-based queries
const db = {
  run: (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pgSql = convertSqlPlaceholders(sql);
    pool.query(pgSql, params, (err, result) => {
      callback(err, result);
    });
  },
  get: (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pgSql = convertSqlPlaceholders(sql);
    pool.query(pgSql, params, (err, result) => {
      callback(err, result?.rows?.[0]);
    });
  },
  all: (sql, params = [], callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const pgSql = convertSqlPlaceholders(sql);
    pool.query(pgSql, params, (err, result) => {
      callback(err, result?.rows);
    });
  },
  serialize: (callback) => {
    callback();
  }
};

// Initialize database tables
const initDatabase = async () => {
  try {
    // Create tables with PostgreSQL syntax
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        extension_token TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        url TEXT NOT NULL,
        scan_result TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS extension_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        extension_token TEXT UNIQUE,
        device_info TEXT,
        last_activity TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);
    
    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
  }
};

// Initialize database on startup
initDatabase();

// ========== MIDDLEWARE ==========
const allowedOrigins = [
  "http://localhost:3000",
  "https://guardianlink-backend.onrender.com",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174"
];

// CORS configuration that accepts both Chrome and Firefox extensions
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests from:
    // 1. Chrome extension (chrome-extension://)
    // 2. Firefox extension (moz-extension://)
    // 3. Localhost (development)
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];

    // Allow all extension URLs (Chrome and Firefox)
    if (!origin || 
        origin.startsWith('chrome-extension://') || 
        origin.startsWith('moz-extension://') ||
        allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ CORS rejected for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
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

// Extension token verification (keep for extension)
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

// ========== EXTENSION ENDPOINTS ==========

// Register extension session (public endpoint)
app.post('/api/extension/register', (req, res) => {
  const extensionToken = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const { deviceInfo } = req.body;
  
  // No user required - extension can register without authentication
  db.run(
    'INSERT INTO extension_sessions (id, user_id, extension_token, device_info, last_activity) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [sessionId, null, extensionToken, JSON.stringify(deviceInfo)],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to register extension' });
      }
      
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
  
  if (!apiKey) {
    console.warn('⚠️ VirusTotal API key not configured');
    return { 
      error: 'API key not configured', 
      score: 0, 
      maxScore: 25,
      status: 'warning',
      available: false 
    };
  }
  
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
    
    // Check for API key errors
    if (submitData.error) {
      const errorMsg = submitData.error.message || JSON.stringify(submitData.error);
      if (errorMsg.includes('API key') || errorMsg.includes('Invalid') || errorMsg.includes('Unauthorized')) {
        console.error('❌ VirusTotal API key error:', errorMsg);
        return { 
          error: 'Invalid or expired API key', 
          score: 0, 
          maxScore: 25,
          status: 'warning',
          available: false 
        };
      }
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
  
  if (!apiKey) {
    console.warn('⚠️ AbuseIPDB API key not configured');
    return { 
      error: 'API key not configured', 
      score: 15, 
      maxScore: 15,
      status: 'warning',
      available: false 
    };
  }
  
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
      const errorMsg = data.errors[0]?.detail || JSON.stringify(data.errors);
      if (errorMsg.includes('API key') || errorMsg.includes('Invalid') || errorMsg.includes('Unauthorized')) {
        console.error('❌ AbuseIPDB API key error:', errorMsg);
        return { 
          error: 'Invalid or expired API key', 
          score: 15, 
          maxScore: 15,
          status: 'warning',
          available: false 
        };
      }
      console.error('AbuseIPDB error:', data.errors);
      return { error: errorMsg, score: 0, maxScore: 15 };
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
        warnings: ['Hostname is an IP address literal - suspicious'],
        isHeuristic: true
      };
    }

    let score = 10;
    let status = 'safe';
    const warnings = [];

    // Check for homograph attacks (visual similarity confusion)
    const homographPatterns = [
      /[0o][0o]{2,}/i,  // Confusion between 0 and o
      /[il1][il1]{2,}/,  // Confusion between i, l, and 1
      /[5s][5s]{2,}/i,   // Confusion between 5 and s
    ];

    for (const pattern of homographPatterns) {
      if (pattern.test(domain)) {
        score -= 3;
        warnings.push(`Possible homograph attack pattern detected`);
      }
    }

    // Check for other suspicious patterns
    const suspiciousPatterns = [
      { pattern: /\d{4,}/, message: 'Long numeric sequence in domain', penalty: -2 },
      { pattern: /-{2,}/, message: 'Multiple consecutive hyphens', penalty: -2 },
      { pattern: /[a-z]{20,}/, message: 'Unusually long word component', penalty: -1 },
    ];

    for (const { pattern, message, penalty } of suspiciousPatterns) {
      if (pattern.test(domain)) {
        score += penalty;
        warnings.push(message);
      }
    }

    // Check for suspicious free TLDs
    const tld = domain.split('.').pop();
    const suspiciousTlds = ['tk', 'ml', 'ga', 'cf', 'gq'];
    if (suspiciousTlds.includes(tld.toLowerCase())) {
      score -= 2;
      warnings.push(`Suspicious TLD: .${tld}`);
    }

    // Determine status based on final score
    if (score < 4) status = 'danger';
    else if (score < 7) status = 'warning';
    else status = 'safe';

    return {
      domain,
      score: Math.max(0, score),
      maxScore: 10,
      status,
      warnings,
      isHeuristic: true  // Mark as heuristic-based, not actual WHOIS
    };
  } catch (error) {
    console.error('Domain age check error:', error.message);
    return { 
      error: error.message, 
      score: 5, 
      maxScore: 10, 
      status: 'warning',
      isHeuristic: true
    };
  }
}

// WHOIS lookup (optional -- requires WHOIS_API_KEY in .env)
async function fetchWhois(url) {
  const apiKey = process.env.WHOIS_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ WHOIS API key not configured');
    return { 
      error: 'WHOIS API key not configured', 
      score: 10, 
      maxScore: 10,
      status: 'warning',
      available: false 
    };
  }
  
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const domain = urlObj.hostname;
    
    // Check if hostname is an IP address (not a domain)
    const isIP = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(domain) || /^\[[0-9a-f:]+\]$/.test(domain);
    if (isIP) {
      console.warn(`⚠️ WHOIS skipped - hostname is IP address: ${domain}`);
      return { 
        error: 'Cannot perform WHOIS lookup on IP address', 
        score: 5, 
        maxScore: 10,
        status: 'warning',
        available: false,
        reason: 'IP address detected - use AbuseIPDB instead'
      };
    }
    
    console.log(`📋 Fetching WHOIS data for domain: ${domain}`);
    
    // Use JSON output format explicitly
    const whoisUrl = `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=${apiKey}&domainName=${encodeURIComponent(domain)}&outputFormat=JSON`;
    
    const response = await fetch(whoisUrl, { 
      timeout: 30000,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    // Check for API key errors
    if (response.status === 401 || response.status === 403) {
      console.error('❌ WHOIS API key error: Invalid or unauthorized');
      return { 
        error: 'Invalid or expired WHOIS API key', 
        score: 10, 
        maxScore: 10,
        status: 'warning',
        available: false 
      };
    }
    
    if (!response.ok) {
      throw new Error(`WHOIS API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Handle API errors in response
    if (data.ErrorMessage || data.errors) {
      const errorMsg = data.ErrorMessage?.msg || data.errors?.[0]?.message || JSON.stringify(data.errors);
      console.error('WHOIS API error:', errorMsg);
      return { 
        error: errorMsg, 
        score: 10, 
        maxScore: 10,
        status: 'warning' 
      };
    }
    
    // Extract WHOIS data from the response
    const whoisRecord = data.WhoisRecord || {};
    const registryData = whoisRecord.registryData || {};
    
    // Parse dates with proper error handling
    let createdDate = null;
    let createdTimestamp = null;
    let expiresDate = null;
    let ageInDays = null;
    
    try {
      // Try multiple possible date fields
      createdDate = registryData.createdDate || 
                   whoisRecord.createdDate || 
                   registryData.createdDateNormalized ||
                   whoisRecord.createdDateNormalized;
      
      expiresDate = registryData.expiresDate || 
                   whoisRecord.expiresDate || 
                   registryData.expiresDateNormalized ||
                   whoisRecord.expiresDateNormalized;
      
      if (createdDate) {
        const created = new Date(createdDate);
        if (!isNaN(created.getTime())) {
          createdTimestamp = created.getTime();
          ageInDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
          console.log(`📊 Domain age: ${ageInDays} days (created: ${createdDate})`);
        }
      }
    } catch (dateError) {
      console.warn('Date parsing error:', dateError.message);
    }
    
    // Extract registrar information
    const registrar = registryData.registrarName || whoisRecord.registrarName;
    const nameServers = registryData.nameServers?.hostNames || 
                       whoisRecord.nameServers?.hostNames || 
                       [];
    
    // Calculate score based on domain age
    let score = 10;
    let status = 'safe';
    let warnings = [];
    
    if (ageInDays !== null) {
      if (ageInDays < 30) {
        score = 3;
        status = 'danger';
        warnings.push(`New domain (< 30 days): ${ageInDays} days old`);
      } else if (ageInDays < 90) {
        score = 7;
        status = 'warning';
        warnings.push(`Relatively new domain (< 90 days): ${ageInDays} days old`);
      } else if (ageInDays > 3650) { // 10 years
        score = 10;
        status = 'safe';
        warnings.push(`Old domain (> 10 years): ${ageInDays} days old`);
      }
    } else {
      // If we can't get age, penalize slightly
      score = 5;
      status = 'warning';
      warnings.push('Unable to determine domain age');
    }
    
    // Check for suspicious TLDs
    const tld = domain.split('.').pop();
    const suspiciousTlds = ['tk', 'ml', 'ga', 'cf', 'gq', 'xyz', 'top', 'loan'];
    if (suspiciousTlds.includes(tld.toLowerCase())) {
      score = Math.max(0, score - 3);
      warnings.push(`Suspicious TLD: .${tld}`);
    }
    
    // Check if domain uses privacy protection
    const hasPrivacy = whoisRecord.dataError === 'MASKED_WHOIS_DATA' ||
                      registrar?.includes('Privacy') ||
                      registrar?.includes('Proxy') ||
                      /redacted/i.test(JSON.stringify(whoisRecord));
    
    if (hasPrivacy) {
      score = Math.max(0, score - 2);
      warnings.push('WHOIS data is privacy-protected');
      status = score < 7 ? 'warning' : status;
    }
    
    console.log(`✅ WHOIS lookup successful - score: ${score}, status: ${status}`);
    
    return {
      domain,
      available: true,
      registrar,
      createdDate,
      expiresDate,
      ageInDays,
      createdDateTimestamp: createdTimestamp,
      nameServers: nameServers.slice(0, 5), // Limit to first 5
      hasPrivacy,
      score,
      maxScore: 10,
      status,
      warnings,
      safeData: {
        domain,
        ageInDays,
        registrar,
        createdDate,
        expiresDate,
        hasPrivacy,
        tld
      }
    };
    
  } catch (error) {
    console.error('WHOIS fetch error:', error.message);
    
    // Handle network timeout specifically
    if (error.message.includes('timeout') || error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      console.warn('⚠️ WHOIS API timeout - using fallback heuristics');
      return { 
        error: 'WHOIS API timeout - using heuristics', 
        score: 5, 
        maxScore: 10,
        status: 'warning',
        note: 'Domain analysis incomplete due to API timeout'
      };
    }
    
    return { 
      error: error.message, 
      score: 5, 
      maxScore: 10,
      status: 'warning' 
    };
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
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [
            { url: url }
          ]
        }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      const errorMsg = data.error.message || JSON.stringify(data.error);
      if (errorMsg.includes('API key') || errorMsg.includes('INVALID_ARGUMENT') || errorMsg.includes('Invalid')) {
        console.error('❌ Google Safe Browsing API key error:', errorMsg);
        return { 
          error: 'Invalid or expired API key', 
          score: 10, 
          maxScore: 15,
          status: 'warning',
          available: false 
        };
      }
      console.error('Google Safe Browsing error:', data.error);
      return { 
        error: errorMsg, 
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
app.post('/api/scan', async (req, res) => {
  const { url, source } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const scanId = crypto.randomUUID();
  
  console.log(`\n🔍 Scan ${scanId} started for: ${url} (from ${source || 'website'})`);
  
  // === Store initial state IMMEDIATELY in cache ===
  scanResults.set(scanId, {
    status: 'processing',
    scanId,
    url,
    startedAt: new Date().toISOString(),
    message: 'Scan started'
  });
  
  // === IMMEDIATE RESPONSE - Don't wait for full scan ===
  res.json({
    status: 'processing',
    scanId: scanId,
    message: 'Scan started in background',
    timestamp: new Date().toISOString()
  });
  
  // === Process scan in background ===
  processScanInBackground(url, scanId, source);
});

/**
 * Check if URL is a search engine
 */
function isSearchEngine(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    const searchEngines = [
      'bing.com',
      'google.com/search',
      'yahoo.com/search',
      'duckduckgo.com',
      'startpage.com',
      'ecosia.org'
    ];
    
    return searchEngines.some(engine => hostname.includes(engine));
  } catch (e) {
    return false;
  }
}

/**
 * Process scan in background and store results
 */
async function processScanInBackground(url, scanId, source) {
  try {
    // ✅ Skip non-HTTP URLs
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.log(`⏭️ Skipping non-HTTP URL: ${url}`);
      const result = {
        scanId,
        url,
        verdict: 'ALLOW',
        score: 100,
        riskLevel: 'SAFE',
        timestamp: new Date().toISOString(),
        phases: {
          urlValidation: { 
            name: 'URL Validation', 
            score: 100, 
            maxScore: 100, 
            status: 'safe', 
            reason: 'Non-HTTP URL (system page)',
            evidence: 'Automatically allowed'
          }
        },
        totalScore: 100,
        maxTotalScore: 100,
        percentage: 100,
        overallStatus: 'safe',
        source: source || 'website'
      };
      
      scanResults.set(scanId, {
        ...result,
        completed: true,
        completedAt: new Date().toISOString()
      });
      
      return;
    }
    
    // Phase 1: Whitelist check (fast)
    const whitelistMatch = rulesManager.isWhitelisted(url);
    if (whitelistMatch) {
      console.log(`✅ Whitelist hit for ${url} - returning safe`);
      const result = {
        scanId,
        url,
        verdict: 'ALLOW',
        score: 100,
        riskLevel: 'SAFE',
        timestamp: new Date().toISOString(),
        phases: {
          whitelist: { name: 'Whitelist Check', score: 100, maxScore: 100, status: 'safe', reason: 'Whitelisted domain', evidence: whitelistMatch }
        },
        totalScore: 100,
        maxTotalScore: 100,
        percentage: 100,
        overallStatus: 'safe',
        source: source || 'website'
      };
      
      scanResults.set(scanId, {
        ...result,
        completed: true,
        completedAt: new Date().toISOString()
      });
      
      // Store in database
      db.run(
        'UPDATE scans SET status = ?, scan_result = ? WHERE id = ?',
        ['completed', JSON.stringify(result), scanId],
        (err) => { if (err) console.error('Failed to save scan:', err); }
      );
      
      return;
    }

    // Phase 2: Search engine detection (safe engines, no analysis needed)
    if (isSearchEngine(url)) {
      console.log(`🔍 Search engine detected: ${url} - returning safe`);
      const result = {
        scanId,
        url,
        verdict: 'ALLOW',
        score: 100,
        riskLevel: 'SAFE',
        timestamp: new Date().toISOString(),
        phases: {
          searchEngine: { 
            name: 'Search Engine Detection', 
            score: 100, 
            maxScore: 100, 
            status: 'safe', 
            reason: 'Search engine domain',
            evidence: 'Automatically allowed for browsing'
          }
        },
        totalScore: 100,
        maxTotalScore: 100,
        percentage: 100,
        overallStatus: 'safe',
        source: source || 'website'
      };
      
      scanResults.set(scanId, {
        ...result,
        completed: true,
        completedAt: new Date().toISOString()
      });
      
      // Store in database
      db.run(
        'UPDATE scans SET status = ?, scan_result = ? WHERE id = ?',
        ['completed', JSON.stringify(result), scanId],
        (err) => { if (err) console.error('Failed to save scan:', err); }
      );
      
      return;
    }

    // Phase 3: Local blacklist (fast)
    const blacklistMatch = rulesManager.isBlacklisted(url);
    if (blacklistMatch) {
      console.log(`🚫 Blacklist hit for ${url} - returning blocked`);
      const result = {
        scanId,
        url,
        verdict: 'BLOCK',
        score: 0,
        riskLevel: 'CRITICAL',
        timestamp: new Date().toISOString(),
        phases: {
          localBlacklist: { name: 'Local Blacklist', score: 0, maxScore: 100, status: 'danger', reason: 'Blacklisted domain', evidence: blacklistMatch }
        },
        totalScore: 0,
        maxTotalScore: 100,
        percentage: 0,
        overallStatus: 'danger',
        source: source || 'website'
      };
      
      scanResults.set(scanId, {
        ...result,
        completed: true,
        completedAt: new Date().toISOString()
      });
      
      // Store in database
      db.run(
        'UPDATE scans SET status = ?, scan_result = ? WHERE id = ?',
        ['completed', JSON.stringify(result), scanId],
        (err) => { if (err) console.error('Failed to save scan:', err); }
      );
      
      return;
    }

    // Store scan as pending in database
    db.run(
      'INSERT INTO scans (id, user_id, url, status) VALUES (?, ?, ?, ?)',
      [scanId, null, url, 'pending'],
      (err) => { if (err) console.error('Failed to log scan:', err); }
    );
    
    // Record start time
    scanStartTimes.set(scanId, Date.now());
    
    // === Full analysis (all phases) ===
    const [
      virusTotal,
      abuseIPDB,
      ssl,
      content,
      redirects,
      securityHeaders,
      whois,
      googleSafeBrowsing
    ] = await Promise.all([
      scanWithVirusTotal(url),
      checkWithAbuseIPDB(url),
      checkSSL(url),
      analyzeContent(url),
      analyzeRedirects(url),
      checkSecurityHeaders(url),
      fetchWhois(url),
      checkWithGoogleSafeBrowsing(url)
    ]);

    const phases = {
      virusTotal: { name: 'VirusTotal Analysis', ...virusTotal },
      abuseIPDB: { name: 'AbuseIPDB Check', ...abuseIPDB },
      ssl: { name: 'SSL Certificate', ...ssl },
      content: { name: 'Content Analysis', ...content },
      redirects: { name: 'Redirect Analysis', ...redirects },
      securityHeaders: { name: 'Security Headers', ...securityHeaders },
      googleSafeBrowsing: { name: 'Google Safe Browsing', ...googleSafeBrowsing }
    };

    // Use WHOIS if available, otherwise fall back to heuristic domain age check
    if (whois && whois.available === true && whois.score !== undefined) {
      // WHOIS data available - use it
      phases.whois = { name: 'WHOIS Lookup', ...whois };
    } else {
      // WHOIS not available - use heuristic-based domain age check
      const domainAge = await checkDomainAge(url);
      phases.domainAge = { name: 'Domain Analysis (Heuristic)', ...domainAge };
    }

    // Evaluate heuristics
    const heuristicsResult = heuristicsManager.evaluate(url, {
      ssl,
      content,
      abuseIPDB,
      redirects,
      securityHeaders,
      whois: whois && whois.available === true && whois.score !== undefined ? whois : null,
      domain: (() => { try { return new URL(url).hostname; } catch { return url; } })()
    });

    phases.heuristics = { name: 'Heuristic Rules', ...heuristicsResult };
    
    // Calculate total score
    let totalScore = 0;
    let maxTotalScore = 0;
    
    for (const phase of Object.values(phases)) {
      totalScore += phase.score || 0;
      maxTotalScore += phase.maxScore || 0;
    }
    
    const percentage = Math.round((totalScore / maxTotalScore) * 100);
    let overallStatus = 'safe';
    let verdict = 'ALLOW';
    let riskLevel = 'SAFE';
    
    if (percentage >= 80) {
      overallStatus = 'safe';
      verdict = 'ALLOW';
      riskLevel = 'SAFE';
    } else if (percentage >= 50) {
      overallStatus = 'warning';
      verdict = 'WARN';
      riskLevel = 'MEDIUM';
    } else {
      overallStatus = 'danger';
      verdict = 'BLOCK';
      riskLevel = 'CRITICAL';
    }
    
    const result = {
      scanId,
      url,
      verdict,
      score: percentage,
      riskLevel,
      timestamp: new Date().toISOString(),
      phases,
      totalScore,
      maxTotalScore,
      percentage,
      overallStatus,
      source: source || 'website'
    };

    // Remove raw WHOIS data in production for privacy
    if (process.env.NODE_ENV === 'production' && result.phases.whois?.raw) {
      delete result.phases.whois.raw;
    }
    
    // Store completed result
    scanResults.set(scanId, {
      ...result,
      completed: true,
      completedAt: new Date().toISOString()
    });
    
    // Store in database
    db.run(
      'UPDATE scans SET status = ?, scan_result = ? WHERE id = ?',
      ['completed', JSON.stringify(result), scanId],
      (err) => { if (err) console.error('Failed to save scan:', err); }
    );
    
    const elapsedMs = Date.now() - scanStartTimes.get(scanId);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ SCAN COMPLETE: ${scanId}`);
    console.log(`URL: ${url}`);
    console.log(`Overall Score: ${percentage}% (${overallStatus.toUpperCase()})`);
    console.log(`Verdict: ${verdict}`);
    console.log(`Time: ${elapsedMs}ms`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error(`❌ Scan ${scanId} failed:`, error.message);
    
    const errorResult = {
      scanId,
      url,
      error: error.message,
      completed: true,
      completedAt: new Date().toISOString(),
      verdict: 'ALLOW', // Default to allow on error
      score: 100,
      riskLevel: 'SAFE'
    };
    
    scanResults.set(scanId, errorResult);
    
    // Store error in database
    db.run(
      'UPDATE scans SET status = ?, scan_result = ? WHERE id = ?',
      ['error', JSON.stringify(errorResult), scanId],
      (err) => { if (err) console.error('Failed to save error:', err); }
    );
  }
}

/**
 * Poll for scan results
 */
app.get('/api/scan/result/:scanId', (req, res) => {
  const { scanId } = req.params;
  
  console.log(`📊 Poll request for scan: ${scanId}`);
  
  const result = scanResults.get(scanId);
  
  // Return "not_found" status instead of 404 - helps extension handle gracefully
  if (!result) {
    console.log(`⚠️ Scan ${scanId} not found in cache (not ready yet)`);
    return res.json({ 
      status: 'not_found',
      scanId,
      message: 'Scan entry not yet in cache (too early)'
    });
  }
  
  // Still processing - return current status
  if (!result.completed) {
    const status = result.status || 'in_progress';
    console.log(`⏳ Scan ${scanId} still ${status}`);
    return res.json({
      status: status,
      scanId,
      message: result.message || 'Scan in progress',
      updatedAt: result.updatedAt
    });
  }
  
  if (result.error) {
    console.log(`❌ Scan ${scanId} errored: ${result.error}`);
    return res.json({
      status: 'error',
      scanId,
      error: result.error,
      verdict: result.verdict || 'ALLOW',
      score: result.score || 100,
      riskLevel: result.riskLevel || 'SAFE'
    });
  }
  
  console.log(`✅ Returning completed scan ${scanId}`);
  res.json({
    status: 'completed',
    scanId,
    ...result
  });
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.0.0'
  });
});

// Scan history (public - no auth required)
app.get('/api/scans', (req, res) => {
  const limit = req.query.limit || 50;
  
  db.all(
    'SELECT id, url, status, created_at, scan_result FROM scans ORDER BY created_at DESC LIMIT ?',
    [limit],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch scans' });
      }
      
      // Parse JSON results and extract score
      const scans = rows.map(row => {
        const result = row.scan_result ? JSON.parse(row.scan_result) : null;
        return {
          id: row.id,
          url: row.url,
          status: row.status,
          created_at: row.created_at,
          score: result ? result.percentage : 0,
          overallStatus: result ? result.overallStatus : 'unknown',
          scan_result: result
        };
      });
      
      res.json(scans);
    }
  );
});

// Get specific scan details (public)
app.get('/api/scans/:scanId', (req, res) => {
  const { scanId } = req.params;
  
  db.get(
    'SELECT id, url, status, created_at, scan_result FROM scans WHERE id = ?',
    [scanId],
    (err, row) => {
      if (err || !row) {
        return res.status(404).json({ error: 'Scan not found' });
      }
      
      const result = row.scan_result ? JSON.parse(row.scan_result) : null;
      
      res.json({
        id: row.id,
        url: row.url,
        status: row.status,
        created_at: row.created_at,
        score: result ? result.percentage : 0,
        overallStatus: result ? result.overallStatus : 'unknown',
        scan_result: result
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
