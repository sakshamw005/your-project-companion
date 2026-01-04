require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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
    
    // Wait a moment for analysis to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get the analysis results
    const analysisResponse = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
      headers: { 'x-apikey': apiKey }
    });
    
    const analysisData = await analysisResponse.json();
    const stats = analysisData.data?.attributes?.stats || {};
    
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
    
    // We'll use a simple heuristic based on domain characteristics
    // In production, you'd want to use a WHOIS API
    const suspiciousPatterns = [
      /\d{4,}/, // Long numbers
      /-{2,}/, // Multiple hyphens
      /[a-z]{20,}/, // Very long words
      /\.(tk|ml|ga|cf|gq)$/, // Free TLD domains often used for phishing
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
    
    // Check for phishing indicators
    const phishingKeywords = [
      'verify your account',
      'confirm your identity',
      'suspended account',
      'unusual activity',
      'update payment',
      'click here immediately'
    ];
    
    for (const keyword of phishingKeywords) {
      if (lowerHtml.includes(keyword)) {
        score -= 3;
        findings.push(`Suspicious phrase: "${keyword}"`);
      }
    }
    
    // Check for hidden forms
    if (lowerHtml.includes('type="hidden"') && lowerHtml.includes('password')) {
      score -= 5;
      findings.push('Hidden password field detected');
    }
    
    // Check for external form submissions
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
    
    // Check for suspicious redirect destinations
    for (const redirect of redirects) {
      try {
        const toHost = new URL(redirect.to).hostname;
        if (toHost.includes('bit.ly') || toHost.includes('tinyurl') || toHost.includes('t.co')) {
          score -= 2;
        }
      } catch {}
    }
    
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

// Main scan endpoint
app.post('/api/scan', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  console.log(`\n🔍 Starting scan for: ${url}`);
  
  const results = {
    url,
    timestamp: new Date().toISOString(),
    phases: {}
  };
  
  // Run all scans in parallel
  const [
    virusTotal,
    abuseIPDB,
    ssl,
    domainAge,
    content,
    redirects,
    securityHeaders
  ] = await Promise.all([
    scanWithVirusTotal(url),
    checkWithAbuseIPDB(url),
    checkSSL(url),
    checkDomainAge(url),
    analyzeContent(url),
    analyzeRedirects(url),
    checkSecurityHeaders(url)
  ]);
  
  results.phases = {
    virusTotal: { name: 'VirusTotal Analysis', ...virusTotal },
    abuseIPDB: { name: 'AbuseIPDB Check', ...abuseIPDB },
    ssl: { name: 'SSL Certificate', ...ssl },
    domainAge: { name: 'Domain Analysis', ...domainAge },
    content: { name: 'Content Analysis', ...content },
    redirects: { name: 'Redirect Analysis', ...redirects },
    securityHeaders: { name: 'Security Headers', ...securityHeaders }
  };
  
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
  
  console.log(`✅ Scan complete. Score: ${results.percentage}% (${results.overallStatus})`);
  
  res.json(results);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    hasVirusTotalKey: !!process.env.VIRUSTOTAL_API_KEY,
    hasAbuseIPDBKey: !!process.env.ABUSEIPDB_API_KEY
  });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🛡️  Guardian Link Backend Server                        ║
║                                                           ║
║   Server running on: http://localhost:${PORT}               ║
║                                                           ║
║   Endpoints:                                              ║
║   - POST /api/scan   - Scan a URL                         ║
║   - GET  /api/health - Check server status                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  console.log('API Keys configured:');
  console.log(`  VirusTotal: ${process.env.VIRUSTOTAL_API_KEY ? '✓' : '✗'}`);
  console.log(`  AbuseIPDB:  ${process.env.ABUSEIPDB_API_KEY ? '✓' : '✗'}`);
  console.log('');
});
