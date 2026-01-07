/**
 * URL Parser Utility
 * Parses URLs and extracts components for analysis
 */

class URLParser {
  /**
   * Parse a URL string into components
   * @param {string} urlString - The URL to parse
   * @returns {Object} Parsed URL components
   */
  static parse(urlString) {
    try {
      const url = new URL(urlString);
      
      return {
        href: url.href,
        protocol: url.protocol,
        hostname: url.hostname,
        domain: this.extractDomain(url.hostname),
        subdomain: this.extractSubdomain(url.hostname),
        port: url.port,
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        isIP: this.isIPAddress(url.hostname),
        queryParams: this.parseQueryParams(url.search),
        length: urlString.length,
        isEncoded: this.isEncoded(urlString),
        isValid: true
      };
    } catch (e) {
      return {
        href: urlString,
        isValid: false,
        error: e.message
      };
    }
  }

  /**
   * Extract domain from hostname
   * @param {string} hostname - The hostname
   * @returns {string} Domain name
   */
  static extractDomain(hostname) {
    if (!hostname) return '';
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts[parts.length - 2] + '.' + parts[parts.length - 1];
    }
    return hostname;
  }

  /**
   * Extract subdomain from hostname
   * @param {string} hostname - The hostname
   * @returns {string} Subdomain
   */
  static extractSubdomain(hostname) {
    if (!hostname) return '';
    const parts = hostname.split('.');
    if (parts.length > 2) {
      return parts.slice(0, -2).join('.');
    }
    return '';
  }

  /**
   * Check if hostname is an IP address
   * @param {string} hostname - The hostname
   * @returns {boolean} True if IP address
   */
  static isIPAddress(hostname) {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^(\[)?([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(\])?$/;
    return ipv4Regex.test(hostname) || ipv6Regex.test(hostname);
  }

  /**
   * Parse query parameters
   * @param {string} queryString - The query string
   * @returns {Object} Parsed parameters
   */
  static parseQueryParams(queryString) {
    const params = {};
    if (!queryString) return params;
    
    const searchParams = new URLSearchParams(queryString);
    for (const [key, value] of searchParams) {
      params[key] = value;
    }
    return params;
  }

  /**
   * Check if URL is encoded
   * @param {string} urlString - The URL string
   * @returns {boolean} True if encoded
   */
  static isEncoded(urlString) {
    try {
      return decodeURIComponent(urlString) !== urlString;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if URL contains suspicious patterns
   * @param {string} urlString - The URL to check
   * @returns {Array} Found suspicious patterns
   */
  static findSuspiciousPatterns(urlString) {
    const patterns = [];
    
    // Check for common encoding patterns
    if (urlString.includes('%') || urlString.includes('&#')) {
      patterns.push('heavy_encoding');
    }
    
    // Check for multiple redirects
    const redirectCount = (urlString.match(/redirect|forward|go\?/gi) || []).length;
    if (redirectCount > 1) {
      patterns.push('multiple_redirects');
    }
    
    // Check for suspicious protocols
    if (urlString.match(/^(javascript|data|vbscript):/i)) {
      patterns.push('dangerous_protocol');
    }
    
    return patterns;
  }

  /**
   * Get TLD from hostname
   * @param {string} hostname - The hostname
   * @returns {string} Top-level domain
   */
  static getTLD(hostname) {
    if (!hostname) return '';
    const parts = hostname.split('.');
    return parts[parts.length - 1].toLowerCase();
  }
}

// Export for use in both content and background scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = URLParser;
}
