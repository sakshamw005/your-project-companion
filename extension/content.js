/**
 * Enhanced Content Script - GuardianLink v2.0
 * Shows loading overlay and coordinates with background
 * FIXED: No direct storage access
 */

console.log('🛡️ GuardianLink Content Script LOADED at:', window.location.href);

let overlayShown = false;

// Check if we're on the warning page or scanner page
const currentUrl = window.location.href;
const isWarningPage = currentUrl.includes('ui/warning.html');
const isScannerPage = currentUrl.includes('ui/scanner.html');

if (isWarningPage || isScannerPage) {
  console.log('⏭️ Skipping content script on extension page');
  // Don't run the rest on our own pages
} else {
  // Initialize on this page
  initializeContentScript();
}

async function initializeContentScript() {
  console.log('🔄 Initializing content script...');
  
  // First check if bypassed BEFORE showing overlay
  const wasBypassed = await checkIfBypassed();
  
  if (!wasBypassed) {
    console.log('📍 Page NOT bypassed, showing loading overlay');
    
    // Register with background AFTER checking bypass
    try {
      await chrome.runtime.sendMessage({ action: 'contentScriptReady' });
      console.log('✅ Registered with background');
    } catch (error) {
      console.log('⚠️ Could not register with background:', error.message);
    }
    
    // Add event listeners to block interactions
    document.addEventListener('keydown', blockAllInteractions, true);
    document.addEventListener('click', blockAllInteractions, true);
    document.addEventListener('contextmenu', blockAllInteractions, true);
    document.addEventListener('mousedown', blockAllInteractions, true);
    
    // Show loading overlay immediately
    showLoadingOverlay();
    
  } else {
    console.log('✅ Page was bypassed, no overlay needed');
    
    // Still register with background but don't show overlay
    try {
      await chrome.runtime.sendMessage({ action: 'contentScriptReady' });
      console.log('✅ Registered with background');
    } catch (error) {
      console.log('⚠️ Could not register with background:', error.message);
    }
  }
  
  // Listen for messages from background
  setupMessageListener();
}

// ========== BYPASS CHECK (MESSAGING ONLY) ==========
async function checkIfBypassed() {
  try {
    const currentUrl = window.location.href;
    
    // First, try a direct check with background
    const response = await chrome.runtime.sendMessage({ 
      action: 'CHECK_BYPASS', 
      url: currentUrl 
    });
    
    if (response && response.isBypassed) {
      console.log('✅ Page bypassed (from background check)');
      return true;
    }
    
    // Second, check if this is a whitelisted domain
    try {
      const urlObj = new URL(currentUrl);
      const hostname = urlObj.hostname.replace('www.', '');
      
      // Common whitelisted domains
      const whitelist = [
        'google.com', 'bing.com', 'youtube.com', 'wikipedia.org',
        'github.com', 'stackoverflow.com', 'microsoft.com', 'apple.com',
        'threatcenter.crdf.fr' // Add this domain
      ];
      
      if (whitelist.includes(hostname)) {
        console.log(`✅ Domain whitelisted: ${hostname}`);
        return true;
      }
    } catch (e) {
      // URL parsing failed
    }
    
    return false;
    
  } catch (error) {
    console.log('⚠️ Bypass check failed:', error.message);
    return false;
  }
}

// ========== LOADING OVERLAY ==========
function showLoadingOverlay() {
  // Prevent multiple overlays
  if (overlayShown) {
    return;
  }
  
  // Remove existing overlay first
  removeLoadingOverlay();
  
  // Check if document.body exists
  if (!document.body) {
    // Wait for body to be available
    document.addEventListener('DOMContentLoaded', () => {
      showLoadingOverlay();
    });
    return;
  }
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'guardianlink-loading-overlay';
  
  // Set styles directly
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.background = 'linear-gradient(135deg, #1a237e 0%, #283593 100%)';
  overlay.style.zIndex = '2147483647';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.color = 'white';
  overlay.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  overlay.style.pointerEvents = 'all';
  
  // Add content
  overlay.innerHTML = `
    <div style="text-align: center; max-width: 500px; padding: 30px;">
      <div style="width: 80px; height: 80px; margin: 0 auto 30px;">
        <div id="guardianlink-spinner" style="width: 100%; height: 100%; border: 6px solid rgba(255,255,255,0.2); border-top: 6px solid #4CAF50; border-radius: 50%; animation: guardianlink-spin 1.5s linear infinite;"></div>
      </div>
      
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 15px; color: white;">
        🛡️ GuardianLink Security Check
      </h1>
      
      <div style="font-size: 18px; opacity: 0.9; margin-bottom: 25px;">
        Analyzing website security before loading...
      </div>
      
      <div style="background: rgba(255,255,255,0.1); border-radius: 10px; padding: 15px; margin-bottom: 25px; text-align: left;">
        <div style="font-size: 14px; opacity: 0.8; margin-bottom: 5px;">Scanning:</div>
        <div id="guardianlink-scan-url" style="font-family: monospace; font-size: 12px; word-break: break-all; opacity: 0.9;">
          ${window.location.href.substring(0, 80)}${window.location.href.length > 80 ? '...' : ''}
        </div>
      </div>
      
      <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
        <div style="width: 300px; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; overflow: hidden;">
          <div id="guardianlink-progress-bar" style="width: 30%; height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A); transition: width 0.3s;"></div>
        </div>
        <div style="font-size: 12px; opacity: 0.7;">Scanning...</div>
      </div>
      
      <div style="margin-top: 30px; font-size: 12px; opacity: 0.6;">
        🔒 All page content is blocked until security check completes
      </div>
    </div>
  `;
  
  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes guardianlink-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  
  // Append to document
  document.head.appendChild(style);
  document.body.appendChild(overlay);
  
  overlayShown = true;
  console.log('✅ Loading overlay displayed');
  
  animateProgressBar();
}

function animateProgressBar() {
  const progressBar = document.getElementById('guardianlink-progress-bar');
  if (!progressBar) return;
  
  let progress = 30;
  const interval = setInterval(() => {
    if (progress < 90) {
      progress += Math.random() * 10;
      progressBar.style.width = Math.min(progress, 90) + '%';
    }
  }, 500);
  
  window.guardianlinkProgressInterval = interval;
}

function removeLoadingOverlay() {
  if (window.guardianlinkProgressInterval) {
    clearInterval(window.guardianlinkProgressInterval);
  }
  
  const overlay = document.getElementById('guardianlink-loading-overlay');
  if (overlay && overlay.parentNode) {
    overlay.remove();
  }
  
  // Remove animation styles
  const styles = document.querySelectorAll('style');
  styles.forEach(style => {
    if (style.textContent.includes('guardianlink-spin')) {
      style.remove();
    }
  });
  
  document.removeEventListener('keydown', blockAllInteractions, true);
  document.removeEventListener('click', blockAllInteractions, true);
  document.removeEventListener('contextmenu', blockAllInteractions, true);
  document.removeEventListener('mousedown', blockAllInteractions, true);
  
  overlayShown = false;
  console.log('✅ Loading overlay removed');
}

function blockAllInteractions(event) {
  if (event.target && event.target.closest('#guardianlink-loading-overlay')) {
    return;
  }
  
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

// ========== MESSAGE LISTENER ==========
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Content script received:', request.action);
    
    switch (request.action) {
      case 'BYPASS':
        console.log('✅ Page bypassed by background script');
        removeLoadingOverlay();
        sendResponse({ success: true });
        break;
        
      case 'UNFREEZE':
        handleUnfreeze(request);
        sendResponse({ status: 'unfrozen' });
        break;
        
      case 'SCAN_UPDATE':
        updateScanProgress(request);
        sendResponse({ status: 'updated' });
        break;
        
      default:
        sendResponse({ status: 'ignored' });
    }
    
    return true;
  });
}

function handleUnfreeze(request) {
  console.log('✅ Received UNFREEZE, removing overlay');
  removeLoadingOverlay();
  
  if (request.needsRefresh) {
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }
}

function updateScanProgress(request) {
  const progressBar = document.getElementById('guardianlink-progress-bar');
  if (progressBar && request.progress) {
    progressBar.style.width = request.progress + '%';
  }
}

// ========== DOM READY HANDLER ==========
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOM fully loaded');
  });
}

console.log('✅ Content script initialization complete');