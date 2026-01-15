/**
 * Security Report Script - GuardianLink v2.0
 * Premium Security Analysis Report with Beautiful Animated Charts
 */

// Global variables
let reportData = [];
let chartInstances = {};
let chartAnimationDelay = 100; // Delay between chart animations

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[GuardianLink] Report page loaded');
    
    // Wait a bit for all scripts to load
    setTimeout(async () => {
        await initializeReport();
    }, 300);
});

// Initialize report
async function initializeReport() {
    try {
        console.log('[GuardianLink] Initializing report...');
        
        // Check for Chart.js
        if (typeof Chart === 'undefined') {
            console.error('[GuardianLink] Chart.js not loaded!');
            showLibraryError();
            return;
        }
        
        console.log('[GuardianLink] Chart.js version:', Chart.version);
        
        // Setup event listeners
        setupEventListeners();
        
        // Load and render data
        await loadReportData();
        await renderReport();
        
        console.log('[GuardianLink] Report initialized successfully');
    } catch (error) {
        console.error('[GuardianLink] Initialization error:', error);
        showError('Failed to load report. Please refresh the page.');
    }
}

// Show library error
function showLibraryError() {
    const summaryText = document.getElementById('summaryText');
    if (summaryText) {
        summaryText.innerHTML = `
            <div style="background: #fee; border: 2px solid #f66; padding: 20px; border-radius: 8px;">
                <h3 style="color: #d32f2f; margin-bottom: 10px;">⚠️ Chart Library Error</h3>
                <p>Chart.js library failed to load. Please ensure you have:</p>
                <ol style="margin-left: 20px; margin-top: 10px;">
                    <li>Added Chart.min.js to extension/lib/ folder</li>
                    <li>Updated manifest.json to allow loading local libraries</li>
                    <li>Restarted the extension</li>
                </ol>
            </div>
        `;
    }
}

// Show general error
function showError(message) {
    const execSummary = document.querySelector('.executive-summary');
    if (execSummary) {
        execSummary.innerHTML = `
            <div style="background: #ffebee; border: 2px solid #f44336; padding: 30px; border-radius: 8px; text-align: center;">
                <h2 style="color: #d32f2f; margin-bottom: 15px;">❌ Error Loading Report</h2>
                <p style="color: #666; margin-bottom: 20px;">${message}</p>
                <button onclick="location.reload()" style="background: #2196f3; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
                    🔄 Refresh Page
                </button>
            </div>
        `;
    }
}

// Setup event listeners
function setupEventListeners() {
    const downloadBtn = document.getElementById('downloadBtn');
    const printBtn = document.getElementById('printBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    if (downloadBtn) {
        downloadBtn.addEventListener('click', exportToPDF);
        console.log('[GuardianLink] Download button listener added');
    }
    
    if (printBtn) {
        printBtn.addEventListener('click', () => window.print());
    }
    
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', showAIAnalysis);
    }
}

// Load report data from storage
async function loadReportData() {
    try {
        console.log('[GuardianLink] Loading report data...');
        
        // Try to get report key from URL first
        const params = new URLSearchParams(window.location.search);
        const reportKey = params.get('reportKey');
        
        if (reportKey) {
            // Load from temporary storage
            const tempData = await browser.storage.local.get(reportKey);
            reportData = (tempData[reportKey] || []).sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime();
                const timeB = new Date(b.timestamp || 0).getTime();
                return timeB - timeA;
            });
            await browser.storage.local.remove(reportKey);
            console.log(`[GuardianLink] Loaded ${reportData.length} entries from temp storage`);
        } else {
            // Load from main storage
            const data = await browser.storage.local.get('guardianlink_logs');
            reportData = (data.guardianlink_logs || []).sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime();
                const timeB = new Date(b.timestamp || 0).getTime();
                return timeB - timeA;
            });
            console.log(`[GuardianLink] Loaded ${reportData.length} entries from main storage`);
        }
        
        if (reportData.length === 0) {
            console.log('[GuardianLink] No report data found');
        }
    } catch (error) {
        console.error('[GuardianLink] Error loading report data:', error);
        reportData = [];
    }
}

// Render the complete report
async function renderReport() {
    try {
        console.log('[GuardianLink] Rendering report with', reportData.length, 'entries');
        
        // Set report date
        const now = new Date();
        const dateEl = document.getElementById('reportDate');
        const periodEl = document.getElementById('reportPeriod');
        
        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        if (periodEl) {
            periodEl.textContent = reportData.length > 0 
                ? `${getReportPeriod()} Days` 
                : 'Last 30 Days';
        }
        
        if (reportData.length === 0) {
            console.log('[GuardianLink] No data, showing empty state');
            showEmptyState();
            return;
        }
        
        // Update all sections
        updateExecutiveSummary();
        updateStatistics();
        
        // Render charts with animation delays
        setTimeout(() => renderTimelineChart(), chartAnimationDelay * 0);
        setTimeout(() => renderVerdictChart(), chartAnimationDelay * 1);
        setTimeout(() => renderRiskChart(), chartAnimationDelay * 2);
        
        // Update other sections
        updateAnalysisCards();
        renderThreats();
        
        console.log('[GuardianLink] Report rendered successfully');
    } catch (error) {
        console.error('[GuardianLink] Error rendering report:', error);
    }
}

// Get report period based on data
function getReportPeriod() {
    if (reportData.length === 0) return 30;
    
    const dates = reportData.map(log => new Date(log.timestamp));
    const oldest = Math.min(...dates);
    const newest = Math.max(...dates);
    const diffDays = Math.ceil((newest - oldest) / (1000 * 60 * 60 * 24));
    
    return diffDays || 1;
}

// Update executive summary
function updateExecutiveSummary() {
    const analysisCount = document.getElementById('analysisCount');
    const threatCount = document.getElementById('threatCount');
    const protectionRate = document.getElementById('protectionRate');
    const summaryText = document.getElementById('summaryText');
    
    if (!analysisCount || !threatCount || !protectionRate) return;
    
    const stats = {
        total: reportData.length,
        blocked: reportData.filter(l => l.verdict === 'BLOCK').length,
        warned: reportData.filter(l => l.verdict === 'WARN').length,
        allowed: reportData.filter(l => l.verdict === 'ALLOW').length
    };
    
    const protectionRateValue = stats.total > 0 
        ? Math.round((stats.blocked / stats.total) * 100) 
        : 0;
    
    // Animate counters
    animateCounter(analysisCount, stats.total, 1500, 'scanned URLs');
    animateCounter(threatCount, stats.blocked + stats.warned, 1500, 'potential threats');
    animateCounter(protectionRate, protectionRateValue, 1500, '%');
    
    // Update summary paragraph
    if (summaryText) {
        summaryText.innerHTML = `
            This comprehensive security analysis report provides detailed insights into URL scanning activities, 
            threat detection patterns, and risk assessment metrics. The analysis covers a period of 
            <strong>${getReportPeriod()} days</strong>, identifying <strong>${stats.blocked + stats.warned} potential threats</strong> 
            and maintaining a <strong>${protectionRateValue}%</strong> protection rate across all monitored endpoints.
        `;
    }
}

// Animate counter
function animateCounter(element, target, duration, suffix = '') {
    if (!element) return;
    
    const start = 0;
    const increment = target / (duration / 16); // 60fps
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        element.textContent = suffix === '%' ? 
            `${Math.floor(current)}%` : 
            `${Math.floor(current).toLocaleString()} ${suffix}`;
    }, 16);
}

// Update statistics cards
function updateStatistics() {
    const stats = {
        total: reportData.length,
        blocked: reportData.filter(l => l.verdict === 'BLOCK').length,
        warned: reportData.filter(l => l.verdict === 'WARN').length,
        allowed: reportData.filter(l => l.verdict === 'ALLOW').length
    };
    
    // Update main metric cards with animation
    animateCounter(document.getElementById('totalScanned'), stats.total, 1000);
    animateCounter(document.getElementById('totalBlocked'), stats.blocked, 1000);
    animateCounter(document.getElementById('totalWarned'), stats.warned, 1000);
    animateCounter(document.getElementById('totalAllowed'), stats.allowed, 1000);
    
    // Update rates
    const blockRate = document.getElementById('blockRate');
    const warnRate = document.getElementById('warnRate');
    const safeRate = document.getElementById('safeRate');
    
    if (blockRate) {
        const rate = stats.total > 0 ? Math.round((stats.blocked / stats.total) * 100) : 0;
        blockRate.textContent = `${rate}% of total`;
    }
    if (warnRate) {
        const rate = stats.total > 0 ? Math.round((stats.warned / stats.total) * 100) : 0;
        warnRate.textContent = `${rate}% of total`;
    }
    if (safeRate) {
        const rate = stats.total > 0 ? Math.round((stats.allowed / stats.total) * 100) : 0;
        safeRate.textContent = `${rate}% of total`;
    }
    
    // Update average risk score
    const avgScore = reportData.length > 0
        ? Math.round(reportData.reduce((sum, log) => sum + getScore(log), 0) / reportData.length)
        : 0;
    const avgScoreEl = document.getElementById('avgRiskScore');
    if (avgScoreEl) {
        animateCounterValue(avgScoreEl, avgScore, 1500, '/100');
    }
    
    // Update efficiency
    const efficiencyEl = document.getElementById('efficiency');
    if (efficiencyEl) {
        const blockedCount = reportData.filter(l => l.verdict === 'BLOCK').length;
        const totalRisky = blockedCount + reportData.filter(l => l.verdict === 'WARN').length;
        const efficiency = totalRisky > 0 ? Math.round((blockedCount / totalRisky) * 100) : 100;
        animateCounterValue(efficiencyEl, efficiency, 1500, '%');
    }
}

// Animate counter without text
function animateCounterValue(element, target, duration, suffix = '') {
    if (!element) return;
    
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        element.textContent = suffix === '/100' ? 
            `${Math.floor(current)}${suffix}` : 
            `${Math.floor(current)}${suffix}`;
    }, 16);
}

// =================== BEAUTIFUL ANIMATED CHARTS ===================

// Render timeline chart - BEAUTIFUL ANIMATED
function renderTimelineChart() {
    const ctx = document.getElementById('timelineChart');
    if (!ctx) {
        console.warn('[GuardianLink] Timeline chart canvas not found');
        return;
    }
    
    // Get timeline data
    const timelineData = getTimelineData();
    
    // Destroy previous chart
    if (chartInstances.timeline) {
        chartInstances.timeline.destroy();
    }
    
    try {
        chartInstances.timeline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timelineData.labels,
                datasets: [
                    {
                        label: 'Blocked',
                        data: timelineData.blocked,
                        borderColor: '#dc2626',
                        backgroundColor: 'rgba(220, 38, 38, 0.15)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#dc2626',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 10,
                        pointHoverBackgroundColor: '#dc2626',
                        pointHoverBorderColor: '#ffffff',
                        pointHoverBorderWidth: 3
                    },
                    {
                        label: 'Warned',
                        data: timelineData.warned,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#f59e0b',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 10,
                        pointHoverBackgroundColor: '#f59e0b',
                        pointHoverBorderColor: '#ffffff',
                        pointHoverBorderWidth: 3
                    },
                    {
                        label: 'Allowed',
                        data: timelineData.allowed,
                        borderColor: '#059669',
                        backgroundColor: 'rgba(5, 150, 105, 0.15)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#059669',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 10,
                        pointHoverBackgroundColor: '#059669',
                        pointHoverBorderColor: '#ffffff',
                        pointHoverBorderWidth: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 2000,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#475569',
                            font: { 
                                size: 12,
                                family: "'Inter', sans-serif",
                                weight: '600'
                            },
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#f1f5f9',
                        borderColor: '#334155',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.raw} URLs`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(226, 232, 240, 0.5)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#64748b',
                            font: {
                                size: 11,
                                family: "'Inter', sans-serif"
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(226, 232, 240, 0.3)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#64748b',
                            font: {
                                size: 11,
                                family: "'Inter', sans-serif"
                            },
                            precision: 0,
                            callback: function(value) {
                                if (value % 1 === 0) {
                                    return value;
                                }
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'nearest'
                },
                elements: {
                    line: {
                        tension: 0.4
                    }
                }
            }
        });
        
        console.log('[GuardianLink] Timeline chart rendered');
    } catch (error) {
        console.error('[GuardianLink] Error creating timeline chart:', error);
    }
}

// Render verdict chart - BEAUTIFUL ANIMATED
function renderVerdictChart() {
    const ctx = document.getElementById('verdictChart');
    if (!ctx) {
        console.warn('[GuardianLink] Verdict chart canvas not found');
        return;
    }
    
    const stats = {
        blocked: reportData.filter(l => l.verdict === 'BLOCK').length,
        warned: reportData.filter(l => l.verdict === 'WARN').length,
        allowed: reportData.filter(l => l.verdict === 'ALLOW').length
    };
    
    // Destroy previous chart
    if (chartInstances.verdict) {
        chartInstances.verdict.destroy();
    }
    
    try {
        // Calculate percentages for center text
        const total = stats.blocked + stats.warned + stats.allowed;
        const safePercentage = total > 0 ? Math.round((stats.allowed / total) * 100) : 0;
        
        chartInstances.verdict = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Blocked', 'Warned', 'Allowed'],
                datasets: [{
                    data: [stats.blocked, stats.warned, stats.allowed],
                    backgroundColor: [
                        '#dc2626',   // Red for blocked
                        '#f59e0b',   // Amber for warned
                        '#059669'    // Green for allowed
                    ],
                    borderColor: [
                        '#b91c1c',
                        '#d97706',
                        '#047857'
                    ],
                    borderWidth: 2,
                    borderRadius: 8,
                    borderAlign: 'inner',
                    hoverOffset: 20,
                    spacing: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                radius: '95%',
                animation: {
                    animateScale: true,
                    animateRotate: true,
                    duration: 1800,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#475569',
                            font: { 
                                size: 12,
                                family: "'Inter', sans-serif",
                                weight: '600'
                            },
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#f1f5f9',
                        borderColor: '#334155',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            },
            plugins: [{
                id: 'centerText',
                afterDraw: (chart) => {
                    const { ctx, chartArea: { width, height } } = chart;
                    
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    // Center position
                    const x = width / 2;
                    const y = height / 2;
                    
                    // Main percentage
                    ctx.font = 'bold 24px Inter';
                    ctx.fillStyle = '#059669';
                    ctx.fillText(`${safePercentage}%`, x, y - 15);
                    
                    // Label
                    ctx.font = '12px Inter';
                    ctx.fillStyle = '#64748b';
                    ctx.fillText('Safe', x, y + 15);
                    
                    ctx.restore();
                }
            }]
        });
        
        console.log('[GuardianLink] Verdict chart rendered');
    } catch (error) {
        console.error('[GuardianLink] Error creating verdict chart:', error);
    }
}

// Render risk chart - BEAUTIFUL ANIMATED
function renderRiskChart() {
    const ctx = document.getElementById('riskChart');
    if (!ctx) {
        console.warn('[GuardianLink] Risk chart canvas not found');
        return;
    }
    
    // Categorize by risk level
    const risks = {
        'Critical': reportData.filter(l => getScore(l) < 20).length,
        'High': reportData.filter(l => getScore(l) >= 20 && getScore(l) < 40).length,
        'Medium': reportData.filter(l => getScore(l) >= 40 && getScore(l) < 70).length,
        'Low': reportData.filter(l => getScore(l) >= 70 && getScore(l) < 90).length,
        'Safe': reportData.filter(l => getScore(l) >= 90).length
    };
    
    // Destroy previous chart
    if (chartInstances.risk) {
        chartInstances.risk.destroy();
    }
    
    try {
        chartInstances.risk = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Critical', 'High', 'Medium', 'Low', 'Safe'],
                datasets: [{
                    data: [risks.Critical, risks.High, risks.Medium, risks.Low, risks.Safe],
                    backgroundColor: [
                        '#dc2626',   // Red - Critical
                        '#f97316',   // Orange - High
                        '#f59e0b',   // Yellow - Medium
                        '#22c55e',   // Green - Low
                        '#10b981'    // Emerald - Safe
                    ],
                    borderColor: [
                        '#b91c1c',
                        '#ea580c',
                        '#d97706',
                        '#16a34a',
                        '#059669'
                    ],
                    borderWidth: 2,
                    borderRadius: 6,
                    borderAlign: 'inner',
                    hoverOffset: 15,
                    spacing: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                radius: '90%',
                animation: {
                    animateScale: true,
                    animateRotate: true,
                    duration: 2200,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#475569',
                            font: { 
                                size: 11,
                                family: "'Inter', sans-serif",
                                weight: '500'
                            },
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 6
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#f1f5f9',
                        borderColor: '#334155',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
        
        console.log('[GuardianLink] Risk chart rendered');
    } catch (error) {
        console.error('[GuardianLink] Error creating risk chart:', error);
    }
}

// Get timeline data for last 7 days
function getTimelineData() {
    const days = 7;
    const labels = [];
    const blocked = [];
    const warned = [];
    const allowed = [];
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
        labels.push(dateStr);
        
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);
        
        const dayLogs = reportData.filter(log => {
            const logTime = new Date(log.timestamp);
            return logTime >= dayStart && logTime <= dayEnd;
        });
        
        blocked.push(dayLogs.filter(l => l.verdict === 'BLOCK').length);
        warned.push(dayLogs.filter(l => l.verdict === 'WARN').length);
        allowed.push(dayLogs.filter(l => l.verdict === 'ALLOW').length);
    }
    
    return { labels, blocked, warned, allowed };
}

// Render top threats
function renderThreats() {
    const container = document.getElementById('threatTable');
    if (!container) {
        console.warn('[GuardianLink] threatTable not found');
        return;
    }
    
    // Get blocked domains and count
    const blockedDomains = {};
    reportData
        .filter(l => l.verdict === 'BLOCK')
        .forEach(log => {
            const domain = extractDomain(log.url || '');
            blockedDomains[domain] = (blockedDomains[domain] || 0) + 1;
        });
    
    // Get top 5
    const topThreats = Object.entries(blockedDomains)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    console.log('[GuardianLink] Top threats:', topThreats);
    
    container.innerHTML = '';
    
    if (topThreats.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'threat-row';
        empty.style.textAlign = 'center';
        empty.style.padding = '40px';
        empty.style.color = 'var(--text-muted)';
        empty.textContent = 'No blocked domains detected during this period.';
        container.appendChild(empty);
        return;
    }
    
    topThreats.forEach(([domain, count], idx) => {
        const threatRow = document.createElement('div');
        threatRow.className = 'threat-row';
        
        // Rank
        const rankDiv = document.createElement('div');
        rankDiv.className = 'threat-rank';
        rankDiv.textContent = `#${idx + 1}`;
        
        // Details
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'threat-details';
        
        const domainTitle = document.createElement('h4');
        domainTitle.textContent = domain;
        
        const desc = document.createElement('p');
        desc.textContent = `Malicious domain blocked ${count} time${count > 1 ? 's' : ''}`;
        
        detailsDiv.appendChild(domainTitle);
        detailsDiv.appendChild(desc);
        
        // Severity
        const severityDiv = document.createElement('div');
        severityDiv.className = 'threat-severity';
        
        const severityBadge = document.createElement('span');
        severityBadge.className = 'severity-badge severity-critical';
        severityBadge.textContent = 'CRITICAL';
        
        severityDiv.appendChild(severityBadge);
        
        // Count
        const countDiv = document.createElement('div');
        countDiv.className = 'threat-count';
        countDiv.textContent = count;
        
        threatRow.appendChild(rankDiv);
        threatRow.appendChild(detailsDiv);
        threatRow.appendChild(severityDiv);
        threatRow.appendChild(countDiv);
        
        container.appendChild(threatRow);
    });
}

// Update analysis cards
function updateAnalysisCards() {
    const criticalCount = reportData.filter(l => getScore(l) < 20).length;
    const highCount = reportData.filter(l => getScore(l) >= 20 && getScore(l) < 40).length;
    const mediumCount = reportData.filter(l => getScore(l) >= 40 && getScore(l) < 70).length;
    const lowCount = reportData.filter(l => getScore(l) >= 70 && getScore(l) < 90).length;
    const safeCount = reportData.filter(l => getScore(l) >= 90).length;
    
    const criticalAnalysis = document.getElementById('criticalAnalysis');
    const moderateAnalysis = document.getElementById('moderateAnalysis');
    const lowRiskAnalysis = document.getElementById('lowRiskAnalysis');
    
    if (criticalAnalysis) {
        criticalAnalysis.innerHTML = `
            <strong>${criticalCount} high-severity threats</strong> detected requiring immediate attention. 
            These URLs exhibited malicious patterns including phishing attempts, malware distribution, 
            or credential harvesting behaviors. <em>Immediate action recommended.</em>
        `;
    }
    
    if (moderateAnalysis) {
        moderateAnalysis.innerHTML = `
            <strong>${highCount + mediumCount} medium-priority security concerns</strong> identified showing suspicious 
            characteristics. These require monitoring and may escalate without proper intervention. 
            <em>Regular review advised.</em>
        `;
    }
    
    if (lowRiskAnalysis) {
        lowRiskAnalysis.innerHTML = `
            <strong>${lowCount + safeCount} URLs</strong> passed all security checks with minimal risk indicators. 
            These represent normal browsing activity with established reputations and valid security 
            certificates. <em>Continue monitoring as part of regular security protocols.</em>
        `;
    }
}

// Export report to PDF
async function exportToPDF() {
    try {
        console.log('[GuardianLink] Starting PDF export...');
        
        const btn = document.getElementById('downloadBtn');
        const originalText = btn.textContent;
        btn.textContent = '⏳ Generating PDF...';
        btn.disabled = true;
        
        // Check if jsPDF is available
        if (typeof window.jspdf === 'undefined') {
            console.error('[GuardianLink] jsPDF not loaded');
            alert('PDF export unavailable. jsPDF library not found.');
            btn.textContent = originalText;
            btn.disabled = false;
            return;
        }
        
        // Use html2canvas if available
        if (typeof window.html2canvas !== 'undefined') {
            await exportWithHtml2Canvas();
        } else {
            await exportWithTextOnly();
        }
        
        btn.textContent = originalText;
        btn.disabled = false;
        
    } catch (error) {
        console.error('[GuardianLink] PDF export error:', error);
        const btn = document.getElementById('downloadBtn');
        if (btn) {
            btn.textContent = '📄 Export PDF Report';
            btn.disabled = false;
        }
        alert('Failed to export PDF: ' + error.message);
    }
}

// Export with html2canvas
async function exportWithHtml2Canvas() {
    const { jsPDF } = window.jspdf;
    
    // Capture the report
    const canvas = await html2canvas(document.querySelector('.report-wrapper'), {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
    });
    
    const imgData = canvas.toDataURL('image/png', 1.0);
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });
    
    const pageWidth = 210;
    const pageHeight = 297;
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    // Calculate dimensions to fit page
    const ratio = Math.min(pageWidth / imgWidth, pageHeight / imgHeight) * 0.264583;
    const finalWidth = imgWidth * ratio;
    const finalHeight = imgHeight * ratio;
    const x = (pageWidth - finalWidth) / 2;
    const y = 10;
    
    pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
    
    const filename = `guardianlink_report_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(filename);
    
    console.log('[GuardianLink] PDF exported with html2canvas');
}

// Export text-only PDF
async function exportWithTextOnly() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });
    
    const pageWidth = 210;
    let yPosition = 20;
    
    // Add title
    pdf.setFontSize(24);
    pdf.setTextColor(30, 58, 138);
    pdf.text('🛡️ GuardianLink Security Report', 20, yPosition);
    yPosition += 15;
    
    // Add date
    pdf.setFontSize(12);
    pdf.setTextColor(100, 116, 139);
    const now = new Date();
    pdf.text(`Generated on ${now.toLocaleDateString()}`, 20, yPosition);
    yPosition += 10;
    
    // Add summary
    pdf.setFontSize(18);
    pdf.setTextColor(15, 23, 42);
    pdf.text('Executive Summary', 20, yPosition);
    yPosition += 10;
    
    pdf.setFontSize(10);
    pdf.setTextColor(71, 85, 105);
    const stats = {
        total: reportData.length,
        blocked: reportData.filter(l => l.verdict === 'BLOCK').length,
        warned: reportData.filter(l => l.verdict === 'WARN').length,
        allowed: reportData.filter(l => l.verdict === 'ALLOW').length
    };
    
    const summaryText = `This report covers ${getReportPeriod()} days, analyzing ${stats.total} URLs. ` +
        `Detected ${stats.blocked} threats and issued ${stats.warned} warnings. ` +
        `Overall protection rate: ${stats.total > 0 ? Math.round((stats.blocked / stats.total) * 100) : 0}%.`;
    
    const lines = pdf.splitTextToSize(summaryText, pageWidth - 40);
    pdf.text(lines, 20, yPosition);
    yPosition += (lines.length * 5) + 15;
    
    // Save PDF
    const filename = `guardianlink_report_${now.toISOString().split('T')[0]}.pdf`;
    pdf.save(filename);
    
    console.log('[GuardianLink] Text-only PDF exported');
}

// Show AI analysis
function showAIAnalysis() {
    alert('🤖 AI Deep Analysis Feature\n\nThis premium feature will be available in GuardianLink v3.0!\n\nFeatures include:\n• Predictive threat modeling\n• Behavioral analysis patterns\n• Security trend predictions\n• Automated remediation suggestions');
}

// Show empty state
function showEmptyState() {
    const summaryText = document.getElementById('summaryText');
    if (summaryText) {
        summaryText.innerHTML = `
            <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-left: 4px solid #3b82f6; padding: 30px; border-radius: 8px;">
                <h3 style="color: #1e40af; margin-bottom: 15px;">📊 No Security Data Available</h3>
                <p style="color: #475569; margin-bottom: 20px;">
                    Start browsing with GuardianLink enabled to generate comprehensive security reports. 
                    Visit a few websites to begin collecting security analysis data.
                </p>
                <div style="background: white; padding: 15px; border-radius: 6px; border: 1px solid #dbeafe;">
                    <p style="color: #64748b; font-size: 0.9em; margin-bottom: 10px;">
                        <strong>Tip:</strong> The security dashboard tracks all your browsing activity. 
                        Just browse normally and check back later for insights.
                    </p>
                </div>
            </div>
        `;
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

function getScore(log) {
    const score = log.combinedScore !== undefined ? log.combinedScore : (log.score || 0);
    return Math.min(100, Math.max(0, score));
}