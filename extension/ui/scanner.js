/**
 * Scanner Page Script
 * Shows scanning progress to user
 * FIXED: Proper communication with background
 */

document.addEventListener('DOMContentLoaded', () => {
  initializeScanner();
});

async function initializeScanner() {
  console.log('🔧 Scanner page initializing...');
  
  // Get URL and tabId from query parameters
  const params = new URLSearchParams(window.location.search);
  const url = decodeURIComponent(params.get('url') || '');
  const tabId = parseInt(params.get('tabId') || '0');
  
  // Display URL
  const urlElement = document.getElementById('scanUrl');
  if (url) {
    try {
      const urlObj = new URL(url);
      urlElement.innerHTML = `
        <div style="margin-bottom: 5px; opacity: 0.8;">Domain:</div>
        <div style="font-weight: bold;">${urlObj.hostname}</div>
        <div style="margin-top: 5px; font-size: 12px; opacity: 0.7;">${urlObj.pathname.substring(0, 50)}${urlObj.pathname.length > 50 ? '...' : ''}</div>
      `;
    } catch {
      urlElement.textContent = url.substring(0, 80) + (url.length > 80 ? '...' : '');
    }
  }
  
  // Initialize phases
  initializePhases();
  
  // Start progress animation
  startProgressAnimation();
  
  // Register with background
  try {
    await chrome.runtime.sendMessage({ 
      action: 'SCANNER_READY',
      tabId: tabId,
      url: url
    });
    console.log('✅ Scanner page registered with background');
  } catch (error) {
    console.log('⚠️ Could not register scanner:', error.message);
  }
  
  // Notify background that scanner is ready
  setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'SCANNER_READY' }).catch(() => {});
  }, 100);
  
  // Add proceed button after delay
  setTimeout(() => {
    setupProceedButton(url, tabId);
  }, 2000);
  
  // Listen for messages from background
  setupMessageListener(tabId, url);
  
  // Simulate initial scan phases
  simulateInitialPhases();
}

function initializePhases() {
  const phases = [
    { id: 'initial', name: 'Initializing Scan', status: 'checking' },
    { id: 'whitelist', name: 'Whitelist Check', status: 'pending' },
    { id: 'blacklist', name: 'Blacklist Check', status: 'pending' },
    { id: 'reputation', name: 'Domain Reputation', status: 'pending' },
    { id: 'backend', name: 'Backend Analysis', status: 'pending' },
    { id: 'final', name: 'Final Decision', status: 'pending' }
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

// ========== PROCEED BUTTON HANDLER ==========
function setupProceedButton(url, tabId) {
  // Create proceed button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.marginTop = '20px';
  buttonContainer.style.textAlign = 'center';
  
  const proceedBtn = document.createElement('button');
  proceedBtn.id = 'scanner-proceed-btn';
  proceedBtn.textContent = 'Proceed Anyway';
  proceedBtn.style.cssText = `
    background: #667eea;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
  `;
  
  proceedBtn.addEventListener('mouseover', () => {
    proceedBtn.style.background = '#5568d3';
  });
  
  proceedBtn.addEventListener('mouseout', () => {
    proceedBtn.style.background = '#667eea';
  });
  
  proceedBtn.addEventListener('click', async () => {
    try {
      proceedBtn.disabled = true;
      proceedBtn.textContent = 'Proceeding...';
      
      // Send message to background
      await chrome.runtime.sendMessage({
        action: 'PROCEED_WITH_URL',
        url: url,
        tabId: tabId
      });
    } catch (error) {
      console.error('❌ Error in proceed:', error);
      // Fallback navigation
      window.location.href = url;
    }
  });
  
  buttonContainer.appendChild(proceedBtn);
  
  // Add to scanner card
  const scanCard = document.querySelector('.scan-card');
  if (scanCard) {
    scanCard.appendChild(buttonContainer);
  }
}

function startProgressAnimation() {
  const progressBar = document.getElementById('progressBar');
  if (!progressBar) {
    console.warn('⚠️ Progress bar element not found');
    return;
  }
  
  let progress = 10;
  
  const interval = setInterval(() => {
    if (progress < 30) {
      progress += 0.5;
      progressBar.style.width = progress + '%';
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
  
  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    const currentWidth = parseInt(progressBar.style.width) || 10;
    
    if (status === 'checking') {
      progressBar.style.width = Math.min(currentWidth + 10, 90) + '%';
    } else if (status === 'complete') {
      progressBar.style.width = Math.min(currentWidth + 15, 100) + '%';
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
  // Simulate initial checks
  setTimeout(() => {
    updatePhase('initial', 'complete', 'Scanner initialized');
    updatePhase('whitelist', 'checking', 'Checking whitelist...');
  }, 1000);
  
  setTimeout(() => {
    updatePhase('whitelist', 'complete', 'Whitelist check complete');
    updatePhase('blacklist', 'checking', 'Checking blacklist...');
  }, 2000);
  
  setTimeout(() => {
    updatePhase('blacklist', 'complete', 'Blacklist check complete');
    updatePhase('reputation', 'checking', 'Analyzing domain reputation...');
  }, 3000);
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
    }
    
    sendResponse({ received: true });
    return true;
  });
}

function handleScanUpdate(request) {
  console.log('📊 Scan update:', request.status, request.progress);
  
  // Update progress bar
  const progressBar = document.getElementById('progressBar');
  if (progressBar && request.progress) {
    progressBar.style.width = request.progress + '%';
  }
  
  // Update status message
  if (request.message) {
    const statusMessage = document.getElementById('statusMessage');
    if (statusMessage) {
      statusMessage.textContent = request.message;
    }
  }
  
  // Update phases
  if (request.status === 'scanning') {
    updatePhase('backend', 'checking', request.message || 'Performing security analysis...');
  }
}

function handleScanComplete(request) {
  console.log('✅ Scan complete:', request.verdict);
  
  // Clear intervals
  if (window.progressInterval) {
    clearInterval(window.progressInterval);
  }
  
  // Update UI
  const statusMessage = document.getElementById('statusMessage');
  if (statusMessage) {
    statusMessage.textContent = 
      `Security verdict: ${request.verdict} (Score: ${request.score || 0})`;
  }
  
  updatePhase('backend', 'complete', 'Backend analysis complete');
  updatePhase('final', 'checking', 'Compiling final decision...');
  
  // Complete final phase
  setTimeout(() => {
    updatePhase('final', 'complete', 'Scan complete!');
    
    // Update progress bar to 100%
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
      progressBar.style.width = '100%';
      progressBar.style.background = 
        request.verdict === 'ALLOW' ? '#4CAF50' : 
        request.verdict === 'WARN' ? '#FF9800' : '#F44336';
    }
    
    // Show message
    const message = request.verdict === 'ALLOW' ? 
      '✅ Website is safe. Loading...' :
      request.verdict === 'WARN' ? 
      '⚠️ Website has warnings. Redirecting to warning page...' :
      '🚫 Website blocked. Redirecting to warning page...';
    
    const msg = document.getElementById('statusMessage');
    if (msg) {
      msg.textContent = message;
    }
    
  }, 1000);
}

// Clean up intervals on page unload
window.addEventListener('beforeunload', () => {
  if (window.progressInterval) {
    clearInterval(window.progressInterval);
  }
});

console.log('✅ Scanner script loaded');