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
   * Get color for risk level
   * @param {string} level - Risk level
   * @returns {string} CSS color
   */
  static getRiskColor(level) {
    const colors = {
      'CRITICAL': '#d32f2f',
      'HIGH': '#f57c00',
      'MEDIUM': '#fbc02d',
      'LOW': '#388e3c',
      'SAFE': '#1976d2'
    };
    return colors[level] || '#757575';
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
