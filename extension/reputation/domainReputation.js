/**
 * Domain Reputation Module
 * Maintains and checks domain reputation against blacklist
 * Simulates domain age heuristics and reputation scoring
 */

class DomainReputation {
  constructor() {
    this.blacklist = [];
    this.reputationCache = new Map();
    this.domainAgeCache = new Map();
    this.initialized = false;
  }

  /**
   * Initialize domain reputation system
   * @param {Array} blacklistData - Blacklist from blacklist.json
   */
  async init(blacklistData) {
    if (this.initialized) return;
    
    try {
      // Load blacklist
      this.blacklist = blacklistData || [];
      
      // Pre-cache blacklist domains for O(1) lookup
      this.blacklist.forEach(entry => {
        this.reputationCache.set(entry.domain.toLowerCase(), {
          verdict: 'BLACKLISTED',
          severity: entry.severity,
          reason: entry.reason,
          source: 'Local Blacklist'
        });
      });
      
      this.initialized = true;
    } catch (e) {
      console.error('Failed to initialize domain reputation:', e);
    }
  }

  /**
   * Check domain reputation
   * @param {string} domain - Domain to check
   * @returns {Object} Reputation verdict
   */
  checkDomain(domain) {
    if (!domain) {
      return { verdict: 'UNKNOWN', score: 0, reason: 'No domain provided' };
    }

    const domainLower = domain.toLowerCase();

    // Check blacklist
    if (this.reputationCache.has(domainLower)) {
      return this.reputationCache.get(domainLower);
    }

    // Check domain age heuristics
    const ageAnalysis = this.analyzeRecentDomain(domain);
    if (ageAnalysis.score > 0) {
      return {
        verdict: 'SUSPICIOUS',
        score: ageAnalysis.score,
        reason: ageAnalysis.reason,
        source: 'Domain Age Heuristics'
      };
    }

    // Check for suspicious patterns in domain name
    const patternAnalysis = this.analyzedomainName(domain);
    if (patternAnalysis.score > 0) {
      return {
        verdict: 'SUSPICIOUS',
        score: patternAnalysis.score,
        reason: patternAnalysis.reason,
        source: 'Domain Name Pattern'
      };
    }

    return {
      verdict: 'TRUSTED',
      score: 0,
      reason: 'No reputation indicators found',
      source: 'Default Assessment'
    };
  }

  /**
   * Simulate domain age analysis
   * (In production: WHOIS lookup to get actual registration date)
   * @param {string} domain
   * @returns {Object} Age analysis
   */
  analyzeRecentDomain(domain) {
    // Heuristic 1: Check if domain has only numbers or random characters
    const randomPattern = /^[a-z0-9]+$/;
    const domainName = domain.split('.')[0];
    
    if (randomPattern.test(domainName) && domainName.length > 10) {
      return { score: 15, reason: 'Random character domain name' };
    }

    // Heuristic 2: Domains ending with numbers are often newly registered
    if (/\d$/.test(domainName)) {
      return { score: 10, reason: 'Domain name ends with numbers' };
    }

    // Heuristic 3: Excessive hyphens suggest auto-generated domains
    const hyphenCount = (domainName.match(/-/g) || []).length;
    if (hyphenCount > 2) {
      return { score: 12, reason: 'Excessive hyphens in domain name' };
    }

    return { score: 0, reason: 'Domain age appears normal' };
  }

  /**
   * Analyze domain name for suspicious patterns
   * @param {string} domain
   * @returns {Object} Pattern analysis
   */
  analyzedomainName(domain) {
    const domainName = domain.split('.')[0].toLowerCase();

    // Check for homograph attacks (look-alike characters)
    const homographPatterns = [
      /[0o][0o]{2,}/,  // Multiple 0s and Os
      /[il1][il1]{2,}/, // Multiple I, l, 1
      /[5s][5s]{2,}/    // Multiple 5s and Ss
    ];

    for (const pattern of homographPatterns) {
      if (pattern.test(domainName)) {
        return { score: 18, reason: 'Homograph attack detected (look-alike characters)' };
      }
    }

    // Check for unusual character combinations
    const consonantClusters = domainName.match(/[bcdfghjklmnpqrstvwxyz]{4,}/);
    if (consonantClusters) {
      return { score: 8, reason: 'Unusual consonant clustering' };
    }

    return { score: 0, reason: 'Domain name appears normal' };
  }

  /**
   * Analyze TLD reputation
   * @param {string} tld - Top-level domain
   * @returns {number} Risk score 0-20
   */
  analyzeTLD(tld) {
    if (!tld) return 0;

    const suspiciousTLDs = [
      'tk', 'xyz', 'top', 'work', 'download',
      'stream', 'review', 'science', 'party',
      'faith', 'webcam', 'trade', 'gdn',
      'accountant', 'fitness', 'loan', 'properties'
    ];

    if (suspiciousTLDs.includes(tld.toLowerCase())) {
      return 15;
    }

    // Single character TLDs are suspicious
    if (tld.length === 1) {
      return 10;
    }

    return 0;
  }

  /**
   * Get combined reputation score
   * @param {string} domain - Domain to analyze
   * @param {string} tld - Top-level domain
   * @returns {Object} Combined verdict
   */
  getReputationScore(domain, tld) {
    const domainVerdict = this.checkDomain(domain);
    const tldScore = this.analyzeTLD(tld);

    let combinedScore = 0;
    let finalVerdict = 'TRUSTED';

    if (domainVerdict.verdict === 'BLACKLISTED') {
      combinedScore = 100;
      finalVerdict = 'BLACKLISTED';
    } else if (domainVerdict.verdict === 'SUSPICIOUS') {
      combinedScore += domainVerdict.score || 0;
      combinedScore += tldScore;
      
      if (combinedScore >= 40) {
        finalVerdict = 'SUSPICIOUS';
      }
    } else {
      combinedScore = tldScore;
      if (combinedScore >= 15) {
        finalVerdict = 'SUSPICIOUS';
      }
    }

    return {
      domain,
      tld,
      verdict: finalVerdict,
      score: Math.min(combinedScore, 100),
      domainAnalysis: domainVerdict,
      tldScore: tldScore,
      source: domainVerdict.source
    };
  }

  /**
   * Add domain to local blacklist
   * @param {string} domain - Domain to blacklist
   * @param {string} reason - Reason for blacklist
   * @param {string} severity - Severity level
   */
  addToBlacklist(domain, reason, severity = 'HIGH') {
    const entry = {
      domain: domain.toLowerCase(),
      reason,
      severity,
      dateAdded: new Date().toISOString().split('T')[0]
    };

    this.blacklist.push(entry);
    this.reputationCache.set(domain.toLowerCase(), {
      verdict: 'BLACKLISTED',
      severity: severity,
      reason: reason,
      source: 'User Reported'
    });

    // Persist to storage
    if (typeof chrome !== 'undefined' && browser.storage) {
      browser.storage.local.set({ 
        'guardianlink_blacklist': this.blacklist 
      });
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.reputationCache.clear();
    this.domainAgeCache.clear();
  }

  /**
   * Get blacklist size
   * @returns {number} Number of domains in blacklist
   */
  getBlacklistSize() {
    return this.blacklist.length;
  }
}

// Create singleton instance
const domainReputationInstance = new DomainReputation();

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DomainReputation, domainReputationInstance };
}
