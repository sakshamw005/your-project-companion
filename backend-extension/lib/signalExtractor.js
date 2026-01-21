/**
 * Signal Extractor Module
 * 
 * Extracts meaningful signals from URLs and their context for threat analysis.
 * These signals feed into heuristic evaluation engines for faster, local analysis.
 * 
 * Signals include:
 * - URL structure (length, encoding, IPs, special characters)
 * - Domain characteristics (age, TLD, subdomains)
 * - SSL/TLS indicators
 * - Content findings (forms, scripts, redirects)
 * - Behavioral indicators (abuse scores, geographic anomalies)
 */

function extractSignals(url, context = {}) {
  let urlObj;
  
  try {
    urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    urlObj = null;
  }

  const hostname = urlObj?.hostname || '';
  const path = urlObj?.pathname || '';
  const query = urlObj?.search || '';

  /* ========== IP Detection ========== */
  const isIp =
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
    /^\[[0-9a-f:]+\]$/.test(hostname);

  /* ========== Content Analysis ========== */
  const contentFindings = context.content?.findings || [];

  /* ========== Domain Age Analysis ========== */
  const domainAgeDays = context.whois?.createdDate
    ? Math.floor(
        (Date.now() - new Date(context.whois.createdDate).getTime()) /
          86400000
      )
    : null;

  /* ========== Signal Extraction ========== */
  const signals = {
    /* =========================
       URL STRUCTURE SIGNALS
       ========================= */
    url_length: url.length,
    url_length_suspicious: url.length > 100, // Very long URLs often obfuscate intent
    url_encoded: url.includes('%'), // Percent-encoded characters
    url_contains_at: url.includes('@'), // User info in URL (rare in legitimate)
    url_contains_multiple_dots: (url.match(/\./g) || []).length > 3,
    url_uses_ip: isIp,
    url_has_credentials: /@/.test(url), // user:pass@host pattern

    /* =========================
       DOMAIN SIGNALS
       ========================= */
    hostname,
    hostname_length: hostname.length,
    tld: hostname.split('.').pop(),
    subdomain_count:
      hostname.split('.').length > 2
        ? hostname.split('.').length - 2
        : 0,
    subdomain_count_high: hostname.split('.').length > 4, // Many subdomains suspicious
    domain_age_days: domainAgeDays,
    domain_very_new: domainAgeDays !== null && domainAgeDays < 30,
    domain_suspicious_tld: isSuspiciousTLD(hostname.split('.').pop()),

    /* =========================
       SSL/TLS SIGNALS
       ========================= */
    https: url.startsWith('https'),
    ssl_self_signed: context.ssl?.issuer
      ?.toLowerCase()
      ?.includes('self'),
    ssl_expired: context.ssl?.expiryDate
      ? new Date(context.ssl.expiryDate) < new Date()
      : false,
    ssl_issuer: context.ssl?.issuer || '',

    /* =========================
       CONTENT/BEHAVIORAL SIGNALS
       ========================= */
    login_form_detected: contentFindings.some(f =>
      /login|sign in|sign up|authentication/i.test(f)
    ),
    password_field: contentFindings.some(f =>
      /password|pass field|password input/i.test(f)
    ),
    hidden_inputs: contentFindings.some(f =>
      /hidden|type="hidden"/i.test(f)
    ),
    js_redirect: contentFindings.some(f =>
      /javascript redirect|window\.location|location\.href/i.test(f)
    ),
    meta_refresh: contentFindings.some(f =>
      /meta refresh|<meta.*refresh/i.test(f)
    ),
    iframe_detected: contentFindings.some(f =>
      /iframe|<iframe/i.test(f)
    ),
    obfuscated_script: contentFindings.some(f =>
      /obfuscated|encoded|minified|eval\(/i.test(f)
    ),
    phishing_keywords: contentFindings.some(f =>
      /phishing|credential|steal|verify account|confirm identity/i.test(f)
    ),

    /* =========================
       REDIRECT SIGNALS
       ========================= */
    redirect_count: context.redirects?.redirectCount ?? 0,
    redirect_count_excessive: (context.redirects?.redirectCount ?? 0) > 3,
    redirect_chain: context.redirects?.chain || [],

    /* =========================
       NETWORK/GEO SIGNALS
       ========================= */
    asn_abuse_score: context.abuseIPDB?.abuseConfidenceScore ?? null,
    asn_is_proxy: context.abuseIPDB?.isProxy ?? false,
    asn_is_vpn: context.abuseIPDB?.isVPN ?? false,
    asn_is_tor: context.abuseIPDB?.isTor ?? false,
    asn_is_datacenter: context.abuseIPDB?.isDatacenter ?? false,
    country: context.abuseIPDB?.countryCode?.toLowerCase() ?? null,
    country_suspicious: isSuspiciousCountry(context.abuseIPDB?.countryCode),

    /* =========================
       HEADER SIGNALS
       ========================= */
    security_headers_missing: context.securityHeaders
      ? Object.values(context.securityHeaders).filter(v => !v).length > 0
      : false,
    csp_header: context.securityHeaders?.['content-security-policy'] ?? null,

    /* =========================
       WHOIS SIGNALS
       ========================= */
    whois_registration_date: context.whois?.createdDate || null,
    whois_registrar: context.whois?.registrar || null,
    whois_hidden: context.whois?.private ?? false
  };

  // Calculate composite risk scores
  signals._riskScore = calculateRiskScore(signals);
  signals._suspiciousIndicators = countSuspiciousIndicators(signals);

  return signals;
}

/**
 * Identify suspicious TLDs commonly used for malware
 */
function isSuspiciousTLD(tld) {
  if (!tld) return false;

  const suspiciousTLDs = [
    'tk',    // Free registrations, high abuse
    'ml',    // Free registrations, high abuse
    'ga',    // Free registrations, high abuse
    'cf',    // Free registrations, high abuse
    'top',   // Frequently abused
    'click', // Frequently abused
    'download',
    'stream',
    'date',
    'faith',
    'accountant'
  ];

  return suspiciousTLDs.includes(tld.toLowerCase());
}

/**
 * Identify suspicious geographic locations
 */
function isSuspiciousCountry(countryCode) {
  if (!countryCode) return false;

  // This is a minimal list - expand based on your threat model
  const restrictedCountries = [
    // Countries with known high malware hosting rates
    // Note: Treat with caution due to geopolitical sensitivity
  ];

  return restrictedCountries.includes(countryCode.toUpperCase());
}

/**
 * Calculate composite risk score from signals
 * Returns value 0-100
 */
function calculateRiskScore(signals) {
  let score = 0;

  // URL structure indicators
  if (signals.url_uses_ip) score += 15;
  if (signals.url_length_suspicious) score += 5;
  if (signals.url_encoded) score += 3;
  if (signals.url_contains_at) score += 10;
  if (signals.url_has_credentials) score += 20;

  // Domain indicators
  if (signals.domain_very_new) score += 10;
  if (signals.subdomain_count_high) score += 5;
  if (signals.domain_suspicious_tld) score += 10;

  // SSL indicators
  if (!signals.https && signals.login_form_detected) score += 15;
  if (signals.ssl_self_signed) score += 10;
  if (signals.ssl_expired) score += 10;

  // Content indicators
  if (signals.login_form_detected && signals.password_field) score += 10;
  if (signals.js_redirect) score += 8;
  if (signals.meta_refresh) score += 5;
  if (signals.iframe_detected) score += 8;
  if (signals.obfuscated_script) score += 10;
  if (signals.phishing_keywords) score += 15;

  // Redirect indicators
  if (signals.redirect_count_excessive) score += 10;

  // Network indicators
  if (signals.asn_is_proxy) score += 5;
  if (signals.asn_is_vpn) score += 5;
  if (signals.asn_is_tor) score += 20;
  if (signals.asn_is_datacenter && signals.url_uses_ip) score += 5;
  if (signals.asn_abuse_score > 50) score += 10;

  // Security headers
  if (signals.security_headers_missing) score += 3;

  // Cap at 100
  return Math.min(100, score);
}

/**
 * Count suspicious indicators
 */
function countSuspiciousIndicators(signals) {
  const suspiciousKeys = [
    'url_uses_ip',
    'url_length_suspicious',
    'url_contains_at',
    'url_has_credentials',
    'domain_very_new',
    'subdomain_count_high',
    'domain_suspicious_tld',
    'ssl_self_signed',
    'ssl_expired',
    'login_form_detected',
    'password_field',
    'js_redirect',
    'meta_refresh',
    'iframe_detected',
    'obfuscated_script',
    'phishing_keywords',
    'redirect_count_excessive',
    'asn_is_proxy',
    'asn_is_vpn',
    'asn_is_tor',
    'security_headers_missing',
    'whois_hidden'
  ];

  return suspiciousKeys.filter(key => signals[key] === true).length;
}

/**
 * Get signal summary for display
 */
function getSignalSummary(signals) {
  return {
    riskScore: signals._riskScore,
    suspiciousIndicatorCount: signals._suspiciousIndicators,
    indicators: {
      network: {
        usesIp: signals.url_uses_ip,
        abuseScore: signals.asn_abuse_score,
        isProxy: signals.asn_is_proxy,
        isTor: signals.asn_is_tor,
        country: signals.country
      },
      domain: {
        age: signals.domain_age_days,
        isNew: signals.domain_very_new,
        suspiciousTld: signals.domain_suspicious_tld
      },
      content: {
        hasLoginForm: signals.login_form_detected,
        hasPasswordField: signals.password_field,
        hasRedirect: signals.js_redirect || signals.meta_refresh,
        hasIframe: signals.iframe_detected,
        phishingIndicators: signals.phishing_keywords
      },
      security: {
        usesHttps: signals.https,
        hasSslIssues: signals.ssl_self_signed || signals.ssl_expired,
        missingSecurityHeaders: signals.security_headers_missing
      }
    }
  };
}

module.exports = {
  extractSignals,
  getSignalSummary,
  calculateRiskScore,
  isSuspiciousTLD,
  isSuspiciousCountry
};
