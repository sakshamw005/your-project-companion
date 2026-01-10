/**
 * Enhanced Background Service Worker - GuardianLink v2.0
 * Complete page blocking until scan results are ready
 * FIXED VERSION - All issues resolved
 */

console.log('🛡️ GuardianLink v2.0 Background Worker Ready');

// ========== GLOBAL STATE ==========
const CONFIG = {
  WEBSITE_API: 'https://guardianlink-backend.onrender.com',
  BLOCK_TIMEOUT: 30000,
  POLL_INTERVAL: 1500,
  MAX_POLL_ATTEMPTS: 20,
  EXTENSION_ID: chrome.runtime.id
};

// ========== TAB EXISTENCE HELPER ==========
async function tabExists(tabId) {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (error) {
    return false;
  }
}

// State tracking
const state = {
  blockedTabs: new Map(),
  scanResults: new Map(),
  allowedUrls: new Set(),
  bypassedUrls: new Map(),
  pendingScans: new Map(),
  contentScriptReady: new Map(),
  currentRuleId: 1000,
  whitelist: new Set([
    'google.com', 'bing.com', 'youtube.com', 'wikipedia.org',
    'github.com', 'stackoverflow.com', 'microsoft.com', 'apple.com'
  ])
};

// Track tabs currently being redirected to prevent race conditions
const processingTabs = new Set();

// ========== INITIALIZATION ==========
chrome.runtime.onInstalled.addListener(() => {
  console.log('🛡️ GuardianLink v2.0 Enhanced Edition - INSTALLED');
  initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('🔄 Extension starting up, clearing stale state');
  clearAllBlockingRules();
  state.blockedTabs.clear();
});

async function initializeExtension() {
  // Clear any existing rules
  await clearAllBlockingRules();
  
  // Setup context menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'scan-link',
      title: 'Scan with Guardian Link',
      contexts: ['link']
    });
    chrome.contextMenus.create({
      id: 'scan-page',
      title: 'Scan this page',
      contexts: ['page']
    });
    console.log('✅ Context menus created');
  });
  
  console.log('✅ Extension initialized');
}

// ========== CLEAR ALL RULES ==========
async function clearAllBlockingRules() {
  try {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    if (rules.length > 0) {
      const ruleIds = rules.map(r => r.id);
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: ruleIds
      });
      console.log(`🧹 Cleared ${ruleIds.length} stale rules`);
    }
  } catch (error) {
    console.error('❌ Failed to clear rules:', error);
  }
}

// ========== MAIN NAVIGATION INTERCEPTION ==========
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  const { url, tabId, frameId } = details;
  
  // ✅ Only process main frame
  if (frameId !== 0) return;
  
  console.log(`🌐 Navigation to: ${url}`);
  
  // ✅ SKIP SYSTEM PAGES (Firefox fix!)
  if (url.startsWith('about:') ||
      url.startsWith('chrome://') || 
      url.startsWith('chrome-extension://') ||
      url.startsWith('moz-extension://') ||
      url.startsWith('edge://') ||
      url.startsWith('file://')) {
    console.log(`⏭️ Skipping system page: ${url}`);
    return;
  }
  
  // Skip our own extension pages
  if (url.includes('/ui/warning.html') || 
      url.includes('/ui/scanner.html')) {
    return;
  }
  
  // Check if URL was recently bypassed
  if (state.bypassedUrls.has(url)) {
    const expiry = state.bypassedUrls.get(url);
    if (Date.now() < expiry) {
      console.log(`✅ URL recently bypassed: ${url}`);
      return;
    } else {
      state.bypassedUrls.delete(url);
    }
  }
  
  // Check whitelist
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    if (state.whitelist.has(hostname)) {
      console.log(`✅ Whitelisted domain: ${hostname}`);
      // Notify content script immediately
      chrome.tabs.sendMessage(tabId, { action: 'BYPASS' }).catch(() => {
        // Content script might not be ready yet, that's okay
      });
      return;
    }
  } catch (e) {
    console.log('⚠️ Could not parse URL:', e.message);
  }
  
  // Check if already allowed
  if (state.allowedUrls.has(url)) {
    console.log(`✅ URL previously allowed: ${url}`);
    return;
  }
  
  // Check if already scanning
  if (state.pendingScans.has(url)) {
    console.log(`⏳ Already scanning: ${url}`);
    return;
  }
  
  // Prevent duplicate processing of same tab
  if (processingTabs.has(tabId)) {
    console.log(`⏳ Tab ${tabId} already being processed`);
    return;
  }
  
  // === CRITICAL: REDIRECT TO SCANNER PAGE FIRST ===
  console.log(`🚫 Redirecting to scanner page for: ${url}`);
  await redirectToScannerPage(tabId, url);
});

// ========== REDIRECT TO SCANNER PAGE ==========
async function redirectToScannerPage(tabId, originalUrl) {
  // Mark tab as being processed
  processingTabs.add(tabId);
  
  try {
    // Check if tab exists
    if (!(await tabExists(tabId))) {
      console.error(`❌ Tab ${tabId} no longer exists, skipping redirect`);
      state.blockedTabs.delete(tabId);
      return;
    }
    
    // Generate scanner URL
    const scannerUrl = chrome.runtime.getURL('ui/scanner.html') + 
      '?' + new URLSearchParams({ 
        url: encodeURIComponent(originalUrl), 
        tabId: tabId.toString() 
      });
    
    console.log(`🎯 Scanner URL: ${scannerUrl}`);
    
    // Store state before redirecting
    state.blockedTabs.set(tabId, {
      originalUrl: originalUrl,
      scannerUrl: scannerUrl,
      startTime: Date.now(),
      status: 'redirecting_to_scanner'
    });
    
    // Update tab to scanner page with error handling
    try {
      await chrome.tabs.update(tabId, { url: scannerUrl });
    } catch (updateError) {
      console.error(`❌ Failed to update tab ${tabId}:`, updateError.message);
      state.blockedTabs.delete(tabId);
      return;
    }
    
    // Start scan AFTER redirect is complete
    setTimeout(() => {
      startURLScan(originalUrl, tabId);
    }, 500);
    
  } catch (error) {
    console.error('❌ Failed to redirect to scanner:', error);
    
    // Check if tab still exists before trying to update
    if (await tabExists(tabId)) {
      try {
        // Fallback: allow the URL
        state.allowedUrls.add(originalUrl);
        await chrome.tabs.update(tabId, { url: originalUrl });
      } catch (fallbackError) {
        console.error(`❌ Fallback redirect failed for tab ${tabId}:`, fallbackError.message);
      }
    }
  } finally {
    // Always remove from processing set
    processingTabs.delete(tabId);
  }
}

// ========== START URL SCAN ==========
async function startURLScan(url, tabId) {
  console.log(`🚀 Starting scan for: ${url}`);
  
  try {
    // Call backend API
    const response = await fetch(`${CONFIG.WEBSITE_API}/api/scan`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ 
        url: url,
        source: 'extension',
        timestamp: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const scanData = await response.json();
    const scanId = scanData.scanId;
    
    console.log(`📋 Backend scan started: ${scanId}`);
    
    // Update state
    state.pendingScans.set(url, { tabId, scanId, startTime: Date.now() });
    
    const blockedInfo = state.blockedTabs.get(tabId);
    if (blockedInfo) {
      blockedInfo.scanId = scanId;
      blockedInfo.status = 'scanning';
    }
    
    // Start polling
    pollForScanResults(scanId, url, tabId);
    
  } catch (error) {
    console.error('❌ Scan initiation failed:', error);
    // On error, allow the URL
    await completeScan(tabId, url, {
      verdict: 'ALLOW',
      score: 100,
      reasoning: 'Scan failed, defaulting to safe'
    });
  }
}

// ========== POLL FOR SCAN RESULTS ==========
async function pollForScanResults(scanId, url, tabId, attempt = 1) {
  if (attempt > CONFIG.MAX_POLL_ATTEMPTS) {
    console.error(`❌ Max poll attempts reached for ${scanId}`);
    await completeScan(tabId, url, {
      verdict: 'ALLOW',
      score: 100,
      reasoning: 'Scan timeout, defaulting to safe'
    });
    return;
  }
  
  try {
    console.log(`📊 Polling scan ${scanId} (attempt ${attempt}/${CONFIG.MAX_POLL_ATTEMPTS})`);
    
    const response = await fetch(`${CONFIG.WEBSITE_API}/api/scan/result/${scanId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`📋 Poll result status: ${result.status}`);
    
    if (result.status === 'completed') {
      console.log(`✅ Scan completed: ${result.verdict} for ${url}`);
      
      // Store result
      state.scanResults.set(scanId, result);
      
      // Process verdict
      await completeScan(tabId, url, result);
      
    } else if (result.status === 'processing' || result.status === 'in_progress') {
      // Update scanner page if it's loaded
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'SCAN_UPDATE',
          status: 'scanning',
          progress: Math.min(30 + (attempt * 5), 90),
          message: result.message || `Scanning... (${attempt}/${CONFIG.MAX_POLL_ATTEMPTS})`
        });
      } catch (e) {
        // Scanner page not ready yet, that's OK
      }
      
      // Poll again
      setTimeout(() => {
        pollForScanResults(scanId, url, tabId, attempt + 1);
      }, CONFIG.POLL_INTERVAL);
      
    } else if (result.status === 'error') {
      console.error(`❌ Scan error: ${result.error}`);
      await completeScan(tabId, url, {
        verdict: 'ALLOW',
        score: 100,
        reasoning: 'Scan error, defaulting to safe'
      });
    }
    
  } catch (error) {
    console.error(`❌ Poll error: ${error.message}`);
    
    // Retry or give up
    if (attempt < CONFIG.MAX_POLL_ATTEMPTS) {
      setTimeout(() => {
        pollForScanResults(scanId, url, tabId, attempt + 1);
      }, CONFIG.POLL_INTERVAL);
    } else {
      console.error(`❌ Giving up on scan ${scanId}`);
      await completeScan(tabId, url, {
        verdict: 'ALLOW',
        score: 100,
        reasoning: 'Polling failed, defaulting to safe'
      });
    }
  }
}

// ========== COMPLETE SCAN ==========
async function completeScan(tabId, url, result) {
  const verdict = result.verdict || 'ALLOW';
  const score = result.score || 100;
  
  console.log(`📋 Final verdict: ${verdict} (Score: ${score}) for ${url}`);
  
  // Cleanup pending state
  state.pendingScans.delete(url);
  
  // Update blocked info
  const blockedInfo = state.blockedTabs.get(tabId);
  if (blockedInfo) {
    blockedInfo.status = 'completed';
    blockedInfo.verdict = verdict;
    blockedInfo.score = score;
  }
  
  // Check if tab still exists
  if (!(await tabExists(tabId))) {
    console.log(`Tab ${tabId} no longer exists, skipping navigation`);
    return;
  }
  
  if (verdict === 'ALLOW') {
    // Mark as allowed for future
    state.allowedUrls.add(url);
    
    // Navigate to original URL
    console.log(`🔄 Allowing URL, navigating to: ${url}`);
    await chrome.tabs.update(tabId, { url: url });
    
    // Send message to content script to remove overlay
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'UNFREEZE',
        verdict: 'ALLOW',
        score: score,
        message: 'URL is safe'
      });
    } catch (e) {
      // Content script not ready yet
    }
    
    // Log decision
    logDecision(url, verdict, score, result);
    
  } else if (verdict === 'WARN' || verdict === 'BLOCK') {
    // Redirect to warning page
    console.log(`⚠️ ${verdict} verdict, redirecting to warning page`);
    await redirectToWarningPage(tabId, url, verdict, score, result);
  }
}

// ========== REDIRECT TO WARNING PAGE ==========
async function redirectToWarningPage(tabId, url, verdict, score, result) {
  try {
    // Store decision data for warning page
    const decisionData = {
      url: url,
      verdict: verdict,
      score: score,
      riskLevel: verdict === 'BLOCK' ? 'CRITICAL' : 'MEDIUM',
      reasoning: result.reasoning || 'Website security analysis',
      timestamp: new Date().toISOString(),
      details: {
        domain: new URL(url).hostname,
        risks: result.risks || [],
        phaseBreakdown: result.phaseBreakdown
      }
    };
    
    await chrome.storage.session.set({
      guardianlink_warning_decision: decisionData,
      guardianlink_original_url: url
    });
    
    // Navigate to warning page WITH tabId
    const warningUrl = chrome.runtime.getURL('ui/warning.html') + 
      '?' + new URLSearchParams({ 
        url: encodeURIComponent(url), 
        verdict: verdict,
        tabId: tabId.toString()
      });
    
    await chrome.tabs.update(tabId, { url: warningUrl });
    
    // Log decision
    logDecision(url, verdict, score, result);
    
  } catch (error) {
    console.error('❌ Failed to redirect to warning page:', error);
    // Fallback: navigate to original URL
    await chrome.tabs.update(tabId, { url: url });
  }
}

// ========== MESSAGE HANDLING ==========
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(`📨 Received message: ${request.action} from tab ${sender.tab?.id}`);
  
  switch (request.action) {
    case 'ping':
      sendResponse({ status: 'ok', version: '2.0' });
      break;
    
    case 'contentScriptReady':
      if (sender.tab?.id) {
        state.contentScriptReady.set(sender.tab.id, true);
        console.log(`✅ Content script ready in tab ${sender.tab.id}`);
        
        // Check if this tab is being scanned
        const blockedInfo = state.blockedTabs.get(sender.tab.id);
        if (blockedInfo && blockedInfo.status === 'scanning') {
          // Send scan status update
          setTimeout(() => {
            chrome.tabs.sendMessage(sender.tab.id, {
              action: 'SCAN_UPDATE',
              status: 'scanning',
              progress: 40,
              message: 'Security scan in progress...'
            }).catch(() => {});
          }, 100);
        }
      }
      sendResponse({ status: 'acknowledged' });
      break;
    
    case 'CHECK_BYPASS':
      handleBypassCheck(request, sendResponse);
      return true;
    
    // FIX: Handle both message types
    case 'INTERSTITIAL_PROCEED':
    case 'PROCEED_ANYWAY':
      handleProceedAnyway(request, sender, sendResponse);
      return true;
    
    case 'SCANNER_READY':
      console.log(`✅ Scanner page ready in tab ${sender.tab?.id}`);
      sendResponse({ status: 'ready' });
      break;
    
    case 'PROCEED_WITH_URL':
      handleProceedWithUrl(request, sendResponse);
      return true;
    
    case 'GO_BACK':
      console.log(`📨 GO_BACK requested from tab ${sender.tab?.id}`);
      if (sender.tab?.id) {
        handleGoBack(sender.tab.id);
      }
      sendResponse({ success: true });
      break;
    
    default:
      sendResponse({ status: 'unknown_action' });
  }
});

// ========== GO BACK HANDLER ==========
async function handleGoBack(tabId) {
  if (!tabId) {
    console.error('❌ No tabId provided for GO_BACK');
    return;
  }
  
  try {
    console.log(`🔙 Handling go back for tab ${tabId}`);
    
    // Check if tab exists
    try {
      await chrome.tabs.get(tabId);
    } catch (error) {
      console.error(`❌ Tab ${tabId} no longer exists`);
      return;
    }
    
    // Clear any blocked state for this tab
    state.blockedTabs.delete(tabId);
    
    // ✅ FIREFOX FIX: Use about:blank instead of chrome://newtab/
    // Firefox doesn't support chrome:// URLs in extensions
    await chrome.tabs.update(tabId, { url: 'about:blank' });
    
    console.log(`✅ Successfully navigated to about:blank`);
    
  } catch (error) {
    console.error('❌ Error in handleGoBack:', error);
  }
}

// ========== HANDLE PROCEED WITH URL ==========
async function handleProceedWithUrl(request, sendResponse) {
  const { url, tabId } = request;
  try {
    // Mark as bypassed (5 minutes)
    state.bypassedUrls.set(url, Date.now() + (5 * 60 * 1000));
    
    // Store in session for content script
    await chrome.storage.session.set({
      guardianlink_bypassed_url: url,
      guardianlink_bypassed_timestamp: Date.now()
    });
    
    // Clear blocked state
    state.blockedTabs.delete(tabId);
    
    // Navigate to the URL
    await chrome.tabs.update(tabId, { url });
    
    sendResponse({ status: 'bypassed' });
  } catch (error) {
    console.error('❌ Error proceeding with URL:', error);
    sendResponse({ status: 'error', error: error.message });
  }
}

// ========== BYPASS HANDLING ==========
function handleBypassCheck(request, sendResponse) {
  const url = request.url;
  
  if (!url) {
    sendResponse({ isBypassed: false });
    return true;
  }
  
  console.log(`🔍 Checking bypass for: ${url}`);
  
  // Check if whitelisted first
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    
    // Check against whitelist
    const whitelist = [
      'google.com', 'bing.com', 'youtube.com', 'wikipedia.org',
      'github.com', 'stackoverflow.com', 'microsoft.com', 'apple.com',
      'threatcenter.crdf.fr', 'crdf.fr' // Add these domains
    ];
    
    if (whitelist.includes(hostname)) {
      console.log(`✅ URL is whitelisted: ${url}`);
      sendResponse({ isBypassed: true });
      return true;
    }
  } catch (e) {
    // URL parsing failed, continue with other checks
  }
  
  // Check if URL is in allowedUrls (previously scanned and allowed)
  if (state.allowedUrls.has(url)) {
    console.log(`✅ URL is in allowedUrls: ${url}`);
    sendResponse({ isBypassed: true });
    return true;
  }
  
  // Check session storage for bypass flag
  chrome.storage.session.get(['guardianlink_bypassed_url'], (result) => {
    const bypassedUrl = result.guardianlink_bypassed_url;
    
    if (bypassedUrl && bypassedUrl === url) {
      console.log(`✅ URL bypassed in session: ${url}`);
      sendResponse({ isBypassed: true });
    } else if (state.bypassedUrls.has(url)) {
      const expiry = state.bypassedUrls.get(url);
      if (Date.now() < expiry) {
        console.log(`✅ URL in bypass cache: ${url}`);
        sendResponse({ isBypassed: true });
      } else {
        state.bypassedUrls.delete(url);
        sendResponse({ isBypassed: false });
      }
    } else {
      sendResponse({ isBypassed: false });
    }
  });
  
  return true;
}

async function handleProceedAnyway(request, sender, sendResponse) {
  const { url } = request;
  const tabId = sender.tab?.id;
  
  if (!tabId || !url) {
    sendResponse({ error: 'Missing tabId or URL' });
    return;
  }
  
  console.log(`✅ User bypassed warning for: ${url}`);
  
  // Add to bypass cache (5 minutes)
  state.bypassedUrls.set(url, Date.now() + (5 * 60 * 1000));
  
  // Store in session for content script
  await chrome.storage.session.set({
    guardianlink_bypassed_url: url,
    guardianlink_bypassed_timestamp: Date.now()
  });
  
  // Clear blocked state
  state.blockedTabs.delete(tabId);
  
  // Navigate to original URL
  await chrome.tabs.update(tabId, { url: url });
  
  // Log bypass
  logBypass(url);
  
  sendResponse({ status: 'bypassed' });
}

// ========== HELPER FUNCTION: GET RISK LEVEL FROM SCORE ==========
function calculateRiskLevel(safetyScore) {
  // safetyScore is percentage (0-100 where 100=safe)
  // Convert to riskScore (100 - safetyScore)
  const riskScore = 100 - safetyScore;
  
  if (riskScore >= 90) return 'CRITICAL';
  if (riskScore >= 70) return 'HIGH';
  if (riskScore >= 50) return 'MEDIUM';
  if (riskScore >= 30) return 'LOW-MEDIUM';
  return 'LOW';
}

// ========== LOGGING FUNCTIONS ==========
function logDecision(url, verdict, score, details) {
  chrome.storage.local.get(['guardianlink_logs'], (data) => {
    const logs = data.guardianlink_logs || [];
    
    // score is the safety percentage from backend (0-100, 100=safe)
    // riskScore is what we display (100 - safety percentage)
    const riskScore = 100 - score;
    const riskLevel = calculateRiskLevel(score);
    
    const logEntry = {
      url,
      verdict,
      score,
      riskScore,
      combinedScore: score,
      riskLevel: riskLevel,
      reasoning: details?.reasoning || 'Security analysis',
      timestamp: new Date().toISOString(),
      details: {
        domain: new URL(url).hostname,
        risks: details?.risks || [],
        phaseBreakdown: details?.phaseBreakdown
      }
    };
    
    logs.unshift(logEntry);
    
    // Keep only last 100 logs
    if (logs.length > 100) {
      logs.length = 100;
    }
    
    chrome.storage.local.set({ guardianlink_logs: logs });
    console.log(`📊 Logged decision: ${verdict} for ${url}`);
    
    // Trigger dashboard update
    try {
      chrome.runtime.sendMessage({ action: 'refreshDashboard' });
    } catch (e) {}
  });
}

function logBypass(url) {
  chrome.storage.local.get(['guardianlink_bypasses'], (data) => {
    const bypasses = data.guardianlink_bypasses || [];
    
    bypasses.unshift({
      url,
      timestamp: new Date().toISOString()
    });
    
    if (bypasses.length > 50) {
      bypasses.length = 50;
    }
    
    chrome.storage.local.set({ guardianlink_bypasses: bypasses });
  });
}

// ========== TAB CLEANUP ==========
chrome.tabs.onRemoved.addListener((tabId) => {
  // Clean up state
  state.blockedTabs.delete(tabId);
  state.contentScriptReady.delete(tabId);
  processingTabs.delete(tabId);
  
  // Find and clean pending scans for this tab
  for (const [url, scanInfo] of state.pendingScans) {
    if (scanInfo.tabId === tabId) {
      state.pendingScans.delete(url);
    }
  }
  
  console.log(`🧹 Cleaned up tab ${tabId}`);
});

// ========== HEALTH CHECK ==========
async function testBackendConnection() {
  try {
    const response = await fetch(`${CONFIG.WEBSITE_API}/api/health`);
    if (response.ok) {
      console.log('✅ Backend is accessible');
      return true;
    }
  } catch (error) {
    console.error('❌ Backend is NOT accessible:', error.message);
  }
  return false;
}

// Test backend on startup
setTimeout(testBackendConnection, 2000);

console.log('✅ Background service worker fully loaded');