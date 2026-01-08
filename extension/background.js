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
  WEBSITE_API: 'http://localhost:3001/api',
  TIMEOUTS: {
    API_CALL: 3000,
    TOTAL_ANALYSIS: 5000
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

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('🛡️ GuardianLink v2.0 Enhanced Edition - INSTALLED WITH WEBSITE SYNC');
  loadBlacklist();
  initializeWhitelist();
  verifyExtensionToken();
  setupContextMenus();
  
  chrome.storage.local.get(['guardianlink_logs'], (data) => {
    if (!data.guardianlink_logs) {
      chrome.storage.local.set({ 'guardianlink_logs': [] });
    }
  });
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
    console.log('📎 Context menu: Scanning link:', info.linkUrl);
    analyzeURL(info.linkUrl, tab.id, 'context-menu')
      .then(decision => {
        console.log('📊 Decision:', decision.verdict);
        if (decision.verdict === 'BLOCK') {
          const decisionJson = encodeURIComponent(JSON.stringify(decision));
          chrome.tabs.create({ 
            url: chrome.runtime.getURL(`ui/warning.html?decision=${decisionJson}`)
          });
        } else {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
            title: `✅ Link is ${decision.verdict}`,
            message: decision.reasoning || 'This link appears to be safe'
          });
        }
      })
      .catch(error => console.error('❌ Error analyzing link:', error));
  }
  
  if (info.menuItemId === 'scan-page') {
    console.log('📄 Context menu: Scanning page:', tab.url);
    analyzeURL(tab.url, tab.id, 'context-menu')
      .then(decision => {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
          title: `🔍 Page Analysis: ${decision.verdict}`,
          message: decision.reasoning || `Security Score: ${decision.combinedScore}%`
        });
      })
      .catch(error => console.error('❌ Error analyzing page:', error));
  }
});

// Verify extension token on startup and periodically
async function verifyExtensionToken() {
  try {
    const response = await fetch(`${CONFIG.WEBSITE_API}/health`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Website backend is available. Status:', data.status);
      isAuthenticated = true;
    } else {
      console.log('⚠️ Website backend not available');
      isAuthenticated = false;
    }
  } catch (error) {
    console.log('⚠️ Could not reach website backend (offline mode):', error.message);
    isAuthenticated = false;
    // Continue with local fallback analysis
  }
  
  // Verify again in 30 minutes
  setTimeout(verifyExtensionToken, 30 * 60 * 1000);
}

// Load blacklist
async function loadBlacklist() {
  try {
    const response = await fetch(chrome.runtime.getURL('reputation/blacklist.json'));
    const data = await response.json();
    blacklistData = data.blacklist || [];
    console.log('✅ Blacklist loaded:', blacklistData.length, 'entries');
  } catch (e) {
    console.error('❌ Failed to load blacklist:', e);
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
    console.log('🚫 BLOCKING DOWNLOAD:', filename, '| Analysis in progress:', anyAnalysisInProgress);
    chrome.downloads.cancel(download.id);
    
    // Notify user via broadcast to all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'showDownloadBlocked',
          filename: filename,
          reason: isExecutable ? 
            'GuardianLink blocked this download - executable files are dangerous' :
            'GuardianLink is analyzing this website - downloads blocked during security check'
        }).catch(() => {});
      });
    });
  }
});

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeURL') {
    console.log('🔍 Received analysis request:', request.url);
    analyzeURL(request.url, sender.tab.id, request.context)
      .then(decision => {
        console.log('📊 Sending decision:', decision.verdict);
        sendResponse(decision);
      })
      .catch(error => {
        console.error('❌ Error:', error);
        sendResponse({ verdict: 'ALLOW', error: error.message });
      });
    return true;
  }

  if (request.action === 'registerExtension') {
    console.log('📝 Extension registration requested with token:', request.userToken);
    registerExtensionWithWebsite(request.userToken)
      .then(result => {
        console.log('✅ Extension registered:', result);
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('❌ Registration failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'logDecision') {
    logDecisionToStorage(request.decision);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'logBypass') {
    console.log('⚠️ Bypass logged for:', request.url);
    
    // Add to temporary bypass list (allow for 5 minutes)
    recentBypassedURLs.set(request.url, Date.now());
    
    // Auto-remove from bypass list after 5 minutes
    setTimeout(() => {
      recentBypassedURLs.delete(request.url);
      console.log('🗑️ Bypass expired for:', request.url);
    }, 5 * 60 * 1000);
    
    logBypassToStorage(request.url);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'PROCEED_ANYWAY') {
    const tabId = sender.tab.id;
    console.log('✅ User proceeded anyway on warning, removing DNR rule for tab:', tabId);
    
    // Remove ALL DNR rules for this tab
    try {
      const ruleIds = blockedTabRules.get(tabId);
      if (ruleIds && Array.isArray(ruleIds) && ruleIds.length > 0) {
        chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: ruleIds
        }).then(() => {
          blockedTabRules.delete(tabId);
          console.log('🔓 DNR rules removed for tab:', tabId);
          chrome.tabs.reload(tabId);
        }).catch(error => {
          console.error('⚠️ Could not remove DNR rules:', error);
        });
      }
    } catch (error) {
      console.error('❌ Error processing PROCEED_ANYWAY:', error);
    }
    
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'contentScriptReady') {
    console.log('✅ Content script ready in tab:', sender.tab.id);
    sendResponse({ status: 'ready' });
    return true;
  }

  if (request.action === 'diagnosticTest') {
    console.log('🔧 Diagnostic test received at:', new Date().toISOString());
    sendResponse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '2.0',
      features: {
        whitelist: true,
        blacklist: blacklistData.length + ' domains',
        apiSupport: Object.keys(CONFIG.API_KEYS).filter(k => CONFIG.API_KEYS[k]).length + ' APIs configured',
        logging: true
      }
    });
    return true;
  }
});

// === FIX #1: Clean up allowed tabs when they close ===
chrome.tabs.onRemoved.addListener((tabId) => {
  allowedTabs.delete(tabId);
  blockedTabRules.delete(tabId);
  analysisInProgressByTab.delete(tabId);
});

// ==================== PROACTIVE URL BLOCKING (Before Page Load) ====================
// Track pending URLs to avoid duplicate analysis
const pendingAnalysis = new Map();
const blockedTabRules = new Map(); // Track which rule IDs block which tabs

// === FIX #1: Track tabs that have been ALLOWED to prevent re-blocking on reload ===
const allowedTabs = new Set(); // Tabs that user has already allowed and were ALLOW verdict
const safeUrls = new Set(); // URLs that are confirmed SAFE (normalized)

// Helper to normalize URL for caching
function normalizeUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname + url.pathname; // e.g., "google.com/search"
  } catch (e) {
    return urlString;
  }
}

// Intercept navigation BEFORE page loads
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  const { url, tabId, frameId } = details;
  
  // Only check main frame navigations (frameId === 0)
  if (frameId !== 0) return;
  
  // Skip restricted URLs - these cannot be blocked or injected
  const restrictedPrefixes = ['chrome://', 'edge://', 'about:', 'ntp.msn.com', 'moz-extension://', 'chrome-extension://'];
  if (restrictedPrefixes.some(prefix => url.includes(prefix) || url.startsWith(prefix))) {
    console.log('⏭️ Skipping restricted URL:', url);
    return;
  }
  
  // Skip our own warning page
  if (url.includes('ui/warning.html')) return;
  
  // Avoid duplicate analysis
  if (pendingAnalysis.has(url)) return;
  
  // Check if URL was recently bypassed by user
  if (recentBypassedURLs.has(url)) {
    console.log('✅ URL recently bypassed by user, allowing:', url);
    analysisInProgressByTab.delete(tabId);
    return;
  }
  
  console.log('🌐 WebNavigation: Before navigate to', url);
  
  // === FIX #1: Skip DNR if this tab was already ALLOWED ===
  if (allowedTabs.has(tabId)) {
    console.log('✅ Tab already allowed, skipping DNR for:', url);
    allowedTabs.delete(tabId); // Clear for next navigation
    return;
  }
  
  // === FIX #1: Skip DNR if this URL is confirmed SAFE ===
  const normalizedUrl = normalizeUrl(url);
  if (safeUrls.has(normalizedUrl)) {
    console.log('✅ URL confirmed SAFE, skipping DNR for:', url);
    return;
  }
  
  // === FIX #2: Check whitelist FIRST before any DNR rule ===
  if (isWhitelistedDomain(url)) {
    console.log('✅ WHITELIST: URL is whitelisted, no protection needed:', url);
    analysisInProgressByTab.delete(tabId);
    return;
  }
  
  // === FIX #4: Bypass search engines completely ===
  const searchEngines = [
    'bing.com/search',
    'google.com/search',
    'duckduckgo.com'
  ];
  if (searchEngines.some(engine => url.includes(engine))) {
    console.log('🔍 SEARCH ENGINE: Bypassing protection for:', url);
    analysisInProgressByTab.delete(tabId);
    return;
  }
  
  // Mark analysis as in progress BEFORE navigation
  analysisInProgressByTab.set(tabId, { url, startTime: Date.now() });
  
  // === FIX #1, #2: Create UNIQUE per-tab rule IDs and remove old rules FIRST ===
  try {
    const baseRuleId = 100000 + tabId; // Unique base per tab
    const allowLocalhost = baseRuleId + 1;
    const allowBing = baseRuleId + 2;
    const allowAbuseDB = baseRuleId + 3;
    const allowVT = baseRuleId + 4;
    const blockResources = baseRuleId; // Block non-main_frame resources
    
    // CRITICAL: Remove ALL old rules for this tab FIRST (separate call)
    const existingRuleIds = blockedTabRules.get(tabId) || [];
    if (Array.isArray(existingRuleIds) && existingRuleIds.length > 0) {
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existingRuleIds
        });
        console.log('🧹 Removed old DNR rules for tab:', tabId);
      } catch (e) {
        console.log('⚠️ Could not remove old rules (may not exist):', e.message);
      }
    }
    
    // NOW add the new rules (second call, no collision risk)
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        // HIGH-PRIORITY ALLOWLIST (priority 100) - BYPASS the block for trusted services
        {
          id: allowLocalhost,
          priority: 100,
          action: { type: 'allow' },
          condition: {
            urlFilter: '|http://localhost',
            resourceTypes: ['xmlhttprequest']
          }
        },
        {
          id: allowBing,
          priority: 100,
          action: { type: 'allow' },
          condition: {
            urlFilter: 'bing.com/api',
            resourceTypes: ['xmlhttprequest']
          }
        },
        {
          id: allowAbuseDB,
          priority: 100,
          action: { type: 'allow' },
          condition: {
            urlFilter: 'abuse.ch',
            resourceTypes: ['xmlhttprequest']
          }
        },
        {
          id: allowVT,
          priority: 100,
          action: { type: 'allow' },
          condition: {
            urlFilter: 'virustotal.com',
            resourceTypes: ['xmlhttprequest']
          }
        },
        // === FIX #3: Do NOT block main_frame until verdict is BLOCK ===
        // Only block sub-resources (scripts, images, etc) pending analysis
        {
          id: blockResources,
          priority: 1,
          action: { type: 'block' },
          condition: {
            urlFilter: '||',
            resourceTypes: ['script', 'image', 'stylesheet', 'xmlhttprequest', 'object', 'media', 'font', 'ping']
          }
        }
      ]
    });
    
    // Store ALL rule IDs for this tab so we can remove them later
    blockedTabRules.set(tabId, [blockResources, allowLocalhost, allowBing, allowAbuseDB, allowVT]);
    console.log('🔐 DNR rules set for tab:', tabId, 'Base:', baseRuleId);
  } catch (error) {
    console.error('⚠️ Could not set DNR rules:', error.message);
  }
  
  // Send message to content script to show overlay
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'FREEZE',
      url: url
    }).catch(err => {
      console.log('⚠️ Content script not ready, will show overlay soon');
    });
  } catch (error) {
    console.log('⚠️ Could not send FREEZE message:', error.message);
  }
  
  pendingAnalysis.set(url, true);
  
  try {
    // Quick analysis
    const decision = await analyzeURL(url, tabId, 'navigation');
    
    console.log('📋 Navigation decision:', decision.verdict, 'for', url);
    
    // Only pass serializable data
    const verdict = decision.verdict;
    const score = Math.round(decision.score || 0);
    
    // Send decision to content script
    chrome.tabs.sendMessage(tabId, {
      action: 'analysisComplete',
      verdict: verdict,
      score: score,
      reasoning: decision.reasoning
    }).catch(err => {
      console.log('⚠️ Content script not ready yet');
    });
    
    // If BLOCK - add main_frame block rule, show block page
    if (verdict === 'BLOCK') {
      console.log('🚨 BLOCKING NAVIGATION to:', url);
      
      // === FIX: Add main_frame block rule ONLY for confirmed malicious sites ===
      try {
        const blockMainFrameId = 100000 + tabId + 10; // Unique ID for main_frame block
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules: [{
            id: blockMainFrameId,
            priority: 50, // Higher than resource block, lower than allow
            action: { type: 'block' },
            condition: {
              urlFilter: '||',
              resourceTypes: ['main_frame']
            }
          }]
        });
        const ruleIds = blockedTabRules.get(tabId) || [];
        ruleIds.push(blockMainFrameId);
        blockedTabRules.set(tabId, ruleIds);
      } catch (e) {
        console.log('⚠️ Could not add main_frame block:', e.message);
      }
      
      // Send BLOCK message to content script
      await chrome.tabs.sendMessage(tabId, {
        action: 'SHOW_BLOCK_PAGE',
        url: url,
        score: score
      }).catch(() => {});
      
      logDecisionToStorage(decision);
    }
    // If WARN - show warning overlay with "Proceed Anyway" button (page loads but resources blocked)
    else if (verdict === 'WARN') {
      console.log('⚠️ WARNING: Suspicious site detected - showing warning overlay');
      
      // Send WARN message to content script with score
      await chrome.tabs.sendMessage(tabId, {
        action: 'SHOW_WARNING',
        score: score,
        url: url
      }).catch(() => {});
      
      logDecisionToStorage(decision);
      // Resources stay blocked until user clicks "Proceed Anyway"
    }
    // If ALLOW - unblock all resources and reload page
    else {
      console.log('✅ Safe URL detected, unblocking all resources');
      
      // === FIX #1: Mark this tab and URL as ALLOWED to prevent re-blocking ===
      allowedTabs.add(tabId);
      safeUrls.add(normalizeUrl(url));
      
      // Remove ALL DNR rules for this tab
      try {
        const ruleIds = blockedTabRules.get(tabId);
        if (ruleIds && Array.isArray(ruleIds) && ruleIds.length > 0) {
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: ruleIds
          });
          blockedTabRules.delete(tabId);
          console.log('🔓 DNR rules removed for tab:', tabId);
        }
      } catch (error) {
        console.error('⚠️ Could not remove DNR rules:', error.message);
      }
      
      // Send UNFREEZE message to content script
      await chrome.tabs.sendMessage(tabId, {
        action: 'UNFREEZE',
        score: score
      }).catch(() => {});
      
      // Reload the tab to actually load the page now that blocking is removed
      chrome.tabs.reload(tabId);
      
      analysisInProgressByTab.delete(tabId);
      logDecisionToStorage(decision);
    }
    
  } catch (error) {
    console.error('❌ Error during navigation analysis:', error);
    // Remove blocking rules if analysis fails
    try {
      const ruleIds = blockedTabRules.get(tabId);
      if (ruleIds && Array.isArray(ruleIds) && ruleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: ruleIds
        });
        blockedTabRules.delete(tabId);
      }
    } catch (e) {}
    analysisInProgressByTab.delete(tabId);
  } finally {
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
    console.log('☁️ Attempting to use website backend for analysis...');
    const cloudResult = await analyzeWithWebsite(urlString);
    if (cloudResult) {
      console.log('✅ Successfully analyzed with website API');
      logDecisionToStorage(cloudResult);
      return cloudResult;
    }
    console.log('⚠️ Website API unavailable, will use local analysis with WARN fallback for safety');

    // PHASE 1: Whitelist
    if (isWhitelistedDomain(urlString)) {
      console.log('✅ PHASE 1: Whitelisted - ALLOW');
      return {
        verdict: 'ALLOW',
        riskLevel: 'SAFE',
        score: 0,
        shouldBlock: false,
        canBypass: false,
        url: urlString,
        reasoning: 'Whitelisted domain',
        timestamp: new Date().toISOString()
      };
    }

    const parsed = parseURL(urlString);
    if (!parsed.valid) {
      console.log('❌ Invalid URL format');
      return {
        verdict: 'ALLOW',
        riskLevel: 'SAFE',
        score: 0,
        shouldBlock: false,
        url: urlString,
        timestamp: new Date().toISOString()
      };
    }

    let totalScore = 0;
    const factors = [];

    // PHASE 2: Local Blacklist (Very Fast)
    console.log('📋 PHASE 2: Checking local blacklist...');
    const blacklistScore = checkBlacklist(parsed.domain);
    if (blacklistScore > 0) {
      console.log('🚨 BLACKLIST HIT - Score:', blacklistScore);
      totalScore += blacklistScore;
      factors.push({
        name: 'Local Blacklist',
        score: blacklistScore,
        severity: 'CRITICAL'
      });
    }

    // PHASE 3: API Checks (Parallel with timeout)
    console.log('🌐 PHASE 3: Running API checks...');
    try {
      const apiScore = await Promise.race([
        runAPIChecks(urlString, parsed),
        new Promise(resolve => setTimeout(() => resolve(0), CONFIG.TIMEOUTS.API_CALL))
      ]);
      
      if (apiScore > 0) {
        console.log('⚠️ API Check Score:', apiScore);
        totalScore += apiScore;
        factors.push({
          name: 'API Threats',
          score: apiScore,
          severity: 'HIGH'
        });
      }
    } catch (e) {
      console.log('⚠️ API checks skipped:', e.message);
    }

    // PHASE 4: Domain Age
    console.log('📅 PHASE 4: Domain age analysis...');
    const ageScore = checkDomainAge(parsed.domain);
    if (ageScore > 0) {
      console.log('⏰ Domain Age Score:', ageScore);
      totalScore += ageScore;
      factors.push({
        name: 'Domain Age',
        score: ageScore,
        severity: 'MEDIUM'
      });
    }

    // PHASE 5: SSL Analysis
    console.log('🔐 PHASE 5: SSL analysis...');
    const sslScore = analyzeSSL(parsed);
    if (sslScore > 0) {
      console.log('🔓 SSL Score:', sslScore);
      totalScore += sslScore;
      factors.push({
        name: 'SSL/HTTPS Issues',
        score: sslScore,
        severity: 'MEDIUM'
      });
    }

    // PHASE 6: Heuristics (Local, Fast)
    console.log('🧠 PHASE 6: Heuristic analysis...');
    const heuristicScore = runHeuristics(urlString, parsed);
    if (heuristicScore > 0) {
      console.log('⚠️ Heuristic Score:', heuristicScore);
      totalScore += heuristicScore;
      factors.push({
        name: 'Suspicious Patterns',
        score: heuristicScore,
        severity: 'MEDIUM'
      });
    }

    // PHASE 7: Google Safe Browsing (if key available)
    if (CONFIG.API_KEYS.GOOGLE_SAFE_BROWSING) {
      console.log('🔍 PHASE 7: Google Safe Browsing...');
      try {
        const gsScore = await Promise.race([
          checkGoogleSafeBrowsing(urlString),
          new Promise(resolve => setTimeout(() => resolve(0), 2000))
        ]);
        
        if (gsScore > 0) {
          console.log('⛔ Google SB: THREAT');
          totalScore += gsScore;
          factors.push({
            name: 'Google Safe Browsing',
            score: gsScore,
            severity: 'CRITICAL'
          });
        }
      } catch (e) {
        console.log('⚠️ Google SB skipped');
      }
    }

    // PHASE 8: Normalize score
    const normalizedScore = Math.min(totalScore, 100);
    console.log('📊 PHASE 8: Normalized Score:', normalizedScore);

    // PHASE 9: Determine verdict based on score (0-100, higher = worse)
    // === FIX #1: Backend offline MUST NOT cause BLOCK ===
    // === FIX #8: score=0 does NOT mean CRITICAL ===
    let verdict = 'ALLOW';
    let riskLevel = 'SAFE';
    let backendFailed = !cloudResult; // Did backend API fail?

    // Check if we have explicit threats (not just heuristic scores)
    const hasExplicitBlacklist = factors.some(f => f.name === 'Local Blacklist');
    const hasGoogleSafeBrowsing = factors.some(f => f.name === 'Google Safe Browsing');
    const hasMultipleThreats = factors.length >= 3;

    // CRITICAL threats = BLOCK
    if (hasExplicitBlacklist || hasGoogleSafeBrowsing) {
      verdict = 'BLOCK';
      riskLevel = 'CRITICAL';
    }
    // Only heuristics (no backend, no blacklist) = WARN (safer default)
    else if (backendFailed && !hasMultipleThreats) {
      verdict = 'WARN';
      riskLevel = 'MEDIUM';
    }
    // Score-based determination (backend succeeded or multiple threats)
    else if (normalizedScore < CONFIG.THRESHOLDS.BLOCK) {
      verdict = 'BLOCK';
      riskLevel = normalizedScore < 25 ? 'CRITICAL' : 'HIGH';
    }
    else if (normalizedScore < CONFIG.THRESHOLDS.WARN) {
      verdict = 'WARN';
      riskLevel = normalizedScore >= 65 ? 'MEDIUM' : 'LOW';
    }
    // Score >= 80 = ALLOW/SAFE (default)

    console.log(`✅ VERDICT: ${verdict} | RISK: ${riskLevel} | SCORE: ${normalizedScore} | Backend: ${backendFailed ? 'FAILED' : 'OK'}`);
    console.log(`⏱️ Analysis time: ${Date.now() - startTime}ms`);

    return {
      verdict,
      riskLevel,
      score: normalizedScore,
      shouldBlock: verdict === 'BLOCK',
      canBypass: verdict === 'WARN',
      url: urlString,
      reasoning: generateReason(factors, verdict),
      factors: factors,
      timestamp: new Date().toISOString()
    };

  } catch (e) {
    console.error('💥 CRITICAL ERROR:', e);
    return {
      verdict: 'ALLOW',
      riskLevel: 'SAFE',
      score: 0,
      shouldBlock: false,
      url: urlString,
      error: e.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Analyze URL using website API (with real-time sync)
 */
async function analyzeWithWebsite(urlString) {
  try {
    console.log('📡 Sending scan request to backend:', CONFIG.WEBSITE_API);
    
    const response = await fetch(`${CONFIG.WEBSITE_API}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: urlString, source: 'extension' })
    });

    if (!response.ok) {
      console.log('⚠️ Website API error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    console.log('✅ Website API result received:', data.scanId, 'Status:', data.overallStatus);
    
    // Transform website API response to extension format
    // Website API returns percentage (0-100 where higher = safer)
    // Our system uses score (0-100 where higher = riskier)
    // So we invert it: ourScore = 100 - apiSafetyScore
    const apiSafetyScore = data.percentage || 100;
    const ourRiskScore = 100 - apiSafetyScore;
    
    const decision = {
      verdict: data.overallStatus === 'danger' ? 'BLOCK' : data.overallStatus === 'warning' ? 'WARN' : 'ALLOW',
      riskLevel: data.overallStatus === 'danger' ? 'HIGH' : data.overallStatus === 'warning' ? 'MEDIUM' : 'SAFE',
      score: ourRiskScore,
      shouldBlock: data.overallStatus === 'danger',
      canBypass: data.overallStatus === 'warning',
      url: urlString,
      reasoning: `Security Score: ${ourRiskScore}% - ${data.overallStatus.toUpperCase()}`,
      source: 'WEBSITE_API',
      scanId: data.scanId,
      timestamp: data.timestamp
    };
    
    console.log('📊 Transformed decision:', decision.verdict, 'Score:', decision.score);
    return decision;
  } catch (error) {
    console.error('❌ Website API error:', error.message);
    console.log('ℹ️ Will use local analysis as fallback');
    return null;
  }
}

/**
 * Register extension with website (called after user login)
 */
async function registerExtensionWithWebsite(userToken) {
  try {
    const response = await fetch(`${CONFIG.WEBSITE_API}/extension/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        extensionId: chrome.runtime.id,
        userAgent: navigator.userAgent
      })
    });

    if (!response.ok) {
      console.error('❌ Failed to register extension:', response.status);
      return null;
    }

    const data = await response.json();
    extensionToken = data.extensionToken;
    userId = data.userId;
    isAuthenticated = true;

    // Store tokens locally
    await chrome.storage.local.set({
      extensionToken: extensionToken,
      userId: userId,
      registeredAt: new Date().toISOString()
    });

    console.log('✅ Extension registered with website. User ID:', userId);
    return data;
  } catch (error) {
    console.error('❌ Extension registration failed:', error);
    return null;
  }
}

// PHASE FUNCTIONS

function isWhitelistedDomain(urlString) {
  try {
    const url = new URL(urlString);
    return whitelistDomains.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function checkBlacklist(domain) {
  if (!domain) return 0;
  const lower = domain.toLowerCase();
  for (const entry of blacklistData) {
    if (entry.domain.toLowerCase() === lower) {
      return entry.severity === 'CRITICAL' ? 50 : 40;
    }
  }
  return 0;
}

async function runAPIChecks(urlString, parsed) {
  let totalScore = 0;

  // VirusTotal
  if (CONFIG.API_KEYS.VIRUSTOTAL) {
    try {
      const vtScore = await checkVirusTotal(urlString);
      totalScore += vtScore;
    } catch (e) {
      console.log('⚠️ VT error:', e.message);
    }
  }

  // AbuseIPDB
  if (parsed.isIP && CONFIG.API_KEYS.ABUSEIPDB) {
    try {
      const abScore = await checkAbuseIPDB(parsed.hostname);
      totalScore += abScore;
    } catch (e) {
      console.log('⚠️ AbuseIPDB error:', e.message);
    }
  }

  // URLhaus (free)
  try {
    const uhScore = await checkURLhaus(urlString);
    totalScore += uhScore;
  } catch (e) {
    console.log('⚠️ URLhaus error:', e.message);
  }

  return Math.min(totalScore, 50);
}

async function checkVirusTotal(urlString) {
  try {
    const encoded = encodeURIComponent(urlString);
    const response = await fetch(`https://www.virustotal.com/api/v3/urls/${encoded}`, {
      headers: { 'x-apikey': CONFIG.API_KEYS.VIRUSTOTAL }
    });
    if (response.ok) {
      const data = await response.json();
      const malicious = data.data?.attributes?.last_analysis_stats?.malicious || 0;
      if (malicious > 0) {
        console.log('🦠 VirusTotal:', malicious, 'detections');
        return Math.min(malicious * 3, 40);
      }
    }
  } catch (e) {
    console.log('⚠️ VirusTotal failed');
  }
  return 0;
}

async function checkAbuseIPDB(ip) {
  try {
    const response = await fetch('https://api.abuseipdb.com/api/v2/check', {
      method: 'POST',
      headers: {
        'Key': CONFIG.API_KEYS.ABUSEIPDB,
        'Accept': 'application/json'
      },
      body: new URLSearchParams({ ip })
    });
    if (response.ok) {
      const data = await response.json();
      const score = data.data?.abuseConfidenceScore || 0;
      if (score > 50) {
        console.log('🔴 AbuseIPDB:', score);
        return Math.min(score / 2, 40);
      }
    }
  } catch (e) {
    console.log('⚠️ AbuseIPDB failed');
  }
  return 0;
}

async function checkURLhaus(urlString) {
  try {
    const response = await fetch('https://urlhaus-api.abuse.ch/v1/url/', {
      method: 'POST',
      body: 'url=' + encodeURIComponent(urlString)
    });
    if (response.ok) {
      const data = await response.json();
      if (data.query_status === 'ok' && data.url_status === 'malware') {
        console.log('⚠️ URLhaus: Malware detected');
        return 45;
      }
    }
  } catch (e) {
    console.log('⚠️ URLhaus failed');
  }
  return 0;
}

function checkDomainAge(domain) {
  if (!domain) return 0;
  const name = domain.split('.')[0].toLowerCase();
  
  if (/^[a-z0-9]{10,}$/.test(name) && !/[aeiou]/.test(name)) {
    return 15;
  }
  if (/\d$/.test(name)) return 10;
  if ((name.match(/-/g) || []).length > 2) return 12;
  
  return 0;
}

function analyzeSSL(parsed) {
  if (parsed.protocol !== 'https:') {
    console.log('🔓 No HTTPS');
    return 25;
  }
  return 0;
}

function runHeuristics(urlString, parsed) {
  let score = 0;
  const lower = urlString.toLowerCase();
  const reasons = [];

  // CRITICAL: Suspicious file downloads
  const suspiciousExtensions = /\.(exe|bin|sh|bat|cmd|msi|scr|vbs|js|ps1|dll|com|sys|drv)($|\?|#)/i;
  if (suspiciousExtensions.test(urlString)) {
    console.log('🚨 SUSPICIOUS FILE DOWNLOAD');
    score += 60;
    reasons.push('Suspicious executable/script file');
  }

  // CRITICAL: IP-based URLs (especially with non-standard ports)
  if (parsed.isIP) {
    console.log('🔴 IP-based URL');
    score += 45;
    reasons.push('Direct IP address (not domain)');
    
    // Even more suspicious if non-standard port
    if (urlString.match(/:\d{4,5}\//)) {
      score += 20;
      reasons.push('Non-standard port detected');
    }
  }

  // CRITICAL: Suspicious TLDs (commonly abused)
  const suspiciousTLDs = /\.(cfd|gdn|cc|tk|ml|ga|cf|xyz|top|trade|stream|click|download|online|icu|shop|club|faith|zip)($|\/)/i;
  if (suspiciousTLDs.test(urlString)) {
    console.log('⚠️ Suspicious TLD detected');
    score += 35;
    reasons.push('Suspicious domain extension');
  }

  // High-risk keywords
  const riskKeywords = [
    { word: 'login', score: 8 },
    { word: 'verify', score: 10 },
    { word: 'confirm', score: 10 },
    { word: 'update', score: 5 },
    { word: 'secure', score: 5 },
    { word: 'kyc', score: 15 },
    { word: 'reward', score: 12 },
    { word: 'bonus', score: 12 },
    { word: 'free', score: 8 },
    { word: 'urgent', score: 10 },
    { word: 'claim', score: 12 },
    { word: 'download', score: 15 }
  ];
  
  for (const item of riskKeywords) {
    if (lower.includes(item.word)) {
      score += item.score;
      reasons.push(`Risk keyword: '${item.word}'`);
    }
  }

  // Typosquatting
  if (/g00gle|faceb00k|paypal-secure|amaz0n|pey.?pal|appel|microsooft|twiter/i.test(urlString)) {
    console.log('🎯 Typosquatting detected');
    score += 40;
    reasons.push('Suspected typosquatting domain');
  }

  // URL shorteners (often used in phishing)
  if (/bit\.ly|tinyurl|goo\.gl|ow\.ly|is\.gd|short\.link|adf\.ly|bit\.do/.test(parsed.hostname)) {
    console.log('📎 URL shortener detected');
    score += 20;
    reasons.push('URL shortener (obscures destination)');
  }

  // Excessive parameters
  const paramCount = Object.keys(parsed.params || {}).length;
  if (paramCount > 5) {
    score += 15;
    reasons.push('Excessive URL parameters');
  }

  // URL encoding abuse
  if ((urlString.match(/%/g) || []).length > 10) {
    score += 20;
    reasons.push('Suspicious URL encoding');
  }

  // Weird domain patterns (many hyphens, numbers)
  if (parsed.domain && /^[a-z0-9]*[a-z][a-z0-9]*-[a-z0-9]*-/.test(parsed.domain)) {
    score += 15;
    reasons.push('Suspicious domain pattern');
  }

  // Very new-looking domains (all numbers after TLD)
  if (/\.\w+\/\d{6,}/.test(urlString)) {
    score += 20;
    reasons.push('Suspicious numeric path pattern');
  }

  console.log('🧠 Heuristic Analysis - Score:', Math.min(score, 80), 'Reasons:', reasons);
  return Math.min(score, 80);
}

async function checkGoogleSafeBrowsing(urlString) {
  try {
    const response = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${CONFIG.API_KEYS.GOOGLE_SAFE_BROWSING}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'guardianlink', clientVersion: '2.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
          platformTypes: ['WINDOWS'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url: urlString }]
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.matches?.length > 0) {
        console.log('⛔ Google SB: THREAT FOUND');
        return 50;
      }
    }
  } catch (e) {
    console.log('⚠️ Google SB check failed');
  }
  return 0;
}

// UTILITIES

function parseURL(urlString) {
  try {
    const url = new URL(urlString);
    return {
      valid: true,
      original: urlString,
      protocol: url.protocol,
      hostname: url.hostname,
      domain: extractDomain(url.hostname),
      pathname: url.pathname,
      params: parseParams(url.search),
      isIP: /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
    };
  } catch (e) {
    return { valid: false };
  }
}

function extractDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
}

function parseParams(search) {
  const params = {};
  if (!search) return params;
  new URLSearchParams(search).forEach((v, k) => params[k] = v);
  return params;
}

function generateReason(factors, verdict) {
  if (!factors.length) return 'URL analysis complete.';
  const names = factors.slice(0, 2).map(f => f.name).join(', ');
  
  if (verdict === 'BLOCK') return `Threats detected: ${names}. URL blocked.`;
  if (verdict === 'WARN') return `Suspicious indicators: ${names}. Proceed carefully.`;
  return 'URL appears safe.';
}

function logDecisionToStorage(decision) {
  chrome.storage.local.get(['guardianlink_logs'], (data) => {
    let logs = data.guardianlink_logs || [];
    logs.push({
      url: decision.url,
      verdict: decision.verdict,
      riskLevel: decision.riskLevel,
      score: decision.score,
      timestamp: decision.timestamp
    });
    if (logs.length > 500) logs = logs.slice(-500);
    chrome.storage.local.set({ 'guardianlink_logs': logs });
  });
}

function logBypassToStorage(url) {
  chrome.storage.local.get(['guardianlink_logs'], (data) => {
    let logs = data.guardianlink_logs || [];
    const idx = logs.findIndex(l => l.url === url);
    if (idx !== -1) {
      logs[idx].bypassed = true;
      logs[idx].bypassTime = new Date().toISOString();
    }
    chrome.storage.local.set({ 'guardianlink_logs': logs });
  });
}

console.log('🛡️ GuardianLink v2.0 Background Worker Ready');

/**
 * Analyze URL with rule engine
 * @param {string} urlString
 * @returns {Object} Rule analysis result
 */
function analyzeURLWithRules(urlString) {
  // Parse URL
  let parsedURL = {};
  try {
    const url = new URL(urlString);
    parsedURL = {
      href: url.href,
      protocol: url.protocol,
      hostname: url.hostname,
      domain: extractDomain(url.hostname),
      subdomain: extractSubdomain(url.hostname),
      port: url.port,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      isIP: isIPAddress(url.hostname),
      queryParams: parseQueryParams(url.search),
      length: urlString.length,
      isEncoded: isEncoded(urlString),
      isValid: true
    };
  } catch (e) {
    parsedURL = {
      href: urlString,
      isValid: false,
      error: e.message
    };
  }

  // Apply rules
  const ruleResults = applyURLRules(urlString, parsedURL);

  return {
    url: urlString,
    parsed: parsedURL,
    riskScore: ruleResults.totalScore,
    risks: ruleResults.risks,
    rules: ruleResults.rules
  };
}

/**
 * Apply URL rules
 * @param {string} urlString
 * @param {Object} parsedURL
 * @returns {Object} Rules results
 */
function applyURLRules(urlString, parsedURL) {
  const results = {
    rules: {},
    totalScore: 0,
    risks: [],
    checks: []
  };

  if (!parsedURL.isValid) {
    return {
      ...results,
      rules: { invalid_url: 100 },
      totalScore: 100,
      risks: ['Invalid URL format']
    };
  }

  // Rule 1: URL Length
  const lengthScore = checkURLLength(urlString);
  if (lengthScore > 0) {
    results.rules.excessive_length = lengthScore;
    results.risks.push(`Abnormally long URL (${urlString.length} chars)`);
  }

  // Rule 2: URL Shorteners
  const shortenerScore = checkShortener(parsedURL.hostname);
  if (shortenerScore > 0) {
    results.rules.shortener = shortenerScore;
    results.risks.push('URL shortener detected');
  }

  // Rule 3: Suspicious Keywords
  const keywordScore = checkSuspiciousKeywords(urlString);
  if (keywordScore > 0) {
    results.rules.suspicious_keywords = keywordScore;
    results.risks.push('Suspicious keywords in URL');
  }

  // Rule 4: Typosquatting
  const typosquatScore = checkTyposquatting(urlString);
  if (typosquatScore > 0) {
    results.rules.typosquatting = typosquatScore;
    results.risks.push('Possible typosquatting detected');
  }

  // Rule 5: IP-based URLs
  const ipScore = checkIPBased(parsedURL);
  if (ipScore > 0) {
    results.rules.ip_based = ipScore;
    results.risks.push('Direct IP address used instead of domain');
  }

  // Rule 6: Excessive Query Parameters
  const queryScore = checkExcessiveParams(parsedURL);
  if (queryScore > 0) {
    results.rules.excessive_params = queryScore;
    results.risks.push('Excessive query parameters');
  }

  // Rule 7: Encoding/Obfuscation
  const encodingScore = checkEncoding(urlString, parsedURL);
  if (encodingScore > 0) {
    results.rules.encoding_obfuscation = encodingScore;
    results.risks.push('Possible URL encoding/obfuscation');
  }

  // Rule 8: Suspicious Subdomains
  const subdomainScore = checkSuspiciousSubdomains(parsedURL.subdomain);
  if (subdomainScore > 0) {
    results.rules.suspicious_subdomain = subdomainScore;
    results.risks.push('Suspicious subdomain structure');
  }

  // Rule 9: Suspicious TLD
  const tldScore = checkSuspiciousTLD(parsedURL);
  if (tldScore > 0) {
    results.rules.suspicious_tld = tldScore;
    results.risks.push('URL uses suspicious TLD');
  }

  // Calculate total score
  Object.values(results.rules).forEach(score => {
    results.totalScore += score;
  });

  results.totalScore = Math.min(results.totalScore, 100);

  return results;
}

/**
 * Check domain reputation
 * @param {Object} parsedURL
 * @returns {Object} Reputation verdict
 */
function checkDomainReputation(parsedURL) {
  const domain = parsedURL.domain || parsedURL.hostname || '';
  
  if (!domain) {
    return {
      verdict: 'UNKNOWN',
      score: 0,
      reason: 'No domain'
    };
  }

  const domainLower = domain.toLowerCase();

  // Check blacklist
  for (const entry of blacklistData) {
    if (entry.domain.toLowerCase() === domainLower) {
      return {
        verdict: 'BLACKLISTED',
        score: 100,
        reason: entry.reason,
        severity: entry.severity,
        source: 'Local Blacklist'
      };
    }
  }

  // Check domain age heuristics
  const ageAnalysis = analyzeRecentDomain(domain);
  if (ageAnalysis.score > 0) {
    return {
      verdict: 'SUSPICIOUS',
      score: ageAnalysis.score,
      reason: ageAnalysis.reason,
      source: 'Domain Age Heuristics'
    };
  }

  // Check domain name patterns
  const patternAnalysis = analyzeDomainName(domain);
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
    reason: 'No reputation indicators',
    source: 'Default Assessment'
  };
}

/**
 * Make final security decision
 * @param {string} urlString
 * @param {Object} ruleAnalysis
 * @param {Object} reputationAnalysis
 * @returns {Object} Final decision
 */
function makeSecurityDecision(urlString, ruleAnalysis, reputationAnalysis) {
  let combinedScore = 0;
  const factors = [];

  // Factor 1: Rule-based score (50% weight)
  const ruleScore = ruleAnalysis.riskScore || 0;
  combinedScore += ruleScore * 0.5;
  if (ruleScore > 0) {
    factors.push({
      source: 'URL Rules',
      score: ruleScore,
      details: ruleAnalysis.risks
    });
  }

  // Factor 2: Domain reputation (40% weight)
  let reputationScore = 0;
  if (reputationAnalysis) {
    if (reputationAnalysis.verdict === 'BLACKLISTED') {
      reputationScore = 100;
    } else if (reputationAnalysis.verdict === 'SUSPICIOUS') {
      reputationScore = reputationAnalysis.score || 60;
    }
  }
  combinedScore += reputationScore * 0.4;
  if (reputationScore > 0) {
    factors.push({
      source: 'Domain Reputation',
      score: reputationScore,
      verdict: reputationAnalysis.verdict,
      reason: reputationAnalysis.reason
    });
  }

  // Cap score
  combinedScore = Math.min(combinedScore, 100);

  // Determine verdict
  let verdict, riskLevel;
  if (combinedScore >= 75) {
    verdict = 'BLOCK';
    riskLevel = 'CRITICAL';
  } else if (combinedScore >= 55) {
    verdict = 'BLOCK';
    riskLevel = 'HIGH';
  } else if (combinedScore >= 35) {
    verdict = 'WARN';
    riskLevel = 'MEDIUM';
  } else if (combinedScore >= 15) {
    verdict = 'WARN';
    riskLevel = 'LOW';
  } else {
    verdict = 'ALLOW';
    riskLevel = 'SAFE';
  }

  return {
    url: urlString,
    verdict: verdict,
    riskLevel: riskLevel,
    combinedScore: Math.round(combinedScore * 10) / 10,
    shouldBlock: verdict === 'BLOCK',
    canBypass: verdict === 'WARN',
    factors: factors,
    details: {
      domain: ruleAnalysis.parsed.domain,
      hostname: ruleAnalysis.parsed.hostname,
      isIP: ruleAnalysis.parsed.isIP,
      urlLength: ruleAnalysis.parsed.length
    },
    risks: ruleAnalysis.risks,
    reasoning: generateReasoning(verdict, factors, ruleAnalysis)
  };
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(verdict, factors, ruleAnalysis) {
  let reasoning = '';

  switch (verdict) {
    case 'BLOCK':
      reasoning = 'This URL has been blocked because it exhibits multiple indicators of malicious intent.';
      break;
    case 'WARN':
      reasoning = 'This URL appears suspicious and may pose a security risk.';
      break;
    case 'ALLOW':
      reasoning = 'This URL appears to be safe based on our analysis.';
      break;
  }

  if (ruleAnalysis.risks && ruleAnalysis.risks.length > 0) {
    reasoning += ' Indicators: ' + ruleAnalysis.risks.slice(0, 2).join(', ') + '.';
  }

  return reasoning;
}

// ===== Rule Functions =====

function checkURLLength(urlString) {
  const length = urlString.length;
  if (length > 2000) return 15;
  if (length > 1000) return 10;
  if (length > 500) return 5;
  return 0;
}

function checkShortener(hostname) {
  if (!hostname) return 0;
  const shorteners = [
    'bit.ly', 'tinyurl.com', 'goo.gl', 'ow.ly',
    'short.link', 'buff.ly', 'adf.ly', 't.co',
    'lnk.co', 'is.gd', 'cli.gs', 'u.to'
  ];
  return shorteners.some(s => hostname.toLowerCase().includes(s)) ? 20 : 0;
}

function checkSuspiciousKeywords(urlString) {
  const keywords = [
    'login', 'signin', 'logon', 'verify', 'confirm', 'validate',
    'kyc', 'aml', 'reward', 'bonus', 'prize', 'claim', 'won',
    'cashback', 'refund', 'free', 'update', 'secure', 'urgent'
  ];
  const lower = urlString.toLowerCase();
  let count = keywords.filter(kw => lower.includes(kw)).length;
  if (count >= 3) return 25;
  if (count === 2) return 15;
  if (count === 1) return 8;
  return 0;
}

function checkTyposquatting(urlString) {
  const patterns = [
    /g00gle|gogle|faceboo?k|paytm-secure|amaz0n|micr0soft/i
  ];
  return patterns.some(p => p.test(urlString)) ? 20 : 0;
}

function checkIPBased(parsedURL) {
  return parsedURL.isIP ? 25 : 0;
}

function checkExcessiveParams(parsedURL) {
  const paramCount = Object.keys(parsedURL.queryParams || {}).length;
  if (paramCount > 10) return 10;
  if (paramCount > 6) return 7;
  if (paramCount > 3) return 3;
  return 0;
}

function checkEncoding(urlString, parsedURL) {
  let score = 0;
  if ((urlString.match(/%/g) || []).length > 10) score += 8;
  if (urlString.includes('&#')) score += 7;
  if (parsedURL.isEncoded) score += 5;
  return Math.min(score, 15);
}

function checkSuspiciousSubdomains(subdomain) {
  if (!subdomain) return 0;
  const count = (subdomain.split('.').length - 1);
  if (count > 5) return 8;
  if (/secure|verify|confirm|update|login/i.test(subdomain)) return 5;
  return 0;
}

function checkSuspiciousTLD(parsedURL) {
  const suspiciousTLDs = [
    'tk', 'xyz', 'top', 'work', 'download',
    'stream', 'review', 'science', 'party'
  ];
  const tld = parsedURL.hostname ? parsedURL.hostname.split('.').pop().toLowerCase() : '';
  return suspiciousTLDs.includes(tld) ? 10 : (tld.length === 1 ? 5 : 0);
}

function analyzeRecentDomain(domain) {
  const domainName = domain.split('.')[0];
  if (/^[a-z0-9]{10,}$/.test(domainName)) return { score: 15, reason: 'Random character domain' };
  if (/\d$/.test(domainName)) return { score: 10, reason: 'Domain ends with numbers' };
  const hyphenCount = (domainName.match(/-/g) || []).length;
  if (hyphenCount > 2) return { score: 12, reason: 'Excessive hyphens' };
  return { score: 0, reason: 'Domain age appears normal' };
}

function analyzeDomainName(domain) {
  const domainName = domain.split('.')[0].toLowerCase();
  if (/[0o]{3,}|[il1]{3,}|[5s]{3,}/.test(domainName)) {
    return { score: 18, reason: 'Homograph attack detected' };
  }
  return { score: 0, reason: 'Domain name appears normal' };
}

// ===== Utility Functions =====

function isWhitelisted(urlString) {
  const patterns = [
    /^about:/,
    /^chrome:\/\//,
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    /^data:text\/html/
  ];
  return patterns.some(p => p.test(urlString));
}

function isIPAddress(hostname) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^(\[)?([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(\])?$/;
  return ipv4Regex.test(hostname) || ipv6Regex.test(hostname);
}

function isEncoded(urlString) {
  try {
    return decodeURIComponent(urlString) !== urlString;
  } catch (e) {
    return false;
  }
}

function extractDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts[parts.length - 2] + '.' + parts[parts.length - 1];
  }
  return hostname;
}

function extractSubdomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.split('.');
  if (parts.length > 2) {
    return parts.slice(0, -2).join('.');
  }
  return '';
}

function parseQueryParams(queryString) {
  const params = {};
  if (!queryString) return params;
  const searchParams = new URLSearchParams(queryString);
  for (const [key, value] of searchParams) {
    params[key] = value;
  }
  return params;
}

// ===== Logging =====

/**
 * Log decision to chrome storage
 */
function logDecisionToStorage(decision) {
  chrome.storage.local.get(['guardianlink_logs'], (data) => {
    let logs = data.guardianlink_logs || [];
    
    // Add new log entry
    logs.push({
      url: decision.url,
      verdict: decision.verdict,
      riskLevel: decision.riskLevel,
      combinedScore: decision.combinedScore,
      timestamp: decision.timestamp,
      details: decision.details,
      risks: decision.risks,
      reasoning: decision.reasoning,
      context: decision.context,
      tabId: decision.tabId
    });

    // Keep only last 500 entries
    if (logs.length > 500) {
      logs = logs.slice(-500);
    }

    chrome.storage.local.set({ 'guardianlink_logs': logs }, () => {
      console.log('Decision logged:', decision.verdict, decision.url.substring(0, 50));
    });
  });
}

/**
 * Log bypass action
 */
function logBypassToStorage(url) {
  chrome.storage.local.get(['guardianlink_logs'], (data) => {
    let logs = data.guardianlink_logs || [];
    
    // Find and update the corresponding log entry
    const logIndex = logs.findIndex(log => log.url === url);
    if (logIndex !== -1) {
      logs[logIndex].bypassTimestamp = new Date().toISOString();
    }

    chrome.storage.local.set({ 'guardianlink_logs': logs });
  });
}

console.log('GuardianLink background service worker loaded');
