/**
 * Enhanced Content Script - GuardianLink v2.0
 * Handles message-based freezing and overlay display
 */

console.log('🛡️ GuardianLink Content Script LOADED at:', window.location.href);

// === CRITICAL: Skip GuardianLink warning pages ===
const isWarningPage = window.location.href.includes('ui/warning.html') || window.location.href.includes('chrome-extension://');
console.log('📍 Is warning page?', isWarningPage);

if (isWarningPage) {
  console.log('⏭️ Skipping GuardianLink warning page, no overlay needed');
  // Don't run the rest of the content script on warning pages
}

// === FIX #2: Check if URL is a search engine ===
function isSearchEngineUrl(url) {
  const searchEngineDomains = [
    'bing.com',
    'google.com',
    'yahoo.com',
    'duckduckgo.com',
    'startpage.com',
    'ecosia.org',
    'search.yahoo.com',
    'www.bing.com',
    'www.google.com'
  ];
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check if hostname is a search engine
    if (searchEngineDomains.includes(hostname)) {
      return true;
    }
    
    // Also check if path contains /search for Google/Bing
    if ((hostname.includes('google.com') || hostname.includes('bing.com')) && 
        urlObj.pathname.includes('/search')) {
      return true;
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

let pageIsFrozen = false;
let analysisInProgress = new Set();
let shownWarnings = new Set();
const allowedTabs = new Set(); // For tracking allowed tabs
let pageWasBypassed = false; // Track if page was bypassed

// === FIX: Ask background to check if page was bypassed ===
async function checkIfBypassed() {
  try {
    console.log('📤 Asking background to check bypass status...');
    
    // Send message with retry logic
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Background response timeout (attempt ${attempt}/${maxRetries})`));
          }, 1000); // Shorter timeout - 1 second per attempt
        
          chrome.runtime.sendMessage(
            { action: 'CHECK_BYPASS', url: window.location.href },
            (response) => {
              clearTimeout(timeout);
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            }
          );
        });
        
        if (response && response.isBypassed) {
          console.log('✅ Background confirmed: Page was bypassed by user');
          pageWasBypassed = true;
          return true;
        } else {
          console.log('❌ Background confirmed: Page was NOT bypassed');
          return false;
        }
        
      } catch (error) {
        console.log(`⚠️ Bypass check attempt ${attempt}/${maxRetries} failed:`, error.message);
        if (attempt < maxRetries) {
          console.log(`⏳ Retrying in 500ms...`);
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
        }
      }
    }
    
    // If all retries failed, proceed without overlay (safe default)
    console.log('⚠️ All bypass checks failed after 3 attempts, proceeding without overlay');
    return false;
    
  } catch (error) {
    console.log('⚠️ Could not check bypass status with background:', error.message);
    // If can't check, assume not bypassed (show overlay)
    return false;
  }
}

// Initialize on load - check bypass first, then create overlay
async function initializeContentScript() {
  console.log('🔄 Initializing content script...');
  
  // === NEW: Check if it's a search engine FIRST ===
  if (isSearchEngineUrl(window.location.href)) {
    console.log('🔍 Content script: Search engine detected, skipping overlay');
    return; // Don't create overlay for search engines
  }
  
  // Only check bypass if not a warning page AND not a search engine
  if (!isWarningPage) {
    const wasBypassed = await checkIfBypassed();
    
    if (!wasBypassed) {
      console.log('📍 Creating overlay because page was NOT bypassed');
      
      // Check if we should create overlay NOW or wait for DOM
      if (document.readyState === 'loading') {
        // Wait for DOM to be ready
        document.addEventListener('DOMContentLoaded', () => {
          console.log('✅ DOM ready, creating overlay');
          createImmediateOverlay();
        });
      } else {
        // DOM is already ready
        console.log('✅ DOM already ready, creating overlay');
        createImmediateOverlay();
      }
    } else {
      console.log('✅ Skipping overlay creation - page was bypassed');
      // Make sure overlay is removed if it somehow exists
      const existingOverlay = document.getElementById('guardianlink-immediate-overlay');
      if (existingOverlay) {
        existingOverlay.remove();
        console.log('🧹 Removed existing overlay (should not exist)');
      }
    }
  } else {
    console.log('⏭️ Skipping initialization for warning page');
  }
}

// Call initialization
initializeContentScript();

// ==================== IMMEDIATE OVERLAY ====================
// Show overlay immediately when script loads
function createImmediateOverlay() {
  // Don't create if page was bypassed
  if (pageWasBypassed) {
    console.log('⏭️ Skipping overlay - page was bypassed');
    return;
  }
  
  // Check if overlay already exists
  if (document.getElementById('guardianlink-immediate-overlay')) {
    return;
  }
  
  const overlay = document.createElement('div');
  overlay.id = 'guardianlink-immediate-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.95);
    z-index: 2147483647;
    display: flex;
    justify-content: center;
    align-items: center;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  overlay.innerHTML = `
    <div style="text-align: center; padding: 30px;">
      <div style="width: 60px; height: 60px; border: 5px solid rgba(255,255,255,0.3); border-top: 5px solid #4CAF50; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 25px;"></div>
      <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">🔒 GuardianLink Security Check</div>
      <div style="font-size: 16px; opacity: 0.8; margin-bottom: 15px;">Analyzing website security...</div>
      <div style="font-size: 12px; opacity: 0.6; font-family: monospace; max-width: 400px; word-break: break-all;">${window.location.href.substring(0, 100)}</div>
    </div>
  `;
  
  // Add spinner animation
  if (!document.querySelector('#guardianlink-spin-style')) {
    const style = document.createElement('style');
    style.id = 'guardianlink-spin-style';
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.documentElement.appendChild(style);
    }
  }
  
  // Add to document
  if (document.body) {
    document.body.appendChild(overlay);
  } else {
    document.documentElement.appendChild(overlay);
  }
  
  console.log('✅ Immediate overlay created');
}

// Overlay creation is now deferred to initializeContentScript
// after bypass check completes

// ==================== MESSAGE LISTENER ====================
// Wrap the message listener in a try-catch and check if API exists
try {
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('📨 Content script received:', request.action);
      
      if (request.action === 'FREEZE') {
        console.log('🔒 FREEZE message received');
        createImmediateOverlay();
        sendResponse({ status: 'frozen' });
        return true;
      }
      
      if (request.action === 'UNFREEZE') {
        console.log('✅ Received UNFREEZE message, removing overlay');
        console.log('📊 Score:', request.score, 'Bypassed:', request.bypassed);
        
        const overlay = document.getElementById('guardianlink-immediate-overlay');
        if (overlay && overlay.parentNode) {
          overlay.remove();
          console.log('✅ Overlay removed');
        }
        
        // Clear any analysis flags
        analysisInProgress.clear();
        pageIsFrozen = false;
        
        // === FIX #2: If it was a bypass, reload the page to get fresh content ===
        if (request.bypassed === true) {
          console.log('🔄 Bypass detected, reloading page...');
          // Wait a moment then reload
          setTimeout(() => {
            window.location.reload();
          }, 300);
        }
        
        sendResponse({ status: 'unfrozen' });
        return true;
      }
  
  if (request.action === 'showDownloadBlocked') {
    showDownloadBlockedNotification(request.filename, request.reason);
    sendResponse({ status: 'received' });
    return true;
  }
  
  if (request.action === 'SHOW_BLOCK_PAGE') {
    console.log('🚫 SHOW_BLOCK_PAGE message received');
    showBlockedPage(request.url, request.score);
    sendResponse({ status: 'blocked_shown' });
    return true;
  }
  
  if (request.action === 'PROCEED_ANYWAY') {
    console.log('⚠️ User clicked Proceed Anyway on warning overlay');
    removeOverlay();
    sendResponse({ status: 'proceeding' });
    return true;
  }
  
  // Default response for unhandled messages
  sendResponse({ status: 'handled' });
  return true;
    });
    console.log('✅ Message listener registered');
  } else {
    console.warn('⚠️ Chrome runtime API not available in this context');
  }
} catch (error) {
  console.error('❌ Failed to register message listener:', error);
}

// Helper function to remove overlay
function removeOverlay() {
  const overlay = document.getElementById('guardianlink-immediate-overlay');
  if (overlay) overlay.remove();
}

// ==================== GLOBAL STYLES ====================
function addGlobalStyles() {
  const styleId = 'guardianlink-global-styles';
  
  // Don't add twice
  if (document.getElementById(styleId)) {
    return;
  }
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  
  // Safe append - wait for document.head if needed
  if (document.head) {
    document.head.appendChild(style);
    console.log('✅ Global styles added');
  } else {
    console.log('⚠️ document.head not ready yet, will retry');
    document.addEventListener('DOMContentLoaded', () => {
      if (document.head && !document.getElementById(styleId)) {
        document.head.appendChild(style);
        console.log('✅ Global styles added after DOMContentLoaded');
      }
    });
  }
}

// Call it safely based on document readiness
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOM ready, adding global styles');
    addGlobalStyles();
  });
} else {
  console.log('✅ DOM already ready, adding global styles');
  addGlobalStyles();
}

// ==================== SAFETY CHECK ON DOM LOAD ====================
// If somehow overlay was created before bypass check, remove it on DOM load
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ DOM fully loaded - running safety check');
  
  // If page was marked as bypassed but overlay exists, remove it
  if (pageWasBypassed) {
    const overlay = document.getElementById('guardianlink-immediate-overlay');
    if (overlay) {
      overlay.remove();
      console.log('🧹 Safety check: Removed overlay on bypassed page');
    }
  }
});

// ==================== SECURITY CHECK OVERLAY - KEPT FOR LEGACY ====================
// (Note: Immediate overlay now handles this, but keeping for compatibility)

// ==================== WARNING OVERLAY ====================
function showWarningOverlay(score) {
  removeSecurityCheckOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'guardianlink-warning-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255, 152, 0, 0.92);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Icon
  const icon = document.createElement('div');
  icon.style.cssText = `
    font-size: 70px;
    margin-bottom: 20px;
  `;
  icon.textContent = '⚠️';

  // Title
  const title = document.createElement('div');
  title.style.cssText = `
    color: white;
    font-size: 28px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 10px;
  `;
  title.textContent = 'Suspicious Website Detected';

  // Score
  const scoreDisplay = document.createElement('div');
  scoreDisplay.style.cssText = `
    color: white;
    font-size: 20px;
    font-weight: 600;
    text-align: center;
    margin-bottom: 20px;
  `;
  scoreDisplay.textContent = `Security Score: ${score}%`;

  // Description
  const description = document.createElement('div');
  description.style.cssText = `
    color: rgba(255, 255, 255, 0.95);
    font-size: 14px;
    text-align: center;
    margin-bottom: 30px;
    max-width: 80%;
    line-height: 1.6;
  `;
  description.innerHTML = `This website exhibits suspicious characteristics.<br>Proceed at your own risk.`;

  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 15px;
    justify-content: center;
  `;

  // Go Back button
  const backBtn = document.createElement('button');
  backBtn.textContent = '❌ Go Back';
  backBtn.style.cssText = `
    padding: 12px 24px;
    background: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    color: #FF9800;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    transition: all 0.2s;
  `;
  backBtn.onmouseover = () => backBtn.style.background = '#f5f5f5';
  backBtn.onmouseout = () => backBtn.style.background = 'white';
  backBtn.onclick = () => window.history.back();

  // Proceed button
  const proceedBtn = document.createElement('button');
  proceedBtn.textContent = '✅ Proceed Anyway';
  proceedBtn.style.cssText = `
    padding: 12px 24px;
    background: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    color: #FF9800;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    transition: all 0.2s;
  `;
  proceedBtn.onmouseover = () => proceedBtn.style.background = '#f5f5f5';
  proceedBtn.onmouseout = () => proceedBtn.style.background = 'white';
  proceedBtn.onclick = () => {
    overlay.remove();
    chrome.runtime.sendMessage({ action: 'PROCEED_ANYWAY' }, (response) => {
      console.log('✅ Proceed response:', response);
    });
  };

  buttonContainer.appendChild(backBtn);
  buttonContainer.appendChild(proceedBtn);

  overlay.appendChild(icon);
  overlay.appendChild(title);
  overlay.appendChild(scoreDisplay);
  overlay.appendChild(description);
  overlay.appendChild(buttonContainer);
  document.documentElement.appendChild(overlay);

  console.log('⚠️ Warning overlay shown');
}

// ==================== BLOCKED PAGE ====================
function showBlockedPage(url, score) {
  removeSecurityCheckOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'guardianlink-blocked-page';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #d32f2f 0%, #c62828 100%);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Icon
  const icon = document.createElement('div');
  icon.style.cssText = `
    font-size: 100px;
    margin-bottom: 20px;
  `;
  icon.textContent = '🚫';

  // Title
  const title = document.createElement('div');
  title.style.cssText = `
    color: white;
    font-size: 32px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 10px;
  `;
  title.textContent = 'Website Blocked';

  // Reason
  const reason = document.createElement('div');
  reason.style.cssText = `
    color: rgba(255, 255, 255, 0.9);
    font-size: 16px;
    text-align: center;
    margin-bottom: 20px;
  `;
  reason.textContent = `GuardianLink has blocked this website as it poses a security threat.`;

  // Score
  const scoreDisplay = document.createElement('div');
  scoreDisplay.style.cssText = `
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
    text-align: center;
    margin-bottom: 30px;
    padding: 10px 20px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 6px;
  `;
  scoreDisplay.innerHTML = `<strong>Risk Score:</strong> ${score}% (DANGER)<br><strong>Domain:</strong> ${(() => {
    try { return new URL(url).hostname; } catch { return url.substring(0, 50); }
  })()}`;

  // Back button
  const backBtn = document.createElement('button');
  backBtn.textContent = '← Go Back';
  backBtn.style.cssText = `
    padding: 12px 30px;
    background: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    color: #d32f2f;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transition: all 0.2s;
  `;
  backBtn.onmouseover = () => backBtn.style.background = '#f5f5f5';
  backBtn.onmouseout = () => backBtn.style.background = 'white';
  backBtn.onclick = () => window.history.back();

  overlay.appendChild(icon);
  overlay.appendChild(title);
  overlay.appendChild(reason);
  overlay.appendChild(scoreDisplay);
  overlay.appendChild(backBtn);
  document.documentElement.appendChild(overlay);

  console.log('🚫 Blocked page shown');
}

// ==================== SAFETY BADGE ====================
function showSafetyBadge(status, color, score) {
  const badge = document.createElement('div');
  badge.id = 'guardianlink-safety-badge';
  badge.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border: 3px solid ${color};
    border-radius: 10px;
    padding: 15px 20px;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-weight: 600;
    font-size: 14px;
    color: #333;
  `;
  badge.innerHTML = `${status}<br><span style="font-size: 12px; color: #666; margin-top: 5px; display: block;">Score: ${score}%</span>`;
  document.body.appendChild(badge);

  setTimeout(() => badge.remove(), 8000);
  console.log('✅ Safety badge shown:', status);
}

// ==================== DOWNLOAD BLOCKED NOTIFICATION ====================
function showDownloadBlockedNotification(filename, reason) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #F44336;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    max-width: 80%;
    word-break: break-word;
  `;
  notification.innerHTML = `🚫 ${filename || 'Download'} blocked<br><span style="font-size: 11px; opacity: 0.9; margin-top: 5px; display: block;">${reason}</span>`;

  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 5000);
  console.log('🚫 Download blocked:', filename);
}

// ==================== LINK CLICK INTERCEPTION ====================
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href]');
  if (!link) return;

  const url = link.href;
  console.log('🔗 Link clicked:', url);

  // Skip safe protocols
  if (/^(#|javascript:|mailto:|tel:|ftp:)/.test(url)) {
    console.log('✅ Safe protocol, allowing');
    return;
  }

  // === CRITICAL FIX: Don't intercept clicks if we're on a search engine ===
  if (isSearchEngineUrl(window.location.href)) {
    console.log('🔍 On search engine, allowing link click without analysis');
    return; // Allow normal navigation
  }

  // Analyze
  e.preventDefault();
  e.stopPropagation();
  analyzeAndHandle(url, 'click', e);
  
}, true);

// ==================== FORM SUBMISSION INTERCEPTION ====================
document.addEventListener('submit', (e) => {
  const form = e.target;
  const action = form.action || window.location.href;
  
  console.log('📋 Form submitted to:', action);
  
  // Show overlay and analyze form action
  if (analysisInProgress.size > 0) {
    console.log('⏸️ Blocking form submission - scan in progress');
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  
  // Analyze the form action URL
  e.preventDefault();
  e.stopPropagation();
  analyzeAndHandle(action, 'form', e);
}, true);

// ==================== NAVIGATION BLOCKING ====================
// Block window.location changes during analysis
const originalLocationAssign = window.location.assign;
const originalLocationReplace = window.location.replace;

window.location.assign = function(url) {
  if (analysisInProgress.size > 0) {
    console.log('🛑 Blocked navigation during analysis:', url);
    return;
  }
  return originalLocationAssign.call(window.location, url);
};

window.location.replace = function(url) {
  if (analysisInProgress.size > 0) {
    console.log('🛑 Blocked replace navigation during analysis:', url);
    return;
  }
  return originalLocationReplace.call(window.location, url);
};

// ==================== PASTE INTERCEPTION ====================
document.addEventListener('paste', (e) => {
  const text = e.clipboardData?.getData('text');
  if (!text) return;

  console.log('📋 Pasted text:', text.substring(0, 50));

  if (isURL(text)) {
    console.log('🔍 URL detected in paste');
    e.preventDefault();
    e.stopPropagation();
    analyzeAndHandle(text, 'paste', e);
  }
});

// ==================== LOADING OVERLAY FUNCTIONS ====================
function showLoadingOverlay(url) {
  // Don't create if on search engine page
  if (isSearchEngineUrl(window.location.href)) {
    console.log('🔍 On search engine, skipping loading overlay');
    return;
  }
  
  // Check if loading overlay already exists
  if (document.getElementById('guardianlink-loading-overlay')) {
    return;
  }
  
  const overlay = document.createElement('div');
  overlay.id = 'guardianlink-loading-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 2147483646;
    display: flex;
    justify-content: center;
    align-items: center;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  overlay.innerHTML = `
    <div style="text-align: center; padding: 30px; background: rgba(0,0,0,0.9); border-radius: 10px;">
      <div style="width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.3); border-top: 3px solid #4CAF50; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px;"></div>
      <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">🔒 Analyzing Link Safety</div>
      <div style="font-size: 12px; opacity: 0.8; margin-bottom: 10px;">Checking security of clicked link...</div>
      <div style="font-size: 10px; opacity: 0.6; font-family: monospace; max-width: 300px; word-break: break-all;">${url.substring(0, 50)}</div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  console.log('⏳ Loading overlay shown for link click');
}

function removeLoadingOverlay() {
  const overlay = document.getElementById('guardianlink-loading-overlay');
  if (overlay && overlay.parentNode) {
    overlay.remove();
    console.log('✅ Loading overlay removed');
  }
}

// ==================== MAIN ANALYSIS FUNCTION ====================
function analyzeAndHandle(url, context, event) {
  if (analysisInProgress.has(url)) {
    console.log('⏳ Already analyzing this URL');
    return;
  }

  analysisInProgress.add(url);
  console.log(`🔍 Analyzing ${context}: ${url.substring(0, 60)}`);

  // Show loading overlay
  showLoadingOverlay(url);

  try {
    chrome.runtime.sendMessage(
      {
        action: 'analyzeURL',
        url: url,
        context: context
      },
      (decision) => {
        analysisInProgress.delete(url);
        removeLoadingOverlay();

        // Check if extension context is still valid
        if (chrome.runtime.lastError) {
          console.error('⚠️ Extension error:', chrome.runtime.lastError.message);
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            console.log('🔄 Extension was reloaded. Reloading page...');
            window.location.reload();
          }
          return;
        }

        if (!decision) {
          console.error('❌ No decision received');
          return;
        }

        console.log(`📊 Decision: ${decision.verdict} (${decision.riskLevel}) Score: ${decision.score}`);

        if (decision.verdict === 'BLOCK') {
          console.log('🚨 BLOCKING URL');
          showWarningPage(decision);
        } else if (decision.verdict === 'WARN') {
          console.log('⚠️ WARN - Showing notification');
          showWarningNotification(decision);
        } else {
          console.log('✅ ALLOW - Navigating');
          navigateToURL(url);
        }
      }
    );
  } catch (error) {
    analysisInProgress.delete(url);
    removeLoadingOverlay();
    console.error('❌ Failed to send message to background:', error.message);
    if (error.message.includes('Extension context invalidated')) {
      console.log('🔄 Extension context invalidated. Reloading...');
      window.location.reload();
    }
  }
}

// ==================== BLOCK FUNCTION ====================
function showWarningPage(decision) {
  console.log('📄 Preparing warning page:', decision);

  // Store decision in chrome.storage.session so warning.html can retrieve it
  chrome.storage.session.set({
    'guardianlink_warning_decision': decision,
    'guardianlink_original_url': decision.url
  }, () => {
    const warningUrl = chrome.runtime.getURL(
      `ui/warning.html?url=${encodeURIComponent(decision.url)}&verdict=${decision.verdict}`
    );
    console.log('🔗 Navigating to warning page with decision in session storage');
    window.location.href = warningUrl;
  });
}

// ==================== WARN FUNCTION ====================
function showWarningNotification(decision) {
  if (shownWarnings.has(decision.url)) {
    console.log('⏭️ Warning already shown for this URL');
    navigateToURL(decision.url);
    return;
  }

  shownWarnings.add(decision.url);

  const notification = document.createElement('div');
  notification.id = 'guardianlink-warning-' + Date.now();
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #ff6b6b 0%, #ff4757 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(255, 69, 87, 0.3);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    max-width: 400px;
    border-left: 4px solid #ff3d3f;
    animation: slideIn 0.3s ease;
  `;

  const title = document.createElement('div');
  title.style.cssText = 'font-weight: 700; margin-bottom: 4px; font-size: 14px;';
  title.textContent = '⚠️ GuardianLink - Suspicious URL';

  const message = document.createElement('div');
  message.style.cssText = 'font-size: 12px; opacity: 0.95; margin-bottom: 10px; line-height: 1.4;';
  message.textContent = decision.reasoning || 'Risk Level: ' + decision.riskLevel;

  const score = document.createElement('div');
  score.style.cssText = 'font-size: 11px; opacity: 0.85; margin-bottom: 10px;';
  score.textContent = `Risk Score: ${decision.score}/100`;

  const warning = document.createElement('div');
  warning.style.cssText = 'font-size: 11px; opacity: 0.8; margin-bottom: 12px; padding: 6px; background: rgba(0,0,0,0.2); border-radius: 4px;';
  warning.textContent = '📋 You can proceed at your own risk if you trust this site.';

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display: flex; gap: 8px;';

  const goBtn = document.createElement('button');
  goBtn.textContent = 'Go Back';
  goBtn.style.cssText = `
    flex: 1;
    padding: 6px 12px;
    background: rgba(255,255,255,0.25);
    color: white;
    border: 1px solid rgba(255,255,255,0.4);
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
  `;
  goBtn.onclick = () => {
    notification.remove();
    window.history.back();
  };

  const proceedBtn = document.createElement('button');
  proceedBtn.textContent = '✅ Proceed Anyway';
  proceedBtn.style.cssText = `
    flex: 1;
    padding: 6px 12px;
    background: rgba(255,255,255,0.9);
    color: #ff3d3f;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
  `;
  proceedBtn.onclick = () => {
    notification.remove();
    chrome.runtime.sendMessage({
      action: 'logBypass',
      url: decision.url
    });
    navigateToURL(decision.url);
  };

  buttons.appendChild(goBtn);
  buttons.appendChild(proceedBtn);

  notification.appendChild(title);
  notification.appendChild(message);
  notification.appendChild(score);
  notification.appendChild(warning);
  notification.appendChild(buttons);

  document.body.appendChild(notification);

  // Auto-remove
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 8000);

  // Add animation
  addStyle(`
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `);
}

// ==================== UTILITIES ====================

function isURL(str) {
  try {
    new URL(str);
    return true;
  } catch {
    if (!str.includes('://')) {
      try {
        new URL('http://' + str);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

function navigateToURL(url) {
  console.log('🔗 Navigating to:', url);
  window.location.href = url;
}

function addStyle(css) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

console.log('✅ GuardianLink v2.0 Content Script Ready');

// ==================== INITIALIZATION ====================
// Register content script with background script (backup registration)
setTimeout(() => {
  chrome.runtime.sendMessage({ action: 'contentScriptReady' }, (response) => {
    console.log('✅ Content script registered with background');
  });
}, 1000);

console.log('✅ GuardianLink Content Script FULLY LOADED at:', window.location.href);

// Additional debug logging
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ DOM fully loaded - content script ready to intercept');
});

// ==================== TEST VERIFICATION ====================
console.log('🎯 GuardianLink Content Script TEST MARKER - LOADED SUCCESSFULLY');
console.log('📊 Current URL:', window.location.href);
console.log('📊 Document readyState:', document.readyState);
