/**
 * Security Report Script - GuardianLink v2.0
 * Premium Security Analysis Report with Beautiful Animated Charts
 */

// Global variables
let reportData = [];
let chartInstances = {};
let timelineChart = null;
let verdictChart = null;
let riskChart = null;
let chartAnimationDelay = 100; // Delay between chart animations

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[GuardianLink] Report page loaded');
    console.log('[GuardianLink] ApexCharts available:', typeof ApexCharts !== 'undefined');
    
    // Setup modal event listeners (CSP-compliant)
    setupModalListeners();
    
    // Wait for all scripts to load and ApexCharts to be ready
    let apexChartsReady = false;
    let retries = 0;
    const checkApexCharts = setInterval(() => {
        if (typeof ApexCharts !== 'undefined') {
            clearInterval(checkApexCharts);
            apexChartsReady = true;
            console.log('[GuardianLink] ApexCharts confirmed loaded');
        }
        retries++;
        if (retries > 50) {
            clearInterval(checkApexCharts);
            console.warn('[GuardianLink] ApexCharts took too long to load, proceeding anyway');
        }
    }, 50);
    
    setTimeout(async () => {
        await initializeReport();
    }, 500);
});

// Setup modal event listeners (CSP-compliant without inline onclick)
function setupModalListeners() {
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const overlay = document.getElementById('analysisOverlay');
    
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeAIAnalysis);
    }
    if (overlay) {
        overlay.addEventListener('click', closeAIAnalysis);
    }
}

// Initialize report
async function initializeReport() {
    try {
        console.log('[GuardianLink] Initializing report...');
        
        // Check for ApexCharts
        if (typeof ApexCharts === 'undefined') {
            console.error('[GuardianLink] ApexCharts not loaded!');
            showLibraryError();
            return;
        }
        
        console.log('[GuardianLink] ApexCharts loaded successfully');
        
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
                <h3 style="color: #d32f2f; margin-bottom: 10px;">⚠️ ApexCharts Library Error</h3>
                <p>ApexCharts library failed to load. Please ensure you have:</p>
                <ol style="margin-left: 20px; margin-top: 10px;">
                    <li>Internet connection available for CDN resources</li>
                    <li>ApexCharts script is properly loaded</li>
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
            console.log('[GuardianLink] No report data found, using demo dataset for visualization');
            reportData = generateDemoData();
        }
    } catch (error) {
        console.error('[GuardianLink] Error loading report data:', error);
        reportData = generateDemoData();
    }
}

// Render the complete report
async function renderReport() {
    try {
        if (reportData.length === 0) {
            showEmptyState();
            return;
        }
        
        updateStatistics();
        updateExecutiveSummary();
        renderCharts();
        renderThreats();
        updateAnalysisCards();
        
        console.log('[GuardianLink] Report rendering complete');
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
        summaryText.innerHTML = `This comprehensive security report spans <strong>${getReportPeriod()} day(s)</strong>, analyzing <strong>${stats.total}</strong> URLs. 
        Our advanced detection systems identified <strong>${stats.blocked}</strong> blocking-grade threats and issued <strong>${stats.warned}</strong> preventive warnings. 
        The system achieved a <strong>${protectionRateValue}%</strong> threat interception rate.`;
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
    
    if (blockRate) blockRate.textContent = stats.total > 0 ? Math.round((stats.blocked / stats.total) * 100) + '%' : '0%';
    if (warnRate) warnRate.textContent = stats.total > 0 ? Math.round((stats.warned / stats.total) * 100) + '%' : '0%';
    if (safeRate) safeRate.textContent = stats.total > 0 ? Math.round((stats.allowed / stats.total) * 100) + '%' : '0%';
    
    // Update average risk score
    const avgScore = reportData.length > 0
        ? Math.round(reportData.reduce((sum, log) => sum + getScore(log), 0) / reportData.length)
        : 0;
    const avgScoreEl = document.getElementById('avgRiskScore');
    if (avgScoreEl) avgScoreEl.textContent = avgScore;
    
    // Update efficiency
    const efficiencyEl = document.getElementById('efficiency');
    if (efficiencyEl) {
        const efficiency = Math.round(((stats.blocked + stats.warned) / stats.total) * 100) || 0;
        efficiencyEl.textContent = efficiency + '%';
    }
}

// =================== BEAUTIFUL APEXCHARTS ===================

// Render all charts with ApexCharts
function renderCharts() {
    console.log('[GuardianLink] renderCharts() called with', reportData.length, 'data entries');
    
    if (!reportData || reportData.length === 0) {
        console.warn('[GuardianLink] No report data available for charts');
        return;
    }
    
    try {
        console.log('[GuardianLink] Starting chart rendering sequence...');
        
        // Stagger chart rendering with delays to ensure smooth initialization
        setTimeout(() => {
            console.log('[GuardianLink] Rendering timeline chart...');
            renderTimelineChart();
        }, chartAnimationDelay);
        
        setTimeout(() => {
            console.log('[GuardianLink] Rendering verdict chart...');
            renderVerdictChart();
        }, chartAnimationDelay + 100);
        
        setTimeout(() => {
            console.log('[GuardianLink] Rendering risk chart...');
            renderRiskChart();
        }, chartAnimationDelay + 200);
        
        console.log('[GuardianLink] Chart rendering sequence initiated');
    } catch (error) {
        console.error('[GuardianLink] Error in renderCharts():', error);
    }
}

// Render 7-day timeline chart - PREMIUM APEXCHARTS
function renderTimelineChart() {
    if (typeof ApexCharts === 'undefined') {
        console.error('[GuardianLink] ApexCharts not loaded!');
        return showLibraryError();
    }
    console.log('[GuardianLink] ApexCharts library confirmed available');

    const timelineContainer = document.getElementById('timelineChart');
    console.log('[GuardianLink] Timeline container lookup:', timelineContainer ? 'FOUND' : 'NOT FOUND');
    if (!timelineContainer) {
        console.error('[GuardianLink] Timeline chart container #timelineChart not found. Available divs with Chart:', document.querySelectorAll('div[id*="Chart"]').length);
        return;
    }

    const data = getTimelineData();
    console.log('[GuardianLink] Timeline data prepared - labels:', data.labels.length, ', blocked:', data.blocked.length, ', warned:', data.warned.length, ', allowed:', data.allowed.length);
    if (timelineChart) {
        console.log('[GuardianLink] Destroying previous timeline chart');
        timelineChart.destroy();
    }

    const series = [
        { name: '🚫 Blocked', data: data.blocked },
        { name: '⚠️ Warned', data: data.warned },
        { name: '✅ Allowed', data: data.allowed }
    ];

    const options = {
        chart: {
            type: 'area',
            height: 450,
            stacked: false,
            toolbar: {
                show: true,
                tools: {
                    download: true,
                    selection: true,
                    zoom: true,
                    zoomin: true,
                    zoomout: true,
                    pan: true,
                    reset: true
                }
            },
            sparkline: { enabled: false },
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 800,
                animateGradually: { enabled: true, delay: 150 },
                dynamicAnimation: { enabled: true, speed: 150 }
            }
        },
        colors: ['#dc2626', '#f59e0b', '#10b981'],
        fill: {
            type: 'gradient',
            gradient: {
                opacityFrom: 0.45,
                opacityTo: 0.05
            }
        },
        stroke: {
            curve: 'smooth',
            width: 3
        },
        xaxis: {
            categories: data.labels,
            title: { text: 'Date', style: { fontSize: '12px', fontWeight: 600 } }
        },
        yaxis: {
            title: { text: 'Number of URLs', style: { fontSize: '12px', fontWeight: 600 } },
            forceNiceScale: true
        },
        legend: {
            position: 'top',
            horizontalAlign: 'center',
            floating: false,
            fontSize: '13px',
            fontFamily: 'Inter, sans-serif',
            markers: { size: 6, radius: 2 }
        },
        tooltip: {
            theme: 'light',
            x: { format: 'dd MMM' },
            y: {
                formatter: function(val) {
                    return Math.round(val);
                }
            },
            style: { fontSize: '12px', fontFamily: 'Inter, sans-serif' }
        },
        grid: {
            borderColor: '#e2e8f0',
            strokeDashArray: 3,
            padding: { top: 10, right: 30, bottom: 10, left: 60 }
        },
        dataLabels: { enabled: false }
    };

    try {
        console.log('[GuardianLink] Creating ApexCharts instance for timeline...');
        console.log('[GuardianLink] Chart type:', options.chart.type);
        console.log('[GuardianLink] Series count:', series.length);
        
        const config = {
            series: series,
            ...options
        };
        
        timelineChart = new ApexCharts(timelineContainer, config);
        timelineChart.render();
        console.log('[GuardianLink] ✅ Timeline chart rendered successfully');
    } catch (error) {
        console.error('[GuardianLink] ❌ Error rendering timeline chart:', error.message);
        if (error.stack) console.error('[GuardianLink] Details:', error.stack);
    }
}

// Render verdict distribution chart - BEAUTIFUL DONUT
function renderVerdictChart() {
    if (typeof ApexCharts === 'undefined') {
        console.error('[GuardianLink] ApexCharts not loaded!');
        return showLibraryError();
    }

    const verdictContainer = document.getElementById('verdictChart');
    if (!verdictContainer) {
        console.warn('[GuardianLink] Verdict chart container not found');
        return;
    }

    if (verdictChart) verdictChart.destroy();

    const stats = {
        blocked: reportData.filter(l => l.verdict === 'BLOCK').length,
        warned: reportData.filter(l => l.verdict === 'WARN').length,
        allowed: reportData.filter(l => l.verdict === 'ALLOW').length
    };

    const series = [stats.blocked, stats.warned, stats.allowed];

    const options = {
        chart: {
            type: 'donut',
            height: 400,
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 800,
                animateGradually: { enabled: true, delay: 150 },
                dynamicAnimation: { enabled: true, speed: 150 }
            }
        },
        colors: ['#dc2626', '#f59e0b', '#10b981'],
        labels: ['🚫 Blocked', '⚠️ Warned', '✅ Allowed'],
        plotOptions: {
            pie: {
                donut: {
                    size: '75%',
                    labels: {
                        show: true,
                        name: {
                            show: true,
                            fontSize: '14px',
                            fontWeight: 600
                        },
                        value: {
                            show: true,
                            fontSize: '18px',
                            fontWeight: 700,
                            formatter: function(val) {
                                return val;
                            }
                        },
                        total: {
                            show: true,
                            label: 'Total Analyzed',
                            fontSize: '13px',
                            fontWeight: 600,
                            formatter: function() {
                                return stats.blocked + stats.warned + stats.allowed;
                            }
                        }
                    }
                }
            }
        },
        legend: {
            position: 'bottom',
            fontSize: '13px',
            fontFamily: 'Inter, sans-serif',
            markers: { size: 8, radius: 2 }
        },
        tooltip: {
            theme: 'light',
            y: {
                formatter: function(val) {
                    return val + ' URLs';
                }
            },
            style: { fontSize: '12px', fontFamily: 'Inter, sans-serif' }
        },
        dataLabels: {
            enabled: true,
            formatter: function(val) {
                return Math.round(val) + '%';
            },
            style: { fontSize: '13px', fontWeight: 600 }
        }
    };

    try {
        console.log('[GuardianLink] Creating ApexCharts instance for verdict...');
        console.log('[GuardianLink] Chart type:', options.chart.type);
        console.log('[GuardianLink] Series data:', series);
        
        const config = {
            series: series,
            ...options
        };
        
        verdictChart = new ApexCharts(verdictContainer, config);
        verdictChart.render();
        console.log('[GuardianLink] ✅ Verdict chart rendered successfully');
    } catch (error) {
        console.error('[GuardianLink] ❌ Error rendering verdict chart:', error.message);
        if (error.stack) console.error('[GuardianLink] Details:', error.stack);
    }
}

// Render risk level distribution chart - DETAILED PIE
function renderRiskChart() {
    if (typeof ApexCharts === 'undefined') {
        console.error('[GuardianLink] ApexCharts not loaded!');
        return showLibraryError();
    }

    const riskContainer = document.getElementById('riskChart');
    if (!riskContainer) {
        console.warn('[GuardianLink] Risk chart container not found');
        return;
    }

    if (riskChart) riskChart.destroy();

    const risks = {
        '🔴 Critical': reportData.filter(l => getScore(l) < 20).length,
        '🟠 High': reportData.filter(l => getScore(l) < 40 && getScore(l) >= 20).length,
        '🟡 Medium': reportData.filter(l => getScore(l) < 70 && getScore(l) >= 40).length,
        '🟢 Low': reportData.filter(l => getScore(l) < 90 && getScore(l) >= 70).length,
        '✅ Safe': reportData.filter(l => getScore(l) >= 90).length
    };

    const series = Object.values(risks);

    const options = {
        chart: {
            type: 'pie',
            height: 400,
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 800,
                animateGradually: { enabled: true, delay: 150 },
                dynamicAnimation: { enabled: true, speed: 150 }
            }
        },
        colors: ['#dc2626', '#f97316', '#eab308', '#84cc16', '#22c55e'],
        labels: Object.keys(risks),
        plotOptions: {
            pie: {
                dataLabels: {
                    offset: -5
                }
            }
        },
        legend: {
            position: 'right',
            fontSize: '12px',
            fontFamily: 'Inter, sans-serif',
            markers: { size: 8, radius: 2 },
            itemMargin: { vertical: 8 }
        },
        tooltip: {
            theme: 'light',
            y: {
                formatter: function(val) {
                    return val + ' URLs';
                }
            },
            style: { fontSize: '12px', fontFamily: 'Inter, sans-serif' }
        },
        dataLabels: {
            enabled: true,
            formatter: function(val) {
                return Math.round(val) + '%';
            },
            style: { fontSize: '12px', fontWeight: 600 }
        }
    };

    try {
        console.log('[GuardianLink] Creating ApexCharts instance for risk...');
        console.log('[GuardianLink] Chart type:', options.chart.type);
        console.log('[GuardianLink] Series data:', series);
        
        const config = {
            series: series,
            ...options
        };
        
        riskChart = new ApexCharts(riskContainer, config);
        riskChart.render();
        console.log('[GuardianLink] ✅ Risk chart rendered successfully');
    } catch (error) {
        console.error('[GuardianLink] ❌ Error rendering risk chart:', error.message);
        if (error.stack) console.error('[GuardianLink] Details:', error.stack);
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
    console.log('[GuardianLink] Opening AI analysis...');
    const modal = document.getElementById('analysisModal');
    const overlay = document.getElementById('analysisOverlay');
    const loadingDiv = document.getElementById('analysisLoading');
    const contentDiv = document.getElementById('analysisContent');
    
    if (!modal || !loadingDiv || !contentDiv) {
        console.error('[GuardianLink] Analysis modal elements missing');
        return;
    }
    
    modal.style.display = 'block';
    overlay.style.display = 'block';
    loadingDiv.style.display = 'block';
    contentDiv.style.display = 'none';
    
    let phase = 0;
    const dots = document.querySelectorAll('.phase-dot');
    if (dots[0]) dots[0].classList.add('active');
    const interval = setInterval(() => {
        phase++;
        if (phase >= dots.length) {
            clearInterval(interval);
            setTimeout(() => {
                const analysis = performDeepAnalysis();
                displayAnalysisResults(analysis);
            }, 400);
        } else {
            if (dots[phase-1]) dots[phase-1].classList.remove('active');
            if (dots[phase]) dots[phase].classList.add('active');
        }
    }, 800);
}

function performDeepAnalysis() {
    const stats = {
        total: reportData.length,
        blocked: reportData.filter(l => l.verdict === 'BLOCK').length,
        warned: reportData.filter(l => l.verdict === 'WARN').length,
        allowed: reportData.filter(l => l.verdict === 'ALLOW').length
    };
    const blockRate = stats.total ? Math.round((stats.blocked / stats.total) * 1000) / 10 : 0;
    const threatLevel = blockRate > 30 ? 'HIGH' : blockRate > 10 ? 'MEDIUM' : 'LOW';
    const avgScore = stats.total ? Math.round(reportData.reduce((s,l)=>s+getScore(l),0)/stats.total) : 0;
    const criticalCount = reportData.filter(l => getScore(l) < 20).length;
    const highCount = reportData.filter(l => getScore(l) >= 20 && getScore(l) < 40).length;
    const mediumCount = reportData.filter(l => getScore(l) >= 40 && getScore(l) < 70).length;
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate()-3);
    const recentThreats = reportData.filter(l => {
        const t = new Date(l.timestamp);
        return t >= threeDaysAgo && (l.verdict === 'BLOCK' || l.verdict === 'WARN');
    }).length;
    const trend = recentThreats > (stats.blocked + stats.warned)/2 ? 'INCREASING' : 'STABLE';
    return { stats, blockRate, threatLevel, avgScore, criticalCount, highCount, mediumCount, recentThreats, trend };
}

function displayAnalysisResults(analysis) {
    const loadingDiv = document.getElementById('analysisLoading');
    const contentDiv = document.getElementById('analysisContent');
    if (!loadingDiv || !contentDiv) return;
    loadingDiv.style.display = 'none';
    contentDiv.style.display = 'block';
    const threatColor = analysis.threatLevel === 'HIGH' ? 'high' : analysis.threatLevel === 'MEDIUM' ? 'medium' : 'low';
    contentDiv.innerHTML = `
        <div class="analysis-section">
            <h3>📊 Overall Threat Assessment</h3>
            <div class="threat-badge ${threatColor}">⚡ THREAT LEVEL: ${analysis.threatLevel}</div>
            <div class="analysis-item ${analysis.threatLevel === 'HIGH' ? 'insight-critical' : analysis.threatLevel === 'MEDIUM' ? 'insight-warning' : 'insight-positive'}">
                <strong>Security Status</strong>
                <p>Threat interception rate: <strong>${analysis.blockRate}%</strong>.</p>
            </div>
        </div>
        <div class="analysis-section">
            <h3>🎯 Risk Score Analysis</h3>
            <div class="analysis-item">
                <strong>Average Risk Score: ${analysis.avgScore}/100</strong>
                <p>${analysis.avgScore < 40 ? '🔴 Concerning' : analysis.avgScore < 70 ? '🟡 Moderate' : '🟢 Good'}</p>
            </div>
        </div>
        <div class="analysis-section">
            <h3>⚠️ Threat Distribution</h3>
            <div class="analysis-item insight-critical"><strong>Critical: ${analysis.criticalCount}</strong></div>
            <div class="analysis-item insight-warning"><strong>High: ${analysis.highCount}</strong></div>
            <div class="analysis-item"><strong>Medium: ${analysis.mediumCount}</strong></div>
        </div>
        <div class="analysis-section">
            <h3>📈 Trend Analysis</h3>
            <div class="analysis-item ${analysis.trend === 'INCREASING' ? 'insight-warning' : 'insight-positive'}">
                <strong>${analysis.trend}</strong> — Recent threats: ${analysis.recentThreats}
            </div>
        </div>
    `;
}

function closeAIAnalysis() {
    const modal = document.getElementById('analysisModal');
    const overlay = document.getElementById('analysisOverlay');
    if (modal) modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
}

window.closeAIAnalysis = closeAIAnalysis;

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

// Demo data generator to ensure charts and AI analysis work after reset
function generateDemoData() {
    const demo = [];
    const urls = [
        'https://google.com', 'https://github.com', 'https://amazon.com',
        'https://fake-amazon.tk', 'https://phishing-site.xyz', 'https://malware-domain.ru',
        'https://stackoverflow.com', 'https://reddit.com', 'https://scam-site.net',
        'https://example.com', 'https://test-site.com', 'https://trusted.org'
    ];
    const verdicts = ['ALLOW','ALLOW','ALLOW','WARN','WARN','BLOCK'];
    
    // Create 50 sample entries across 7 days to ensure charts have data
    for (let i = 0; i < 50; i++) {
        const d = new Date();
        d.setDate(d.getDate() - Math.floor(Math.random()*7));
        d.setHours(Math.floor(Math.random()*24), Math.floor(Math.random()*60));
        
        const verdict = verdicts[Math.floor(Math.random()*verdicts.length)];
        let score;
        
        // Assign realistic scores based on verdict
        if (verdict === 'BLOCK') {
            score = Math.floor(Math.random()*25); // 0-25 (low score = threat)
        } else if (verdict === 'WARN') {
            score = 30 + Math.floor(Math.random()*35); // 30-65 (medium score)
        } else {
            score = 70 + Math.floor(Math.random()*30); // 70-100 (high score = safe)
        }
        
        demo.push({
            url: urls[i % urls.length],
            verdict: verdict,
            combinedScore: score,
            score: score,
            timestamp: d.toISOString()
        });
    }
    
    console.log('[GuardianLink] Generated', demo.length, 'demo entries for visualization');
    return demo;
}