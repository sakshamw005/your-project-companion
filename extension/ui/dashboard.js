/**
 * Dashboard Script
 * Manages the GuardianLink dashboard UI and log display
 */

let allLogs = [];
let currentFilter = '';

// Initialize dashboard on load
document.addEventListener('DOMContentLoaded', () => {
  loadLogs();
  setupAutoRefresh();
  
  // Add event listeners for CSP compliance (no inline handlers)
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportLogs);
  }
  
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettings);
  }
  
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearLogs);
  }
  
  const filterSelect = document.getElementById('filterVerdict');
  if (filterSelect) {
    filterSelect.addEventListener('change', filterLogs);
  }
  
  const closeModalBtn = document.getElementById('closeDetailBtn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeDetailModal);
  }
});

// Load logs from chrome storage
function loadLogs() {
  chrome.storage.local.get(['guardianlink_logs', 'guardianlink_blacklist'], (data) => {
    allLogs = data.guardianlink_logs || [];
    
    console.log('📊 Dashboard loaded logs:', allLogs.length, 'entries');
    console.log('Latest logs:', allLogs.slice(-3).map(l => ({ url: l.url, verdict: l.verdict })));

    // Sort by timestamp (newest first)
    allLogs.sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });

    // Update display
    updateStats();
    displayLogs(allLogs);
  });
}

// Update statistics
function updateStats() {
  // Filter to only include logs from the last 24 hours
  const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
  const recentLogs = allLogs.filter(log => {
    try {
      const logTime = new Date(log.timestamp).getTime();
      return logTime > twentyFourHoursAgo;
    } catch {
      return false;
    }
  });
  
  const blocked = recentLogs.filter(log => log.verdict === 'BLOCK').length;
  const warned = recentLogs.filter(log => log.verdict === 'WARN').length;
  const allowed = recentLogs.filter(log => log.verdict === 'ALLOW').length;

  document.getElementById('blockedCount').textContent = blocked;
  document.getElementById('warnedCount').textContent = warned;
  document.getElementById('allowedCount').textContent = allowed;
}

// Display logs in table
// Helper functions
function truncateUrl(url, maxLength) {
  if (!url || typeof url !== 'string') return 'N/A';
  return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
}

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return 'N/A';
  }
}

function displayLogs(logs) {
  const container = document.getElementById('logContainer');
  
  if (logs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <p>No URLs logged yet. GuardianLink is monitoring your browsing.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = logs.map((log, index) => {
    // Add null checks for log properties
    const verdict = log.verdict || 'UNKNOWN';
    const riskLevel = log.riskLevel || 'UNKNOWN';
    const url = log.url || 'Unknown URL';
    const score = log.combinedScore !== undefined ? log.combinedScore : (log.score !== undefined ? log.score : 'N/A');
    
    return `
      <div class="log-row" data-log-index="${index}">
        <div class="url-cell" title="${url}">
          ${truncateUrl(url, 40)}
        </div>
        <div>
          <span class="verdict-badge verdict-${verdict.toLowerCase()}">
            ${verdict}
          </span>
        </div>
        <div>
          <span class="risk-badge risk-${riskLevel.toLowerCase()}">
            ${riskLevel}
          </span>
        </div>
        <div>${typeof score === 'number' ? score.toFixed(1) : score}/100</div>
        <div class="timestamp">${formatTime(log.timestamp)}</div>
      </div>
    `;
  }).join('');
  
  // Add event listeners to log rows
  const logRows = document.querySelectorAll('.log-row');
  logRows.forEach(row => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', (e) => {
      const index = parseInt(row.getAttribute('data-log-index'));
      showDetails(index);
    });
  });
}

// Filter logs by verdict
function filterLogs() {
  const filterValue = document.getElementById('filterVerdict').value;
  currentFilter = filterValue;
  
  const filtered = filterValue 
    ? allLogs.filter(log => log.verdict === filterValue)
    : allLogs;
  
  displayLogs(filtered);
}

// Show detailed view of a log entry
function showDetails(index) {
  const filteredLogs = currentFilter 
    ? allLogs.filter(log => log.verdict === currentFilter)
    : allLogs;
  
  const log = filteredLogs[index];
  if (!log) return;

  const content = document.getElementById('detailContent');
  const risks = Array.isArray(log.risks) ? log.risks : [];

  content.innerHTML = `
    <div class="modal-detail-row">
      <div class="modal-label">URL</div>
      <div class="modal-value" style="word-break: break-all;">${escapeHtml(log.url)}</div>
    </div>
    <div class="modal-detail-row">
      <div class="modal-label">Domain</div>
      <div class="modal-value">${escapeHtml(log.details?.domain || log.details?.hostname || 'Unknown')}</div>
    </div>
    <div class="modal-detail-row">
      <div class="modal-label">Verdict</div>
      <div class="modal-value">
        <span class="verdict-badge verdict-${log.verdict.toLowerCase()}">
          ${log.verdict}
        </span>
      </div>
    </div>
    <div class="modal-detail-row">
      <div class="modal-label">Risk Level</div>
      <div class="modal-value">
        <span class="risk-badge risk-${log.riskLevel.toLowerCase()}">
          ${log.riskLevel}
        </span>
      </div>
    </div>
    <div class="modal-detail-row">
      <div class="modal-label">Risk Score</div>
      <div class="modal-value">${(log.combinedScore || 0).toFixed(1)} / 100</div>
    </div>
    <div class="modal-detail-row">
      <div class="modal-label">Timestamp</div>
      <div class="modal-value">${new Date(log.timestamp).toLocaleString()}</div>
    </div>
    ${risks.length > 0 ? `
      <div class="modal-detail-row" style="flex-direction: column; align-items: flex-start;">
        <div class="modal-label">Detected Risks</div>
        <div class="modal-value">
          <ul style="margin-left: 20px; margin-top: 5px;">
            ${risks.map(risk => `<li>${escapeHtml(String(risk))}</li>`).join('')}
          </ul>
        </div>
      </div>
    ` : ''}
    ${log.reasoning ? `
      <div class="modal-detail-row" style="flex-direction: column; align-items: flex-start;">
        <div class="modal-label">Analysis</div>
        <div class="modal-value">${escapeHtml(log.reasoning)}</div>
      </div>
    ` : ''}
  `;

  document.getElementById('detailModal').classList.add('active');
}

// Close detail modal
function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('active');
}

// Clear all logs
function clearLogs() {
  if (confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
    chrome.storage.local.set({ 'guardianlink_logs': [] }, () => {
      allLogs = [];
      updateStats();
      displayLogs([]);
    });
  }
}

// Export logs as JSON
function exportLogs() {
  const dataStr = JSON.stringify(allLogs, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `guardianlink_logs_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Open settings (placeholder)
function openSettings() {
  alert('Settings page coming soon. Current features:\n\n' +
    '✓ Rule-based URL detection\n' +
    '✓ Domain reputation checking\n' +
    '✓ Local blacklist\n' +
    '✓ Offline operation\n' +
    '✓ Decision logging\n\n' +
    'For now, you can manage logs and export data here.');
}

// Utility functions

function truncateUrl(url, length) {
  if (url.length > length) {
    return url.substring(0, length) + '...';
  }
  return url;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-refresh logs every 5 seconds
function setupAutoRefresh() {
  setInterval(loadLogs, 5000);
}

// Close modal when clicking outside
document.getElementById('detailModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('detailModal')) {
    closeDetailModal();
  }
});

// Handle messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'refreshDashboard') {
    loadLogs();
    sendResponse({ success: true });
  }
});
