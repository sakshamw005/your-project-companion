/**
 * Dashboard Script - GuardianLink v2.0
 * Enterprise-grade real-time security logging dashboard
 */

// Helper function to safely escape HTML
function escapeHTML(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

let allLogs = [];
let currentFilter = 'all';

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('[GuardianLink] Dashboard loaded');
    setupEventListeners();
    setupFilterListener();
    loadLogs();
});

// Setup event listeners
function setupEventListeners() {
    const closeBtn = document.getElementById('closeModalBtn');
    const modal = document.getElementById('detailModal');
    const clearBtn = document.getElementById('clearBtn');
    const exportBtn = document.getElementById('exportBtn');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeDetailModal);
    }
    
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeDetailModal();
            }
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllLogs);
    }
    
    if (exportBtn) {
        exportBtn.addEventListener('click', exportLogs);
    }
}

function setupFilterListener() {
    const filterSelect = document.getElementById('filterVerdict');
    if (filterSelect) {
        filterSelect.addEventListener('change', function() {
            currentFilter = this.value || 'all';
            displayLogs(allLogs);
        });
    }
}

// Load logs from storage
async function loadLogs() {
    try {
        const data = await browser.storage.local.get('guardianlink_logs');
        const logs = data.guardianlink_logs || [];
        
        console.log('[GuardianLink] Loaded logs:', logs.length);
        
        allLogs = logs.sort((a, b) => {
            const timeA = new Date(a.timestamp || 0).getTime();
            const timeB = new Date(b.timestamp || 0).getTime();
            return timeB - timeA;
        });
        
        updateUI(allLogs);
        displayLogs(allLogs);
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

// Update stats
function updateUI(logs) {
    const blockedCount = document.getElementById('blockedCount');
    const warnedCount = document.getElementById('warnedCount');
    const analyzedCount = document.getElementById('analyzedCount');
    
    if (!blockedCount || !warnedCount || !analyzedCount) return;
    
    const counts = {
        BLOCK: logs.filter(l => l.verdict === 'BLOCK').length,
        WARN: logs.filter(l => l.verdict === 'WARN').length,
        ALLOW: logs.filter(l => l.verdict === 'ALLOW').length
    };
    
    const totalAnalyzed = counts.BLOCK + counts.WARN + counts.ALLOW;
    
    blockedCount.textContent = counts.BLOCK;
    warnedCount.textContent = counts.WARN;
    analyzedCount.textContent = totalAnalyzed;
}

// Display logs in table
function displayLogs(logs) {
    const logContainer = document.getElementById('logContainer');
    if (!logContainer) return;
    
    const filteredLogs = currentFilter === 'all' 
        ? logs 
        : logs.filter(l => l.verdict === currentFilter);
    
    if (filteredLogs.length === 0) {
        logContainer.innerHTML = '';
        const emptyDiv = document.createElement('div');
        emptyDiv.style.padding = '40px';
        emptyDiv.style.textAlign = 'center';
        emptyDiv.style.color = 'var(--text-secondary)';
        emptyDiv.textContent = 'No logs found';
        logContainer.appendChild(emptyDiv);
        return;
    }
    
    logContainer.innerHTML = '';
    filteredLogs.forEach((log, idx) => {
        const row = createLogRowElement(log);
        row.addEventListener('click', () => {
            const viewBtn = row.querySelector('.view-details-btn');
            if (viewBtn) viewBtn.click();
        });
        logContainer.appendChild(row);
    });
    
    // Attach click listeners to view buttons
    document.querySelectorAll('.view-details-btn').forEach((btn, idx) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showLogDetails(filteredLogs[idx]);
        });
    });
}

function createLogRow(log, index) {
    const verdict = log.verdict || 'UNKNOWN';
    const score = log.combinedScore !== undefined ? log.combinedScore : (log.score || 0);
    const riskLevel = getRiskLevel(score);
    const url = log.url || 'Unknown URL';
    const domain = extractDomain(url);
    const time = formatTime(log.timestamp);
    
    const verdictClass = `verdict-${verdict.toLowerCase()}`;
    const riskClass = `risk-${riskLevel.toLowerCase()}`;
    
    return `
        <div class="log-row">
            <div class="url-cell" title="${escapeHtml(url)}">${escapeHtml(domain)}</div>
            <div><span class="verdict-badge ${verdictClass}">${verdict}</span></div>
            <div><span class="risk-badge ${riskClass}">${riskLevel}</span></div>
            <div>${time}</div>
            <div><button class="icon-btn view-details-btn" title="View details">👁️</button></div>
        </div>
    `;
}

function createLogRowElement(log) {
    const verdict = log.verdict || 'UNKNOWN';
    const score = log.combinedScore !== undefined ? log.combinedScore : (log.score || 0);
    const riskLevel = getRiskLevel(score);
    const url = log.url || 'Unknown URL';
    const domain = extractDomain(url);
    const time = formatTime(log.timestamp);
    
    const verdictClass = `verdict-${verdict.toLowerCase()}`;
    const riskClass = `risk-${riskLevel.toLowerCase()}`;
    
    const row = document.createElement('div');
    row.className = 'log-row';
    
    const urlCell = document.createElement('div');
    urlCell.className = 'url-cell';
    urlCell.title = url;
    urlCell.textContent = domain;
    
    const verdictCell = document.createElement('div');
    const verdictSpan = document.createElement('span');
    verdictSpan.className = `verdict-badge ${verdictClass}`;
    verdictSpan.textContent = verdict;
    verdictCell.appendChild(verdictSpan);
    
    const riskCell = document.createElement('div');
    const riskSpan = document.createElement('span');
    riskSpan.className = `risk-badge ${riskClass}`;
    riskSpan.textContent = riskLevel;
    riskCell.appendChild(riskSpan);
    
    const timeCell = document.createElement('div');
    timeCell.textContent = time;
    
    const btnCell = document.createElement('div');
    const viewBtn = document.createElement('button');
    viewBtn.className = 'icon-btn view-details-btn';
    viewBtn.title = 'View details';
    viewBtn.textContent = '👁️';
    btnCell.appendChild(viewBtn);
    
    row.appendChild(urlCell);
    row.appendChild(verdictCell);
    row.appendChild(riskCell);
    row.appendChild(timeCell);
    row.appendChild(btnCell);
    
    return row;
}

// Show modal with details
function showLogDetails(log) {
    const modal = document.getElementById('detailModal');
    const content = document.getElementById('detailContent');
    
    if (!log || !modal || !content) return;
    
    const verdict = log.verdict || 'UNKNOWN';
    const score = log.combinedScore !== undefined ? log.combinedScore : (log.score || 0);
    const riskLevel = getRiskLevel(score);
    const verdictClass = verdict.toLowerCase();
    const riskClass = riskLevel.toLowerCase();
    
    // Clear previous content
    content.innerHTML = '';
    
    // URL Details Section
    const urlSection = document.createElement('div');
    urlSection.className = 'modal-section';
    
    const urlTitle = document.createElement('h3');
    urlTitle.textContent = '🔗 URL Details';
    urlSection.appendChild(urlTitle);
    
    const urlContent = document.createElement('div');
    urlContent.className = 'modal-section-content';
    
    const urlRow = document.createElement('div');
    urlRow.className = 'modal-detail-row';
    const urlLabel = document.createElement('span');
    urlLabel.className = 'modal-label';
    urlLabel.textContent = 'Full URL';
    const urlValue = document.createElement('span');
    urlValue.className = 'modal-value';
    urlValue.textContent = log.url;
    urlRow.appendChild(urlLabel);
    urlRow.appendChild(urlValue);
    
    const domainRow = document.createElement('div');
    domainRow.className = 'modal-detail-row';
    const domainLabel = document.createElement('span');
    domainLabel.className = 'modal-label';
    domainLabel.textContent = 'Domain';
    const domainValue = document.createElement('span');
    domainValue.className = 'modal-value';
    domainValue.textContent = extractDomain(log.url);
    domainRow.appendChild(domainLabel);
    domainRow.appendChild(domainValue);
    
    urlContent.appendChild(urlRow);
    urlContent.appendChild(domainRow);
    urlSection.appendChild(urlContent);
    content.appendChild(urlSection);
    
    // Security Assessment Section
    const secSection = document.createElement('div');
    secSection.className = 'modal-section';
    
    const secTitle = document.createElement('h3');
    secTitle.textContent = '🛡️ Security Assessment';
    secSection.appendChild(secTitle);
    
    const secContent = document.createElement('div');
    secContent.className = 'modal-section-content';
    
    const verdictRow = document.createElement('div');
    verdictRow.className = 'modal-detail-row';
    const verdictLabel = document.createElement('span');
    verdictLabel.className = 'modal-label';
    verdictLabel.textContent = 'Verdict';
    const verdictBadge = document.createElement('span');
    verdictBadge.className = `modal-verdict ${verdictClass}`;
    verdictBadge.textContent = verdict;
    verdictRow.appendChild(verdictLabel);
    verdictRow.appendChild(verdictBadge);
    
    const riskRow = document.createElement('div');
    riskRow.className = 'modal-detail-row';
    const riskLabel = document.createElement('span');
    riskLabel.className = 'modal-label';
    riskLabel.textContent = 'Risk Level';
    const riskBadge = document.createElement('span');
    riskBadge.className = `modal-risk ${riskClass}`;
    riskBadge.textContent = riskLevel;
    riskRow.appendChild(riskLabel);
    riskRow.appendChild(riskBadge);
    
    secContent.appendChild(verdictRow);
    secContent.appendChild(riskRow);
    secSection.appendChild(secContent);
    content.appendChild(secSection);
    
    // Analysis Details Section
    const analysisSection = document.createElement('div');
    analysisSection.className = 'modal-section';
    
    const analysisTitle = document.createElement('h3');
    analysisTitle.textContent = '📊 Analysis Details';
    analysisSection.appendChild(analysisTitle);
    
    const analysisContent = document.createElement('div');
    analysisContent.className = 'modal-section-content';
    
    const timeRow = document.createElement('div');
    timeRow.className = 'modal-detail-row';
    const timeLabel = document.createElement('span');
    timeLabel.className = 'modal-label';
    timeLabel.textContent = 'Timestamp';
    const timeValue = document.createElement('span');
    timeValue.className = 'modal-value';
    timeValue.textContent = formatDateTime(log.timestamp);
    timeRow.appendChild(timeLabel);
    timeRow.appendChild(timeValue);
    
    const reasonRow = document.createElement('div');
    reasonRow.className = 'modal-detail-row';
    const reasonLabel = document.createElement('span');
    reasonLabel.className = 'modal-label';
    reasonLabel.textContent = 'Reasoning';
    const reasonValue = document.createElement('span');
    reasonValue.className = 'modal-value';
    reasonValue.textContent = log.reasoning || 'Security analysis completed';
    reasonRow.appendChild(reasonLabel);
    reasonRow.appendChild(reasonValue);
    
    analysisContent.appendChild(timeRow);
    analysisContent.appendChild(reasonRow);
    analysisSection.appendChild(analysisContent);
    content.appendChild(analysisSection);
    
    modal.classList.add('active');
}

// Close modal
function closeDetailModal() {
    const modal = document.getElementById('detailModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Clear all logs
function clearAllLogs() {
    if (!confirm('Clear all logs? This cannot be undone.')) return;
    
    browser.storage.local.set({ logs: [] }, () => {
        allLogs = [];
        loadLogs();
    });
}

// Export logs
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
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function extractDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return url.split('/')[2] || url.substring(0, 30);
    }
}

// score is the safety percentage from backend (0-100, 100=safe)
// riskScore is display value (100 - score)
function getRiskLevel(safetyScore) {
    const riskScore = 100 - safetyScore;
    if (riskScore >= 90) return 'CRITICAL';
    if (riskScore >= 70) return 'HIGH';
    if (riskScore >= 50) return 'MEDIUM';
    if (riskScore >= 30) return 'LOW-MEDIUM';
    return 'LOW';
}

function getScoreColor(safetyScore) {
    const riskScore = 100 - safetyScore;
    if (riskScore >= 90) return '#ef4444';  // CRITICAL - red
    if (riskScore >= 70) return '#f97316';  // HIGH - orange
    if (riskScore >= 50) return '#eab308';  // MEDIUM - yellow
    if (riskScore >= 30) return '#a3e635';  // LOW-MEDIUM - lime
    return '#22c55e';  // LOW - green
    return '#10b981';
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
