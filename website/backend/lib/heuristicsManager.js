const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'heuristics.json');

let heuristics = { version: '1.0', description: '', rules: [] };

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    heuristics = JSON.parse(raw);
    return heuristics;
  } catch (err) {
    console.warn('heuristicsManager: could not load heuristics file, initializing empty rules', err.message);
    heuristics = { version: '1.0', description: '', rules: [] };
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(heuristics, null, 2), 'utf8');
    } catch (e) {}
    return heuristics;
  }
}

function getAll() {
  return heuristics;
}

// simple levenshtein distance
function levenshtein(a = '', b = '') {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function _isIp(hostname) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || /^\[[0-9a-f:]+\]$/.test(hostname);
}

function evaluate(url, context = {}) {
  // context may include: ssl, content, abuseIPDB, redirects, securityHeaders, whois
  const urlObj = (() => {
    try { return new URL(url); } catch { return null; }
  })();
  const hostname = urlObj ? urlObj.hostname : (url || '');
  const pathAndQuery = urlObj ? (urlObj.pathname + (urlObj.search || '')) : '';

  const knownBrands = [
    'google','microsoft','facebook','apple','amazon','paypal','github','linkedin','icloud','office','spotify','netflix'
  ];

  let matched = [];
  let totalSuspicion = 0;

  for (const rule of heuristics.rules) {
    const c = rule.condition || {};
    let matchedRule = false;

    // URL based checks
    if (c.url_uses_ip) {
      if (_isIp(hostname)) matchedRule = true;
    }
    if (c.url_length_gt) {
      if ((url || '').length > c.url_length_gt) matchedRule = true;
    }
    if (c.url_encoded) {
      if ((url || '').includes('%')) matchedRule = true;
    }
    if (c.url_keywords_any) {
      const combined = (hostname + ' ' + pathAndQuery).toLowerCase();
      for (const kw of c.url_keywords_any) {
        if (combined.includes(kw.toLowerCase())) { matchedRule = true; break; }
      }
    }

    // Domain checks
    if (c.domain_age_days_lt != null) {
      const whois = context.whois;
      if (whois && whois.createdDateTimestamp) {
        const ageDays = Math.floor((Date.now() - whois.createdDateTimestamp) / (1000 * 60 * 60 * 24));
        if (ageDays < c.domain_age_days_lt) matchedRule = true;
      }
    }
    if (c.tld_in) {
      const tld = hostname.split('.').pop();
      if (tld && c.tld_in.includes(tld.toLowerCase())) matchedRule = true;
    }

    // Brand checks
    if (c.brand_match) {
      const lowerHost = hostname.toLowerCase();
      for (const b of knownBrands) {
        if (lowerHost.includes(b)) { matchedRule = true; break; }
      }
    }
    if (c.brand_hyphenated) {
      const lowerHost = hostname.toLowerCase();
      for (const b of knownBrands) {
        if (lowerHost.includes(b + '-') || lowerHost.includes('-' + b) || lowerHost.endsWith(b + 's')) { matchedRule = true; break; }
      }
    }
    if (c.brand_typosquat) {
      const lowerHost = hostname.toLowerCase();
      for (const b of knownBrands) {
        // compare second-level domain part
        const sld = (lowerHost.split('.').slice(0, -1).join('.')) || lowerHost.split('.')[0];
        if (levenshtein(sld, b) <= 1 && sld !== b) { matchedRule = true; break; }
      }
    }

    // SSL checks
    if (c.https === false) {
      if (!urlObj || urlObj.protocol !== 'https:') matchedRule = true;
    }
    if (c.ssl_age_days_lt != null) {
      const ssl = context.ssl;
      if (ssl && ssl.validTo) {
        const validTo = new Date(ssl.validTo);
        const now = new Date();
        const diffDays = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));
        if (diffDays < c.ssl_age_days_lt) matchedRule = true;
      }
    }
    if (c.ssl_self_signed) {
      const ssl = context.ssl;
      if (ssl && ssl.issuer && ssl.issuer.toLowerCase().includes('self')) matchedRule = true;
    }
    if (c.ssl_domain_mismatch) {
      const ssl = context.ssl;
      if (ssl && ssl.issuer && context.domain && ssl.issuer !== context.domain) matchedRule = true; // best-effort
    }

    // ASN / network
    if (c.asn_abuse_score_gt != null) {
      const abuse = context.abuseIPDB;
      if (abuse && abuse.abuseConfidenceScore != null) {
        if (abuse.abuseConfidenceScore > c.asn_abuse_score_gt) matchedRule = true;
      }
    }
    if (c.asn_bulletproof) {
      const abuse = context.abuseIPDB;
      if (abuse && abuse.isBulletproof) matchedRule = true; // set by upstream if detected
    }

    // Page behaviour
    if (c.login_form_detected) {
      const content = context.content;
      if (content && (content.findings || []).some(f => /login|password|sign in/i.test(f))) matchedRule = true;
    }
    if (c.password_field && c.brand_match) {
      const content = context.content;
      const hasPassword = content && (content.findings || []).some(f => /password/i.test(f));
      let brandPresent = false;
      const lowerHost = hostname.toLowerCase();
      for (const b of knownBrands) if (lowerHost.includes(b)) brandPresent = true;
      if (hasPassword && brandPresent) matchedRule = true;
    }
    if (c.js_redirect) {
      const content = context.content;
      if (content && (content.findings || []).some(f => /window.location|document.location|location.href/.test(f))) matchedRule = true;
    }
    if (c.external_form_action) {
      const content = context.content;
      if (content && (content.findings || []).some(f => /External form submission to:/i.test(f))) matchedRule = true;
    }

    if (matchedRule) {
      matched.push({ id: rule.id, score: rule.score || 0, description: rule.description });
      totalSuspicion += rule.score || 0;
    }
  }

  // Map suspicion points to a phase score (higher is better)
  const maxScore = 25;
  const cappedSuspicion = Math.min(totalSuspicion, maxScore);
  const score = Math.max(0, Math.round(maxScore - cappedSuspicion));

  let status = 'safe';
  if (totalSuspicion >= 30) status = 'danger';
  else if (totalSuspicion >= 10) status = 'warning';

  return {
    matched,
    totalSuspicion,
    score,
    maxScore,
    status
  };
}

function validate() {
  const knownKeys = new Set([
    'url_uses_ip','url_length_gt','url_encoded','url_keywords_any',
    'domain_age_days_lt','tld_in',
    'brand_match','brand_hyphenated','brand_typosquat',
    'https','ssl_age_days_lt','ssl_self_signed','ssl_domain_mismatch',
    'asn_abuse_score_gt','asn_bulletproof',
    'login_form_detected','password_field','js_redirect','external_form_action'
  ]);

  const problems = [];
  const ids = new Set();
  (heuristics.rules || []).forEach((r, idx) => {
    if (!r.id) problems.push({ idx, problem: 'missing id' });
    if (r.id && ids.has(r.id)) problems.push({ idx, id: r.id, problem: 'duplicate id' });
    ids.add(r.id);
    const keys = Object.keys(r.condition || {});
    for (const k of keys) if (!knownKeys.has(k)) problems.push({ idx, id: r.id, problem: `unknown condition key: ${k}` });
  });

  return problems;
}

module.exports = { load, getAll, evaluate, validate };

