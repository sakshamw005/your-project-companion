/**
 * Rule Engine
 * Coordinates URL rule evaluation with URLParser and URLRules
 */

class RuleEngine {
  /**
   * Analyze a URL for threats
   * @param {string} urlString - URL to analyze
   * @returns {Object} Complete analysis result
   */
  static analyze(urlString) {
    // Step 1: Parse URL
    const parsedURL = URLParser.parse(urlString);
    
    // Step 2: Evaluate rules
    const ruleResults = URLRules.evaluateRules(urlString, parsedURL);
    
    // Step 3: Combine results
    return {
      url: urlString,
      timestamp: new Date().toISOString(),
      parsed: {
        hostname: parsedURL.hostname,
        domain: parsedURL.domain,
        subdomain: parsedURL.subdomain,
        isIP: parsedURL.isIP,
        isValid: parsedURL.isValid,
        length: parsedURL.length
      },
      rules: ruleResults.rules,
      riskScore: ruleResults.totalScore,
      maxScore: ruleResults.maxScore,
      risks: ruleResults.risks,
      checks: ruleResults.checks
    };
  }

  /**
   * Get risk level from score
   * @param {number} score - Risk score 0-100
   * @returns {string} Risk level
   */
  static getRiskLevel(score) {
    if (score >= 70) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    if (score >= 10) return 'LOW';
    return 'SAFE';
  }

  /**
   * Get color for risk level (consistent with decisionEngine)
   * @param {string} level - Risk level
   * @param {string} verdict - Verdict (BLOCK/WARN/ALLOW)
   * @returns {string} CSS color
   */
  static getRiskColor(level, verdict) {
    if (verdict === 'BLOCK') {
      return '#d32f2f'; // Red for BLOCK
    } else if (verdict === 'WARN') {
      if (level === 'MEDIUM') return '#fbc02d'; // Yellow
      if (level === 'LOW') return '#388e3c'; // Green
      return '#f97316'; // Orange for other WARN
    }
    return '#1976d2'; // Blue for ALLOW
  }

  /**
   * Generate summary of analysis
   * @param {Object} analysis - Analysis result from analyze()
   * @returns {Object} Summary object
   */
  static getSummary(analysis) {
    const riskLevel = this.getRiskLevel(analysis.riskScore);
    const color = this.getRiskColor(riskLevel);
    
    return {
      riskLevel,
      color,
      score: analysis.riskScore,
      verdict: riskLevel === 'SAFE' ? 'ALLOW' : (riskLevel === 'CRITICAL' ? 'BLOCK' : 'WARN'),
      risks: analysis.risks,
      domain: analysis.parsed.domain,
      hostname: analysis.parsed.hostname
    };
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RuleEngine;
}
