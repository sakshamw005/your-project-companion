const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'rules.json');

let rules = { version: '1.0', generatedAt: new Date().toISOString(), entries: [] };
let whitelist = [];
let blacklist = [];

function _normalizeHostnameFromUrl(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return (u || '').toLowerCase();
  }
}

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    rules = JSON.parse(raw);
    whitelist = rules.entries.filter(e => e.type === 'whitelist');
    blacklist = rules.entries.filter(e => e.type === 'blacklist');
    return rules;
  } catch (err) {
    // If file missing or invalid, initialize default structure
    console.warn('rulesManager: could not load rules file, initializing empty rules', err.message);
    rules = { version: '1.0', generatedAt: new Date().toISOString(), entries: [] };
    whitelist = [];
    blacklist = [];
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(rules, null, 2), 'utf8');
    } catch (e) {}
    return rules;
  }
}

function save() {
  rules.generatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(rules, null, 2), 'utf8');
}

function _domainMatches(entryValue, hostname) {
  if (!entryValue || !hostname) return false;
  entryValue = entryValue.toLowerCase();
  hostname = hostname.toLowerCase();
  if (hostname === entryValue) return true;
  if (hostname.endsWith('.' + entryValue)) return true; // subdomain match
  return false;
}

function isWhitelisted(urlOrDomain) {
  const host = _normalizeHostnameFromUrl(urlOrDomain);
  for (const e of whitelist) {
    if (e.selector === 'domain' && _domainMatches(e.value, host)) return e;
    if (e.selector === 'url' && (urlOrDomain || '') === e.value) return e;
    if (e.selector === 'ip' && e.value === host) return e;
  }
  return null;
}

function isBlacklisted(urlOrDomain) {
  const host = _normalizeHostnameFromUrl(urlOrDomain);
  for (const e of blacklist) {
    if (e.selector === 'domain' && _domainMatches(e.value, host)) return e;
    if (e.selector === 'url' && (urlOrDomain || '') === e.value) return e;
    if (e.selector === 'ip' && e.value === host) return e;
  }
  return null;
}

function addRule(entry) {
  if (!entry || !entry.id) throw new Error('entry.id is required');
  rules.entries.push(entry);
  // refresh caches
  whitelist = rules.entries.filter(e => e.type === 'whitelist');
  blacklist = rules.entries.filter(e => e.type === 'blacklist');
  save();
  return entry;
}

function getAll() {
  return rules;
}

function count() {
  return rules.entries.length;
}

module.exports = { load, save, isWhitelisted, isBlacklisted, addRule, getAll, count };
