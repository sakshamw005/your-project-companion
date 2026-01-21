const fs = require('fs');
const path = require('path');

// In-memory cache with 24-hour TTL for quick lookups
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const memoryCache = new Map(); // url -> { verdict, confidence, metadata, timestamp }

// Persistent cache file for offline support
const CACHE_FILE = path.join(__dirname, '..', 'data', 'url_cache.json');

function canonicalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    u.hash = '';
    u.search = '';
    
    // Remove default ports
    if ((u.protocol === 'https:' && u.port === '443') ||
        (u.protocol === 'http:' && u.port === '80')) {
      u.port = '';
    }
    
    // Normalize trailing slash (except for root)
    if (u.pathname.endsWith('/') && u.pathname !== '/') {
      u.pathname = u.pathname.slice(0, -1);
    }
    
    return u.toString();
  } catch (err) {
    return rawUrl.toLowerCase();
  }
}

// Load persistent cache from disk
function loadPersistentCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      
      // Populate memory cache from persistent cache
      for (const [url, entry] of Object.entries(data)) {
        if (entry.timestamp) {
          const ageMs = Date.now() - entry.timestamp;
          if (ageMs < CACHE_TTL_MS) {
            memoryCache.set(url, entry);
          }
        }
      }
      
      console.log(`✅ Loaded ${memoryCache.size} cached URL analyses`);
      return memoryCache.size;
    }
  } catch (err) {
    console.warn('⚠️ Could not load persistent cache:', err.message);
  }
  return 0;
}

// Save cache to persistent storage with error handling
function savePersistentCache() {
  try {
    const cacheData = {};
    
    // Convert memory cache to object
    for (const [url, entry] of memoryCache.entries()) {
      cacheData[url] = entry;
    }
    
    // Ensure data directory exists
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write with atomic operation: write to temp file first, then rename
    const tempFile = CACHE_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(cacheData, null, 2), 'utf8');
    
    // Atomic rename ensures data integrity
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
    fs.renameSync(tempFile, CACHE_FILE);
    
    console.log(`💾 Persistent cache saved (${memoryCache.size} entries)`);
  } catch (err) {
    console.error('❌ Could not save persistent cache:', err.message);
    // Don't throw - memory cache is still valid
  }
}

/**
 * Get cached scan result for a URL
 * Returns cached result if available and not expired
 * Otherwise returns null
 */
function getCachedScan(url) {
  const canonicalized = canonicalizeUrl(url);
  const cached = memoryCache.get(canonicalized);
  
  if (!cached) {
    return null;
  }
  
  const ageMs = Date.now() - cached.timestamp;
  
  // Check if cache entry is still valid
  if (ageMs > CACHE_TTL_MS) {
    memoryCache.delete(canonicalized);
    return null;
  }
  
  return {
    verdict: cached.verdict,
    confidence: cached.confidence,
    metadata: cached.metadata || {},
    ageMs,
    cached: true
  };
}

/**
 * Store a scan result in cache
 * Updates both memory and persistent cache with error handling
 */
function upsertScan(url, verdict, confidence, metadata = {}) {
  const canonicalized = canonicalizeUrl(url);
  const now = Date.now();
  
  const cacheEntry = {
    verdict,
    confidence,
    metadata,
    timestamp: now,
    originalUrl: url,
    canonicalUrl: canonicalized,
    // Store additional metadata for faster retrieval
    riskLevel: metadata.riskLevel || 'UNKNOWN',
    overallStatus: metadata.overallStatus || 'unknown',
    sources: metadata.sources || []
  };
  
  // Update memory cache
  memoryCache.set(canonicalized, cacheEntry);
  
  // Save to persistent storage with error handling
  try {
    setImmediate(() => {
      try {
        savePersistentCache();
        console.log(`✅ Cache saved for: ${canonicalized}`);
      } catch (err) {
        console.error('❌ Failed to save cache to disk:', err.message);
        // Continue anyway - memory cache is still valid
      }
    });
  } catch (err) {
    console.error('❌ Error scheduling cache save:', err.message);
  }
}

/**
 * Clear specific cache entry
 */
function invalidateCache(url) {
  const canonicalized = canonicalizeUrl(url);
  if (memoryCache.has(canonicalized)) {
    memoryCache.delete(canonicalized);
    setImmediate(() => savePersistentCache());
    return true;
  }
  return false;
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  const stats = {
    totalCached: memoryCache.size,
    cacheFile: CACHE_FILE,
    ttlMs: CACHE_TTL_MS,
    ttlHours: CACHE_TTL_MS / (60 * 60 * 1000)
  };
  
  return stats;
}

/**
 * Clear entire cache
 */
function clearCache() {
  memoryCache.clear();
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
  } catch (err) {
    console.warn('⚠️ Could not delete cache file:', err.message);
  }
}

// Load cache on module initialization
loadPersistentCache();

module.exports = {
  getCachedScan,
  upsertScan,
  canonicalizeUrl,
  invalidateCache,
  getCacheStats,
  clearCache,
  loadPersistentCache,
  savePersistentCache
};
