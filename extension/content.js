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
    console.log('📍 Page NOT bypassed, registering with background');
    
    // Register with background so it knows the page loaded
    try {
      await browser.runtime.sendMessage({ action: 'contentScriptReady' });
      console.log('✅ Registered with background');
    } catch (error) {
      console.log('⚠️ Could not register with background:', error.message);
    }
    
    // NOTE: Do NOT show overlay - background.js redirects to scanner before content script runs
    // If you see this, it means the redirect didn't work
    
  } else {
    console.log('✅ Page was bypassed, no scanning needed');
    
    // Still register with background
    try {
      await browser.runtime.sendMessage({ action: 'contentScriptReady' });
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
    const response = await browser.runtime.sendMessage({ 
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

// ========== LOADING OVERLAY (DISABLED - redirect handles page blocking) ==========
// The background.js script redirects to scanner.html before this content script runs
// So no overlay is needed. If you see a loading screen, the redirect failed.

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
  
  // Build content using DOM construction
  const container = document.createElement('div');
  container.style.textAlign = 'center';
  container.style.maxWidth = '500px';
  container.style.padding = '30px';
  
  const spinnerDiv = document.createElement('div');
  spinnerDiv.style.width = '80px';
  spinnerDiv.style.height = '80px';
  spinnerDiv.style.margin = '0 auto 30px';
  
  const spinner = document.createElement('div');
  spinner.id = 'guardianlink-spinner';
  spinner.style.width = '100%';
  spinner.style.height = '100%';
  spinner.style.border = '6px solid rgba(255,255,255,0.2)';
  spinner.style.borderTop = '6px solid #4CAF50';
  spinner.style.borderRadius = '50%';
  spinner.style.animation = 'guardianlink-spin 1.5s linear infinite';
  spinnerDiv.appendChild(spinner);
  container.appendChild(spinnerDiv);
  
  const title = document.createElement('h1');
  title.style.fontSize = '32px';
  title.style.fontWeight = '700';
  title.style.marginBottom = '15px';
  title.style.color = 'white';
  title.textContent = '🛡️ GuardianLink Security Check';
  container.appendChild(title);
  
  const subtitle = document.createElement('div');
  subtitle.style.fontSize = '18px';
  subtitle.style.opacity = '0.9';
  subtitle.style.marginBottom = '25px';
  subtitle.textContent = 'Analyzing website security before loading...';
  container.appendChild(subtitle);
  
  const urlBox = document.createElement('div');
  urlBox.style.background = 'rgba(255,255,255,0.1)';
  urlBox.style.borderRadius = '10px';
  urlBox.style.padding = '15px';
  urlBox.style.marginBottom = '25px';
  urlBox.style.textAlign = 'left';
  
  const urlLabel = document.createElement('div');
  urlLabel.style.fontSize = '14px';
  urlLabel.style.opacity = '0.8';
  urlLabel.style.marginBottom = '5px';
  urlLabel.textContent = 'Scanning:';
  urlBox.appendChild(urlLabel);
  
  const urlText = document.createElement('div');
  urlText.id = 'guardianlink-scan-url';
  urlText.style.fontFamily = 'monospace';
  urlText.style.fontSize = '12px';
  urlText.style.wordBreak = 'break-all';
  urlText.style.opacity = '0.9';
  urlText.textContent = window.location.href.substring(0, 80) + (window.location.href.length > 80 ? '...' : '');
  urlBox.appendChild(urlText);
  container.appendChild(urlBox);
  
  const progressDiv = document.createElement('div');
  progressDiv.style.display = 'flex';
  progressDiv.style.alignItems = 'center';
  progressDiv.style.justifyContent = 'center';
  progressDiv.style.gap = '10px';
  
  const progressContainer = document.createElement('div');
  progressContainer.style.width = '300px';
  progressContainer.style.height = '6px';
  progressContainer.style.background = 'rgba(255,255,255,0.2)';
  progressContainer.style.borderRadius = '3px';
  progressContainer.style.overflow = 'hidden';
  
  const progressBar = document.createElement('div');
  progressBar.id = 'guardianlink-progress-bar';
  progressBar.style.width = '30%';
  progressBar.style.height = '100%';
  progressBar.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
  progressBar.style.transition = 'width 0.3s';
  progressContainer.appendChild(progressBar);
  progressDiv.appendChild(progressContainer);
  
  const progressText = document.createElement('div');
  progressText.style.fontSize = '12px';
  progressText.style.opacity = '0.7';
  progressText.textContent = 'Scanning...';
  progressDiv.appendChild(progressText);
  container.appendChild(progressDiv);
  
  const footer = document.createElement('div');
  footer.style.marginTop = '30px';
  footer.style.fontSize = '12px';
  footer.style.opacity = '0.6';
  footer.textContent = '🔒 All page content is blocked until security check completes';
  container.appendChild(footer);
  
  overlay.appendChild(container);
  
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
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
