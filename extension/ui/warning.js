/**
 * Warning Page Script (Interstitial)
 * Displays security warnings to users and handles user interaction
 * Data passed via chrome.storage.session from background.js
 */

// === DEBUG MODE ===
const DEBUG = true; // Set to false in production
function debugLog(...args) {
  if (DEBUG) console.log('[GuardianLink Warning]', ...args);
}

// Get tabId from URL parameters
const params = new URLSearchParams(window.location.search);
const urlFromParams = params.get('url');
const verdictFromParams = params.get('verdict');
const tabIdFromParams = parseInt(params.get('tabId')) || 0;

// Ensure DOM is available
function waitForElement(id, timeout = 5000) {
  return new Promise((resolve) => {
    const element = document.getElementById(id);
    if (element) {
      resolve(element);
      return;
    }
    
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      const el = document.getElementById(id);
      if (el) {
        clearInterval(checkInterval);
        resolve(el);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        console.warn(`⚠️ Timeout waiting for element: ${id}`);
        resolve(null);
      }
    }, 100);
  });
}

// Health check - verify background script is running
async function checkBackgroundReady() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'ping' });
    return response && response.status === 'ok';
  } catch (error) {
    console.error('❌ Background not responding:', error);
    return false;
  }
}

// === UTILITY: Debounce function to prevent rapid navigation ===
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// === UTILITY: Timeout wrapper for async operations ===
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timeout')), ms)
    )
  ]);
}

// Get decision data from storage
async function getDecisionData() {
  try {
    console.log('🔍 Attempting to retrieve decision data...');
    
    // First: Try session storage (preferred, used by content.js)
    const sessionResult = await chrome.storage.session.get(['guardianlink_warning_decision']);
    if (sessionResult.guardianlink_warning_decision) {
      console.log('✅ Found decision in session storage');
      return sessionResult.guardianlink_warning_decision;
    }
    
    // Second: Check URL parameters as fallback
    if (urlFromParams) {
      console.log('🔍 Looking for decision via parameters - URL:', urlFromParams, 'Verdict:', verdictFromParams);
      
      // Create a basic decision from params
      try {
        const basicDecision = {
          url: decodeURIComponent(urlFromParams),
          verdict: verdictFromParams || 'WARN',
          score: 60, // Default score
          riskLevel: verdictFromParams === 'BLOCK' ? 'CRITICAL' : 'MEDIUM',
          reasoning: 'Security threat detected',
          timestamp: new Date().toISOString(),
          details: {
            domain: new URL(decodeURIComponent(urlFromParams)).hostname,
            risks: ['Suspicious domain', 'Potential security risk'],
            phaseBreakdown: {}
          }
        };
        return basicDecision;
      } catch (e) {
        console.error('Error creating decision from params:', e);
      }
    }
    
  } catch (error) {
    console.error('Error retrieving decision from storage:', error);
  }
  
  console.log('⚠️ No decision found');
  return null;
}

// Get original URL from session storage
async function getOriginalUrl() {
  try {
    // Manifest V3 uses .get() method, not .getItem()
    const result = await chrome.storage.session.get(['guardianlink_original_url']);
    return result.guardianlink_original_url || null;
  } catch (error) {
    console.error('Failed to get original URL from session:', error);
    
    // Fallback 1: Check URL parameters
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get('url');
    if (urlParam) return decodeURIComponent(urlParam);
    
    // Fallback 2: Use decision data URL
    const decision = await getDecisionData();
    return decision?.url || null;
  }
}

// Initialize warning page
async function initWarning() {
  // Check if background is ready first
  const bgReady = await checkBackgroundReady();
  if (!bgReady) {
    console.error('⚠️ Background script not ready, retrying...');
    setTimeout(initWarning, 1000);
    return;
  }
  
  const decision = await getDecisionData();
  
  if (!decision) {
    document.querySelector('.content').innerHTML = 
      '<p style="padding: 20px; color: #666;">No security decision data found. Please try again.</p>';
    return;
  }

  displayWarning(decision);
  await setupEventListeners(decision);
}

// Setup event listeners (CSP compliant)
async function setupEventListeners(decision) {
  const goBackBtn = document.getElementById('goBackBtn');
  const proceedBtn = document.getElementById('proceedBtn');
  const originalUrl = await getOriginalUrl();

  if (goBackBtn) {
    goBackBtn.addEventListener('click', async () => {
      debugLog('🔙 User clicked Go Back');
      
      try {
        // Get current tab
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (currentTab) {
          // Check if we came from a scanner page or directly
          const referrer = document.referrer;
          debugLog('Referrer:', referrer);
          
          if (referrer && referrer.includes('scanner.html')) {
            // Go back to scanner
            window.history.back();
          } else {
            // Navigate to a safe page
            await chrome.tabs.update(currentTab.id, { 
              url: 'chrome://newtab/' 
            });
          }
        } else {
          // Fallback: navigate to new tab
          chrome.tabs.create({ url: 'chrome://newtab/' });
        }
      } catch (error) {
        console.error('❌ Error in go back:', error);
        // Fallback: navigate to new tab
        chrome.tabs.create({ url: 'chrome://newtab/' });
      }
    });
  }

  if (proceedBtn) {
    proceedBtn.addEventListener('click', async () => {
      debugLog('⚠️ User clicked Proceed Anyway');
      
      if (!originalUrl) {
        console.error('❌ No original URL available');
        return;
      }
      
      // Use tabId from URL parameters (already extracted at top)
      const tabId = tabIdFromParams;
      
      // Disable button to prevent double-click
      proceedBtn.disabled = true;
      proceedBtn.textContent = 'Proceeding...';
      
      try {
        // Send message to background
        const response = await chrome.runtime.sendMessage({
          action: 'INTERSTITIAL_PROCEED',
          url: originalUrl,
          tabId: tabId
        });
        
        if (response && response.status === 'bypassed') {
          debugLog('✅ Bypass successful, navigating...');
          // Background will handle navigation
        } else {
          // Fallback: Navigate directly
          window.location.href = originalUrl;
        }
      } catch (error) {
        console.error('❌ Error during proceed:', error);
        // Fallback: Navigate directly
        window.location.href = originalUrl;
      }
    });
  }
}

// Display warning based on decision
async function displayWarning(decision) {
  // Get warning page elements with null safety
  const riskIndicator = document.getElementById('riskIndicator');
  const riskLevelText = document.getElementById('riskLevel');
  const riskDescription = document.getElementById('riskDescription');
  const contentDiv = document.querySelector('.content');

  // Add comprehensive null checks for DOM elements
  if (!riskIndicator || !riskLevelText || !riskDescription || !contentDiv) {
    console.error('❌ Could not find warning page elements');
    if (contentDiv) {
      contentDiv.innerHTML = '<p style="padding: 20px; color: #666;">Error: Page elements not found. Please refresh.</p>';
    }
    return;
  }
  
  const {
    url,
    verdict,
    riskLevel,
    score = 0,
    reasoning = 'Security threat detected',
    factors = [],
    canBypass = true
  } = decision;

  // Check if URL is localhost (for development)
  const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('[::1]');
  debugLog(`🏠 Is localhost: ${isLocalhost}`);

  // Determine risk level from verdict if not provided
  const actualRiskLevel = riskLevel || (verdict === 'BLOCK' ? 'CRITICAL' : 'MEDIUM');
  riskIndicator.className = `risk-indicator ${actualRiskLevel.toLowerCase()}`;
  
  const icons = {
    'CRITICAL': '🚨',
    'HIGH': '⚠️',
    'MEDIUM': '⚠️',
    'LOW': 'ℹ️',
    'SAFE': '✅'
  };

  const riskLabels = {
    'CRITICAL': 'CRITICAL THREAT BLOCKED',
    'HIGH': 'HIGH RISK DETECTED',
    'MEDIUM': 'MEDIUM RISK - CAUTION',
    'LOW': 'LOW RISK - PROCEED WITH CARE',
    'SAFE': 'URL APPEARS SAFE'
  };

  document.querySelector('.risk-icon').textContent = icons[actualRiskLevel] || '⚠️';
  riskLevelText.textContent = riskLabels[actualRiskLevel];
  riskDescription.textContent = reasoning || 'Your security is important to us';

  // Update details with null checks
  const urlDetail = document.getElementById('urlDetail');
  const domainDetail = document.getElementById('domainDetail');
  const scoreDetail = document.getElementById('scoreDetail');
  
  if (urlDetail) urlDetail.textContent = url;
  if (domainDetail) {
    try {
      const urlObj = new URL(url);
      domainDetail.textContent = urlObj.hostname;
    } catch {
      domainDetail.textContent = url.split('/')[2] || url;
    }
  }
  if (scoreDetail) scoreDetail.textContent = `${score.toFixed(1)} / 100`;

  // Show score bar
  const scoreBarContainer = document.getElementById('scoreBarContainer');
  const scoreFill = document.getElementById('scoreFill');
  scoreBarContainer.classList.remove('hidden');
  
  const scorePercent = Math.min(score, 100);
  scoreFill.style.width = scorePercent + '%';
  
  // Color based on score
  if (scorePercent >= 75) {
    scoreFill.style.background = '#d32f2f'; // Red - Critical
  } else if (scorePercent >= 50) {
    scoreFill.style.background = '#f57c00'; // Orange - High
  } else if (scorePercent >= 25) {
    scoreFill.style.background = '#fbc02d'; // Yellow - Medium
  } else {
    scoreFill.style.background = '#388e3c'; // Green - Low
  }

  // Show risks if available
  if (factors && factors.length > 0) {
    const risksContainer = document.getElementById('risksContainer');
    const risksList = document.getElementById('risksList');
    
    risksList.innerHTML = factors.map(factor => 
      `<li><strong>${factor.name || 'Threat'}:</strong> +${factor.score || 0} points (${factor.severity || 'INFO'})</li>`
    ).join('');
    
    risksContainer.classList.remove('hidden');
  }

  // Show warning message for WARN verdict
  if (verdict === 'WARN' || actualRiskLevel === 'MEDIUM') {
    document.getElementById('warningMessage').classList.remove('hidden');
    document.getElementById('proceedBtn').classList.remove('hidden');
  }

  // Show critical message
  if (verdict === 'BLOCK' || actualRiskLevel === 'CRITICAL') {
    document.getElementById('criticalMessage').classList.remove('hidden');
    
    // For localhost/development, still allow proceeding at own risk
    if (isLocalhost) {
      document.getElementById('proceedBtn').classList.remove('hidden');
      // Change button text
      const proceedBtn = document.getElementById('proceedBtn');
      proceedBtn.textContent = '⚡ Proceed (Development Only)';
      proceedBtn.style.background = '#ff9800'; // Orange for development
    } else {
      document.getElementById('proceedBtn').classList.add('hidden');
    }
  } else if (canBypass !== false) {
    document.getElementById('proceedBtn').classList.remove('hidden');
  }

  // Update timestamp with null check
  const timestamp = document.getElementById('timestamp');
  if (timestamp) {
    timestamp.textContent = new Date().toLocaleString();
  }

  // Log decision
  logDecision(decision);
}

// Log decision to background script
function logDecision(decision) {
  chrome.runtime.sendMessage({
    action: 'logDecision',
    decision: decision
  }, (response) => {
    debugLog('✅ Decision logged');
  });
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWarning);
} else {
  initWarning();
}

// Message listener for background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getDecision') {
    getDecisionData().then(decision => {
      sendResponse({ decision });
    });
    return true;
  }
});

debugLog('✅ Warning page script loaded');
