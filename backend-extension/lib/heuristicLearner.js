const fs = require('fs');
const path = require('path');

const HEURISTICS_FILE =
  process.env.HEURISTICS_FILE ||
  path.join(__dirname, '..', 'data', 'heuristics.json');

fs.mkdirSync(path.dirname(HEURISTICS_FILE), { recursive: true });

/**
 * Load heuristics from file
 */
function loadHeuristics() {
  try {
    const raw = fs.readFileSync(HEURISTICS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { version: '1.0', rules: [] };
  }
}

/**
 * Save heuristics to file
 */
function saveHeuristics(data) {
  try {
    const dir = path.dirname(HEURISTICS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(HEURISTICS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️ Could not save heuristics:', err.message);
  }
}

/**
 * Check if a rule with these conditions already exists
 */
function ruleExists(rules, conditions) {
  return rules.some(r =>
    JSON.stringify(r.conditions) === JSON.stringify(conditions)
  );
}

/**
 * Generate unique rule ID from conditions
 */
function makeRuleId(conditions) {
  const key = Object.keys(conditions)
    .sort()
    .map(k => `${k}:${conditions[k]}`)
    .join('|');
  const hash = require('crypto')
    .createHash('md5')
    .update(key)
    .digest('hex')
    .substring(0, 8);
  return `learned:vt:${hash}`;
}

/**
 * Learn malicious patterns from VirusTotal analysis
 * 
 * This function extracts patterns from URLs flagged as malicious by VirusTotal
 * and creates heuristic rules that can detect similar threats faster in the future.
 * 
 * @param {string} url - The URL that was flagged as malicious
 * @param {object} context - Contains: virusTotal, content, redirects, ssl, etc.
 */
function learnFromVirusTotal(url, context) {
  const { virusTotal, content, redirects } = context || {};

  // Hard gate: only learn from high-confidence VT malicious verdicts
  if (!virusTotal || virusTotal.mandate !== 'malicious') {
    return { learned: false, reason: 'Not marked as malicious by VirusTotal' };
  }

  const heuristics = loadHeuristics();

  const learnedConditions = {};

  /* ========== Pattern Extraction ========== */

  // Content-based patterns
  if (content?.findings && Array.isArray(content.findings)) {
    if (content.findings.some(f => /javascript redirect|window\.location|location\.href/i.test(f))) {
      learnedConditions.js_redirect = true;
    }

    if (content.findings.some(f => /meta refresh/i.test(f))) {
      learnedConditions.meta_refresh = true;
    }

    if (content.findings.some(f => /password|pass field|password input/i.test(f))) {
      learnedConditions.password_field = true;
    }

    if (content.findings.some(f => /login|sign in|sign up|authentication/i.test(f))) {
      learnedConditions.login_form_detected = true;
    }

    if (content.findings.some(f => /obfuscated|encoded|minified/i.test(f))) {
      learnedConditions.obfuscated_script = true;
    }

    if (content.findings.some(f => /iframe|frame/i.test(f))) {
      learnedConditions.iframe_detected = true;
    }

    if (content.findings.some(f => /phishing|credential|steal/i.test(f))) {
      learnedConditions.phishing_indicators = true;
    }
  }

  // Redirect pattern
  if (redirects?.redirectCount >= 3) {
    learnedConditions.redirect_chain_long = true;
  }

  // Domain age pattern (very young domains are suspicious)
  if (context.whois?.domainAgeDays !== undefined && context.whois.domainAgeDays < 30) {
    learnedConditions.domain_age_very_young = true;
  }

  // IP-based domain
  if (context.url_uses_ip) {
    learnedConditions.url_uses_ip = true;
  }

  // Missing HTTPS on suspicious content
  if (!url.startsWith('https') && (content?.findings?.length > 0)) {
    learnedConditions.http_with_suspicious_content = true;
  }

  // If nothing meaningful learned → stop
  if (Object.keys(learnedConditions).length < 2) {
    return { 
      learned: false, 
      reason: `Insufficient patterns extracted (${Object.keys(learnedConditions).length})` 
    };
  }

  // Prevent duplicate heuristic rules
  if (ruleExists(heuristics.rules, learnedConditions)) {
    return { 
      learned: false, 
      reason: 'Rule with these conditions already exists' 
    };
  }

  /* ========== Rule Creation ========== */

  const newRule = {
    id: makeRuleId(learnedConditions),
    description: `Learned from VT-malicious URL: ${url.substring(0, 80)}...`,
    conditions: learnedConditions,
    severity: 'high',
    scoreImpact: -30,
    confidence: 0.85,
    minConfidence: 0.1,
    confidenceDecayPerDay: 0.01, // Lose 1% confidence per day
    source: 'virustotal-learning',
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    active: true,
    expiresAt: null,
    evidenceUrls: [url]
  };

  // Add rule to collection
  heuristics.rules.push(newRule);
  saveHeuristics(heuristics);

  console.log(`🧠 Heuristic learned: ${newRule.id}`);
  console.log(`   Conditions: ${Object.keys(learnedConditions).join(', ')}`);

  return { 
    learned: true, 
    ruleId: newRule.id,
    conditions: learnedConditions 
  };
}

/**
 * Learn from false positives (URLs marked safe that we flagged)
 * Adjusts confidence of affected heuristics downward
 */
function learnFromFalsePositive(url, context) {
  const { triggeredRules = [] } = context || {};

  if (triggeredRules.length === 0) {
    return { adjusted: false, reason: 'No triggered rules to adjust' };
  }

  const heuristics = loadHeuristics();
  let adjustedCount = 0;

  for (const ruleId of triggeredRules) {
    const rule = heuristics.rules.find(r => r.id === ruleId);
    if (!rule) continue;

    // Reduce confidence based on false positive
    const adjustment = 0.1; // Reduce by 10%
    rule.confidence = Math.max(0, rule.confidence - adjustment);

    if (rule.confidence < rule.minConfidence) {
      rule.active = false;
      rule.expiresAt = new Date().toISOString();
      console.log(`⚠️ Rule deactivated due to false positive: ${ruleId}`);
    } else {
      console.log(`📉 Rule confidence adjusted: ${ruleId} → ${rule.confidence.toFixed(3)}`);
    }

    adjustedCount++;
  }

  if (adjustedCount > 0) {
    saveHeuristics(heuristics);
  }

  return { 
    adjusted: adjustedCount > 0, 
    adjustedRules: adjustedCount 
  };
}

/**
 * Get learning statistics
 */
function getLearningStats() {
  const heuristics = loadHeuristics();
  const allRules = heuristics.rules || [];
  const learnedRules = allRules.filter(r => r.source === 'virustotal-learning');
  const activeRules = allRules.filter(r => r.active);

  return {
    totalRules: allRules.length,
    learnedRules: learnedRules.length,
    activeRules: activeRules.length,
    expiredRules: allRules.length - activeRules.length,
    averageConfidence: allRules.length > 0 
      ? (allRules.reduce((sum, r) => sum + (r.confidence || 0), 0) / allRules.length).toFixed(3)
      : 0
  };
}

module.exports = {
  learnFromVirusTotal,
  learnFromFalsePositive,
  getLearningStats,
  loadHeuristics,
  saveHeuristics
};
