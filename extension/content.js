/**
 * Enhanced Content Script - GuardianLink v2.0
 * Aggressive URL interception with website sync support
 */

console.log('🛡️ GuardianLink v2.0 Content Script LOADED');

// Track warnings shown
const shownWarnings = new Set();
const analysisInProgress = new Set();
let pageIsFrozen = false;
let analysisResult = null;

// ==================== LOADING OVERLAY ====================
function showLoadingOverlay(url) {
  // Remove any existing overlay
  removeLoadingOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'guardianlink-loading-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Spinner
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 60px;
    height: 60px;
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-top: 4px solid #4CAF50;
    border-radius: 50%;
    animation: guardianlink-spin 1s linear infinite;
    margin-bottom: 20px;
  `;

  // Message
  const message = document.createElement('div');
  message.style.cssText = `
    color: white;
    font-size: 18px;
    font-weight: 600;
    text-align: center;
    margin-bottom: 10px;
  `;
  message.textContent = '🔒 GuardianLink is checking this website...';

  // Subtitle
  const subtitle = document.createElement('div');
  subtitle.style.cssText = `
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    text-align: center;
  `;
  subtitle.textContent = 'Please wait while we analyze the security of this site';

  // Domain info
  const domainInfo = document.createElement('div');
  domainInfo.style.cssText = `
    color: rgba(255, 255, 255, 0.6);
    font-size: 11px;
    text-align: center;
    margin-top: 15px;
    font-family: monospace;
    word-break: break-all;
    max-width: 80%;
  `;
  try {
    domainInfo.textContent = new URL(url).hostname;
  } catch {
    domainInfo.textContent = url.substring(0, 50);
  }

  overlay.appendChild(spinner);
  overlay.appendChild(message);
  overlay.appendChild(subtitle);
  overlay.appendChild(domainInfo);
  document.body.appendChild(overlay);

  // Add animation keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes guardianlink-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  console.log('📊 Loading overlay shown for:', url);
}

function removeLoadingOverlay() {
  const overlay = document.getElementById('guardianlink-loading-overlay');
  if (overlay) {
    overlay.remove();
    console.log('✅ Loading overlay removed');
  }
}

// Show notification (used for downloads and other alerts)
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.id = 'guardianlink-notification';
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${type === 'error' ? '#d32f2f' : type === 'warning' ? '#f57c00' : '#4CAF50'};
    color: white;
    padding: 15px 20px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    z-index: 999998;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    max-width: 350px;
    word-wrap: break-word;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  // Auto remove after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showDownloadBlocked') {
    showNotification(
      `⛔ GuardianLink blocked download: ${request.filename}\n${request.reason}`,
      'error'
    );
  }
});

// Periodic health check to detect extension reload
let extensionHealthy = true;
setInterval(() => {
  chrome.runtime.sendMessage(
    { action: 'diagnosticTest' },
    (response) => {
      if (chrome.runtime.lastError) {
        if (!extensionHealthy) {
          console.log('🔄 Extension is back online, reloading page...');
          window.location.reload();
        }
        extensionHealthy = false;
      } else {
        extensionHealthy = true;
      }
    }
  );
}, 5000);


// Listen for registration requests from popup
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data.type === 'EXTENSION_REGISTER') {
    console.log('📨 Received extension registration token');
    chrome.runtime.sendMessage({
      action: 'registerWithWebsite',
      userToken: event.data.userToken
    });
  }

  if (event.data.type === 'EXTENSION_LOGIN_SUCCESS') {
    console.log('✅ Extension login successful, syncing with website');
    showNotification('Extension linked to your account!');
  }
});

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
  console.log('📄 Preparing warning page');

  const decisionJson = encodeURIComponent(JSON.stringify(decision));
  const warningUrl = chrome.runtime.getURL(
    `ui/warning.html?decision=${decisionJson}`
  );

  console.log('🔗 Navigating to warning page');
  window.location.href = warningUrl;
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
    max-width: 380px;
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
  proceedBtn.textContent = 'Proceed';
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

// Listen for analysis complete messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analysisComplete') {
    console.log('📊 Analysis complete:', request.verdict, 'Score:', request.score);
    analysisResult = request.decision;
    
    if (request.verdict === 'BLOCK') {
      // Page will be replaced with warning, no need to show overlay
      console.log('🚫 Page will be replaced with warning');
    } else if (request.verdict === 'WARN') {
      showSecurityWarningOverlay(request.score, request.decision);
    } else {
      // Safe - just show brief badge
      showSecurityBadge('✅ Safe', '#4CAF50', request.score);
    }
    
    sendResponse({ status: 'received' });
  }
  
  if (request.action === 'showDownloadBlocked') {
    showDownloadBlockedNotification(request.filename, request.reason);
    sendResponse({ status: 'received' });
  }
});

// Show security warning overlay
function showSecurityWarningOverlay(score, decision) {
  const overlay = document.createElement('div');
  overlay.id = 'guardianlink-warning-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255, 152, 0, 0.15);
    border: 3px solid #FF9800;
    z-index: 999998;
    pointer-events: none;
  `;
  
  const badge = document.createElement('div');
  badge.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border: 3px solid #FF9800;
    border-radius: 10px;
    padding: 15px 20px;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    font-weight: 600;
    font-size: 14px;
    color: #FF9800;
  `;
  badge.innerHTML = `⚠️ Warning<br><span style="font-size: 12px; color: #666; margin-top: 5px; display: block;">Score: ${score}%</span>`;
  
  document.body.appendChild(overlay);
  document.body.appendChild(badge);
  
  console.log('⚠️ Security warning overlay shown for suspicious site');
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    overlay.remove();
    badge.remove();
  }, 10000);
}

function showSecurityBadge(status, color, score) {
  const badge = document.createElement('div');
  badge.id = 'guardianlink-security-badge';
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
  
  console.log('✅ Security badge shown:', status);
  
  // Auto-remove after 8 seconds
  setTimeout(() => badge.remove(), 8000);
}

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
  console.log('🚫 Download blocked notification shown:', filename);
  
  setTimeout(() => notification.remove(), 5000);
}
