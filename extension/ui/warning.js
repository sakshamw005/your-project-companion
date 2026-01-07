/**
 * Warning Page Script
 * Displays security warnings to users and handles user interaction
 */

// Check if backend is connected
async function checkBackendConnection() {
  try {
    const response = await fetch('http://localhost:3001/api/health', {
      timeout: 3000
    });
    const isConnected = response.ok;
    console.log(isConnected ? '✅ Backend connected' : '❌ Backend offline');
    return isConnected;
  } catch (error) {
    console.log('❌ Backend connection failed:', error.message);
    return false;
  }
}

// Get decision data from URL parameters or localStorage
function getDecisionData() {
  const params = new URLSearchParams(window.location.search);
  const decisionJson = params.get('decision');
  
  if (decisionJson) {
    try {
      return JSON.parse(decodeURIComponent(decisionJson));
    } catch (e) {
      console.error('Failed to parse decision:', e);
    }
  }

  // Try sessionStorage
  const stored = sessionStorage.getItem('guardianlink_decision');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse stored decision:', e);
    }
  }

  return null;
}

// Initialize warning page
function initWarning() {
  const decision = getDecisionData();
  
  if (!decision) {
    document.querySelector('.content').innerHTML = 
      '<p style="padding: 20px; color: #666;">No security decision data found. Please try again.</p>';
    return;
  }

  // Check backend connection
  checkBackendConnection().then(isConnected => {
    console.log('🔗 Backend status:', isConnected ? 'CONNECTED' : 'OFFLINE');
  });

  displayWarning(decision);
  setupEventListeners(decision);
}

// Setup event listeners (CSP compliant)
function setupEventListeners(decision) {
  const goBackBtn = document.getElementById('goBackBtn');
  const proceedBtn = document.getElementById('proceedBtn');

  if (goBackBtn) {
    goBackBtn.addEventListener('click', () => {
      console.log('🔙 User clicked Go Back');
      window.history.back();
    });
  }

  if (proceedBtn) {
    proceedBtn.addEventListener('click', () => {
      if (decision && decision.url) {
        console.log('⚠️ User proceeded anyway to:', decision.url);
        // Log the bypass
        chrome.runtime.sendMessage({
          action: 'logBypass',
          url: decision.url
        }, (response) => {
          console.log('Bypass logged');
        });
        // Navigate to URL
        window.location.href = decision.url;
      }
    });
  }
}

// Display warning based on decision
function displayWarning(decision) {
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
    console.log('Decision logged');
  });
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', initWarning);
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getDecision') {
    sendResponse({ decision: getDecisionData() });
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', initWarning);

// Fallback initialization if DOMContentLoaded doesn't fire
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWarning);
} else {
  initWarning();
}
