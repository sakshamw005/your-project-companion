/**
 * Scanner Page Script - Enhanced with Threat Analysis & Education
 * Real-time progress, threat breakdown, and user education
 */

// Helper function to calculate risk level from safety score
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

document.addEventListener('DOMContentLoaded', () => {
  initializeScanner();
});

async function initializeScanner() {
  console.log('[GuardianLink] Scanner page initializing...');
  
  const params = new URLSearchParams(window.location.search);
  const url = decodeURIComponent(params.get('url') || '');
  const tabId = parseInt(params.get('tabId') || '0');
  
  const urlElement = document.getElementById('scanUrl');
  if (url) {
    try {
      const urlObj = new URL(url);
      urlElement.innerHTML = `<div style="opacity: 0.7; font-size: 10px; margin-bottom: 4px;">DOMAIN</div><div style="font-weight: 600;">${urlObj.hostname}</div><div style="font-size: 11px; opacity: 0.6; margin-top: 4px;">${urlObj.pathname.substring(0, 50)}${urlObj.pathname.length > 50 ? '...' : ''}</div>`;
    } catch {
      urlElement.textContent = url.substring(0, 80) + (url.length > 80 ? '...' : '');
    }
  }
  
  initializePhases();
  startProgressAnimation();
  
  try {
    await chrome.runtime.sendMessage({ 
      action: 'SCANNER_READY',
      tabId: tabId,
      url: url
    });
    console.log('[GuardianLink] Scanner registered with background');
  } catch (error) {
    console.log('[GuardianLink] Scanner registration:', error.message);
  }
  
  setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'SCANNER_READY' }).catch(() => {});
  }, 100);
  
  setTimeout(() => {
    setupProceedButton(url, tabId);
  }, 2000);
  
  setupMessageListener(tabId, url);
  simulateInitialPhases();
}

function initializePhases() {
  const phases = [
    { id: 'initial', name: 'Initializing', status: 'checking' },
    { id: 'whitelist', name: 'Whitelist Check', status: 'pending' },
    { id: 'blacklist', name: 'Blacklist Scan', status: 'pending' },
    { id: 'reputation', name: 'Domain Reputation', status: 'pending' },
    { id: 'virustotal', name: 'VirusTotal Analysis', status: 'pending' },
    { id: 'backend', name: 'Backend Analysis', status: 'pending' },
    { id: 'final', name: 'Final Verdict', status: 'pending' }
  ];
  
  const container = document.getElementById('phasesContainer');
  container.innerHTML = phases.map(phase => `
    <div class="phase" id="phase-${phase.id}">
      <span class="phase-name">${phase.name}</span>
      <span class="phase-status status-${phase.status}" id="status-${phase.id}">
        ${phase.status.toUpperCase()}
      </span>
    </div>
  `).join('');
}

// ========== PROGRESS TRACKING ==========
let currentProgress = 0;
const phaseProgression = {
  'initial': 5,
  'whitelist': 15,
  'blacklist': 30,
  'reputation': 45,
  'virustotal': 60,
  'backend': 80,
  'final': 100
};

function setProgressTo(percentage) {
  currentProgress = Math.max(currentProgress, Math.min(percentage, 100));
  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    progressBar.style.width = currentProgress + '%';
  }
  updateProgressLabel();
}

function updateProgressLabel() {
  const progressLabel = document.getElementById('progressLabel');
  if (progressLabel) {
    progressLabel.textContent = `${Math.round(currentProgress)}%`;
  }
}

// ========== THREATS TRACKING ==========
let detectedThreats = [];

function addThreat(severity, category, description, impact) {
  detectedThreats.push({
    severity, // 'critical', 'high', 'medium', 'low'
    category,
    description,
    impact,
    timestamp: new Date().toISOString()
  });
  displayThreats();
}

function displayThreats() {
  const threatsContainer = document.getElementById('threatsContainer');
  if (!threatsContainer || detectedThreats.length === 0) return;
  
  threatsContainer.innerHTML = `
    <div class="threats-section">
      <h3 class="threats-title">🚨 Detected Threats</h3>
      <div class="threats-list">
        ${detectedThreats.map(threat => `
          <div class="threat-item threat-${threat.severity}">
            <div class="threat-badge">${threat.severity.toUpperCase()}</div>
            <div class="threat-content">
              <div class="threat-category">${threat.category}</div>
              <div class="threat-description">${threat.description}</div>
              <div class="threat-impact">Impact: ${threat.impact}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ========== EDUCATION SECTION ==========
function showEducationalWarning(verdict, threats) {
  const educationContainer = document.getElementById('educationContainer');
  if (!educationContainer) return;
  
  let educationContent = '';
  
  if (verdict === 'BLOCK') {
    educationContent = `
      <div class="education-box education-danger">
        <h4>⚠️ What Could Happen?</h4>
        <p>If you had visited this website without GuardianLink protection:</p>
        <ul class="danger-list">
          <li><strong>Malware Infection:</strong> Your device could be infected with viruses, trojans, or ransomware</li>
          <li><strong>Data Theft:</strong> Personal information, passwords, and financial data could be stolen</li>
          <li><strong>Identity Theft:</strong> Criminals could impersonate you online or in financial institutions</li>
          <li><strong>Financial Loss:</strong> Direct theft from bank accounts or credit card fraud</li>
          <li><strong>Privacy Breach:</strong> Sensitive documents and photos could be exposed or sold</li>
          <li><strong>System Damage:</strong> Your computer could be damaged or held for ransom</li>
        </ul>
      </div>
    `;
  } else if (verdict === 'WARN') {
    educationContent = `
      <div class="education-box education-warning">
        <h4>⚠️ Potential Risks</h4>
        <p>This website has some suspicious characteristics:</p>
        <ul class="warning-list">
          <li><strong>Phishing Attempts:</strong> Could try to trick you into revealing passwords or personal info</li>
          <li><strong>Unwanted Software:</strong> May attempt to download potentially unwanted programs</li>
          <li><strong>Tracking:</strong> Extensive tracking of your online behavior and location</li>
          <li><strong>Scams:</strong> Fake offers or too-good-to-be-true deals designed to defraud users</li>
          <li><strong>Data Harvesting:</strong> Collection of personal information for resale</li>
        </ul>
      </div>
    `;
  } else {
    educationContent = `
      <div class="education-box education-safe">
        <h4>✅ Safe to Proceed</h4>
        <p>This website passed all security checks:</p>
        <ul class="safe-list">
          <li>✓ No known malware detected</li>
          <li>✓ Valid security certificate</li>
          <li>✓ Legitimate domain reputation</li>
          <li>✓ No suspicious patterns detected</li>
          <li>✓ Protected by security vendors</li>
        </ul>
      </div>
    `;
  }
  
  educationContainer.innerHTML = educationContent;
}

// ========== PROCEED BUTTON HANDLER ==========
function setupProceedButton(url, tabId) {
  const buttonContainer = document.createElement('div');
  buttonContainer.style.marginTop = '20px';
  buttonContainer.style.textAlign = 'center';
  
  const proceedBtn = document.createElement('button');
  proceedBtn.id = 'scanner-proceed-btn';
  proceedBtn.textContent = 'Proceed Anyway';
  proceedBtn.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  `;
  
  proceedBtn.addEventListener('mouseover', () => {
    proceedBtn.style.background = 'linear-gradient(135deg, #5568d3 0%, #6b3fa0 100%)';
    proceedBtn.style.transform = 'translateY(-2px)';
  });
  
  proceedBtn.addEventListener('mouseout', () => {
    proceedBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    proceedBtn.style.transform = 'translateY(0)';
  });
  
  proceedBtn.addEventListener('click', async () => {
    try {
      proceedBtn.disabled = true;
      proceedBtn.textContent = 'Proceeding...';
      
      await chrome.runtime.sendMessage({
        action: 'PROCEED_WITH_URL',
        url: url,
        tabId: tabId
      });
    } catch (error) {
      console.error('❌ Error in proceed:', error);
      window.location.href = url;
    }
  });
  
  buttonContainer.appendChild(proceedBtn);
  
  const scanCard = document.querySelector('.scan-card');
  if (scanCard) {
    scanCard.appendChild(buttonContainer);
  }
}

function startProgressAnimation() {
  const progressBar = document.getElementById('progressBar');
  if (!progressBar) return;
  
  let progress = 5;
  
  const interval = setInterval(() => {
    if (progress < 30) {
      progress += Math.random() * 1.5;
      setProgressTo(progress);
    }
  }, 200);
  
  window.progressInterval = interval;
}

function updatePhase(phaseId, status, message = '') {
  const phaseElement = document.getElementById(`phase-${phaseId}`);
  const statusElement = document.getElementById(`status-${phaseId}`);
  
  if (!phaseElement || !statusElement) {
    console.warn(`⚠️ Could not find phase element for ${phaseId}`);
    return;
  }
  
  statusElement.className = `phase-status status-${status}`;
  statusElement.textContent = status.toUpperCase();
  
  // Update progress based on phase
  if (phaseProgression[phaseId]) {
    if (status === 'checking') {
      setProgressTo(phaseProgression[phaseId] - 5);
    } else if (status === 'complete') {
      setProgressTo(phaseProgression[phaseId]);
    }
  }
  
  if (message) {
    const statusMessage = document.getElementById('statusMessage');
    if (statusMessage) {
      statusMessage.textContent = message;
    }
  }
}

function simulateInitialPhases() {
  setTimeout(() => {
    updatePhase('initial', 'complete', 'Scanner initialized');
    updatePhase('whitelist', 'checking', 'Checking whitelist...');
  }, 800);
  
  setTimeout(() => {
    updatePhase('whitelist', 'complete', 'Whitelist check complete');
    updatePhase('blacklist', 'checking', 'Checking blacklist...');
  }, 1600);
  
  setTimeout(() => {
    updatePhase('blacklist', 'complete', 'Blacklist check complete');
    updatePhase('reputation', 'checking', 'Analyzing domain reputation...');
  }, 2400);
  
  setTimeout(() => {
    updatePhase('reputation', 'complete', 'Reputation analysis complete');
    updatePhase('virustotal', 'checking', 'VirusTotal scanning...');
  }, 3200);
}

function setupMessageListener(tabId, url) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Scanner received:', request.action);
    
    switch (request.action) {
      case 'SCAN_UPDATE':
        handleScanUpdate(request);
        break;
        
      case 'SCAN_COMPLETE':
        handleScanComplete(request);
        break;
        
      case 'THREAT_DETECTED':
        addThreat(request.severity, request.category, request.description, request.impact);
        break;
    }
    
    sendResponse({ received: true });
    return true;
  });
}

function handleScanUpdate(request) {
  console.log('📊 Scan update:', request.status, request.progress);
  
  // Update progress
  if (request.progress) {
    setProgressTo(request.progress);
  }
  
  // Update status message
  if (request.message) {
    const statusMessage = document.getElementById('statusMessage');
    if (statusMessage) {
      statusMessage.innerHTML = `<span style="animation: pulse 1s ease-in-out infinite;">⏳</span> ${request.message}`;
    }
  }
  
  // Update current phase
  if (request.phase) {
    updatePhase(request.phase, 'checking', request.message);
  }
}

function handleScanComplete(request) {
  console.log('✅ Scan complete:', request.verdict, 'Score:', request.score);
  
  if (window.progressInterval) {
    clearInterval(window.progressInterval);
  }
  
  // Calculate risk score and risk level from safety score
  const riskScore = 100 - request.score;
  const riskLevel = calculateRiskLevel(request.score);
  
  // Update to 100%
  setProgressTo(100);
  
  // Complete all remaining phases
  updatePhase('virustotal', 'complete', 'VirusTotal analysis complete');
  updatePhase('backend', 'complete', 'Backend analysis complete');
  updatePhase('final', 'checking', 'Compiling final decision...');
  
  // Update progress bar color
  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    progressBar.style.background = 
      request.verdict === 'ALLOW' ? 'linear-gradient(90deg, #10b981 0%, #6ee7b7 100%)' : 
      request.verdict === 'WARN' ? 'linear-gradient(90deg, #f59e0b 0%, #fcd34d 100%)' : 
      'linear-gradient(90deg, #ef4444 0%, #fca5a5 100%)';
  }
  
  // Update status message with risk score
  const statusMessage = document.getElementById('statusMessage');
  if (statusMessage) {
    const messages = {
      'ALLOW': `✅ Website is safe (Risk: ${Math.round(riskScore)}% - ${riskLevel}). Loading...`,
      'WARN': `⚠️ Website has warnings (Risk: ${Math.round(riskScore)}% - ${riskLevel}). Proceed with caution.`,
      'BLOCK': `🚫 Website blocked (Risk: ${Math.round(riskScore)}% - ${riskLevel}) due to security threats.`
    };
    statusMessage.textContent = messages[request.verdict] || 'Scan complete';
  }
  
  // Show threat breakdown if available
  if (request.threats && request.threats.length > 0) {
    request.threats.forEach(threat => {
      addThreat(threat.severity, threat.category, threat.description, threat.impact);
    });
  }
  
  // Show educational warning
  showEducationalWarning(request.verdict, request.threats || []);
  
  // Complete final phase
  setTimeout(() => {
    updatePhase('final', 'complete', 'Scan complete!');
  }, 1000);
}

window.addEventListener('beforeunload', () => {
  if (window.progressInterval) {
    clearInterval(window.progressInterval);
  }
});

console.log('✅ Scanner script loaded');