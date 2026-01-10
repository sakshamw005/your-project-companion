/**
 * Warning Page Script (Interstitial)
 * Displays security warnings to users and handles user interaction
 * Data passed via chrome.storage.session from background.js
 */

// === DEBUG MODE ===
const DEBUG = true; // Set to true for development debugging
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
    console.error('[GuardianLink] Background check failed:', error);
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
    debugLog('Attempting to retrieve decision data...');
    
    // First: Try session storage (preferred, used by content.js)
    const sessionResult = await chrome.storage.session.get(['guardianlink_warning_decision']);
    if (sessionResult.guardianlink_warning_decision) {
      debugLog('✅ Found decision in session storage:', sessionResult.guardianlink_warning_decision);
      return sessionResult.guardianlink_warning_decision;
    }
    
    debugLog('No decision in session storage, checking URL parameters');
    
    // Second: Check URL parameters as fallback
    if (urlFromParams) {
      debugLog('URL from params:', urlFromParams, 'Verdict:', verdictFromParams);
      
      try {
        const decodedUrl = decodeURIComponent(urlFromParams);
        const basicDecision = {
          url: decodedUrl,
          verdict: verdictFromParams || 'WARN',
          score: verdictFromParams === 'BLOCK' ? 85 : 60,
          riskLevel: verdictFromParams === 'BLOCK' ? 'CRITICAL' : 'MEDIUM',
          reasoning: verdictFromParams === 'BLOCK' 
            ? 'This site has been blocked due to critical security threats'
            : 'This site shows signs of suspicious activity',
          timestamp: new Date().toISOString(),
          details: {
            domain: new URL(decodedUrl).hostname,
            risks: verdictFromParams === 'BLOCK' 
              ? ['Critical security threat detected', 'Site contains malware']
              : ['Suspicious domain', 'Potential phishing risk'],
            phaseBreakdown: {}
          }
        };
        debugLog('✅ Created decision from URL params:', basicDecision);
        return basicDecision;
      } catch (e) {
        console.error('[GuardianLink] Error creating decision from params:', e);
      }
    }
    
    debugLog('No URL parameters found, using generic default');
    
    // Return a generic default
    return {
      url: 'Unknown website',
      verdict: 'WARN',
      score: 50,
      riskLevel: 'MEDIUM',
      reasoning: 'Security analysis in progress',
      timestamp: new Date().toISOString(),
      details: {
        domain: 'Unknown',
        risks: ['Unable to retrieve security details'],
        phaseBreakdown: {}
      }
    };
    
  } catch (error) {
    console.error('[GuardianLink] Error retrieving decision:', error);
    
    // Return safe default on error
    return {
      url: 'Unknown website',
      verdict: 'WARN',
      score: 50,
      riskLevel: 'MEDIUM',
      reasoning: 'Error during security analysis',
      timestamp: new Date().toISOString(),
      details: {
        domain: 'Unknown',
        risks: ['Error retrieving security information'],
        phaseBreakdown: {}
      }
    };
  }
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

// Store decision globally for use in event listeners
let globalDecision = null;
let globalOriginalUrl = null;

// Initialize warning page
async function initWarning() {
  debugLog('Initializing warning page...');
  
  // ALWAYS set up event listeners, even if data loading fails
  setupEventListeners();
  
  try {
    const bgReady = await checkBackgroundReady();
    if (!bgReady) {
      console.warn('[GuardianLink] Background not ready immediately, will retry');
      setTimeout(initWarning, 1000);
      return;
    }
    
    debugLog('Fetching decision data...');
    const decision = await getDecisionData();
    
    if (!decision) {
      console.error('[GuardianLink] No decision data received');
      return;
    }

    debugLog('Decision data retrieved:', decision);
    globalDecision = decision;
    globalOriginalUrl = await getOriginalUrl();
    displayWarning(decision);
  } catch (error) {
    console.error('[GuardianLink] Error during initialization:', error);
  }
}

// Setup event listeners (CSP compliant)
function setupEventListeners() {
  debugLog('Setting up event listeners...');
  
  const goBackBtn = document.getElementById('goBackBtn');
  const proceedBtn = document.getElementById('proceedBtn');

  debugLog('Go Back button element:', goBackBtn);
  debugLog('Proceed button element:', proceedBtn);

  if (goBackBtn) {
    goBackBtn.addEventListener('click', handleGoBack);
    debugLog('✅ Go Back listener attached');
  } else {
    console.error('❌ Go Back button not found');
  }

  if (proceedBtn) {
    proceedBtn.addEventListener('click', handleProceed);
    debugLog('✅ Proceed listener attached');
  }
}

// Handle Go Back button click
function handleGoBack(e) {
  if (e) e.preventDefault();
  debugLog('🔙 Go Back clicked');
  
  try {
    debugLog('Attempting to go back in history (2 steps to skip scanner)...');
    // Go back 2 steps: warning page -> scanner page -> original page before extension
    // This avoids re-triggering the scan on the suspicious URL
    window.history.go(-2);
    
    // Fallback: If still on the page after 800ms, open new tab
    setTimeout(() => {
      const stillOnWarningPage = window.location.href.includes('warning.html');
      if (stillOnWarningPage) {
        debugLog('Still on warning page after history.go(-2), opening new tab...');
        try {
          chrome.tabs.create({ url: 'chrome://newtab/' });
        } catch (e2) {
          console.error('Cannot create tab:', e2);
        }
      }
    }, 800);
  } catch (error) {
    console.error('[GuardianLink] Go back error:', error);
    debugLog('History failed, opening new tab instead');
    try {
      chrome.tabs.create({ url: 'chrome://newtab/' });
    } catch (e) {
      console.error('[GuardianLink] Cannot create tab:', e);
    }
  }
}

// Handle Proceed Anyway button click
async function handleProceed(e) {
  if (e) e.preventDefault();
  debugLog('✅ Proceed clicked');
  
  if (!globalOriginalUrl) {
    console.error('[GuardianLink] No original URL available');
    alert('Cannot proceed: Original URL not available');
    return;
  }
  
  const proceedBtn = document.getElementById('proceedBtn');
  if (proceedBtn) {
    proceedBtn.disabled = true;
    proceedBtn.textContent = 'Proceeding...';
  }
  
  try {
    const tabId = tabIdFromParams || 0;
    debugLog('Sending INTERSTITIAL_PROCEED message for URL:', globalOriginalUrl);
    
    const response = await chrome.runtime.sendMessage({
      action: 'INTERSTITIAL_PROCEED',
      url: globalOriginalUrl,
      tabId: tabId
    });
    
    debugLog('Proceed response:', response);
    
    if (response && response.status === 'bypassed') {
      debugLog('Bypass successful');
    } else {
      debugLog('Navigating to original URL');
      window.location.href = globalOriginalUrl;
    }
  } catch (error) {
    console.error('[GuardianLink] Proceed error:', error);
    debugLog('Falling back to direct navigation');
    window.location.href = globalOriginalUrl;
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
  
  if (urlDetail) {
    urlDetail.textContent = url;
    debugLog('Set URL detail:', url);
  }
  
  if (domainDetail) {
    try {
      const urlObj = new URL(url);
      domainDetail.textContent = urlObj.hostname;
      debugLog('Set domain detail:', urlObj.hostname);
    } catch {
      domainDetail.textContent = url.split('/')[2] || url;
      debugLog('Set domain detail (fallback):', domainDetail.textContent);
    }
  }

  // Show score bar
  const scoreBarContainer = document.getElementById('scoreBarContainer');
  const scoreFill = document.getElementById('scoreFill');
  const scoreValue = document.getElementById('scoreValue');
  
  if (scoreBarContainer) {
    scoreBarContainer.classList.remove('hidden');
  }
  
  if (scoreFill && scoreValue) {
    const scorePercent = Math.min(score, 100);
    scoreFill.style.width = scorePercent + '%';
    scoreValue.textContent = scorePercent.toFixed(0) + '%';
    
    // Color based on score
    if (scorePercent >= 75) {
      scoreFill.style.background = 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)'; // Red - Critical
    } else if (scorePercent >= 50) {
      scoreFill.style.background = 'linear-gradient(90deg, #f97316 0%, #ea580c 100%)'; // Orange - High
    } else if (scorePercent >= 25) {
      scoreFill.style.background = 'linear-gradient(90deg, #eab308 0%, #ca8a04 100%)'; // Yellow - Medium
    } else {
      scoreFill.style.background = 'linear-gradient(90deg, #10b981 0%, #059669 100%)'; // Green - Low
    }
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
  const warningMsg = document.getElementById('warningMessage');
  if (warningMsg) {
    if (verdict === 'WARN' || actualRiskLevel === 'MEDIUM') {
      warningMsg.textContent = 'This website shows signs of suspicious activity. Proceed only if you trust the source.';
      warningMsg.classList.remove('hidden');
      document.getElementById('proceedBtn').classList.remove('hidden');
    }
  }

  // Update critical message
  const criticalMsg = document.getElementById('criticalMessage');
  if (criticalMsg) {
    if (verdict === 'BLOCK' || actualRiskLevel === 'CRITICAL') {
      criticalMsg.classList.remove('hidden');
      
      // For localhost/development, still allow proceeding at own risk
      if (isLocalhost) {
        document.getElementById('proceedBtn').classList.remove('hidden');
        const proceedBtn = document.getElementById('proceedBtn');
        proceedBtn.textContent = 'Proceed (Dev)';
      } else {
        document.getElementById('proceedBtn').classList.add('hidden');
      }
    } else if (canBypass !== false) {
      document.getElementById('proceedBtn').classList.remove('hidden');
    }
  }

  debugLog('Warning display complete');
  
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
