const fs = require('fs');
const path = require('path');

const HEURISTICS_FILE =
  process.env.HEURISTICS_FILE ||
  path.join(__dirname, '..', 'data', 'heuristics.json');

fs.mkdirSync(path.dirname(HEURISTICS_FILE), { recursive: true });

/**
 * Calculate days between two timestamps
 */
function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Apply time-based decay to heuristic confidence scores
 * 
 * Heuristics lose confidence over time as threat landscape changes.
 * This ensures old rules don't overly influence modern analysis.
 * 
 * Rules expire when confidence drops below minConfidence threshold.
 */
function applyHeuristicDecay() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(HEURISTICS_FILE, 'utf8'));
  } catch {
    // File doesn't exist or is invalid, skip decay
    return;
  }

  if (!data.rules || !Array.isArray(data.rules)) {
    return;
  }

  const now = Date.now();
  let changed = false;

  for (const rule of data.rules) {
    // Skip inactive rules
    if (!rule.active) continue;
    
    // Skip rules without decay configuration
    if (!rule.confidenceDecayPerDay) continue;

    // Calculate days since rule was last seen
    const lastSeen = new Date(rule.lastSeenAt || rule.createdAt).getTime();
    const days = daysBetween(lastSeen, now);
    
    // No decay if rule is very recent
    if (days <= 0) continue;

    // Apply decay formula: newConfidence = confidence - (days * decayPerDay)
    const decay = days * rule.confidenceDecayPerDay;
    const newConfidence = Math.max(0, rule.confidence - decay);

    // Update rule with new confidence
    rule.confidence = Number(newConfidence.toFixed(3));
    rule.lastSeenAt = new Date(now).toISOString();

    // Check if rule has expired (confidence below minimum threshold)
    if (rule.confidence < (rule.minConfidence || 0.1)) {
      rule.active = false;
      rule.expiresAt = new Date(now).toISOString();
      console.log(`🧠 Heuristic expired: ${rule.id} (confidence: ${rule.confidence.toFixed(3)})`);
    } else if (days >= 7) {
      // Log significant decay events (weekly)
      console.log(`📉 Heuristic decay: ${rule.id} (${days}d) → confidence: ${rule.confidence.toFixed(3)}`);
    }

    changed = true;
  }

  // Persist changes to disk
  if (changed) {
    try {
      fs.writeFileSync(HEURISTICS_FILE, JSON.stringify(data, null, 2), 'utf8');
      console.log('✅ Heuristic decay applied and saved');
    } catch (err) {
      console.warn('⚠️ Could not save heuristics after decay:', err.message);
    }
  }
}

/**
 * Reset decay for a specific rule (when it's seen again)
 */
function resetDecayForRule(ruleId) {
  try {
    const data = JSON.parse(fs.readFileSync(HEURISTICS_FILE, 'utf8'));
    const rule = data.rules?.find(r => r.id === ruleId);
    
    if (rule) {
      rule.lastSeenAt = new Date().toISOString();
      rule.active = true;
      rule.expiresAt = null;
      
      fs.writeFileSync(HEURISTICS_FILE, JSON.stringify(data, null, 2), 'utf8');
      console.log(`✅ Decay reset for rule: ${ruleId}`);
      return true;
    }
  } catch (err) {
    console.warn('⚠️ Could not reset decay:', err.message);
  }
  
  return false;
}

/**
 * Get active rules count
 */
function getActiveRulesCount() {
  try {
    const data = JSON.parse(fs.readFileSync(HEURISTICS_FILE, 'utf8'));
    return data.rules?.filter(r => r.active).length || 0;
  } catch {
    return 0;
  }
}

/**
 * Get expired rules count
 */
function getExpiredRulesCount() {
  try {
    const data = JSON.parse(fs.readFileSync(HEURISTICS_FILE, 'utf8'));
    return data.rules?.filter(r => !r.active && r.expiresAt).length || 0;
  } catch {
    return 0;
  }
}

module.exports = {
  applyHeuristicDecay,
  resetDecayForRule,
  getActiveRulesCount,
  getExpiredRulesCount,
  daysBetween
};
