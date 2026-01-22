/**
 * Dashboard Script - GuardianLink v2.0
 * Enterprise-grade real-time security logging dashboard
 */

// Inject modal icon styles
function injectModalIconStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .modal-icon {
            display: inline-block;
            width: 46px;
            height: 46px;
            vertical-align: middle;
            margin-right: 8px;
            transform-style: preserve-3d;
            animation: modalIconSpin 6s linear infinite;
        }
        
        @keyframes modalIconSpin {
            0% {
                transform: rotateY(0deg);
            }
            100% {
                transform: rotateY(360deg);
            }
        }
    `;
    document.head.appendChild(style);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[GuardianLink] Dashboard loaded');
    injectModalIconStyles();
    setupEventListeners();
    setupFilterListener();
    await loadLogs();
    setupStorageListener();
    console.log('[GuardianLink] Dashboard initialization complete');
});

// Setup event listeners
function setupEventListeners() {
    const closeBtn = document.getElementById('closeModalBtn');
    const modal = document.getElementById('detailModal');
    const clearBtn = document.getElementById('clearBtn');
    const exportBtn = document.getElementById('exportBtn');
    const reportBtn = document.getElementById('reportBtn');
    
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
    
    if (reportBtn) {
        reportBtn.addEventListener('click', generateSecurityReport);
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

// Listen for storage changes (new logs)
function setupStorageListener() {
    browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.guardianlink_logs) {
            console.log('[GuardianLink] Storage changed - reloading logs');
            loadLogs();
        }
    });
}

// Load logs from storage
async function loadLogs() {
    try {
        const data = await browser.storage.local.get('guardianlink_logs');
        const logs = data.guardianlink_logs || [];
        
        console.log('[GuardianLink] Loaded logs:', logs.length);
        console.log('[GuardianLink] Full data:', data);
        
        if (!logs || logs.length === 0) {
            console.warn('[GuardianLink] No logs found in storage');
            allLogs = [];
        } else {
            allLogs = logs.sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime();
                const timeB = new Date(b.timestamp || 0).getTime();
                return timeB - timeA;
            });
        }
        
        console.log('[GuardianLink] Updated allLogs:', allLogs.length);
        updateUI(allLogs);
        displayLogs(allLogs);
    } catch (error) {
        console.error('[GuardianLink] Error loading logs:', error);
        console.error('[GuardianLink] Error details:', error.message, error.stack);
        allLogs = [];
        updateUI([]);
    }
}

// Update stats
function updateUI(logs) {
    const blockedCount = document.getElementById('blockedCount');
    const warnedCount = document.getElementById('warnedCount');
    const analyzedCount = document.getElementById('analyzedCount');
    
    console.log('[GuardianLink] updateUI called with logs:', logs.length);
    console.log('[GuardianLink] Elements found:', {
        blockedCount: !!blockedCount,
        warnedCount: !!warnedCount,
        analyzedCount: !!analyzedCount
    });
    
    if (!blockedCount || !warnedCount || !analyzedCount) {
        console.error('[GuardianLink] Missing stat card elements!');
        return;
    }
    
    const counts = {
        BLOCK: logs.filter(l => l.verdict === 'BLOCK').length,
        WARN: logs.filter(l => l.verdict === 'WARN').length,
        ALLOW: logs.filter(l => l.verdict === 'ALLOW').length
    };
    
    console.log('[GuardianLink] Verdict counts:', counts);
    
    const totalAnalyzed = counts.BLOCK + counts.WARN + counts.ALLOW;
    
    blockedCount.textContent = counts.BLOCK;
    warnedCount.textContent = counts.WARN;
    analyzedCount.textContent = totalAnalyzed;
    
    console.log('[GuardianLink] Stats updated - Blocked:', counts.BLOCK, 'Warned:', counts.WARN, 'Analyzed:', totalAnalyzed);
}

// Display logs in table
function displayLogs(logs) {
    const logContainer = document.getElementById('logContainer');
    if (!logContainer) return;
    
    const filteredLogs = currentFilter === 'all' 
        ? logs 
        : logs.filter(l => l.verdict === currentFilter);
    
    if (filteredLogs.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style.padding = '40px';
        emptyDiv.style.textAlign = 'center';
        emptyDiv.style.color = 'var(--text-secondary)';
        emptyDiv.textContent = 'No logs found';
        logContainer.textContent = '';
        logContainer.appendChild(emptyDiv);
        return;
    }
    
    // Clear container safely
    while (logContainer.firstChild) {
        logContainer.removeChild(logContainer.firstChild);
    }
    
    filteredLogs.forEach((log, idx) => {
        const row = createLogRowElement(log);
        logContainer.appendChild(row);
        
        // Attach click listener directly to view button
        const viewBtn = row.querySelector('.view-details-btn');
        if (viewBtn) {
            viewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showLogDetails(log);
            });
        }
    });
}

function createLogRowElement(log) {
    const verdict = log.verdict || 'UNKNOWN';
    const score = log.combinedScore !== undefined ? log.combinedScore : (log.score || 0);
    const safetyScore = Math.min(100, Math.max(0, score));
    const url = log.url || 'Unknown URL';
    const domain = extractDomain(url);
    const time = formatTime(log.timestamp);
    
    const verdictClass = `verdict-${verdict.toLowerCase()}`;
    // Pass verdict to get appropriate color
    const riskColor = getScoreColor(safetyScore, verdict);
    
    const row = document.createElement('div');
    row.className = 'log-row';
    
    // URL Cell
    const urlCell = document.createElement('div');
    urlCell.className = 'url-cell';
    urlCell.title = DOMPurify.sanitize(url);
    urlCell.textContent = DOMPurify.sanitize(domain);
    
    // Verdict Cell
    const verdictCell = document.createElement('div');
    const verdictSpan = document.createElement('span');
    verdictSpan.className = `verdict-badge ${verdictClass}`;
    verdictSpan.textContent = verdict;
    verdictCell.appendChild(verdictSpan);
    
    // Risk Score Cell (showing the actual score)
    const riskCell = document.createElement('div');
    const scoreContainer = document.createElement('div');
    scoreContainer.className = 'score-container';
    scoreContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        justify-content: center;
    `;
    
    const scoreCircle = document.createElement('div');
    scoreCircle.className = 'score-circle';
    scoreCircle.style.cssText = `
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 10px;
        background: ${riskColor};
        color: ${getContrastColor(riskColor)};
        border: 2px solid ${adjustColorBrightness(riskColor, -20)};
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;
    scoreCircle.textContent = safetyScore;
    
    const scoreText = document.createElement('span');
    scoreText.className = 'score-text';
    scoreText.style.cssText = `
        font-weight: 600;
        font-size: 11px;
        color: var(--text-primary);
    `;
    scoreText.textContent = safetyScore >= 60 ? 'Safe' : 'Risk';
    
    scoreContainer.appendChild(scoreCircle);
    scoreContainer.appendChild(scoreText);
    riskCell.appendChild(scoreContainer);
    
    // Time Cell
    const timeCell = document.createElement('div');
    timeCell.textContent = time;
    
    // Button Cell
    const btnCell = document.createElement('div');
    const viewBtn = document.createElement('button');
    viewBtn.className = 'icon-btn view-details-btn';
    viewBtn.title = 'View details';
    viewBtn.textContent = '👁️';
    btnCell.appendChild(viewBtn);
    
    // Append all cells
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
    const safetyScore = Math.min(100, Math.max(0, score));
    const url = log.url || 'Unknown URL';
    const verdictClass = verdict.toLowerCase();
    const riskColor = getScoreColor(safetyScore, verdict);
    const contrastColor = getContrastColor(riskColor);
    
    // Clear previous content safely
    content.textContent = '';
    
    // URL Details Section
    const urlSection = document.createElement('div');
    urlSection.className = 'modal-section';
    
    const urlTitle = document.createElement('h3');
    urlTitle.textContent = '🔗 URL Details';
    urlSection.appendChild(urlTitle);
    
    const urlContent = document.createElement('div');
    urlContent.className = 'modal-section-content';
    
    const urlRow = createDetailRow('Full URL', DOMPurify.sanitize(url));
    const domainRow = createDetailRow('Domain', DOMPurify.sanitize(extractDomain(url)));
    
    urlContent.appendChild(urlRow);
    urlContent.appendChild(domainRow);
    urlSection.appendChild(urlContent);
    content.appendChild(urlSection);
    
    // Security Assessment Section
    const secSection = document.createElement('div');
    secSection.className = 'modal-section';
    
    const secTitle = document.createElement('h3');
    
    // Create icon image
    const iconImg = document.createElement('img');
    iconImg.src = '../assets/icon-128-new.png';
    iconImg.alt = 'Security Assessment Icon';
    iconImg.className = 'modal-icon';
    secTitle.appendChild(iconImg);
    
    // Create text span
    const titleText = document.createElement('span');
    titleText.textContent = 'Security Assessment';
    secTitle.appendChild(titleText);
    
    secSection.appendChild(secTitle);
    
    const secContent = document.createElement('div');
    secContent.className = 'modal-section-content';
    
    // Verdict row
    const verdictRow = createDetailRow('Verdict', '');
    const verdictBadge = document.createElement('span');
    verdictBadge.className = `modal-verdict ${verdictClass}`;
    verdictBadge.textContent = verdict;
    verdictRow.lastChild.appendChild(verdictBadge);
    
    // Risk Score row with visual indicator
    const riskRow = createDetailRow('Risk Score', '');
    
    const scoreContainer = document.createElement('div');
    scoreContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    `;
    
    // Score circle
    const scoreCircle = document.createElement('div');
    scoreCircle.style.cssText = `
        width: 60px;
        height: 60px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 18px;
        background: ${riskColor};
        color: ${contrastColor};
        border: 3px solid ${adjustColorBrightness(riskColor, -30)};
        box-shadow: 0 4px 12px ${adjustColorBrightness(riskColor, -40)}40;
    `;
    scoreCircle.textContent = safetyScore;
    
    // Score gauge
    const scoreGauge = document.createElement('div');
    scoreGauge.style.cssText = `
        flex: 1;
        min-width: 200px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;
    
    const gaugeContainer = document.createElement('div');
    gaugeContainer.style.cssText = `
        height: 12px;
        background: var(--border);
        border-radius: 6px;
        overflow: hidden;
        position: relative;
    `;
    
    const gaugeFill = document.createElement('div');
    gaugeFill.style.cssText = `
        height: 100%;
        width: ${safetyScore}%;
        background: ${riskColor};
        border-radius: 6px;
        transition: width 0.5s ease;
    `;
    
    const gaugeMarks = document.createElement('div');
    gaugeMarks.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        justify-content: space-between;
        padding: 0 4px;
    `;
    
    ['0', '25', '50', '75', '100'].forEach(mark => {
        const markDiv = document.createElement('div');
        markDiv.style.cssText = `
            width: 2px;
            height: 100%;
            background: rgba(255,255,255,0.3);
            position: relative;
        `;
        
        const label = document.createElement('div');
        label.style.cssText = `
            position: absolute;
            top: 16px;
            left: -8px;
            font-size: 9px;
            color: var(--text-secondary);
            white-space: nowrap;
        `;
        label.textContent = mark;
        markDiv.appendChild(label);
        gaugeMarks.appendChild(markDiv);
    });
    
    gaugeContainer.appendChild(gaugeFill);
    gaugeContainer.appendChild(gaugeMarks);
    
    const scoreLabels = document.createElement('div');
    scoreLabels.style.cssText = `
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: var(--text-secondary);
        margin-top: 4px;
    `;
    
    const lowLabel = document.createElement('span');
    lowLabel.textContent = 'High Risk';
    const highLabel = document.createElement('span');
    highLabel.textContent = 'Safe';
    scoreLabels.appendChild(lowLabel);
    scoreLabels.appendChild(highLabel);
    
    scoreGauge.appendChild(gaugeContainer);
    scoreGauge.appendChild(scoreLabels);
    
    scoreContainer.appendChild(scoreCircle);
    scoreContainer.appendChild(scoreGauge);
    riskRow.lastChild.appendChild(scoreContainer);
    
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
    
    const timeRow = createDetailRow('Timestamp', formatDateTime(log.timestamp));
    const reasonRow = createDetailRow('Reasoning', log.reasoning || 'Security analysis completed');
    
    analysisContent.appendChild(timeRow);
    analysisContent.appendChild(reasonRow);
    analysisSection.appendChild(analysisContent);
    content.appendChild(analysisSection);
    
    modal.classList.add('active');
}

// Helper function to create detail rows
function createDetailRow(label, value) {
    const row = document.createElement('div');
    row.className = 'modal-detail-row';
    
    const labelSpan = document.createElement('span');
    labelSpan.className = 'modal-label';
    labelSpan.textContent = label;
    
    const valueSpan = document.createElement('span');
    valueSpan.className = 'modal-value';
    
    if (typeof value === 'string') {
        valueSpan.textContent = value;
    } else if (value instanceof HTMLElement) {
        valueSpan.appendChild(value);
    }
    
    row.appendChild(labelSpan);
    row.appendChild(valueSpan);
    return row;
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
    
    browser.storage.local.set({ guardianlink_logs: [] }, () => {
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

// Generate security report
async function generateSecurityReport() {
    try {
        console.log('[GuardianLink] Generating security report...');
        
        if (allLogs.length === 0) {
            alert('No logs available to generate report.');
            return;
        }
        
        // Store logs temporarily for report page
        const reportKey = `guardianlink_report_${Date.now()}`;
        await browser.storage.local.set({
            [reportKey]: allLogs
        });
        
        // Open report page (like scanner.html does)
        const reportUrl = browser.runtime.getURL('ui/report.html') + 
            '?' + new URLSearchParams({
                reportKey: reportKey
            });
        
        await browser.tabs.create({
            url: reportUrl,
            active: true
        });
        
        console.log(`[GuardianLink] Report opened with ${allLogs.length} logs`);
        
    } catch (error) {
        console.error('Error generating report:', error);
        alert('Failed to generate report. Check console for details.');
    }
}

// Utility functions
function extractDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return url.split('/')[2] || url.substring(0, 30);
    }
}

// score is the safety percentage from backend (0-100, 100=safe)
// score is the safety percentage from backend (0-100, 100=safe)
function getScoreColor(safetyScore, verdict) {
  // Safety score: 0-100 where 100=safe
  if (verdict === 'BLOCK') {
    return '#d32f2f'; // Red - consistent with decisionEngine
  } else if (verdict === 'WARN') {
    // Match decisionEngine thresholds for WARN
    if (safetyScore < 35) return '#f97316'; // Orange - LOW risk WARN (should be green per decisionEngine)
    return '#fbc02d'; // Yellow - MEDIUM risk WARN (per decisionEngine)
  } else { // ALLOW
    return '#1976d2'; // Blue - consistent with decisionEngine
  }
}

function getContrastColor(hexColor) {
    // Convert hex to RGB
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return black or white based on luminance
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

function adjustColorBrightness(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    
    return "#" + (
        0x1000000 +
        (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)
    ).toString(16).slice(1);
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

// Global variables
let allLogs = [];
let currentFilter = 'all';