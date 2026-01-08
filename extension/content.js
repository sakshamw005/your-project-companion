/**
 * Enhanced Content Script - GuardianLink v2.0
 * Handles message-based freezing and overlay display
 */

console.log('🛡️ GuardianLink v2.0 Content Script LOADED');

let pageIsFrozen = false;

// ==================== MESSAGE LISTENER ====================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === 'FREEZE') {
      console.log('🔒 FREEZE message received');
      showSecurityCheckOverlay(request.url);
      pageIsFrozen = true;
      sendResponse({ status: 'frozen' });
    } 
    else if (request.action === 'UNFREEZE') {
      console.log('✅ UNFREEZE message received, score:', request.score);
      removeSecurityCheckOverlay();
      showSafetyBadge('✅ Safe', '#4CAF50', request.score);
      pageIsFrozen = false;
      sendResponse({ status: 'unfrozen' });
    }
    else if (request.action === 'SHOW_WARNING') {
      console.log('⚠️ SHOW_WARNING message received, score:', request.score);
      removeSecurityCheckOverlay();
      showWarningOverlay(request.score);
      sendResponse({ status: 'warning_shown' });
    }
    else if (request.action === 'SHOW_BLOCK_PAGE') {
      console.log('🚫 SHOW_BLOCK_PAGE message received');
      showBlockedPage(request.url, request.score);
      sendResponse({ status: 'blocked_shown' });
    }
    else if (request.action === 'showDownloadBlocked') {
      showDownloadBlockedNotification(request.filename, request.reason);
      sendResponse({ status: 'received' });
    }
    else if (request.action === 'PROCEED_ANYWAY') {
      console.log('⚠️ User clicked Proceed Anyway on warning overlay');
      removeSecurityCheckOverlay();
      pageIsFrozen = false;
      sendResponse({ status: 'proceeding' });
    }
  } catch (error) {
    console.error('❌ Error handling message:', error);
    sendResponse({ status: 'error', error: error.message });
  }
});

// ==================== SECURITY CHECK OVERLAY ====================
function showSecurityCheckOverlay(url) {
  removeSecurityCheckOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'guardianlink-security-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Spinner
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 70px;
    height: 70px;
    border: 5px solid rgba(255, 255, 255, 0.2);
    border-top: 5px solid #4CAF50;
    border-radius: 50%;
    animation: guardianlink-spin 1s linear infinite;
    margin-bottom: 30px;
  `;

  // Title
  const title = document.createElement('div');
  title.style.cssText = `
    color: white;
    font-size: 24px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 10px;
  `;
  title.textContent = '🔒 GuardianLink Security Check';

  // Subtitle
  const subtitle = document.createElement('div');
  subtitle.style.cssText = `
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
    text-align: center;
    margin-bottom: 20px;
  `;
  subtitle.textContent = 'Analyzing website security...';

  // Domain
  const domain = document.createElement('div');
  domain.style.cssText = `
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    text-align: center;
    font-family: monospace;
    word-break: break-all;
    max-width: 80%;
  `;
  try {
    domain.textContent = new URL(url).hostname;
  } catch {
    domain.textContent = url.substring(0, 60);
  }

  overlay.appendChild(spinner);
  overlay.appendChild(title);
  overlay.appendChild(subtitle);
  overlay.appendChild(domain);
  document.documentElement.appendChild(overlay);

  // Animation
  if (!document.querySelector('style[data-guardianlink]')) {
    const style = document.createElement('style');
    style.setAttribute('data-guardianlink', 'true');
    style.textContent = `
      @keyframes guardianlink-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.documentElement.appendChild(style);
  }

  console.log('🔒 Security check overlay shown');
}

function removeSecurityCheckOverlay() {
  const overlay = document.getElementById('guardianlink-security-overlay');
  if (overlay) overlay.remove();
}

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
    
    if (request.verdict === 'BLOCK') {
      console.log('🚫 Page will be replaced with warning');
    } else if (request.verdict === 'WARN') {
      console.log('⚠️ Keeping page frozen, showing warning with proceed button');
      // Background script will handle this via injected script
    } else {
      console.log('✅ Safe site, unfrozen');
      // Background script will handle this via injected script
    }
    
    sendResponse({ status: 'received' });
  }
  
  if (request.action === 'showDownloadBlocked') {
    showDownloadBlockedNotification(request.filename, request.reason);
    sendResponse({ status: 'received' });
  }
});

// Show security warning overlay
// (Handled by background.js injected script now)

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
