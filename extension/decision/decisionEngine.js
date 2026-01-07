/**
 * Decision Engine
 * Combines rule-based analysis and domain reputation to make final verdict
 */

class DecisionEngine {
  /**
   * Make final security decision on a URL
   * @param {string} urlString - URL to evaluate
   * @param {Object} ruleAnalysis - Analysis from RuleEngine
   * @param {Object} reputationAnalysis - Analysis from DomainReputation
   * @returns {Object} Final decision
   */
  static makeDecision(urlString, ruleAnalysis, reputationAnalysis) {
    let combinedScore = 0;
    const factors = [];

    // Factor 1: Rule-based risk score (weight: 50%)
    const ruleScore = ruleAnalysis.riskScore || 0;
    const ruleFactor = ruleScore * 0.5;
    combinedScore += ruleFactor;
    
    if (ruleScore > 0) {
      factors.push({
        source: 'URL Rules',
        score: ruleScore,
        contribution: ruleFactor,
        details: ruleAnalysis.risks || []
      });
    }

    // Factor 2: Domain reputation (weight: 40%)
    let reputationScore = 0;
    if (reputationAnalysis) {
      if (reputationAnalysis.verdict === 'BLACKLISTED') {
        reputationScore = 100;
      } else if (reputationAnalysis.verdict === 'SUSPICIOUS') {
        reputationScore = reputationAnalysis.score || 60;
      } else {
        reputationScore = reputationAnalysis.score || 0;
      }
    }
    
    const reputationFactor = reputationScore * 0.4;
    combinedScore += reputationFactor;
    
    if (reputationScore > 0) {
      factors.push({
        source: 'Domain Reputation',
        score: reputationScore,
        contribution: reputationFactor,
        verdict: reputationAnalysis?.verdict,
        details: reputationAnalysis?.reason || 'Unknown'
      });
    }

    // Factor 3: Domain/TLD analysis (weight: 10%)
    let tldScore = 0;
    const parsedDomain = ruleAnalysis.parsed.hostname || '';
    const tldMatch = parsedDomain.match(/\.([a-z0-9]+)$/i);
    const tld = tldMatch ? tldMatch[1] : '';
    
    if (reputationAnalysis && reputationAnalysis.tldScore) {
      tldScore = reputationAnalysis.tldScore;
    }
    
    const tldFactor = tldScore * 0.1;
    combinedScore += tldFactor;
    
    if (tldScore > 0) {
      factors.push({
        source: 'TLD Analysis',
        score: tldScore,
        contribution: tldFactor,
        tld: tld
      });
    }

    // Determine verdict based on combined score
    const verdict = this.getVerdict(combinedScore);
    
    // Compile final decision
    const decision = {
      url: urlString,
      verdict: verdict.action,
      riskLevel: verdict.level,
      combinedScore: Math.min(combinedScore, 100),
      maxScore: 100,
      factors: factors,
      timestamp: new Date().toISOString(),
      shouldBlock: verdict.action === 'BLOCK',
      canBypass: verdict.action === 'WARN',
      details: {
        domain: ruleAnalysis.parsed.domain,
        hostname: ruleAnalysis.parsed.hostname,
        isIP: ruleAnalysis.parsed.isIP,
        urlLength: ruleAnalysis.parsed.length
      },
      reasoning: this.generateReasoning(verdict, factors, ruleAnalysis)
    };

    return decision;
  }

  /**
   * Determine verdict from combined score
   * @param {number} score - Combined score 0-100
   * @returns {Object} Verdict info
   */
  static getVerdict(score) {
    if (score >= 75) {
      return {
        action: 'BLOCK',
        level: 'CRITICAL',
        color: '#d32f2f',
        confidence: 'Very High',
        allowBypass: false
      };
    } else if (score >= 55) {
      return {
        action: 'BLOCK',
        level: 'HIGH',
        color: '#f57c00',
        confidence: 'High',
        allowBypass: false
      };
    } else if (score >= 35) {
      return {
        action: 'WARN',
        level: 'MEDIUM',
        color: '#fbc02d',
        confidence: 'Medium',
        allowBypass: true
      };
    } else if (score >= 15) {
      return {
        action: 'WARN',
        level: 'LOW',
        color: '#388e3c',
        confidence: 'Low',
        allowBypass: true
      };
    } else {
      return {
        action: 'ALLOW',
        level: 'SAFE',
        color: '#1976d2',
        confidence: 'Very High',
        allowBypass: false
      };
    }
  }

  /**
   * Generate human-readable reasoning
   * @param {Object} verdict - Verdict info
   * @param {Array} factors - Contributing factors
   * @param {Object} ruleAnalysis - Rule analysis result
   * @returns {string} Reasoning text
   */
  static generateReasoning(verdict, factors, ruleAnalysis) {
    let reasoning = '';

    switch (verdict.action) {
      case 'BLOCK':
        reasoning = 'This URL has been blocked because it exhibits multiple indicators of malicious intent. ';
        break;
      case 'WARN':
        reasoning = 'This URL appears suspicious and may pose a security risk. ';
        break;
      case 'ALLOW':
        reasoning = 'This URL appears to be safe based on our analysis. ';
        break;
    }

    // Add factor details
    if (factors.length > 0) {
      reasoning += 'Indicators: ';
      const indicators = factors.map(f => {
        if (f.source === 'URL Rules' && f.details && f.details.length > 0) {
          return f.details[0];
        } else if (f.source === 'Domain Reputation') {
          return f.details;
        }
        return f.source;
      }).filter(Boolean);
      
      reasoning += indicators.join(', ') + '.';
    }

    return reasoning;
  }

  /**
   * Check if URL matches safe whitelist patterns
   * @param {string} urlString
   * @returns {boolean}
   */
  static isSafeWhitelisted(urlString) {
    // Whitelist known safe browsers and extensions
    const safePatterns = [
      /^about:/,
      /^chrome:\/\//,
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^data:text\/html/
    ];

    for (const pattern of safePatterns) {
      if (pattern.test(urlString)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get decision summary for display
   * @param {Object} decision - Decision from makeDecision()
   * @returns {Object} Summary for UI
   */
  static getSummary(decision) {
    return {
      verdict: decision.verdict,
      riskLevel: decision.riskLevel,
      score: decision.combinedScore,
      domain: decision.details.domain,
      hostname: decision.details.hostname,
      reason: decision.reasoning,
      canBypass: decision.canBypass,
      color: this.getVerdict(decision.combinedScore).color,
      risks: decision.factors.filter(f => f.details).flatMap(f => 
        Array.isArray(f.details) ? f.details : [f.details]
      )
    };
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DecisionEngine;
}
