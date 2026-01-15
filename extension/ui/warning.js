/**
 * Warning Page Script (Interstitial) - FIXED FOR FIREFOX
 * Displays security warnings and handles user interaction
 */

const DEBUG = true;
function debugLog(...args) {
  if (DEBUG) {
    console.log("[GuardianLink Warning]", ...args);
  }
}

let decisionData = null;

// Helper function to calculate risk level from safety score
function calculateRiskLevel(safetyScore) {
  // safetyScore is percentage (0-100 where 100=safe)
  // Convert to riskScore (100 - safetyScore)
  const riskScore = 100 - safetyScore;

  if (riskScore >= 90) return "CRITICAL";
  if (riskScore >= 70) return "HIGH";
  if (riskScore >= 50) return "MEDIUM";
  if (riskScore >= 30) return "LOW-MEDIUM";
  return "LOW";
}

// Get color based on VERDICT (not score)
function getColorFromVerdict(verdict, safetyScore) {
  // Safety score: 0-100 where 100=safe
  if (verdict === "BLOCK") {
    return "#d32f2f"; // Red - always red for BLOCK
  } else if (verdict === "WARN") {
    // Match decisionEngine thresholds for WARN
    if (safetyScore < 35) return "#388e3c"; // Green - LOW risk WARN (per decisionEngine)
    return "#fbc02d"; // Yellow - MEDIUM risk WARN (per decisionEngine)
  } else {
    // ALLOW
    return "#1976d2"; // Blue - consistent with decisionEngine
  }
}

// Get CSS class for risk indicator based on VERDICT
function getRiskIndicatorClass(verdict) {
  switch (verdict) {
    case "BLOCK":
      return "critical";
    case "WARN":
      return "high";
    case "ALLOW":
      return "low";
    default:
      return "medium";
  }
}

// Security check icons mapping
function getCheckIcon(checkName, status) {
  const icons = {
    'virusTotal': status === 'danger' ? '🦠' : '✅',
    'abuseIPDB': status === 'danger' ? '⚠️' : '✅',
    'ssl': status === 'safe' ? '🔒' : '⚠️',
    'domainAge': status === 'safe' ? '📅' : '⚠️',
    'content': status === 'safe' ? '📝' : '⚠️',
    'redirects': status === 'safe' ? '↪️' : '⚠️',
    'securityHeaders': status === 'safe' ? '🛡️' : '⚠️',
    'googleSafeBrowsing': status === 'safe' ? '🔍' : '🦠',
    'heuristics': status === 'safe' ? '🧠' : '⚠️'
  };
  
  return icons[checkName] || '🔍';
}

// Format check display name
function formatCheckName(checkName) {
  const names = {
    'virusTotal': 'VirusTotal',
    'abuseIPDB': 'AbuseIPDB',
    'ssl': 'SSL Certificate',
    'domainAge': 'Domain Age',
    'content': 'Content Analysis',
    'redirects': 'Redirect Analysis',
    'securityHeaders': 'Security Headers',
    'googleSafeBrowsing': 'Google Safe Browsing',
    'heuristics': 'Heuristic Rules'
  };
  
  return names[checkName] || checkName;
}

// Create security check card element
function createSecurityCheckCard(checkName, checkData) {
  const card = document.createElement('div');
  card.className = `check-card ${checkData.status || 'safe'}`;
  
  const header = document.createElement('div');
  header.className = 'check-header';
  
  const icon = document.createElement('div');
  icon.className = `check-icon ${checkData.status || 'safe'}`;
  icon.textContent = getCheckIcon(checkName, checkData.status);
  
  const title = document.createElement('div');
  title.className = 'check-title';
  title.textContent = formatCheckName(checkName);
  
  const score = document.createElement('div');
  score.className = `check-score ${checkData.status || 'safe'}`;
  
  if (checkData.score !== undefined && checkData.maxScore !== undefined) {
    score.textContent = `${checkData.score}/${checkData.maxScore}`;
  } else if (checkData.available === false) {
    score.textContent = 'N/A';
  } else {
    score.textContent = checkData.status || 'N/A';
  }
  
  header.appendChild(icon);
  header.appendChild(title);
  header.appendChild(score);
  
  const details = document.createElement('div');
  details.className = 'check-details';
  
  if (checkData.reason || checkData.error) {
    details.textContent = checkData.reason || checkData.error || 'No details available';
  } else if (checkData.safe !== undefined) {
    details.textContent = checkData.safe ? 'No threats detected' : 'Threats detected';
  } else {
    details.textContent = checkData.details || 'Check completed';
  }
  
  card.appendChild(header);
  card.appendChild(details);
  
  // Add findings if available
  if (checkData.findings && checkData.findings.length > 0) {
    const findingsDiv = document.createElement('div');
    findingsDiv.className = 'check-findings';
    
    checkData.findings.slice(0, 3).forEach(finding => {
      const findingItem = document.createElement('div');
      findingItem.className = 'finding-item';
      findingItem.textContent = typeof finding === 'string' ? finding : JSON.stringify(finding);
      findingsDiv.appendChild(findingItem);
    });
    
    if (checkData.findings.length > 3) {
      const moreItem = document.createElement('div');
      moreItem.className = 'finding-item';
      moreItem.textContent = `+${checkData.findings.length - 3} more findings...`;
      findingsDiv.appendChild(moreItem);
    }
    
    card.appendChild(findingsDiv);
  }
  
  return card;
}

// Create threat breakdown item
function createThreatBreakdownItem(threat, index) {
  const item = document.createElement('div');
  item.className = 'breakdown-item';
  
  const severity = document.createElement('div');
  severity.className = `breakdown-severity ${threat.severity || 'medium'}`;
  
  const text = document.createElement('div');
  text.className = 'breakdown-text';
  text.textContent = threat.reason || threat.details || 'Security threat detected';
  
  const source = document.createElement('div');
  source.className = 'breakdown-source';
  source.textContent = threat.source || 'Security Check';
  
  item.appendChild(severity);
  item.appendChild(text);
  item.appendChild(source);
  
  return item;
}

// Display security checks and threats
function displaySecurityChecks(phases) {
  const checksContainer = document.getElementById('securityChecksContainer');
  const checksGrid = document.getElementById('checksGrid');
  const breakdownContainer = document.getElementById('threatBreakdownContainer');
  const breakdownList = document.getElementById('breakdownList');
  
  if (!phases || !checksContainer || !checksGrid) return;
  
  // Clear existing content
  checksGrid.textContent = '';
  if (breakdownList) breakdownList.textContent = '';
  
  // Track all threats for breakdown
  const allThreats = [];
  
  // Display each security check
  Object.entries(phases).forEach(([checkName, checkData]) => {
    const card = createSecurityCheckCard(checkName, checkData);
    checksGrid.appendChild(card);
    
    // Collect threats for breakdown
    if (checkData.status === 'danger' || checkData.status === 'warning') {
      allThreats.push({
        source: formatCheckName(checkName),
        severity: checkData.status === 'danger' ? 'high' : 'medium',
        reason: checkData.reason || checkData.error || `${formatCheckName(checkName)} detected issues`,
        details: checkData.details
      });
    }
  });
  
  // Show security checks section
  checksContainer.classList.remove('hidden');
  
  // Show threat breakdown if there are threats
  if (breakdownContainer && breakdownList && allThreats.length > 0) {
    allThreats.forEach((threat, index) => {
      const item = createThreatBreakdownItem(threat, index);
      breakdownList.appendChild(item);
    });
    breakdownContainer.classList.remove('hidden');
  }
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", function () {
  debugLog("DOM Content Loaded");
  initWarning();
});

async function initWarning() {
  debugLog("Initializing warning page...");

  // Setup event listeners FIRST
  setupEventListeners();
  debugLog("Setting up event listeners...");

  // Then fetch decision data
  await fetchDecisionData();

  // Display the warning
  await displayWarning();
}

function setupEventListeners() {
  const goBackBtn = document.getElementById("goBackBtn");
  const proceedBtn = document.getElementById("proceedBtn");

  debugLog("Go Back button element:", goBackBtn);
  debugLog("Proceed button element:", proceedBtn);

  if (goBackBtn) {
    goBackBtn.addEventListener("click", handleGoBack);
    debugLog("✅ Go Back listener attached");
  }

  if (proceedBtn) {
    proceedBtn.addEventListener("click", handleProceed);
    debugLog("✅ Proceed listener attached");
  }
}

async function fetchDecisionData() {
  debugLog("Fetching decision data...");

  try {
    debugLog("Attempting to retrieve decision data...");

    // Try sessionStorage first (from background.js redirect)
    const sessionData = sessionStorage.getItem("guardianlink_decision");
    if (sessionData) {
      decisionData = JSON.parse(sessionData);
      
      // If we have phases, we're good
      if (decisionData.phases) {
        debugLog("✅ Found complete decision in session storage with phases");
      } else {
        // Try to fetch from backend using scanId if available
        await fetchCompleteScanDetails();
      }
      
      // Calculate risk score and risk level from safety score
      decisionData.riskScore = 100 - (decisionData.score || 0);
      decisionData.riskLevel = calculateRiskLevel(decisionData.score || 0);
      debugLog("✅ Found decision in session storage:", decisionData);
      debugLog(
        `Score: ${decisionData.score}, Risk Score: ${decisionData.riskScore}, Risk Level: ${decisionData.riskLevel}`
      );
      return;
    }

    // Try URL parameters as fallback
    const params = new URLSearchParams(window.location.search);
    const url = decodeURIComponent(params.get("url") || "");
    const verdict = params.get("verdict") || "WARN";
    const scanId = params.get("scanId") || "";

    // Get score parameter - be explicit about checking for valid number
    const scoreParam = params.get("score");
    let safetyScore = null;

    if (scoreParam !== null && scoreParam !== undefined && scoreParam !== "") {
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
    const finalSafetyScore =
      safetyScore !== null
        ? safetyScore
        : verdict === "BLOCK"
        ? 20
        : verdict === "WARN"
        ? 50
        : 95;

    if (url) {
      decisionData = {
        url,
        verdict,
        score: finalSafetyScore, // Safety score from backend (0-100, 100=safe)
        riskScore: 100 - finalSafetyScore, // What we display (100 - safety)
        riskLevel: calculateRiskLevel(finalSafetyScore), // Calculate from safety score
        reasoning: "Security analysis completed",
        timestamp: new Date().toISOString(),
        scanId: scanId // Store scanId for potential fetch
      };
      
      // If we have a scanId, try to fetch complete data
      if (scanId) {
        await fetchCompleteScanDetails();
      }
      
      debugLog("✅ Created decision from URL parameters:", decisionData);
      debugLog(
        `Score: ${decisionData.score}, Risk Score: ${decisionData.riskScore}, Risk Level: ${decisionData.riskLevel}`
      );
      return;
    }

    // Default fallback
    const defaultSafetyScore =
      verdict === "BLOCK" ? 20 : verdict === "WARN" ? 50 : 95;
    decisionData = {
      url: "unknown",
      verdict: verdict,
      score: defaultSafetyScore,
      riskScore: 100 - defaultSafetyScore,
      riskLevel: calculateRiskLevel(defaultSafetyScore),
      reasoning: "Security analysis completed",
      timestamp: new Date().toISOString(),
    };
    debugLog("⚠️ Using default decision data:", decisionData);
    debugLog(
      `Score: ${decisionData.score}, Risk Score: ${decisionData.riskScore}, Risk Level: ${decisionData.riskLevel}`
    );
  } catch (error) {
    console.error("[GuardianLink Warning] Error fetching decision:", error);
    const defaultSafetyScore = 50;
    decisionData = {
      url: "unknown",
      verdict: "WARN",
      score: defaultSafetyScore,
      riskScore: 100 - defaultSafetyScore,
      riskLevel: calculateRiskLevel(defaultSafetyScore),
      reasoning: "Error retrieving decision data",
      timestamp: new Date().toISOString(),
    };
  }
}

// ========== FETCH COMPLETE SCAN DETAILS ==========
async function fetchCompleteScanDetails() {
  if (!decisionData.scanId) {
    debugLog("No scanId available, cannot fetch details");
    return;
  }
  
  try {
    debugLog(`Fetching complete scan details for scanId: ${decisionData.scanId}`);
    
    const response = await fetch(`https://guardianlink-backend.onrender.com/api/scan/result/${decisionData.scanId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const completeData = await response.json();
    
    if (completeData.status === 'completed') {
      // Merge complete data with existing decision data
      decisionData = {
        ...decisionData,
        phases: completeData.phases,
        totalScore: completeData.totalScore,
        maxTotalScore: completeData.maxTotalScore,
        percentage: completeData.percentage,
        overallStatus: completeData.overallStatus,
        details: {
          ...decisionData.details,
          ...completeData.details
        }
      };
      
      debugLog("✅ Successfully fetched complete scan details");
    }
  } catch (error) {
    console.error("Failed to fetch complete scan details:", error);
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
    
    // Set risk level with detailed information
    const riskLevel = document.getElementById('riskLevel');
    if (riskLevel) {
      const scoreText = `${decisionData.score || 0}%`;
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
      const color = getColorFromVerdict(decisionData.verdict, decisionData.score);
      riskIndicator.style.borderColor = `${color}30`;
      riskIndicator.style.background = `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`;
      
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
      const riskScore = decisionData.riskScore || 100 - (decisionData.score || 0);
      scoreValue.textContent = `${Math.round(riskScore)}%`;
      scoreFill.style.width = `${Math.min(riskScore, 100)}%`;
      
      // Set color based on VERDICT and SCORE
      const color = getColorFromVerdict(decisionData.verdict, decisionData.score);
      scoreFill.style.background = `linear-gradient(90deg, ${color} 0%, ${adjustColorBrightness(color, -20)} 100%)`;
      scoreFill.style.boxShadow = `0 0 10px ${color}40`;
    }
    
    // Display security checks if available
    if (decisionData.phases) {
      displaySecurityChecks(decisionData.phases);
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
        warningMessage.textContent = `Warning: This site scored ${decisionData.score}% on our security check. Proceed with caution.`;
      } else if (decisionData.verdict === 'BLOCK') {
        warningMessage.classList.remove('hidden');
        warningMessage.textContent = `Blocked: This site scored ${decisionData.score}% and has been blocked for your safety.`;
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
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;

  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
}

// ========== FIREFOX FIX: PROPER GO BACK HANDLER ==========
function handleGoBack(e) {
  if (e) e.preventDefault();
  debugLog("🔙 Go Back clicked - sending to background");

  // Simply send message to background.js to handle navigation
  browser.runtime.sendMessage({ action: "GO_BACK" }, (response) => {
    if (response && response.success) {
      debugLog("✅ Background handled go back successfully");
    } else {
      debugLog("❌ Background did not handle go back");
      // If background fails, try history.back as fallback
      setTimeout(() => {
        window.history.back();
      }, 500);
    }
  });
}

function handleProceed(e) {
  if (e) e.preventDefault();
  debugLog("Proceeding to URL:", decisionData.url);

  try {
    browser.runtime.sendMessage({
      action: "PROCEED_WITH_URL",
      url: decisionData.url,
    });
  } catch (error) {
    console.error("[GuardianLink Warning] Proceed error:", error);
    window.location.href = decisionData.url;
  }
}

console.log("[GuardianLink Warning] Script loaded successfully");
