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
        
        // Set risk level
        const riskLevel = document.getElementById('riskLevel');
        if (riskLevel) {
            riskLevel.textContent = decisionData.riskLevel || 'MEDIUM';
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
        
        // Set risk indicator color
        const riskIndicator = document.getElementById('riskIndicator');
        if (riskIndicator) {
            riskIndicator.className = `risk-indicator ${(decisionData.riskLevel || 'medium').toLowerCase()}`;
        }
        
        // Display risk score bar
        const scoreBarContainer = document.getElementById('scoreBarContainer');
        const scoreValue = document.getElementById('scoreValue');
        const scoreFill = document.getElementById('scoreFill');
        if (scoreBarContainer && scoreValue && scoreFill) {
            scoreBarContainer.classList.remove('hidden');
            // Add risk level class using classList (doesn't remove other classes)
            scoreBarContainer.classList.add(`risk-level-${(decisionData.riskLevel || 'medium').toLowerCase()}`);
            // Display the actual risk score percentage (100 - backend score)
            scoreValue.textContent = `${Math.round(decisionData.riskScore)}%`;
            scoreFill.style.width = `${Math.min(decisionData.riskScore, 100)}%`;
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
        
        debugLog('Warning display complete');
        
        // Log the decision
        try {
            await chrome.runtime.sendMessage({
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

// ========== FIREFOX FIX: PROPER GO BACK HANDLER ==========
function handleGoBack(e) {
    if (e) e.preventDefault();
    debugLog('🔙 Go Back clicked - sending to background');
    
    // Simply send message to background.js to handle navigation
    chrome.runtime.sendMessage(
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
        chrome.runtime.sendMessage({
            action: 'PROCEED_WITH_URL',
            url: decisionData.url
        });
    } catch (error) {
        console.error('[GuardianLink Warning] Proceed error:', error);
        window.location.href = decisionData.url;
    }
}

console.log('[GuardianLink Warning] Script loaded successfully');
