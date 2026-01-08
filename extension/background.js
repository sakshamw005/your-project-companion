/**
 * Enhanced Background Service Worker - GuardianLink v2.0
 * Multi-phase URL detection with real API integration and website sync
 */

// Configuration
const CONFIG = {
  API_KEYS: {
    VIRUSTOTAL: '',
    ABUSEIPDB: '',
    GOOGLE_SAFE_BROWSING: ''
  },
  WEBSITE_API: 'http://localhost:3001', // Just the base URL, endpoints added in functions
  TIMEOUTS: {
    API_CALL: 5000,           // Initial request timeout
    POLL_TIMEOUT: 30000,      // Total polling timeout (30 seconds)
    TOTAL_ANALYSIS: 35000     // Total analysis timeout (35 seconds)
  },
  THRESHOLDS: {
    BLOCK: 50,    // < 50% = BLOCK
    WARN: 80,     // 50-79% = WARN
    ALLOW: 80     // >= 80% = ALLOW
  }
};

// State
let blacklistData = [];
let whitelistDomains = new Set();
let extensionToken = null;
let userId = null;
let isAuthenticated = false;
let recentBypassedURLs = new Map(); // Store bypassed URLs with timestamp to prevent re-blocking

// === FIX #1: NUKE ALL STALE DNR RULES ON STARTUP ===
// This removes any leftover blocking rules from previous runs that may not be removed
chrome.declarativeNetRequest.getDynamicRules(rules => {
  const ids = rules.map(r => r.id);
  if (ids.length > 0) {
    chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
  }
});

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('🛡️ GuardianLink v2.0 Enhanced Edition - INSTALLED WITH WEBSITE SYNC');
  loadBlacklist();
  initializeWhitelist();
  verifyExtensionToken();
  setupContextMenus();
  testBackendConnection();
  
  chrome.storage.local.get(['guardianlink_logs'], (data) => {
    const logs = data.guardianlink_logs || [];
    console.log('📊 Loaded logs:', logs.length, 'entries');
  });
});

// === FIX: Clear stale state on startup ===
chrome.runtime.onStartup?.addListener(() => {
  console.log('🔄 Extension starting up, clearing stale state');
  allowedTabs.clear();
  safeUrls.clear();
  recentBypassedURLs.clear();
  blockedTabRules.clear();
  analysisInProgressByTab.clear();
  console.log('✅ Stale state cleared');
});

// Setup context menus for right-click scanning
function setupContextMenus() {
  chrome.contextMenus.removeAll();
  
  // Context menu for links
  chrome.contextMenus.create({
    id: 'scan-link',
    title: 'Scan with Guardian Link',
    contexts: ['link']
  });
  
  // Context menu for current page
  chrome.contextMenus.create({
    id: 'scan-page',
    title: 'Scan this page',
    contexts: ['page']
  });
  
  console.log('✅ Context menus created');
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'scan-link' && info.linkUrl) {
    console.log('🔗 Scanning link:', info.linkUrl);
    analyzeURL(info.linkUrl, tab.id, 'context-menu').then(decision => {
      console.log('📋 Decision:', decision);
    });
  }
  
  if (info.menuItemId === 'scan-page') {
    console.log('📄 Scanning page:', tab.url);
    analyzeURL(tab.url, tab.id, 'context-menu').then(decision => {
      console.log('📋 Decision:', decision);
    });
  }
});

// Verify extension token on startup and periodically
async function verifyExtensionToken() {
  try {
    extensionToken = chrome.runtime.id;
    console.log('✅ Extension token verified:', extensionToken);
  } catch (error) {
    console.error('❌ Failed to verify token:', error);
  }
  
  // Verify again in 30 minutes
  setTimeout(verifyExtensionToken, 30 * 60 * 1000);
}

/**
 * Test backend connection on startup
 */
async function testBackendConnection() {
  console.log('🔧 Testing backend connection...');
  
  // Use AbortController for timeout since fetch doesn't accept timeout option
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  
  try {
    const response = await fetch(`${CONFIG.WEBSITE_API}/api/health`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Backend is running:', data);
      return true;
    } else {
      console.log('❌ Backend responded with status:', response.status);
      return false;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.log('❌ Backend connection timeout (3s)');
    } else {
      console.log('❌ Backend is NOT accessible:', error.message);
    }
    
    console.log('💡 Make sure:');
    console.log('   1. Backend is running: node server.js or npm start');
    console.log('   2. Port 3001 is not blocked');
    console.log('   3. CORS is enabled in backend');
    console.log('   4. Backend URL is:', CONFIG.WEBSITE_API);
    return false;
  }
}

// Load blacklist
async function loadBlacklist() {
  try {
    const response = await fetch(chrome.runtime.getURL('reputation/blacklist.json'));
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Expected JSON but got: ' + contentType);
    }
    
    const data = await response.json();
    
    // Validate data format
    if (Array.isArray(data)) {
      blacklistData = data;
      console.log('✅ Loaded blacklist:', blacklistData.length, 'entries');
    } else if (data.domains && Array.isArray(data.domains)) {
      blacklistData = data.domains;
      console.log('✅ Loaded blacklist:', blacklistData.length, 'entries');
    } else {
      console.warn('⚠️ Blacklist format unexpected, using empty array');
      blacklistData = [];
    }
    
  } catch (e) {
    console.error('❌ Failed to load blacklist:', e);
    blacklistData = []; // Ensure it's an array
  }
}

// Initialize trusted whitelist
function initializeWhitelist() {
  const trusted = [
    'google.com', 'www.google.com', 'github.com', 'www.github.com',
    'stackoverflow.com', 'www.stackoverflow.com', 'wikipedia.org',
    'amazon.com', 'microsoft.com', 'apple.com', 'youtube.com',
    'edge://extensions', 'chrome://extensions', 'about:addons'
  ];
  whitelistDomains = new Set(trusted.map(d => d.toLowerCase()));
  console.log('✅ Whitelist initialized:', whitelistDomains.size, 'domains');
}

// Cleanup old decisions from storage (prevent bloat)
async function cleanupOldDecisions() {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const now = new Date().getTime();
  
  try {
    // Get all local storage keys
    const allLocal = await chrome.storage.local.get(null);
    const keysToDelete = [];
    
    for (const key in allLocal) {
      // Only process decision keys
      if (key.startsWith('guardianlink_decision_') || key === 'guardianlink_current_decision') {
        const item = allLocal[key];
        if (item && item.timestamp) {
          const itemTime = new Date(item.timestamp).getTime();
          if (now - itemTime > ONE_HOUR_MS) {
            keysToDelete.push(key);
          }
        }
      }
    }
    
    if (keysToDelete.length > 0) {
      await chrome.storage.local.remove(keysToDelete);
      console.log('🧹 Cleaned up', keysToDelete.length, 'old decisions from storage');
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Run cleanup periodically (every hour)
setInterval(cleanupOldDecisions, 60 * 60 * 1000);

// Run cleanup on startup
cleanupOldDecisions();

// ==================== DOWNLOAD BLOCKING ====================
// Track ongoing analysis per tab
const analysisInProgressByTab = new Map();

// Block downloads during URL analysis
chrome.downloads.onCreated.addListener((download) => {
  const url = download.url.toLowerCase();
  const filename = download.filename.toLowerCase();
  
  // Block executable/dangerous file extensions
  const dangerous = /\.(exe|bin|cmd|bat|msi|dll|scr|vbs|ps1|com|sys)$/i;
  const isExecutable = dangerous.test(filename) || dangerous.test(url);
  
  // Check if ANY tab is currently analyzing
  const anyAnalysisInProgress = analysisInProgressByTab.size > 0;
  
  if (isExecutable || anyAnalysisInProgress) {
    chrome.downloads.cancel(download.id);
    console.log('🚫 Blocked download:', filename);
    
    // Only send message if tabId is valid (not -1)
    if (download.tabId && download.tabId > 0) {
      chrome.tabs.sendMessage(download.tabId, {
        action: 'showDownloadBlocked',
        filename: filename,
        reason: isExecutable ? 'Executable files are blocked' : 'Analyzing website security'
      }).catch(() => {
        // Silently ignore errors (tab might be closed)
      });
    }
  }
});

// Message listener
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  // Health check ping from warning.js
  if (request.action === 'ping') {
    sendResponse({ status: 'ok' });
    return true;
  }

  if (request.action === 'analyzeURL') {
    analyzeURL(request.url, sender.tab.id, 'message').then(sendResponse);
    return true;
  }

  if (request.action === 'registerExtension') {
    const token = request.token;
    console.log('📝 Extension registered by user:', token);
    userId = token;
    sendResponse({ status: 'registered' });
    return true;
  }

  if (request.action === 'logDecision') {
    console.log('📊 Decision logged:', request.decision);
    sendResponse({ status: 'logged' });
    return true;
  }

  if (request.action === 'logBypass') {
    logBypassToStorage(request.url);
    sendResponse({ status: 'logged' });
    return true;
  }

  // === Handle bypass check from content script ===
  if (request.action === 'CHECK_BYPASS') {
    const url = request.url;
    console.log('🔍 Background checking bypass status for:', url);
    
    // Check if URL was recently bypassed
    if (recentBypassedURLs.has(url)) {
      const expiryTime = recentBypassedURLs.get(url);
      if (Date.now() < expiryTime) {
        console.log('✅ Background confirms: URL recently bypassed');
        sendResponse({ isBypassed: true });
        return true;
      } else {
        recentBypassedURLs.delete(url);
      }
    }
    
    // Also check session storage bypass flag
    try {
      const result = await chrome.storage.session.get(['guardianlink_bypassed_url']);
      const bypassedUrl = result.guardianlink_bypassed_url;
      
      if (bypassedUrl) {
        // Compare URLs without hash fragments
        const storedUrlWithoutHash = bypassedUrl.split('#')[0];
        const currentUrlWithoutHash = url.split('#')[0];
        
        if (storedUrlWithoutHash === currentUrlWithoutHash) {
          console.log('✅ Background confirms: URL in session bypass flag');
          
          // Clear the flag since we're confirming it
          try {
            await chrome.storage.session.remove(['guardianlink_bypassed_url', 'guardianlink_bypassed_timestamp']);
          } catch (e) {
            console.log('⚠️ Could not clear bypass flag:', e);
          }
          
          sendResponse({ isBypassed: true });
          return true;
        }
      }
    } catch (error) {
      console.log('⚠️ Error checking session storage:', error);
    }
    
    console.log('❌ Background confirms: URL NOT bypassed');
    sendResponse({ isBypassed: false });
    return true;
  }

  // === CONSOLIDATED: Handle both PROCEED_ANYWAY (legacy overlay) and INTERSTITIAL_PROCEED (new) ===
  if (request.action === 'PROCEED_ANYWAY' || request.action === 'INTERSTITIAL_PROCEED') {
    console.log('✅ User bypassed warning for:', request.url);
    
    const url = request.url;
    const tabId = sender.tab.id;
    
    // Mark URL as bypassed (don't re-block for 5 minutes)
    recentBypassedURLs.set(url, Date.now() + (5 * 60 * 1000));
    
    // === Store bypass flag in session storage BEFORE navigating ===
    try {
      await chrome.storage.session.set({
        'guardianlink_bypassed_url': url,
        'guardianlink_bypassed_timestamp': Date.now()
      });
      console.log('💾 Stored bypass flag in session storage');
      console.log('💾 Bypass URL:', url);
    } catch (error) {
      console.log('⚠️ Could not store bypass flag:', error.message);
    }
    
    // Remove blocking DNR rules
    try {
      const ruleIds = blockedTabRules.get(tabId);
      if (ruleIds) {
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: ruleIds
        });
        blockedTabRules.delete(tabId);
        console.log('🧹 Removed blocking rules for tab:', tabId);
      }
    } catch (error) {
      console.error('❌ Failed to remove rules:', error);
    }
    
    // Navigate to original URL (content script will check bypass flag on load)
    chrome.tabs.update(tabId, { url: url });
    console.log('🔄 Navigating to original URL, bypass flag is set');
    console.log('🔄 Navigate URL:', url);
    
    // Log bypass
    logBypassToStorage(url);
    
    sendResponse({ status: 'bypassed' });
    return true;
  }

  if (request.action === 'contentScriptReady') {
    console.log('✅ Content script ready in tab:', sender.tab.id);
    sendResponse({ status: 'acknowledged' });
    return true;
  }

  if (request.action === 'diagnosticTest') {
    console.log('🧪 Diagnostic test received');
    sendResponse({ 
      status: 'ok', 
      version: '2.0.0',
      timestamp: new Date().toISOString()
    });
    return true;
  }
});

// === Clean up allowed tabs when they close ===
chrome.tabs.onRemoved.addListener((tabId) => {
  allowedTabs.delete(tabId);
  blockedTabRules.delete(tabId);
  analysisInProgressByTab.delete(tabId);
  console.log('🧹 Cleaned up tab:', tabId);
});

// Also clean up when tab is refreshed/reloaded
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    // If tab is loading a new page, clear its allowed status
    if (allowedTabs.has(tabId)) {
      console.log('🔄 Tab reloading, clearing allowed status:', tabId);
      allowedTabs.delete(tabId);
    }
  }
});

// ==================== PROACTIVE URL BLOCKING (Before Page Load) ====================
// Track pending URLs to avoid duplicate analysis
const pendingAnalysis = new Map();
const blockedTabRules = new Map(); // Track which rule IDs block which tabs
let nextRuleId = 1000; // Start rule IDs at 1000 to avoid conflicts

// Function to generate unique rule IDs
function generateUniqueRuleId() {
  const id = nextRuleId;
  nextRuleId++;
  // Ensure we don't exceed Chrome's max rule ID (2147483647)
  if (nextRuleId > 2147483647) {
    nextRuleId = 1000;
  }
  return id;
}

// === FIX #1: Track tabs that have been ALLOWED to prevent re-blocking on reload ===
const allowedTabs = new Set(); // Tabs that user has already allowed and were ALLOW verdict
const safeUrls = new Set(); // URLs that are confirmed SAFE (normalized)

// Helper to normalize URL for caching
function normalizeUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    return parsed.hostname + parsed.pathname;
  } catch (e) {
    return urlString.toLowerCase();
  }
}

// Ensure content script is injected before sending messages
async function ensureContentScriptInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      function: () => {
        console.log('✅ Content script injected');
      },
      world: 'MAIN'
    });
    console.log('✅ Content script injection verified for tab:', tabId);
  } catch (error) {
    console.log('⚠️ Could not verify content script injection:', error.message);
  }
}

// Intercept navigation BEFORE page loads
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  const { url, tabId, frameId } = details;
  
  // Only check main frame navigations (frameId === 0)
  if (frameId !== 0) return;
  
  // Skip restricted URLs
  const restrictedPrefixes = ['chrome://', 'edge://', 'about:', 'ntp.msn.com'];
  if (restrictedPrefixes.some(prefix => url.startsWith(prefix))) {
    console.log('⏭️ Skipping restricted URL:', url);
    return;
  }
  
  // Skip our own warning page
  if (url.includes('ui/warning.html')) return;
  
  // Avoid duplicate analysis
  if (pendingAnalysis.has(url)) return;
  
  // Check if URL was recently bypassed by user
  if (recentBypassedURLs.has(url)) {
    const expiryTime = recentBypassedURLs.get(url);
    if (Date.now() < expiryTime) {
      console.log('✅ URL recently bypassed by user, allowing:', url);
      analysisInProgressByTab.delete(tabId);
      return;
    } else {
      // Remove expired bypass
      recentBypassedURLs.delete(url);
    }
  }
  
  console.log('🌐 WebNavigation: Before navigate to', url);
  
  // === FIX THIS PART: ===
  // Don't skip analysis just because tab was allowed for a DIFFERENT URL
  
  // Clear allowedTabs for this tab (fresh navigation)
  if (allowedTabs.has(tabId)) {
    console.log('🔄 Tab was previously allowed, clearing for fresh analysis');
    allowedTabs.delete(tabId);
  }
  
  // Clear safeUrls for this specific URL
  const normalizedUrl = normalizeUrl(url);
  if (safeUrls.has(normalizedUrl)) {
    console.log('🔄 URL was previously marked safe, re-evaluating:', url);
    safeUrls.delete(normalizedUrl);
  }
  
  // Check whitelist
  if (isWhitelistedDomain(url)) {
    console.log('✅ WHITELIST: URL is whitelisted, no protection needed:', url);
    analysisInProgressByTab.delete(tabId);
    return;
  }
  
  // === FIX #4: Bypass search engines completely (BEFORE any analysis) ===
  const searchEnginePatterns = [
    'bing.com',
    'google.com',
    'yahoo.com',
    'duckduckgo.com',
    'startpage.com',
    'ecosia.org',
    'search.yahoo.com'
  ];
  
  // Extract just the hostname for matching
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    if (searchEnginePatterns.some(engine => hostname.includes(engine))) {
      console.log('🔍 SEARCH ENGINE DETECTED: Skipping analysis for:', hostname);
      
      // === CRITICAL: Mark as bypassed immediately ===
      recentBypassedURLs.set(url, Date.now() + (60 * 60 * 1000)); // 1 hour bypass
      
      // === ALSO store in session storage for content script ===
      chrome.storage.session.set({
        'guardianlink_bypassed_url': url,
        'guardianlink_bypassed_timestamp': Date.now()
      });
      
      analysisInProgressByTab.delete(tabId);
      pendingAnalysis.delete(url);
      
      // Try to unfreeze content script
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'UNFREEZE',
          score: 100,
          bypassed: false,
          isSearchEngine: true
        });
        console.log('✅ Sent UNFREEZE to content script for search engine');
      } catch (error) {
        console.log('ℹ️ Could not send search engine unfreeze:', error.message);
        // That's OK - content script will check bypass flag
      }
      
      return;
    }
  } catch (e) {
    console.log('⚠️ Could not parse URL for search engine check:', e.message);
  }
  
  // Mark analysis as in progress
  analysisInProgressByTab.set(tabId, { url, startTime: Date.now() });
  pendingAnalysis.set(url, true);
  
  try {
    // === CRITICAL CHANGE: Don't inject content script or set DNR yet ===
    // Wait for page to load first, then analyze
    
    // Wait a bit for page to start loading
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Now analyze the URL
    const decision = await analyzeURL(url, tabId, 'navigation');
    
    console.log('📋 Navigation decision:', decision.verdict, 'for', url);
    
    const verdict = decision.verdict;
    const score = Math.round(decision.score || 0);
    
    // If BLOCK or WARN - NOW set DNR rules and redirect
    if (verdict === 'BLOCK' || verdict === 'WARN') {
      console.log(`${verdict === 'BLOCK' ? '🚨' : '⚠️'} ${verdict} VERDICT - Setting DNR rules`);
      
      // === SET DNR RULES NOW (after analysis) ===
      // Generate unique rule ID (never reuse IDs)
      const baseRuleId = generateUniqueRuleId();
      console.log(`🔑 Generated unique rule ID: ${baseRuleId} for tabId: ${tabId}`);
      
      // Remove any existing rules for this tab
      try {
        const existingRules = blockedTabRules.get(tabId) || [];
        if (existingRules.length > 0) {
          console.log(`🧹 Removing ${existingRules.length} old rules for tab ${tabId}`);
          await chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: existingRules
          });
        }
      } catch (e) {
        console.log('⚠️ Could not remove old rules:', e.message);
      }
      
      // Add BLOCK rule for main_frame (this will replace the page with warning)
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [{
          id: baseRuleId,
          priority: 1,
          action: { type: 'block' },
          condition: {
            tabIds: [tabId],
            urlFilter: url, // Specific URL
            resourceTypes: ['main_frame']
          }
        }]
      });
      
      blockedTabRules.set(tabId, [baseRuleId]);
      console.log('🔐 DNR rule set to block:', url, 'with rule ID:', baseRuleId);
      
      // Store decision with URL-specific key
      const storageKey = `guardianlink_decision_${encodeURIComponent(url)}`;
      const decisionData = {
        url: url,
        score: score,
        verdict: verdict,
        reasoning: decision.reasoning || (verdict === 'BLOCK' ? 'Threat detected' : 'Suspicious site'),
        riskLevel: verdict === 'BLOCK' ? 'CRITICAL' : 'MEDIUM',
        timestamp: new Date().toISOString()
      };
      
      // Store decision in BOTH session (for warning page) and local (for dashboard)
      await chrome.storage.session.set({ 
        'guardianlink_warning_decision': decisionData,
        'guardianlink_original_url': url
      });
      
      await chrome.storage.local.set({ [storageKey]: decisionData });
      await chrome.storage.local.set({ 'guardianlink_current_decision': decisionData });
      
      console.log('💾 Stored decision for:', url);
      console.log('✅ Stored in session storage (warning page access)');
      
      // Redirect to warning page
      const extensionId = chrome.runtime.id;
      const warningUrl = `chrome-extension://${extensionId}/ui/warning.html?url=${encodeURIComponent(url)}&verdict=${verdict}`;
      
      await chrome.tabs.update(tabId, { url: warningUrl });
      console.log('🔄 Redirected to warning page');
      
    } else {
      // ALLOW verdict - just mark as safe, no blocking needed
      console.log('✅ Safe URL detected, no blocking needed:', url);
      allowedTabs.add(tabId);
      safeUrls.add(normalizedUrl);
      
      // === CRITICAL: Log ALLOW decisions too ===
      logDecisionToStorage(decision);
      console.log('📊 ALLOW decision logged to storage for dashboard');
      
      // === CRITICAL: Send UNFREEZE message to content script ===
      try {
        // Check if tab still exists before sending message
        const tab = await chrome.tabs.get(tabId);
        
        if (tab && tab.status === 'loading') {
          console.log('🔄 Tab still loading, waiting a bit...');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        await chrome.tabs.sendMessage(tabId, {
          action: 'UNFREEZE',
          score: score,
          bypassed: false
        });
        console.log('✅ UNFREEZE message sent to tab:', tabId);
        
      } catch (error) {
        // Common errors when tab is closed or content script not loaded
        if (error.message.includes('No tab with id') || 
            error.message.includes('Receiving end does not exist') ||
            error.message.includes('Could not establish connection') ||
            error.message.includes('The extensions gallery cannot be scripted')) {
          console.log('ℹ️ Content script not ready for UNFREEZE, skipping');
          return;
        }
        
        console.log('⚠️ Could not send UNFREEZE message:', error.message);
        
        // Try alternative: inject a script to remove overlay (only for regular tabs)
        if (tabId && !error.message.includes('gallery')) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              function: () => {
                const overlay = document.getElementById('guardianlink-immediate-overlay');
                if (overlay) {
                  overlay.remove();
                  console.log('✅ Overlay removed via injection');
                }
              }
            });
          } catch (injectError) {
            // Silently ignore injection errors
            if (!injectError.message.includes('No tab with id') &&
                !injectError.message.includes('Cannot access') &&
                !injectError.message.includes('gallery')) {
              console.log('ℹ️ Could not inject cleanup (tab may be closed)');
            }
          }
        }
      }
    }
    
    // Always log the decision
    logDecisionToStorage(decision);
    console.log('📊 Decision logged to storage for dashboard');
    
    
  } catch (error) {
    console.error('❌ Error during navigation analysis:', error);
  } finally {
    analysisInProgressByTab.delete(tabId);
    // Remove from pending after short delay
    setTimeout(() => pendingAnalysis.delete(url), 2000);
  }
});

// Functions to inject into page
// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // "View Details" button clicked
    console.log('📊 User clicked View Details on notification');
  } else if (buttonIndex === 1) {
    // "Dismiss" button clicked
    console.log('✔️ User dismissed notification');
  }
});

/**
 * MAIN ANALYSIS FUNCTION - Enhanced Multi-Phase Detection with Website Sync
 */
async function analyzeURL(urlString, tabId, context = 'unknown') {
  const startTime = Date.now();
  console.log('🚀 STARTING ANALYSIS:', urlString);

  try {
    // ALWAYS try to use website API for analysis (no authentication needed - public API)
    try {
      const websiteResult = await analyzeWithWebsite(urlString);
      
      // If analysis succeeded and we have a verdict, return it
      if (websiteResult && websiteResult.verdict) {
        console.log('✅ WEBSITE API ANALYSIS COMPLETE:', websiteResult.verdict);
        return websiteResult;
      }
    } catch (e) {
      console.log('⚠️ Website API failed, falling back to local analysis:', e.message);
    }
    
    // Fallback to local analysis if API fails
    const ruleAnalysis = analyzeURLWithRules(urlString);
    const parsed = parseURL(urlString);
    const reputationAnalysis = checkDomainReputation(parsed);
    
    // Combine both analyses for final decision
    const decision = makeSecurityDecision(urlString, ruleAnalysis, reputationAnalysis);
    
    const elapsed = Date.now() - startTime;
    console.log('✅ ANALYSIS COMPLETE in', elapsed, 'ms:', decision.verdict);
    
    return decision;
    
  } catch (error) {
    console.error('❌ Analysis error:', error);
    
    // Default to ALLOW if analysis fails
    return {
      verdict: 'ALLOW',
      score: 100,
      riskLevel: 'SAFE',
      reasoning: 'Analysis unavailable, assuming safe'
    };
  }
}

/**
 * Analyze URL using website API (with real-time sync)
 */
async function analyzeWithWebsite(urlString) {
  try {
    // Step 1: Start scan and get scan ID
    const scanStart = await startWebsiteScan(urlString);
    
    if (!scanStart.scanId) {
      throw new Error('No scan ID received');
    }
    
    // Step 2: Poll for results (with timeout)
    const result = await pollForScanResult(scanStart.scanId, urlString);
    return result;
    
  } catch (error) {
    console.log('⚠️ Website API failed:', error.message);
    throw error;
  }
}

async function startWebsiteScan(urlString) {
  const apiUrl = `http://localhost:3001/api/scan`;
  console.log('🌐 Starting website scan:', apiUrl);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ 
      url: urlString,
      source: 'extension',
      extensionId: chrome.runtime.id,
      timestamp: new Date().toISOString()
    })
  });
  
  if (!response.ok) {
    throw new Error(`API start failed: ${response.status}`);
  }
  
  return await response.json();
}

async function pollForScanResult(scanId, originalUrl, maxAttempts = 15) {
  const pollUrl = `http://localhost:3001/api/scan/result/${scanId}`;
  console.log('🔄 Polling for scan result:', scanId);
  
  // Initial delay before first poll - gives backend time to cache
  await new Promise(resolve => setTimeout(resolve, 500));
  
  let lastStatus = '';
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`📊 Poll attempt ${attempt}/${maxAttempts} for scan ${scanId}`);
      
      const response = await fetch(pollUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      const data = await response.json();
      
      // Handle "not_found" as "not ready yet" - not an error
      if (data.status === 'not_found') {
        console.log(`⏳ Scan entry not yet in cache (attempt ${attempt})`);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5 seconds
        }
        continue; // Try again
      }
      
      // Handle processing status - log and retry
      if (data.status === 'processing' || data.status === 'in_progress') {
        if (data.status !== lastStatus) {
          console.log(`⏳ Scan status: ${data.status}`);
          lastStatus = data.status;
        }
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5 seconds
        }
        continue; // Try again
      }
      
      // Handle completion
      if (data.status === 'completed') {
        console.log('✅ Scan completed:', scanId);
        
        // Convert backend result to extension format
        return {
          verdict: (data.verdict || 'ALLOW').toUpperCase(),
          score: data.score || (data.verdict === 'SAFE' ? 100 : 0),
          riskLevel: data.riskLevel || (data.verdict === 'BLOCK' ? 'CRITICAL' : 
                    data.verdict === 'WARN' ? 'MEDIUM' : 'SAFE'),
          reasoning: data.reasoning || 'Website API analysis',
          source: 'website_api',
          scanId: scanId,
          phaseBreakdown: data.phaseBreakdown || null
        };
      }
      
      // Handle error status
      if (data.status === 'error') {
        throw new Error(`Scan error: ${data.error}`);
      }
      
      // Unknown status - log and retry
      console.log(`⚠️ Unknown status: ${data.status}`);
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
    } catch (error) {
      console.log(`⚠️ Poll error attempt ${attempt}:`, error.message);
      if (attempt === maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  throw new Error('Max polling attempts (15) reached - backend may be slow');
}

/**
 * Register extension with website (called after user login)
 */
async function registerExtensionWithWebsite(userToken) {
  try {
    const response = await fetch(`${CONFIG.WEBSITE_API}/extensions/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extensionId: chrome.runtime.id,
        userToken: userToken,
        version: '2.0.0'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Extension registered with website:', data.id);
      return data;
    }
  } catch (error) {
    console.error('❌ Registration failed:', error);
  }
  
  return null;
}

// PHASE FUNCTIONS

function isWhitelistedDomain(urlString) {
  try {
    const parsed = new URL(urlString);
    return whitelistDomains.has(parsed.hostname.toLowerCase());
  } catch (e) {
    return false;
  }
}

function checkBlacklist(domain) {
  return blacklistData.some(item => item.domain === domain);
}

async function runAPIChecks(urlString, parsed) {
  const checks = {
    virusTotal: null,
    urlhaus: null
  };
  
  try {
    checks.virusTotal = await checkVirusTotal(urlString);
  } catch (e) {
    console.log('⚠️ VirusTotal check failed');
  }
  
  try {
    checks.urlhaus = await checkURLhaus(urlString);
  } catch (e) {
    console.log('⚠️ URLhaus check failed');
  }
  
  return checks;
}

async function checkVirusTotal(urlString) {
  if (!CONFIG.API_KEYS.VIRUSTOTAL) return null;
  // Implementation would go here
  return null;
}

async function checkAbuseIPDB(ip) {
  if (!CONFIG.API_KEYS.ABUSEIPDB) return null;
  // Implementation would go here
  return null;
}

async function checkURLhaus(urlString) {
  try {
    const response = await fetch(`https://urlhaus-api.abuse.ch/v1/url/?url=${encodeURIComponent(urlString)}`, {
      method: 'POST'
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch (e) {
    console.log('⚠️ URLhaus API call failed');
  }
  return null;
}

function checkDomainAge(domain) {
  // Simulate domain age check
  return {
    age: Math.floor(Math.random() * 10),
    riskScore: Math.random() * 100
  };
}

function analyzeSSL(parsed) {
  return {
    isSecure: parsed.protocol === 'https:',
    selfSigned: false
  };
}

function runHeuristics(urlString, parsed) {
  const factors = [];
  let score = 100;
  
  // Check URL length
  if (urlString.length > 100) {
    factors.push('Long URL');
    score -= 5;
  }
  
  // Check for IP-based URLs
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(parsed.hostname)) {
    factors.push('IP-based URL');
    score -= 20;
  }
  
  // Check for suspicious keywords
  const suspiciousKeywords = ['login', 'verify', 'confirm', 'update', 'urgent', 'action'];
  if (suspiciousKeywords.some(keyword => urlString.toLowerCase().includes(keyword))) {
    factors.push('Suspicious keywords in URL');
    score -= 10;
  }
  
  return { factors, score };
}

async function checkGoogleSafeBrowsing(urlString) {
  if (!CONFIG.API_KEYS.GOOGLE_SAFE_BROWSING) return null;
  // Implementation would go here
  return null;
}

// UTILITIES

function parseURL(urlString) {
  try {
    return new URL(urlString);
  } catch (e) {
    return null;
  }
}

function parseParams(search) {
  const params = {};
  if (search) {
    new URLSearchParams(search).forEach((value, key) => {
      params[key] = value;
    });
  }
  return params;
}

function generateReason(factors, verdict) {
  if (verdict === 'BLOCK') {
    return 'This website exhibits critical security threats';
  } else if (verdict === 'WARN') {
    return 'This website has some suspicious characteristics';
  } else {
    return 'This website appears to be safe';
  }
}

function logDecisionToStorage(decision) {
  chrome.storage.local.get(['guardianlink_logs'], (data) => {
    let logs = data.guardianlink_logs || [];
    
    // Create log entry with all fields needed by dashboard
    const logEntry = {
      url: decision.url,
      verdict: decision.verdict,
      score: decision.score,
      combinedScore: decision.score,  // Dashboard expects combinedScore
      riskLevel: decision.riskLevel || 'UNKNOWN',
      reasoning: decision.reasoning || 'URL security analysis',
      source: decision.source || 'extension',
      scanId: decision.scanId || null,
      phaseBreakdown: decision.phaseBreakdown || null,
      risks: decision.risks || [],
      details: decision.details || {
        domain: new URL(decision.url).hostname,
        hostname: new URL(decision.url).hostname
      },
      timestamp: new Date().toISOString()
    };
    
    logs.push(logEntry);
    
    // Keep only last 100 logs
    if (logs.length > 100) {
      logs = logs.slice(-100);
    }
    
    chrome.storage.local.set({ guardianlink_logs: logs });
    console.log('📊 Log entry stored:', logEntry.verdict, logEntry.url);
  });
}

function logBypassToStorage(url) {
  chrome.storage.local.get(['guardianlink_bypasses'], (data) => {
    let bypasses = data.guardianlink_bypasses || [];
    
    bypasses.push({
      url: url,
      timestamp: new Date().toISOString()
    });
    
    if (bypasses.length > 100) {
      bypasses = bypasses.slice(-100);
    }
    
    chrome.storage.local.set({ guardianlink_bypasses: bypasses });
  });
}

console.log('🛡️ GuardianLink v2.0 Background Worker Ready');

/**
 * Analyze URL with rule engine
 * @param {string} urlString
 * @returns {Object} Rule analysis result
 */
function analyzeURLWithRules(urlString) {
  try {
    const parsed = parseURL(urlString);
    if (!parsed) {
      return {
        verdict: 'ALLOW',
        score: 100,
        reasoning: 'Invalid URL format'
      };
    }
    
    const ruleResults = applyURLRules(urlString, parsed);
    const heuristics = runHeuristics(urlString, parsed);
    
    return {
      ...ruleResults,
      heuristics: heuristics,
      source: 'rule_engine'
    };
    
  } catch (error) {
    console.error('Rule engine error:', error);
    return {
      verdict: 'ALLOW',
      score: 100,
      reasoning: 'Rule engine error'
    };
  }
}

/**
 * Apply URL rules
 * @param {string} urlString
 * @param {Object} parsedURL
 * @returns {Object} Rules results
 */
function applyURLRules(urlString, parsedURL) {
  let riskScore = 0;
  const factors = [];
  
  // Check URL length
  if (checkURLLength(urlString)) {
    riskScore += 15;
    factors.push('Excessively long URL');
  }
  
  // Check for shortener
  if (checkShortener(parsedURL.hostname)) {
    riskScore += 10;
    factors.push('URL shortener detected');
  }
  
  // Check for suspicious keywords
  if (checkSuspiciousKeywords(urlString)) {
    riskScore += 20;
    factors.push('Suspicious keywords found');
  }
  
  // Check IP-based URLs
  if (checkIPBased(parsedURL)) {
    riskScore += 25;
    factors.push('IP-based URL');
  }
  
  // Check excessive parameters
  if (checkExcessiveParams(parsedURL)) {
    riskScore += 10;
    factors.push('Too many parameters');
  }
  
  // Check encoding
  if (checkEncoding(urlString, parsedURL)) {
    riskScore += 15;
    factors.push('Unusual encoding detected');
  }
  
  const safetyScore = Math.max(0, 100 - riskScore);
  
  return {
    riskScore: riskScore,
    safetyScore: safetyScore,
    verdict: riskScore >= 50 ? 'BLOCK' : (riskScore >= 30 ? 'WARN' : 'ALLOW'),
    factors: factors
  };
}

/**
 * Check domain reputation
 * @param {Object} parsedURL
 * @returns {Object} Reputation verdict
 */
function checkDomainReputation(parsedURL) {
  try {
    const domain = parsedURL.hostname;
    const domainAge = checkDomainAge(domain);
    const ssl = analyzeSSL(parsedURL);
    
    let reputationScore = 100;
    const factors = [];
    
    // Check if newly registered (very risky)
    if (domainAge.age < 7) {
      reputationScore -= 40;
      factors.push('Newly registered domain (< 1 week)');
    } else if (domainAge.age < 30) {
      reputationScore -= 20;
      factors.push('Recently registered domain (< 1 month)');
    }
    
    // Check SSL
    if (!ssl.isSecure) {
      reputationScore -= 15;
      factors.push('No HTTPS/SSL certificate');
    }
    
    // Check blacklist
    if (checkBlacklist(domain)) {
      reputationScore -= 60;
      factors.push('Domain on blocklist');
    }
    
    return {
      reputation: reputationScore,
      factors: factors,
      domainAge: domainAge.age,
      ssl: ssl
    };
    
  } catch (error) {
    return {
      reputation: 100,
      factors: [],
      domainAge: null
    };
  }
}

/**
 * Make final security decision
 * @param {string} urlString
 * @param {Object} ruleAnalysis
 * @param {Object} reputationAnalysis
 * @returns {Object} Final decision
 */
function makeSecurityDecision(urlString, ruleAnalysis, reputationAnalysis) {
  // Combine scores
  const ruleScore = ruleAnalysis.safetyScore || 100;
  const reputationScore = reputationAnalysis.reputation || 100;
  
  // Weight them (60% rules, 40% reputation)
  const finalScore = (ruleScore * 0.6) + (reputationScore * 0.4);
  
  // Determine verdict based on thresholds
  let verdict = 'ALLOW';
  if (finalScore < CONFIG.THRESHOLDS.BLOCK) {
    verdict = 'BLOCK';
  } else if (finalScore < CONFIG.THRESHOLDS.WARN) {
    verdict = 'WARN';
  }
  
  // Combine factors
  const allFactors = [
    ...(ruleAnalysis.factors || []),
    ...(reputationAnalysis.factors || [])
  ];
  
  // Generate reasoning
  const reasoning = generateReasoning(verdict, allFactors, ruleAnalysis);
  
  return {
    url: urlString,
    verdict: verdict,
    score: Math.round(finalScore),
    riskLevel: verdict === 'BLOCK' ? 'CRITICAL' : (verdict === 'WARN' ? 'MEDIUM' : 'SAFE'),
    factors: allFactors,
    reasoning: reasoning,
    timestamp: new Date().toISOString()
  };
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(verdict, factors, ruleAnalysis) {
  if (verdict === 'BLOCK') {
    return `This website has been identified as malicious. Detected issues: ${factors.slice(0, 2).join(', ')}`;
  } else if (verdict === 'WARN') {
    return `This website shows some suspicious characteristics. Please review: ${factors.slice(0, 2).join(', ')}`;
  } else {
    return 'This website appears to be safe based on our analysis';
  }
}

// ===== Rule Functions =====

function checkURLLength(urlString) {
  return urlString.length > 100;
}

function checkShortener(hostname) {
  const shorteners = ['bit.ly', 'tinyurl.com', 'short.link', 'ow.ly'];
  return shorteners.some(s => hostname.includes(s));
}

function checkSuspiciousKeywords(urlString) {
  const keywords = ['login', 'verify', 'confirm', 'urgent', 'update', 'admin', 'account'];
  return keywords.some(k => urlString.toLowerCase().includes(k));
}

function checkTyposquatting(urlString) {
  // Simplified typosquatting check
  return false;
}

function checkIPBased(parsedURL) {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(parsedURL.hostname);
}

function checkExcessiveParams(parsedURL) {
  const params = parseParams(parsedURL.search);
  return Object.keys(params).length > 5;
}

function checkEncoding(urlString, parsedURL) {
  return /%[0-9a-f]{2}/i.test(urlString);
}

function checkSuspiciousSubdomains(subdomain) {
  const suspicious = ['admin', 'mail', 'vpn', 'secure', 'account'];
  return suspicious.some(s => subdomain.includes(s));
}

function checkSuspiciousTLD(parsedURL) {
  const suspicious = ['.tk', '.ml', '.ga', '.cf'];
  return suspicious.some(tld => parsedURL.hostname.endsWith(tld));
}

function analyzeRecentDomain(domain) {
  return false;
}

function analyzeDomainName(domain) {
  return false;
}

// ===== Utility Functions =====

function isWhitelisted(urlString) {
  try {
    const parsed = new URL(urlString);
    return whitelistDomains.has(parsed.hostname);
  } catch (e) {
    return false;
  }
}

function isIPAddress(hostname) {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

function isEncoded(urlString) {
  return /%[0-9a-f]{2}/i.test(urlString);
}

function extractDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length > 2) {
    return parts.slice(-2).join('.');
  }
  return hostname;
}

function extractSubdomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length > 2) {
    return parts.slice(0, -2).join('.');
  }
  return '';
}

function parseQueryParams(queryString) {
  const params = {};
  if (queryString) {
    new URLSearchParams(queryString).forEach((value, key) => {
      params[key] = value;
    });
  }
  return params;
}

// ===== Logging =====
console.log('GuardianLink background service worker loaded');
