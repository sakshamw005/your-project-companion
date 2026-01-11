/**
 * Warning Page Script (Interstitial) - FIXED FOR FIREFOX
 * Displays security warnings and handles user interaction
 */

const DEBUG = true;
function debugLog(...args) {
    if (DEBUG) {
        console.log('[GuardianLink Warning]', ...args);
    }
}

let decisionData = null;

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

// Get color based on VERDICT (not score)
function getColorFromVerdict(verdict) {
    switch(verdict) {
        case 'BLOCK': return '#ef4444';  // red
        case 'WARN': return '#f97316';   // orange
        case 'ALLOW': return '#22c55e';  // green
        default: return '#6b7280';       // gray for unknown
    }
}

// Get CSS class for risk indicator based on VERDICT
function getRiskIndicatorClass(verdict) {
    switch(verdict) {
        case 'BLOCK': return 'critical';
        case 'WARN': return 'high';
        case 'ALLOW': return 'low';
        default: return 'medium';
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    debugLog('DOM Content Loaded');
    initWarning();
});

async function initWarning() {
    debugLog('Initializing warning page...');
    
    // Setup event listeners FIRST
    setupEventListeners();
    debugLog('Setting up event listeners...');
    
    // Then fetch decision data
    await fetchDecisionData();
    
    // Display the warning
    await displayWarning();
}

function setupEventListeners() {
    const goBackBtn = document.getElementById('goBackBtn');
    const proceedBtn = document.getElementById('proceedBtn');
    
    debugLog('Go Back button element:', goBackBtn);
    debugLog('Proceed button element:', proceedBtn);
    
    if (goBackBtn) {
        goBackBtn.addEventListener('click', handleGoBack);
        debugLog('✅ Go Back listener attached');
    }
    
    if (proceedBtn) {
        proceedBtn.addEventListener('click', handleProceed);
        debugLog('✅ Proceed listener attached');
    }
}

async function fetchDecisionData() {
    debugLog('Fetching decision data...');
    
    try {
        debugLog('Attempting to retrieve decision data...');
        
        // Try sessionStorage first (from background.js redirect)
        const sessionData = sessionStorage.getItem('guardianlink_decision');
        if (sessionData) {
            decisionData = JSON.parse(sessionData);
            // Calculate risk score and risk level from safety score
            decisionData.riskScore = 100 - (decisionData.score || 0);
            decisionData.riskLevel = calculateRiskLevel(decisionData.score || 0);
            debugLog('✅ Found decision in session storage:', decisionData);
            debugLog(`Score: ${decisionData.score}, Risk Score: ${decisionData.riskScore}, Risk Level: ${decisionData.riskLevel}`);
            return;
        }
        
        // Try URL parameters as fallback
        const params = new URLSearchParams(window.location.search);
        const url = decodeURIComponent(params.get('url') || '');
        const verdict = params.get('verdict') || 'WARN';
        
        // Get score parameter - be explicit about checking for valid number
        const scoreParam = params.get('score');
        let safetyScore = null;
        
        if (scoreParam !== null && scoreParam !== undefined && scoreParam !== '') {
            const parsedScore = parseInt(scoreParam);
            if (!isNaN(parsedScore) && parsedScore >= 0 && parsedScore <= 100) {
                safetyScore = parsedScore;
                debugLog(`✅ Using score from parameter: ${safetyScore}`);
            } else {
                debugLog(`⚠️ Invalid score parameter: ${scoreParam}, using null`);
                safetyScore = null;
            }
        }
        
        // ✅ KEY FIX: Always provide a valid safety score (never null/undefined)
        const finalSafetyScore = safetyScore !== null ? safetyScore : 
            (verdict === 'BLOCK' ? 20 : (verdict === 'WARN' ? 50 : 95));
        
        if (url) {
            decisionData = {
                url,
                verdict,
                score: finalSafetyScore,  // Safety score from backend (0-100, 100=safe)
                riskScore: 100 - finalSafetyScore,  // What we display (100 - safety)
                riskLevel: calculateRiskLevel(finalSafetyScore),  // Calculate from safety score
                reasoning: 'Security analysis completed',
                timestamp: new Date().toISOString()
            };
            debugLog('✅ Created decision from URL parameters:', decisionData);
            debugLog(`Score: ${decisionData.score}, Risk Score: ${decisionData.riskScore}, Risk Level: ${decisionData.riskLevel}`);
            return;
        }
        
        // Default fallback
        const defaultSafetyScore = verdict === 'BLOCK' ? 20 : (verdict === 'WARN' ? 50 : 95);
        decisionData = {
            url: 'unknown',
            verdict: verdict,
            score: defaultSafetyScore,
            riskScore: 100 - defaultSafetyScore,
            riskLevel: calculateRiskLevel(defaultSafetyScore),
            reasoning: 'Security analysis completed',
            timestamp: new Date().toISOString()
        };
        debugLog('⚠️ Using default decision data:', decisionData);
        debugLog(`Score: ${decisionData.score}, Risk Score: ${decisionData.riskScore}, Risk Level: ${decisionData.riskLevel}`);
        
    } catch (error) {
        console.error('[GuardianLink Warning] Error fetching decision:', error);
        const defaultSafetyScore = 50;
        decisionData = {
            url: 'unknown',
            verdict: 'WARN',
            score: defaultSafetyScore,
            riskScore: 100 - defaultSafetyScore,
            riskLevel: calculateRiskLevel(defaultSafetyScore),
            reasoning: 'Error retrieving decision data',
            timestamp: new Date().toISOString()
        };
    }
}

async function displayWarning() {
    try {
        debugLog('Decision data retrieved:', decisionData);
        
        const isLocalhost = decisionData.url.includes('localhost');
        debugLog('🏠 Is localhost:', isLocalhost);
        
        // Set URL details
        const urlDetail = document.getElementById('urlDetail');
        if (urlDetail) {
            urlDetail.textContent = decisionData.url;
            debugLog('Set URL detail:', decisionData.url);
        }
        
        // Set domain
        const domainDetail = document.getElementById('domainDetail');
        if (domainDetail) {
            try {
                const domain = new URL(decisionData.url).hostname;
                domainDetail.textContent = domain;
            } catch {
                domainDetail.textContent = decisionData.url;
            }
            debugLog('Set domain detail:', domainDetail.textContent);
        }
        
        // Set risk level (text only)
        const riskLevel = document.getElementById('riskLevel');
        if (riskLevel) {
            // Show the actual score from backend + risk level text
            const scoreText = `${decisionData.score}/100`;
            const riskText = decisionData.riskLevel || 'MEDIUM';
            riskLevel.textContent = `${scoreText} (${riskText})`;
        }
        
        // Set risk description based on verdict
        const riskDescription = document.getElementById('riskDescription');
        if (riskDescription) {
            if (decisionData.verdict === 'BLOCK') {
                riskDescription.textContent = 'This site has been blocked due to critical security threats.';
            } else if (decisionData.verdict === 'WARN') {
                riskDescription.textContent = 'This site shows suspicious characteristics. Proceed with caution.';
            } else {
                riskDescription.textContent = 'This site appears safe to visit.';
            }
        }
        
        // Set risk indicator color based on VERDICT
        const riskIndicator = document.getElementById('riskIndicator');
        if (riskIndicator) {
            const indicatorClass = getRiskIndicatorClass(decisionData.verdict);
            riskIndicator.className = `risk-indicator ${indicatorClass}`;
            
            // Also update the icon based on verdict
            const riskIcon = riskIndicator.querySelector('.risk-icon');
            if (riskIcon) {
                if (decisionData.verdict === 'BLOCK') {
                    riskIcon.textContent = '🚫';
                } else if (decisionData.verdict === 'WARN') {
                    riskIcon.textContent = '⚠️';
                } else {
                    riskIcon.textContent = '🔒';
                }
            }
        }
        
        // Display risk score bar
        const scoreBarContainer = document.getElementById('scoreBarContainer');
        const scoreValue = document.getElementById('scoreValue');
        const scoreFill = document.getElementById('scoreFill');
        if (scoreBarContainer && scoreValue && scoreFill) {
            scoreBarContainer.classList.remove('hidden');
            
            // Display the risk score (100 - safety score)
            const riskScore = decisionData.riskScore || (100 - decisionData.score);
            scoreValue.textContent = `${Math.round(riskScore)}%`;
            scoreFill.style.width = `${Math.min(riskScore, 100)}%`;
            
            // Set color based on VERDICT
            const color = getColorFromVerdict(decisionData.verdict);
            scoreFill.style.background = `linear-gradient(90deg, ${color} 0%, ${adjustColorBrightness(color, -20)} 100%)`;
            scoreFill.style.boxShadow = `0 0 10px ${color}40`;
        }
        
        // Show/hide proceed button based on verdict
        const proceedBtn = document.getElementById('proceedBtn');
        if (proceedBtn) {
            if (decisionData.verdict === 'BLOCK') {
                proceedBtn.classList.add('hidden');
            } else {
                proceedBtn.classList.remove('hidden');
            }
        }
        
        // Show warning message for WARN verdict
        const warningMessage = document.getElementById('warningMessage');
        if (warningMessage) {
            if (decisionData.verdict === 'WARN') {
                warningMessage.classList.remove('hidden');
                warningMessage.textContent = `Warning: This site scored ${decisionData.score}/100 on our security check. Proceed with caution.`;
            } else if (decisionData.verdict === 'BLOCK') {
                warningMessage.classList.remove('hidden');
                warningMessage.textContent = `Blocked: This site scored ${decisionData.score}/100 and has been blocked for your safety.`;
            }
        }
        
        // Show critical message for BLOCK verdict
        const criticalMessage = document.getElementById('criticalMessage');
        if (criticalMessage) {
            if (decisionData.verdict === 'BLOCK') {
                criticalMessage.classList.remove('hidden');
            } else {
                criticalMessage.classList.add('hidden');
            }
        }
        
        debugLog('Warning display complete');
        
        // Log the decision
        try {
            await browser.runtime.sendMessage({
                action: 'logDecision',
                decision: decisionData
            });
            debugLog('✅ Decision logged');
        } catch (error) {
            debugLog('⚠️ Could not log decision:', error.message);
        }
        
    } catch (error) {
        console.error('[GuardianLink Warning] Display error:', error);
    }
}

// Helper function to adjust color brightness
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

// ========== FIREFOX FIX: PROPER GO BACK HANDLER ==========
function handleGoBack(e) {
    if (e) e.preventDefault();
    debugLog('🔙 Go Back clicked - sending to background');
    
    // Simply send message to background.js to handle navigation
    browser.runtime.sendMessage(
        { action: 'GO_BACK' },
        (response) => {
            if (response && response.success) {
                debugLog('✅ Background handled go back successfully');
            } else {
                debugLog('❌ Background did not handle go back');
                // If background fails, try history.back as fallback
                setTimeout(() => {
                    window.history.back();
                }, 500);
            }
        }
    );
}

function handleProceed(e) {
    if (e) e.preventDefault();
    debugLog('Proceeding to URL:', decisionData.url);
    
    try {
        browser.runtime.sendMessage({
            action: 'PROCEED_WITH_URL',
            url: decisionData.url
        });
    } catch (error) {
        console.error('[GuardianLink Warning] Proceed error:', error);
        window.location.href = decisionData.url;
    }
}

console.log('[GuardianLink Warning] Script loaded successfully');