/**
 * URL Rules Engine
 * Defines and applies security rules to URLs
 */

class URLRules {
  static SUSPICIOUS_KEYWORDS = [
    'login', 'signin', 'sign-in', 'logon',
    'verify', 'confirm', 'validate',
    'kyc', 'aml', 'authentication',
    'reward', 'bonus', 'prize', 'claim', 'won',
    'cashback', 'refund', 'rebate',
    'free', 'complimentary',
    'update', 'upgrade', 'patch',
    'secure', 'security', 'alert',
    'urgent', 'critical', 'immediate',
    'act now', 'click here', 'confirm',
    'paypal', 'amazon', 'apple', 'microsoft',
    'bank', 'payment', 'credit card'
  ];

  static SUSPICIOUS_SHORTENERS = [
    'bit.ly', 'tinyurl.com', 'goo.gl', 'ow.ly',
    'short.link', 'buff.ly', 'adf.ly', 't.co',
    'lnk.co', 'is.gd', 'cli.gs', 'u.to'
  ];

  static SUSPICIOUS_TLDS = [
    'tk', 'xyz', 'top', 'work', 'download',
    'stream', 'review', 'science', 'party',
    'faith', 'webcam', 'trade', 'gdn',
    'accountant', 'fitness', 'loan', 'properties'
  ];

  /**
   * Evaluate all rules against a URL
   * @param {string} urlString - URL to evaluate
   * @param {Object} parsedURL - Parsed URL object from URLParser
   * @returns {Object} Risk analysis result
   */
  static evaluateRules(urlString, parsedURL) {
    const results = {
      rules: {},
      totalScore: 0,
      maxScore: 100,
      risks: [],
      checks: []
    };

    if (!parsedURL || !parsedURL.isValid) {
      return {
        ...results,
        rules: { invalid_url: 100 },
        totalScore: 100,
        risks: ['Invalid URL format'],
        checks: ['URL parsing failed']
      };
    }

    // Rule 1: Check URL length
    results.checks.push('Checking URL length...');
    const lengthScore = this.checkURLLength(urlString);
    if (lengthScore > 0) {
      results.rules.excessive_length = lengthScore;
      results.risks.push(`Abnormally long URL (${urlString.length} chars)`);
    }

    // Rule 2: Check for URL shorteners
    results.checks.push('Checking for URL shorteners...');
    const shortenerScore = this.checkShortener(parsedURL.hostname);
    if (shortenerScore > 0) {
      results.rules.shortener = shortenerScore;
      results.risks.push('URL shortener detected');
    }

    // Rule 3: Check for suspicious keywords
    results.checks.push('Checking for suspicious keywords...');
    const keywordScore = this.checkSuspiciousKeywords(urlString);
    if (keywordScore > 0) {
      results.rules.suspicious_keywords = keywordScore;
      results.risks.push('Suspicious keywords in URL');
    }

    // Rule 4: Check for typosquatting patterns
    results.checks.push('Checking for typosquatting...');
    const typosquatScore = this.checkTyposquatting(urlString);
    if (typosquatScore > 0) {
      results.rules.typosquatting = typosquatScore;
      results.risks.push('Possible typosquatting detected');
    }

    // Rule 5: Check for IP-based URLs
    results.checks.push('Checking for IP-based URLs...');
    const ipScore = this.checkIPBased(parsedURL);
    if (ipScore > 0) {
      results.rules.ip_based = ipScore;
      results.risks.push('Direct IP address used instead of domain');
    }

    // Rule 6: Check for excessive query parameters
    results.checks.push('Checking query parameters...');
    const queryScore = this.checkExcessiveParams(parsedURL);
    if (queryScore > 0) {
      results.rules.excessive_params = queryScore;
      results.risks.push('Excessive query parameters');
    }

    // Rule 7: Check for encoding/obfuscation
    results.checks.push('Checking for encoding...');
    const encodingScore = this.checkEncoding(urlString, parsedURL);
    if (encodingScore > 0) {
      results.rules.encoding_obfuscation = encodingScore;
      results.risks.push('Possible URL encoding/obfuscation');
    }

    // Rule 8: Check for suspicious subdomains
    results.checks.push('Checking subdomains...');
    const subdomainScore = this.checkSuspiciousSubdomains(parsedURL.subdomain);
    if (subdomainScore > 0) {
      results.rules.suspicious_subdomain = subdomainScore;
      results.risks.push('Suspicious subdomain structure');
    }

    // Rule 9: Check for suspicious TLD
    results.checks.push('Checking TLD...');
    const tldScore = this.checkSuspiciousTLD(parsedURL);
    if (tldScore > 0) {
      results.rules.suspicious_tld = tldScore;
      results.risks.push('URL uses suspicious TLD');
    }

    // Calculate total score
    Object.values(results.rules).forEach(score => {
      results.totalScore += score;
    });

    // Cap at max score
    results.totalScore = Math.min(results.totalScore, results.maxScore);

    return results;
  }

  /**
   * Check URL length
   * @param {string} urlString
   * @returns {number} Score (0-15)
   */
  static checkURLLength(urlString) {
    const length = urlString.length;
    if (length > 2000) return 15;
    if (length > 1000) return 10;
    if (length > 500) return 5;
    return 0;
  }

  /**
   * Check for known URL shorteners
   * @param {string} hostname
   * @returns {number} Score (0-20)
   */
  static checkShortener(hostname) {
    if (!hostname) return 0;
    
    const lower = hostname.toLowerCase();
    for (const shortener of this.SUSPICIOUS_SHORTENERS) {
      if (lower.includes(shortener)) {
        return 20;
      }
    }
    return 0;
  }

  /**
   * Check for suspicious keywords
   * @param {string} urlString
   * @returns {number} Score (0-25)
   */
  static checkSuspiciousKeywords(urlString) {
    const lower = urlString.toLowerCase();
    let count = 0;
    
    for (const keyword of this.SUSPICIOUS_KEYWORDS) {
      if (lower.includes(keyword)) {
        count++;
      }
    }
    
    if (count >= 3) return 25;
    if (count === 2) return 15;
    if (count === 1) return 8;
    return 0;
  }

  /**
   * Check for typosquatting patterns
   * @param {string} urlString
   * @returns {number} Score (0-20)
   */
  static checkTyposquatting(urlString) {
    const patterns = [
      /g00gle|gogle|goggle|googlе|goog1e/i,
      /faceb00k|facebool|fb-secure/i,
      /paytm-secure|paytml|paym/i,
      /amaz0n|amazom|amazon-secure/i,
      /micr0soft|microsft/i,
      /appIe|aple|ample/i
    ];
    
    for (const pattern of patterns) {
      if (pattern.test(urlString)) {
        return 20;
      }
    }
    return 0;
  }

  /**
   * Check for IP-based URLs
   * @param {Object} parsedURL
   * @returns {number} Score (0-25)
   */
  static checkIPBased(parsedURL) {
    if (parsedURL.isIP) {
      return 25;
    }
    return 0;
  }

  /**
   * Check for excessive query parameters
   * @param {Object} parsedURL
   * @returns {number} Score (0-10)
   */
  static checkExcessiveParams(parsedURL) {
    const paramCount = Object.keys(parsedURL.queryParams || {}).length;
    
    if (paramCount > 10) return 10;
    if (paramCount > 6) return 7;
    if (paramCount > 3) return 3;
    return 0;
  }

  /**
   * Check for encoding/obfuscation
   * @param {string} urlString
   * @param {Object} parsedURL
   * @returns {number} Score (0-15)
   */
  static checkEncoding(urlString, parsedURL) {
    let score = 0;
    
    // Check for percent encoding
    if ((urlString.match(/%/g) || []).length > 10) {
      score += 8;
    }
    
    // Check for HTML entities
    if (urlString.includes('&#')) {
      score += 7;
    }
    
    // Check if heavily encoded
    if (parsedURL.isEncoded) {
      score += 5;
    }
    
    return Math.min(score, 15);
  }

  /**
   * Check for suspicious subdomain patterns
   * @param {string} subdomain
   * @returns {number} Score (0-10)
   */
  static checkSuspiciousSubdomains(subdomain) {
    if (!subdomain) return 0;
    
    const suspiciousPatterns = [
      /secure|verify|confirm|update|login|signin/i,
      /admin|panel|dashboard/i,
      /api|service|internal/i,
      /\.\./, // Double dots
      /^-|-$/ // Leading/trailing dash
    ];
    
    const count = (subdomain.split('.').length - 1);
    if (count > 5) return 8;
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(subdomain)) {
        return 5;
      }
    }
    
    return 0;
  }

  /**
   * Check for suspicious TLDs
   * @param {Object} parsedURL
   * @returns {number} Score (0-10)
   */
  static checkSuspiciousTLD(parsedURL) {
    const tld = parsedURL.hostname ? parsedURL.hostname.split('.').pop().toLowerCase() : '';
    
    if (this.SUSPICIOUS_TLDS.includes(tld)) {
      return 10;
    }
    
    // Single character TLD is suspicious
    if (tld.length === 1) {
      return 5;
    }
    
    return 0;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = URLRules;
}
