/**
 * Cache Utility
 * Manages in-memory and persistent caching for performance
 */

class Cache {
  constructor() {
    this.memoryCache = new Map();
    this.cacheExpiry = new Map();
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttlMs - Time to live in milliseconds (0 = no expiry)
   */
  set(key, value, ttlMs = 3600000) { // Default 1 hour
    this.memoryCache.set(key, value);
    
    if (ttlMs > 0) {
      this.cacheExpiry.set(key, Date.now() + ttlMs);
    }
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or null
   */
  get(key) {
    // Check if expired
    if (this.cacheExpiry.has(key)) {
      if (Date.now() > this.cacheExpiry.get(key)) {
        this.delete(key);
        return null;
      }
    }
    
    return this.memoryCache.get(key) || null;
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if exists and not expired
   */
  has(key) {
    if (!this.memoryCache.has(key)) {
      return false;
    }
    
    if (this.cacheExpiry.has(key)) {
      if (Date.now() > this.cacheExpiry.get(key)) {
        this.delete(key);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Delete a cache entry
   * @param {string} key - Cache key
   */
  delete(key) {
    this.memoryCache.delete(key);
    this.cacheExpiry.delete(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.memoryCache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Get cache size
   * @returns {number} Number of items in cache
   */
  size() {
    return this.memoryCache.size;
  }

  /**
   * Clean expired entries
   */
  cleanExpired() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, expiryTime] of this.cacheExpiry) {
      if (now > expiryTime) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.delete(key));
    return expiredKeys.length;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      size: this.memoryCache.size,
      expiredCount: Array.from(this.cacheExpiry.values()).filter(
        expiry => expiry < Date.now()
      ).length
    };
  }
}

// Create singleton instance
const globalCache = new Cache();

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Cache, globalCache };
}
