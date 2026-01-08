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
    const params = new URLSearchParams(window.location.search);
    const targetUrl = params.get('url');
    const verdictParam = params.get('verdict');
    
    if (!targetUrl) {
      console.error('❌ No URL parameter found in warning page');
      return null;
    }
    
    console.log('🔍 Looking for decision via parameters - URL:', targetUrl, 'Verdict:', verdictParam);
    
    // For both BLOCK and WARN verdicts: check URL-specific local storage
    const storageKey = `guardianlink_decision_${encodeURIComponent(targetUrl)}`;
    const result = await chrome.storage.local.get([storageKey, 'guardianlink_current_decision']);
    
    if (result[storageKey]) {
      console.log('✅ Found URL-specific decision in local storage');
      return result[storageKey];
    }
    
    if (result.guardianlink_current_decision && result.guardianlink_current_decision.url === targetUrl) {
      console.log('✅ Found current decision in local storage');
      return result.guardianlink_current_decision;
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
    goBackBtn.addEventListener('click', () => {
      debugLog('🔙 User clicked Go Back');
      window.history.back();
    });
  }

  if (proceedBtn) {
    // === ENHANCED: Add error handling with background ping and fallback ===
    const handleProceedClick = debounce(async () => {
      debugLog('⚠️ User clicked Proceed Anyway');
      
      if (!originalUrl) {
        console.error('❌ No original URL available');
        proceedBtn.disabled = false;
        proceedBtn.textContent = 'Proceed Anyway';
        return;
      }
      
      // Disable button to prevent double-click
      proceedBtn.disabled = true;
      proceedBtn.textContent = 'Proceeding...';

      try {
        // === FIX #1: Check if background is available with timeout ===
        debugLog('🔗 Checking background availability...');
        await withTimeout(
          chrome.runtime.sendMessage({ action: 'ping' }),
          3000 // 3 second timeout
        );
        debugLog('✅ Background is available');
        
        // === FIX #2: Add to temporary allowlist in session storage ===
        try {
          // Use correct Manifest V3 API
          const result = await chrome.storage.session.get(['guardianlink_session_allowlist']);
          let allowList = result.guardianlink_session_allowlist || [];
          
          if (!allowList.includes(originalUrl)) {
            allowList.push(originalUrl);
            await chrome.storage.session.set({ 
              guardianlink_session_allowlist: allowList 
            });
            debugLog('✅ Added to session allowlist:', originalUrl);
          }
        } catch (storageError) {
          console.warn('⚠️ Could not update allowlist:', storageError);
          // Continue anyway - allowlist is optional
        }

        // === FIX #3: Send message to background with timeout ===
        debugLog('📤 Sending PROCEED_ANYWAY message...');
        await withTimeout(
          new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'PROCEED_ANYWAY',  // Background expects this action name
              url: originalUrl
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (response?.status === 'bypassed') {
                debugLog('✅ Background confirmed, removing DNR rules');
                resolve(response);
              } else {
                reject(new Error(response?.error || 'Background request failed'));
              }
            });
          }),
          5000 // 5 second timeout for background response
        );
        
        debugLog('✅ Proceeding to URL:', originalUrl);
        window.location.href = originalUrl;
        
      } catch (error) {
        console.error('❌ Error during proceed:', error.message);
        
        // === FALLBACK: Navigate directly if background fails ===
        if (error.message.includes('timeout') || error.message.includes('not available')) {
          debugLog('⚠️ Background unavailable, using fallback direct navigation');
          console.warn('⚠️ GuardianLink background not responding, navigating directly to:', originalUrl);
          
          // Add small delay before navigation to ensure user sees the message
          setTimeout(() => {
            window.location.href = originalUrl;
          }, 500);
        } else {
          // Other error: re-enable button
          proceedBtn.disabled = false;
          proceedBtn.textContent = 'Proceed Anyway';
          
          // Show error to user
          console.error('❌ Failed to proceed:', error.message);
          alert(`⚠️ Error: ${error.message}\n\nPlease try again or go back.`);
        }
      }
    }, 300); // 300ms debounce to prevent rapid clicks
    
    proceedBtn.addEventListener('click', handleProceedClick);
  }
}

// Display warning based on decision
async function displayWarning(decision) {
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

  // Update header and risk indicator
  const riskIndicator = document.getElementById('riskIndicator');
  const riskLevelText = document.getElementById('riskLevel');
  const riskDescription = document.getElementById('riskDescription');

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

  // Update details
  document.getElementById('urlDetail').textContent = url;
  try {
    const urlObj = new URL(url);
    document.getElementById('domainDetail').textContent = urlObj.hostname;
  } catch {
    document.getElementById('domainDetail').textContent = url.split('/')[2] || url;
  }
  document.getElementById('scoreDetail').textContent = `${score.toFixed(1)} / 100`;

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

  // Update timestamp
  document.getElementById('timestamp').textContent = new Date().toLocaleString();

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

// Display warning based on decision
async function displayWarning(decision) {
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
  console.log(`🏠 Is localhost: ${isLocalhost}`);

  // Update header and risk indicator
  const riskIndicator = document.getElementById('riskIndicator');
  const riskLevelText = document.getElementById('riskLevel');
  const riskDescription = document.getElementById('riskDescription');

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

  // Update details
  document.getElementById('urlDetail').textContent = url;
  try {
    const urlObj = new URL(url);
    document.getElementById('domainDetail').textContent = urlObj.hostname;
  } catch {
    document.getElementById('domainDetail').textContent = url.split('/')[2] || url;
  }
  document.getElementById('scoreDetail').textContent = `${score.toFixed(1)} / 100`;

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

  // Update timestamp
  document.getElementById('timestamp').textContent = new Date().toLocaleString();

  // Log decision
  logDecision(decision);
}

// Log decision to background script
function logDecision(decision) {
  chrome.runtime.sendMessage({
    action: 'logDecision',
    decision: decision
  }, (response) => {
    console.log('✅ Decision logged');
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

