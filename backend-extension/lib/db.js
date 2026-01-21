const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'guardianlink.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Open or create database
const db = new Database(DB_PATH);

// Enable foreign keys and optimize for performance
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -64000');

/**
 * Initialize database schema
 */
function initializeSchema() {
  try {
    // URL intelligence cache table
    db.exec(`
      CREATE TABLE IF NOT EXISTS url_intelligence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        verdict TEXT NOT NULL,
        confidence REAL NOT NULL,
        source TEXT DEFAULT 'guardianlink',
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index for fast lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_url_intelligence_url 
      ON url_intelligence(url);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_url_intelligence_last_seen 
      ON url_intelligence(last_seen DESC);
    `);

    // Scan history table
    db.exec(`
      CREATE TABLE IF NOT EXISTS scan_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        verdict TEXT,
        confidence REAL,
        scan_data TEXT,
        scan_time_ms INTEGER,
        cached BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scan_history_created_at 
      ON scan_history(created_at DESC);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scan_history_url 
      ON scan_history(url);
    `);

    // Heuristic hits table (for learning)
    db.exec(`
      CREATE TABLE IF NOT EXISTS heuristic_hits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        rule_id TEXT,
        rule_name TEXT,
        score_impact REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_heuristic_hits_rule_id 
      ON heuristic_hits(rule_id);
    `);

    console.log('✅ Database schema initialized');
    return true;
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    return false;
  }
}

/**
 * Get cached URL analysis
 */
function getCachedUrl(url) {
  try {
    const stmt = db.prepare(`
      SELECT verdict, confidence, metadata, last_seen
      FROM url_intelligence
      WHERE url = ?
    `);
    return stmt.get(url);
  } catch (err) {
    console.error('Database query error:', err.message);
    return null;
  }
}

/**
 * Upsert URL analysis result
 */
function upsertUrl(url, verdict, confidence, metadata = {}) {
  try {
    const stmt = db.prepare(`
      INSERT INTO url_intelligence (url, verdict, confidence, metadata, first_seen, last_seen)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(url) DO UPDATE SET
        verdict = excluded.verdict,
        confidence = excluded.confidence,
        metadata = excluded.metadata,
        last_seen = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(url, verdict, confidence, JSON.stringify(metadata));
    return true;
  } catch (err) {
    console.error('Database insert error:', err.message);
    return false;
  }
}

/**
 * Log scan to history
 */
function logScan(url, verdict, confidence, scanData, scanTimeMs, cached) {
  try {
    const stmt = db.prepare(`
      INSERT INTO scan_history (url, verdict, confidence, scan_data, scan_time_ms, cached)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(url, verdict, confidence, JSON.stringify(scanData), scanTimeMs, cached ? 1 : 0);
    return true;
  } catch (err) {
    console.error('Database insert error:', err.message);
    return false;
  }
}

/**
 * Get scan statistics
 */
function getScanStats() {
  try {
    const stats = {};
    
    // Total cached URLs
    const cachedCount = db.prepare(`
      SELECT COUNT(*) as count FROM url_intelligence
    `).get();
    stats.cachedUrls = cachedCount.count;

    // Scan history
    const scanCount = db.prepare(`
      SELECT COUNT(*) as count FROM scan_history
    `).get();
    stats.totalScans = scanCount.count;

    // Cache hit rate
    const cacheHits = db.prepare(`
      SELECT COUNT(*) as count FROM scan_history WHERE cached = 1
    `).get();
    stats.cacheHits = cacheHits.count;
    stats.cacheHitRate = stats.totalScans > 0 
      ? ((stats.cacheHits / stats.totalScans) * 100).toFixed(2) + '%'
      : '0%';

    // Average scan time
    const avgTime = db.prepare(`
      SELECT AVG(scan_time_ms) as avg FROM scan_history
    `).get();
    stats.averageScanTimeMs = avgTime.avg ? avgTime.avg.toFixed(2) : 0;

    // Verdicts distribution
    const verdicts = db.prepare(`
      SELECT verdict, COUNT(*) as count FROM url_intelligence GROUP BY verdict
    `).all();
    stats.verdictDistribution = {};
    verdicts.forEach(row => {
      stats.verdictDistribution[row.verdict] = row.count;
    });

    return stats;
  } catch (err) {
    console.error('Database query error:', err.message);
    return null;
  }
}

/**
 * Clean old cache entries (older than 30 days)
 */
function cleanOldCache(daysOld = 30) {
  try {
    const result = db.prepare(`
      DELETE FROM url_intelligence
      WHERE last_seen < datetime('now', '-' || ? || ' days')
    `).run(daysOld);
    
    console.log(`🧹 Cleaned ${result.changes} old cache entries`);
    return result.changes;
  } catch (err) {
    console.error('Database cleanup error:', err.message);
    return 0;
  }
}

/**
 * Backup database
 */
function backupDatabase() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(dataDir, `guardianlink_backup_${timestamp}.db`);
    
    db.exec(`VACUUM INTO '${backupPath}'`);
    console.log(`✅ Database backed up to ${backupPath}`);
    return backupPath;
  } catch (err) {
    console.error('Backup error:', err.message);
    return null;
  }
}

/**
 * Close database connection
 */
function close() {
  try {
    db.close();
    console.log('✅ Database closed');
  } catch (err) {
    console.error('Error closing database:', err.message);
  }
}

// Initialize schema on module load
initializeSchema();

module.exports = {
  db,
  getCachedUrl,
  upsertUrl,
  logScan,
  getScanStats,
  cleanOldCache,
  backupDatabase,
  close
};
