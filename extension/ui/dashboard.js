/**
 * Dashboard Script - GuardianLink v2.0
 * Enterprise-grade real-time security logging dashboard
 */

let allLogs = [];
let currentFilter = 'all';
let stats = { blocked: 0, warned: 0, allowed: 0, total: 0 };

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  console.log('[GuardianLink] Dashboard initializing...');
  
  loadLogs();
  setupEventListeners();
  setupRealTimeUpdates();
  updateStats();
});

// ========== LOAD LOGS ==========
function loadLogs() {
  chrome.storage.local.get(['guardianlink_logs'], (data) => {
    const logs = data.guardianlink_logs || [];
    
    console.log(`[GuardianLink] Loaded ${logs.length} security logs`);
    
    // Sort by timestamp (newest first)
    allLogs = logs.sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });
    
    updateStats();
    displayLogs(allLogs);
    updateUI();
  });
}

// ========== UPDATE STATS ==========
function updateStats() {
  // Reset stats
  stats = { blocked: 0, warned: 0, allowed: 0, total: allLogs.length };
  
  // Count by verdict
  allLogs.forEach(log => {
    switch (log.verdict) {
      case 'BLOCK':
        stats.blocked++;
        break;
      case 'WARN':
        stats.warned++;
        break;
      case 'ALLOW':
        stats.allowed++;
        break;
    }
  });
  
  // Update UI
  document.getElementById('blockedCount').textContent = stats.blocked;
  document.getElementById('warnedCount').textContent = stats.warned;
  document.getElementById('allowedCount').textContent = stats.allowed;
  
  // Update filter counts
  updateFilterCounts();
}

// ========== DISPLAY LOGS ==========
function displayLogs(logs) {
  const container = document.getElementById('logContainer');
  
  if (!logs || logs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">�</div>
        <p>No security logs yet</p>
        <p class="empty-state-hint">GuardianLink monitors URLs as you browse</p>
      </div>
    `;
    return;
  }
  
  const filteredLogs = applyFilter(logs);
  container.innerHTML = filteredLogs.map((log, index) => createLogRow(log, index)).join('');
  
  // Stagger animation for log rows
  document.querySelectorAll('.log-row').forEach((row, idx) => {
    row.style.animation = `slideUp 0.4s ease 0.05s`;
    row.style.animationDelay = `${idx * 0.05}s`;
  });

  // Attach event listeners to view details buttons
  document.querySelectorAll('.view-details-btn').forEach((btn, idx) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showLogDetails(filteredLogs[idx]);
    });
  });
}

function createLogRow(log, index) {
  const verdict = log.verdict || 'UNKNOWN';
  const riskLevel = log.riskLevel || 'UNKNOWN';
  const score = log.combinedScore !== undefined ? log.combinedScore : (log.score || 0);
  const url = log.url || 'Unknown URL';
  const domain = extractDomain(url);
  const time = formatTime(log.timestamp);
  
  const verdictClass = `verdict-${verdict.toLowerCase()}`;
  const riskClass = `risk-${riskLevel.toLowerCase()}`;
  
  return `
    <div class="log-row" data-index="${index}">
      <div class="log-cell log-url" title="${escapeHtml(url)}">
        <div class="log-domain">${escapeHtml(domain)}</div>
        <div class="log-path">${truncatePath(url, 40)}</div>
      </div>
      <div class="log-cell">
        <span class="verdict-badge ${verdictClass}">
          ${verdict}
        </span>
      </div>
      <div class="log-cell">
        <span class="risk-badge ${riskClass}">
          ${riskLevel}
        </span>
      </div>
      <div class="log-cell log-score">
        <div class="score-bar">
          <div class="score-fill" style="width: ${score}%; background: ${getScoreColor(score)};"></div>
        </div>
        <span class="score-text">${score.toFixed(0)}</span>
      </div>
      <div class="log-cell log-time">${time}</div>
      <div class="log-cell log-actions">
        <button class="icon-btn view-details-btn" title="View details">
          👁️
        </button>
      </div>
    </div>
  `;
}

// ========== LOG DETAILS MODAL ==========
function showLogDetails(log) {
  const modal = document.getElementById('detailModal');
  const content = document.getElementById('detailContent');
  
  if (!log) {
    content.innerHTML = '<p>Error: Log data not available</p>';
    modal.classList.add('active');
    return;
  }

  const verdict = log.verdict || 'UNKNOWN';
  const riskLevel = log.riskLevel || 'UNKNOWN';
  const score = log.combinedScore !== undefined ? log.combinedScore : (log.score || 0);
  const verdictClass = verdict === 'BLOCK' ? 'block' : (verdict === 'WARN' ? 'warn' : 'allow');
  const riskClass = riskLevel.toLowerCase();
  
  const details = `
    <div class="modal-section">
      <h3>🔗 URL Details</h3>
      <div class="modal-section-content">
        <div class="modal-detail-row">
          <span class="modal-label">Full URL</span>
          <span class="modal-value">${escapeHtml(log.url)}</span>
        </div>
        <div class="modal-detail-row">
          <span class="modal-label">Domain</span>
          <span class="modal-value">${escapeHtml(extractDomain(log.url))}</span>
        </div>
      </div>
    </div>
    
    <div class="modal-section">
      <h3>🛡️ Security Assessment</h3>
      <div class="modal-section-content">
        <div class="modal-detail-row">
          <span class="modal-label">Verdict</span>
          <span class="modal-verdict ${verdictClass}">${verdict}</span>
        </div>
        <div class="modal-detail-row">
          <span class="modal-label">Risk Level</span>
          <span class="modal-risk ${riskClass}">${riskLevel}</span>
        </div>
        <div class="modal-detail-row">
          <span class="modal-label">Security Score</span>
          <div class="modal-score-bar">
            <div class="modal-score-label">
              <span>Threat Level</span>
              <span class="modal-score-value">${score.toFixed(0)}%</span>
            </div>
            <div class="modal-score-bar-container">
              <div class="modal-score-fill" style="width: ${Math.min(score, 100)}%; background: ${getScoreColor(score)};"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="modal-section">
      <h3>📊 Analysis Details</h3>
      <div class="modal-section-content">
        <div class="modal-detail-row">
          <span class="modal-label">Timestamp</span>
          <span class="modal-value">${formatDateTime(log.timestamp)}</span>
        </div>
        <div class="modal-detail-row">
          <span class="modal-label">Reasoning</span>
          <span class="modal-value">${escapeHtml(log.reasoning || 'Security analysis completed')}</span>
        </div>
        ${log.details?.risks?.length > 0 ? `
          <div class="modal-detail-row">
            <span class="modal-label">Detected Risks</span>
            <ul class="modal-risk-list">
              ${log.details.risks.map(risk => `<li>${escapeHtml(risk)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    </div>
    
    ${log.details?.phaseBreakdown ? `
      <div class="modal-section">
        <h3>⚙️ Scan Breakdown</h3>
        <div class="modal-section-content">
          ${Object.entries(log.details.phaseBreakdown).map(([phase, data]) => `
            <div class="modal-detail-row">
              <span class="modal-label">${escapeHtml(phase)}</span>
              <span class="modal-value">
                <strong>${data.score || 0}/${data.maxScore || 100}</strong> 
                <span style="margin-left: 8px; color: var(--text-secondary);">(${data.status || 'unknown'})</span>
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
  
  content.innerHTML = details;
  modal.classList.add('active');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('active');
}

// ========== FILTERING ==========
function applyFilter(logs) {
  if (currentFilter === 'all') return logs;
  return logs.filter(log => log.verdict === currentFilter);
}

function updateFilterCounts() {
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    const filter = btn.dataset.filter;
    let count = 0;
    
    switch (filter) {
      case 'all': count = stats.total; break;
      case 'BLOCK': count = stats.blocked; break;
      case 'WARN': count = stats.warned; break;
      case 'ALLOW': count = stats.allowed; break;
    }
    
    const countBadge = btn.querySelector('.filter-count');
    if (countBadge) {
      countBadge.textContent = count;
      countBadge.style.display = count > 0 ? 'inline' : 'none';
    }
  });
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
  // Filter dropdown
  const filterSelect = document.getElementById('filterVerdict');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      const filter = e.target.value;
      setActiveFilter(filter || 'all');
    });
  }
  
  // Filter buttons (legacy support)
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      setActiveFilter(filter);
    });
  });
  
  // Export button
  document.getElementById('exportBtn').addEventListener('click', exportLogs);
  
  // Clear button
  document.getElementById('clearBtn').addEventListener('click', clearLogs);
  
  // Settings button
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  
  // Modal close
  document.getElementById('closeDetailBtn').addEventListener('click', closeDetailModal);
  document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('detailModal')) {
      closeDetailModal();
    }
  });
  
  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', loadLogs);
}

function setActiveFilter(filter) {
  // Normalize filter value: empty string should be 'all'
  currentFilter = (filter === '' || filter === undefined) ? 'all' : filter;
  
  console.log('[GuardianLink] Filter changed to:', currentFilter);
  
  // Update UI
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === currentFilter);
  });
  
  // Update select dropdown if it exists
  const filterSelect = document.getElementById('filterVerdict');
  if (filterSelect) {
    filterSelect.value = currentFilter === 'all' ? '' : currentFilter;
  }
  
  // Refresh display
  displayLogs(allLogs);
}

// ========== ACTIONS ==========
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
  
  setTimeout(() => URL.revokeObjectURL(url), 100);
  
  showToast('✅ Logs exported successfully');
}

function clearLogs() {
  if (!confirm('Are you sure you want to clear all logs? This action cannot be undone.')) {
    return;
  }
  
  chrome.storage.local.set({ 'guardianlink_logs': [] }, () => {
    allLogs = [];
    updateStats();
    displayLogs([]);
    showToast('🧹 All logs cleared');
  });
}

function openSettings() {
  showToast('⚙️ Settings panel coming soon');
  // In future: Open settings modal or page
}

// ========== REAL-TIME UPDATES ==========
function setupRealTimeUpdates() {
  // Listen for background messages
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'refreshDashboard') {
      console.log('🔄 Refreshing dashboard...');
      loadLogs();
    }
  });
  
  // Poll for updates every 3 seconds
  setInterval(() => {
    chrome.storage.local.get(['guardianlink_logs'], (data) => {
      const newCount = data.guardianlink_logs?.length || 0;
      if (newCount !== stats.total) {
        console.log(`🔄 New logs detected (${newCount} vs ${stats.total}), refreshing...`);
        loadLogs();
      }
    });
  }, 3000);
}

// ========== UTILITY FUNCTIONS ==========
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url.split('/')[2] || url.substring(0, 30);
  }
}

function truncatePath(url, maxLength) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    return path.length > maxLength ? path.substring(0, maxLength) + '...' : path;
  } catch {
    return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
  }
}

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  } catch {
    return 'Unknown';
  }
}

function formatDateTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return 'Unknown';
  }
}

function getScoreColor(score) {
  if (score >= 80) return '#4CAF50';
  if (score >= 60) return '#FFC107';
  if (score >= 40) return '#FF9800';
  return '#F44336';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  // Create new toast
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function updateUI() {
  // Update last refresh time
  document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
  
  // Show/hide empty state
  const emptyState = document.querySelector('.empty-state');
  const logContainer = document.getElementById('logContainer');
  
  if (allLogs.length === 0) {
    emptyState?.classList.add('show');
    logContainer?.classList.add('empty');
  } else {
    emptyState?.classList.remove('show');
    logContainer?.classList.remove('empty');
  }
}

// ========== INITIALIZE ==========
console.log('[GuardianLink] Dashboard loaded');