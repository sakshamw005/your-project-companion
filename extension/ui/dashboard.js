/**
 * Dashboard Script - GuardianLink v2.0
 * Enterprise-grade real-time security logging dashboard
 */

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
        const data = await chrome.storage.local.get('guardianlink_logs');
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
        logContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-secondary);">No logs found</div>';
        return;
    }
    
    logContainer.innerHTML = filteredLogs.map((log, idx) => createLogRow(log, idx)).join('');
    
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
    
    content.innerHTML = `
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
                    <span class="modal-label">Risk Score</span>
                    <div class="modal-score-bar">
                        <div class="modal-score-label">
                            <span>Risk Level</span>
                            <span class="modal-score-value">${Math.round(100 - score)}%</span>
                        </div>
                        <div class="modal-score-bar-container">
                            <div class="modal-score-fill" style="width: ${Math.min(100 - score, 100)}%; background: ${getScoreColor(score)};"></div>
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
            </div>
        </div>
    `;
    
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
    
    chrome.storage.local.set({ logs: [] }, () => {
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