/**
 * Enhanced Background Service Worker - GuardianLink v2.0
 * Complete page blocking until scan results are ready
 * FIXED VERSION - All issues resolved
 */

console.log('🛡️ GuardianLink v2.0 Background Worker Ready');

// ========== GLOBAL STATE ==========
const CONFIG = {
  WEBSITE_API: 'https://guardianlink-backend.onrender.com', // Will be updated after local check
  LOCAL_API: 'http://localhost:3001',
  REMOTE_API: 'https://guardianlink-backend.onrender.com',
  BLOCK_TIMEOUT: 30000,
  POLL_INTERVAL: 1500,
  MAX_POLL_ATTEMPTS: 20,
  EXTENSION_ID: browser.runtime.id
};

// ========== DETECT LOCAL BACKEND ==========
async function detectAndSetAPI() {
  try {
    const healthResponse = await Promise.race([
      fetch(`${CONFIG.LOCAL_API}/api/health`, { timeout: 2000 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
    ]);
    
    if (healthResponse.ok) {
      CONFIG.WEBSITE_API = CONFIG.LOCAL_API;
      console.log('✅ Using LOCAL backend: ' + CONFIG.LOCAL_API);
      return;
    }
  } catch (error) {
    console.log('⚠️ Local backend not available, using Render backend');
  }
  
  CONFIG.WEBSITE_API = CONFIG.REMOTE_API;
  console.log('🌐 Using REMOTE backend: ' + CONFIG.REMOTE_API);
}

// Initialize API endpoint detection immediately
detectAndSetAPI();

// ========== TAB EXISTENCE HELPER ==========
async function tabExists(tabId) {
  try {
    await browser.tabs.get(tabId);
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
  localScanCache: new Map(),  // NEW: Local cache of scan results
  whitelist: new Set([
    'google.com', 'bing.com', 'youtube.com', 'wikipedia.org',
    'github.com', 'stackoverflow.com', 'microsoft.com', 'apple.com'
  ])
};

// Track tabs currently being redirected to prevent race conditions
const processingTabs = new Set();

// ========== INITIALIZATION ==========
browser.runtime.onInstalled.addListener(() => {
  console.log('GuardianLink v2.0 Enhanced Edition - INSTALLED');
  initializeExtension();
  
  // Show installation notification
  browser.notifications.create({
    type: 'basic',
    title: 'GuardianLink Installed',
    message: 'GuardianLink v2.0 is now active!\nAll URLs will be scanned for security threats.',
    iconUrl: browser.runtime.getURL('assets/icon-128.png')
  });
});

browser.runtime.onStartup.addListener(() => {
  console.log('🔄 Extension starting up, clearing stale state');
  clearAllBlockingRules();
  state.blockedTabs.clear();
  
  // Show startup notification
  browser.notifications.create({
    type: 'basic',
    title: 'GuardianLink Active',
    message: 'GuardianLink v2.0 is now protecting your browsing.\nAll URLs will be scanned for security threats.',
    iconUrl: browser.runtime.getURL('assets/icon-128.png'),
    tag: 'guardianlink-startup'
  });
});

// ========== CONSOLE HELPER - Logs available test functions ==========
setTimeout(() => {
  console.log('🎮 Console Helper Functions Available:');
  console.log('   testNotification(verdict) - Test notifications');
  console.log('   quickNotify(title, message) - Quick notification');
  console.log('   Examples: testNotification("BLOCK"), testNotification("WARN"), testNotification("ALLOW")');
}, 100);

async function initializeExtension() {
  // Clear any existing rules
  await clearAllBlockingRules();
  
  // Initialize notification manager
  try {
    if (typeof notificationManager !== 'undefined' && notificationManager.initialize) {
      await notificationManager.initialize();
      console.log('✅ Notification manager initialized');
    }
  } catch (e) {
    console.warn('⚠️ Notification manager initialization skipped:', e.message);
  }
  
  // Setup context menus
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: 'scan-link',
      title: 'Scan with Guardian Link',
      contexts: ['link']
    });
    browser.contextMenus.create({
      id: 'scan-page',
      title: 'Scan this page',
      contexts: ['page']
    });
    console.log('✅ Context menus created');
  });
  
  console.log('✅ Extension initialized');
}

// ========== CONTEXT MENU HANDLER ==========
browser.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || tab.url;
  
  if (info.menuItemId === 'scan-link' || info.menuItemId === 'scan-page') {
    console.log(`🔍 Context menu scan requested for: ${url}`);
    
    // Show initial notification
    browser.notifications.create({
      type: 'basic',
      title: '🔍 Scan Starting',
      message: `Scanning: ${new URL(url).hostname}...\nPlease wait for results.`,
      iconUrl: browser.runtime.getURL('assets/icon-128.png'),
      tag: 'guardianlink-scan-start-' + Date.now()
    });
    
    // Perform scan
    performManualScan(url, tab.id);
  }
});

async function performManualScan(url, tabId) {
  try {
    // Create a new tab for scanner
    const scanUrl = browser.runtime.getURL('ui/scanner.html') + 
      '?' + new URLSearchParams({
        url: encodeURIComponent(url),
        tabId: tabId.toString()
      });
    
    await browser.tabs.create({
      url: scanUrl,
      active: true
    });
    
    console.log(`📄 Opened scanner for: ${url}`);
  } catch (error) {
    console.error('❌ Failed to start scan:', error);
    browser.notifications.create({
      type: 'basic',
      title: '❌ Scan Failed',
      message: `Could not scan the URL. Please try again.`,
      iconUrl: browser.runtime.getURL('assets/icon-128.png')
    });
  }
}

// ========== CLEAR ALL RULES ==========
async function clearAllBlockingRules() {
  // declarativeNetRequest not supported in Firefox MV2
  // This function is disabled for Firefox compatibility
  return;
}

// ========== MAIN NAVIGATION INTERCEPTION ==========
browser.webNavigation.onBeforeNavigate.addListener(async (details) => {
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
      browser.tabs.sendMessage(tabId, { action: 'BYPASS' }).catch(() => {
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
    const scannerUrl = browser.runtime.getURL('ui/scanner.html') + 
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
      await browser.tabs.update(tabId, { url: scannerUrl });
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
        await browser.tabs.update(tabId, { url: originalUrl });
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
  const scanStartTime = Date.now();
  console.log(`🚀 Starting scan for: ${url}`);
  
  try {
    // NEW: Check local cache first (instant lookup)
    const localCached = state.localScanCache.get(url);
    if (localCached && Date.now() - localCached.timestamp < 24 * 60 * 60 * 1000) {
      // Cache hit in extension memory
      const cacheAge = Date.now() - localCached.timestamp;
      console.log(`⚡ Local cache HIT for ${url} (${cacheAge}ms old)`);
      await completeScan(tabId, url, localCached.result);
      return;
    }
    
    // Determine if URL is an IP address or domain
    const urlObj = new URL(url);
    const isIP = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(urlObj.hostname);
    console.log(`📍 Hostname: ${urlObj.hostname} (${isIP ? 'IP Address' : 'Domain'})`);
    
    // Call backend API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    try {
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
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const scanData = await response.json();
      const scanId = scanData.scanId;
      const requestTime = Date.now() - scanStartTime;
      
      console.log(`📋 Backend scan initiated: ${scanId} (request time: ${requestTime}ms)`);
      
      // Check if scan was completed from cache
      if (scanData.status === 'completed' && scanData.cached) {
        console.log(`⚡ Scan completed immediately from cache (${requestTime}ms)`);
        // Store in local cache for instant future lookups
        state.localScanCache.set(url, {
          result: scanData,
          timestamp: Date.now()
        });
        // Skip polling and go directly to completion
        await completeScan(tabId, url, scanData);
        return;
      }
      
      // Update state
      state.pendingScans.set(url, { tabId, scanId, startTime: Date.now() });
      
      const blockedInfo = state.blockedTabs.get(tabId);
      if (blockedInfo) {
        blockedInfo.scanId = scanId;
        blockedInfo.status = 'scanning';
      }
      
      // Start polling
      pollForScanResults(scanId, url, tabId);
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Scan request timeout (15 seconds)');
      }
      throw fetchError;
    }
    
  } catch (error) {
    console.error('❌ Scan initiation failed:', error.message);
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
  const pollStartTime = Date.now();
  
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
    const pollTime = Date.now() - pollStartTime;
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`📋 Poll result status: ${result.status} (response time: ${result.responseTimeMs || pollTime}ms)`);
    
    if (result.status === 'completed') {
      console.log(`✅ Scan completed: ${result.verdict} for ${url}`);
      
      // NEW: Store in local cache for instant future lookups
      state.localScanCache.set(url, {
        result: result,
        timestamp: Date.now()
      });
      
      // Log if any phases were skipped
      if (result.phases) {
        const skippedPhases = Object.entries(result.phases)
          .filter(([_, phase]) => phase.available === false || phase.error)
          .map(([key, phase]) => `${key} (${phase.reason || phase.error || 'N/A'})`)
          .join(', ');
        
        if (skippedPhases) {
          console.warn(`⚠️ Skipped phases: ${skippedPhases}`);
        }
      }
      
      // Store result
      state.scanResults.set(scanId, result);
      
      // Process verdict
      await completeScan(tabId, url, result);
      
    } else if (result.status === 'processing' || result.status === 'in_progress') {
      // Update scanner page if it's loaded
      try {
        await browser.tabs.sendMessage(tabId, {
          action: 'SCAN_UPDATE',
          status: 'scanning',
          progress: Math.min(30 + (attempt * 5), 90),
          message: result.message || `Scanning... (${attempt}/${CONFIG.MAX_POLL_ATTEMPTS})`
        });
      } catch (e) {
        // Scanner page not ready yet, that's OK
      }
      
      // Adaptive polling: shorter interval for first attempts, longer for later
      const pollDelay = attempt < 5 ? CONFIG.POLL_INTERVAL : CONFIG.POLL_INTERVAL * 2;
      
      // Poll again
      setTimeout(() => {
        pollForScanResults(scanId, url, tabId, attempt + 1);
      }, pollDelay);
      
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

// ========== NOTIFICATION HELPER ==========
// Firefox WebExtensions notifications.create() only supports: type, title, message, iconUrl
// Does NOT support: requireInteraction, tag (these are Web Notifications API, not WebExtensions API)
async function showScanNotification(url, verdict, score, result) {
  try {
    const domain = new URL(url).hostname;
    const timestamp = new Date().toLocaleTimeString();
    const riskScore = Math.round(100 - score);
    
    let notificationTitle = '';
    let notificationMessage = '';
    
    if (verdict === 'BLOCK') {
      notificationTitle = '🛑 Malicious URL Blocked';
      notificationMessage = `Domain: ${domain}\nRisk Score: ${riskScore}% (Critical)\nTime: ${timestamp}\nAction: URL has been blocked for your safety.`;
    } else if (verdict === 'WARN') {
      notificationTitle = '⚠️ Suspicious Website Detected';
      notificationMessage = `Domain: ${domain}\nRisk Score: ${riskScore}% (Medium)\nTime: ${timestamp}\nAction: Review warning before proceeding.`;
    } else if (verdict === 'ALLOW') {
      notificationTitle = '✅ Website Safe';
      notificationMessage = `Domain: ${domain}\nSafety Score: ${score}%\nTime: ${timestamp}\nStatus: Safe to visit.`;
    }
    
    // Create notification using Firefox WebExtensions API
    // Supported properties: type, title, message, iconUrl
    console.log(`📢 Creating notification for ${verdict}: ${domain}`);
    
    const notificationId = await browser.notifications.create({
      type: "basic",
      title: notificationTitle,
      message: notificationMessage,
      iconUrl: browser.runtime.getURL("assets/icon-128.png")
    });
    
    console.log(`✅ Notification created successfully with ID: ${notificationId}`);
    console.log(`   Verdict: ${verdict} | Domain: ${domain} | Score: ${score}%`);
    
  } catch (error) {
    console.error('❌ Failed to show notification:', error.message);
    console.error('   Error details:', error);
  }
}

// ========== TEST NOTIFICATION FUNCTION ==========
// Can be called from console: testNotification('BLOCK') or testNotification('WARN') or testNotification('ALLOW')
async function testNotification(verdict = 'ALLOW') {
  console.log(`🧪 Testing notification for verdict: ${verdict}`);
  
  const testUrl = 'https://example.com/test';
  const testScore = verdict === 'BLOCK' ? 10 : (verdict === 'WARN' ? 50 : 90);
  
  await showScanNotification(testUrl, verdict, testScore, {});
}

// Make testNotification globally accessible
globalThis.testNotification = testNotification;

// Alternative: Direct notification creation for testing
globalThis.quickNotify = async function(title = '✅ Test Notification', message = 'This is a test notification') {
  return await browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("assets/icon-128.png"),
    title: title,
    message: message
  });
};

// ========== GET COMPLETE SCAN DETAILS ==========
async function getCompleteScanDetails(scanId) {
  try {
    console.log(`🔄 Fetching complete scan details for scanId: ${scanId}`);
    
    const response = await fetch(`${CONFIG.WEBSITE_API}/api/scan/result/${scanId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const result = await response.json();
    
    console.log(`📊 Scan details received - status: ${result.status}`);
    
    if (result.status === 'completed' && result.phases) {
      console.log(`✅ Complete scan data available with ${Object.keys(result.phases).length} phases`);
      
      // Log phase results for debugging
      Object.entries(result.phases).forEach(([key, phase]) => {
        if (phase.error) {
          console.warn(`  ⚠️ ${phase.name}: ${phase.error}`);
        } else if (phase.available === false) {
          console.warn(`  ⏭️ ${phase.name}: Skipped (${phase.reason || 'N/A'})`);
        } else if (phase.score !== undefined && phase.maxScore !== undefined) {
          console.log(`  ✅ ${phase.name}: Score ${phase.score}/${phase.maxScore}`);
        } else {
          console.warn(`  ⚠️ ${phase.name}: Incomplete data (score: ${phase.score}, maxScore: ${phase.maxScore})`);
        }
      });
      
      return result;
    }
    
    console.warn(`⚠️ Scan result not ready - status: ${result.status}`);
    return null;
  } catch (error) {
    console.error('Error fetching scan details:', error);
    return null;
  }
}

// ========== COMPLETE SCAN ==========
async function completeScan(tabId, url, result) {
  const verdict = result.verdict || 'ALLOW';
  const score = result.score || 100;
  
  console.log(`📋 Final verdict: ${verdict} (Score: ${score}) for ${url}`);
  
  // 🔔 SHOW NOTIFICATION FOR EVERY SCAN RESULT
  // Show notifications directly for BLOCK and WARN (most important)
  if (verdict === 'BLOCK' || verdict === 'WARN') {
    await showScanNotification(url, verdict, score, result);
  } else if (verdict === 'ALLOW') {
    // For ALLOW, try to use settings but default to not showing
    try {
      if (notificationManager && typeof notificationManager.shouldNotify === 'function') {
        const shouldShow = await notificationManager.shouldNotify(verdict);
        if (shouldShow) {
          await showScanNotification(url, verdict, score, result);
        }
      }
    } catch (e) {
      // Ignore errors, don't block scan completion
    }
  }
  
  // Cleanup pending state
  state.pendingScans.delete(url);
  
  // Update blocked info
  const blockedInfo = state.blockedTabs.get(tabId);
  if (blockedInfo) {
    blockedInfo.status = 'completed';
    blockedInfo.verdict = verdict;
    blockedInfo.score = score;
    blockedInfo.scanId = result.scanId; // Store scanId for fetching details
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
    await browser.tabs.update(tabId, { url: url });
    
    // Send message to content script to remove overlay
    try {
      await browser.tabs.sendMessage(tabId, {
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
    // Get complete scan details from backend
    const completeDetails = await getCompleteScanDetails(result.scanId);
    
    console.log(`⚠️ ${verdict} verdict, redirecting to warning page`);
    await redirectToWarningPage(tabId, url, verdict, score, completeDetails || result);
  }
}

// ========== REDIRECT TO WARNING PAGE ==========
async function redirectToWarningPage(tabId, url, verdict, score, result) {
  try {
    // Store COMPLETE decision data for warning page
    const decisionData = {
      url: url,
      verdict: verdict,
      score: score,
      riskLevel: verdict === 'BLOCK' ? 'CRITICAL' : 'MEDIUM',
      reasoning: result.reasoning || 'Website security analysis',
      timestamp: new Date().toISOString(),
      // Pass all the detailed phases data
      phases: result.phases || null,
      // Pass all other details from backend
      totalScore: result.totalScore || 0,
      maxTotalScore: result.maxTotalScore || 100,
      percentage: result.percentage || score,
      overallStatus: result.overallStatus || (verdict === 'BLOCK' ? 'danger' : 'warning'),
      details: {
        domain: new URL(url).hostname,
        risks: result.risks || [],
        // Include all findings
        findings: result.findings || [],
        warnings: result.warnings || [],
        threats: result.threats || []
      }
    };
    
    // Store in both sessionStorage AND local storage for reliability
    sessionStorage.setItem('guardianlink_decision', JSON.stringify(decisionData));
    
    await browser.storage.local.set({
      guardianlink_warning_decision: decisionData,
      guardianlink_original_url: url
    });
    
    // Navigate to warning page WITH tabId
    const warningUrl = browser.runtime.getURL('ui/warning.html') + 
      '?' + new URLSearchParams({ 
        url: encodeURIComponent(url), 
        verdict: verdict,
        score: score,
        tabId: tabId.toString(),
        // Pass scanId to fetch details if needed
        scanId: result.scanId || ''
      });
    
    await browser.tabs.update(tabId, { url: warningUrl });
    
    // Log decision
    logDecision(url, verdict, score, result);
    
  } catch (error) {
    console.error('❌ Failed to redirect to warning page:', error);
    // Fallback: navigate to original URL
    await browser.tabs.update(tabId, { url: url });
  }
}

// ========== MESSAGE HANDLING ==========
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
            browser.tabs.sendMessage(sender.tab.id, {
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
        handleGoBack(sender.tab.id).then(success => {
          sendResponse({ success: true });
        }).catch(error => {
          console.error('GO_BACK error:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true; // Will respond asynchronously
      } else {
        sendResponse({ success: false });
      }
      break;
    
    default:
      sendResponse({ status: 'unknown_action' });
  }
});

// ========== GO BACK HANDLER ==========
async function handleGoBack(tabId) {
  if (!tabId) {
    console.error('❌ No tabId provided for GO_BACK');
    throw new Error('No tabId provided');
  }
  
  try {
    console.log(`🔙 Handling go back for tab ${tabId}`);
    
    // Check if tab exists
    try {
      await browser.tabs.get(tabId);
    } catch (error) {
      console.error(`❌ Tab ${tabId} no longer exists`);
      throw error;
    }
    
    // Clear any blocked state for this tab
    state.blockedTabs.delete(tabId);
    
    // ✅ FIREFOX FIX: Use browser.tabs.create({}) to open about:newtab safely
    // This is the most reliable and fully supported method in Firefox
    console.log('📄 Creating new tab with browser.tabs.create({})...');
    await browser.tabs.create({});
    console.log('✅ New tab created successfully');
    
    // Close the current warning tab
    console.log(`🗑️ Closing warning tab ${tabId}...`);
    await browser.tabs.remove(tabId);
    console.log(`✅ Warning tab ${tabId} closed successfully`);
    
    console.log(`✅ Successfully navigated to home`);
    return true;
    
  } catch (error) {
    console.error('❌ Error in handleGoBack:', error.message);
    throw error;
  }
}

// ========== HANDLE PROCEED WITH URL ==========
async function handleProceedWithUrl(request, sendResponse) {
  const { url, tabId } = request;
  try {
    // Mark as bypassed (5 minutes)
    state.bypassedUrls.set(url, Date.now() + (5 * 60 * 1000));
    
    // Store in local storage for content script
    await browser.storage.local.set({
      guardianlink_bypassed_url: url,
      guardianlink_bypassed_timestamp: Date.now()
    });
    
    // Clear blocked state
    state.blockedTabs.delete(tabId);
    
    // Navigate to the URL
    await browser.tabs.update(tabId, { url });
    
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
  
  // Check local storage for bypass flag
  browser.storage.local.get(['guardianlink_bypassed_url'], (result) => {
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
  
  // Store in local storage for content script
  await browser.storage.local.set({
    guardianlink_bypassed_url: url,
    guardianlink_bypassed_timestamp: Date.now()
  });
  
  // Clear blocked state
  state.blockedTabs.delete(tabId);
  
  // Navigate to original URL
  await browser.tabs.update(tabId, { url: url });
  
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
  browser.storage.local.get(['guardianlink_logs'], (data) => {
    const logs = data.guardianlink_logs || [];
    
    // score is the safety percentage from backend (0-100, 100=safe)
    // riskScore is what we display (100 - safety percentage)
    const color = getColorByVerdictAndScore(verdict, score);
    const riskScore = 100 - score;
    const riskLevel = calculateRiskLevel(score);
    
    const logEntry = {
      url,
      verdict,
      score,
      riskScore,
      combinedScore: score,
      color: color,
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
    
    browser.storage.local.set({ guardianlink_logs: logs });
    console.log(`📊 Logged decision: ${verdict} for ${url}`);
    
    // Trigger dashboard update
    try {
      browser.runtime.sendMessage({ action: 'refreshDashboard' });
    } catch (e) {}
  });
}
function getColorByVerdictAndScore(verdict, safetyScore) {
  // Safety score: 0-100 where 100=safe
  if (verdict === 'BLOCK') {
    return '#d32f2f'; // Red - always red for BLOCK
  } else if (verdict === 'WARN') {
    // For WARN, use orange for moderate risk, yellow for low risk
    if (safetyScore < 40) return '#f97316'; // Orange - high risk WARN
    return '#eab308'; // Yellow - moderate risk WARN
  } else { // ALLOW
    if (safetyScore >= 80) return '#22c55e'; // Green - very safe
    if (safetyScore >= 60) return '#a3e635'; // Lime green - safe
    return '#1976d2'; // Blue - safe but not perfect
  }
}
function logBypass(url) {
  browser.storage.local.get(['guardianlink_bypasses'], (data) => {
    const bypasses = data.guardianlink_bypasses || [];
    
    bypasses.unshift({
      url,
      timestamp: new Date().toISOString()
    });
    
    if (bypasses.length > 50) {
      bypasses.length = 50;
    }
    
    browser.storage.local.set({ guardianlink_bypasses: bypasses });
  });
}

// ========== TAB CLEANUP ==========
browser.tabs.onRemoved.addListener((tabId) => {
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
