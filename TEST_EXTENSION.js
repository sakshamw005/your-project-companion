/**
 * Extension Debugging Test Script
 * Run with: node TEST_EXTENSION.js
 * Tests the URL analysis logic without needing Chrome
 */

// ==================== CONFIGURATION ====================
const CONFIG = {
  WEBSITE_API: 'http://localhost:3001/api',
  THRESHOLDS: {
    BLOCK: 70,
    WARN: 40,
    ALLOW: 0
  }
};

// ==================== TEST URLS ====================
const TEST_URLS = {
  'GOOD': [
    'https://www.google.com',
    'https://www.github.com',
    'https://stackoverflow.com'
  ],
  'WARN': [
    'https://suspicious-domain.tk',
    'https://bit.ly/xyz123',
    'https://short.url/abc'
  ],
  'BLOCK': [
    'https://malware-site.ru',
    'https://phishing-page.com',
    'https://virus-download.xyz'
  ]
};

// ==================== URL RULES (From extension) ====================
const URL_RULES = {
  blacklist: [
    { pattern: 'malware', risk: 95 },
    { pattern: 'phishing', risk: 90 },
    { pattern: 'ransomware', risk: 92 },
    { pattern: 'trojan', risk: 85 },
    { pattern: '.ru$', risk: 45 }, // Russian domains slightly suspicious
    { pattern: '.tk$', risk: 60 }  // Free domains more risky
  ],
  suspicious: [
    { pattern: 'bit.ly', risk: 35 },
    { pattern: 'short.url', risk: 30 },
    { pattern: 'tinyurl', risk: 25 },
    { pattern: 'js.do', risk: 40 }
  ],
  whitelist: [
    'google.com', 'github.com', 'stackoverflow.com',
    'wikipedia.org', 'amazon.com', 'microsoft.com'
  ]
};

// ==================== ANALYSIS FUNCTION ====================
async function analyzeURL(urlString) {
  console.log('\n🔍 Analyzing:', urlString);
  console.log('━'.repeat(70));

  try {
    const url = new URL(urlString);
    let score = 0;
    const reasons = [];

    // Phase 1: Whitelist check
    console.log('📋 Phase 1: Checking whitelist...');
    const domain = url.hostname.replace('www.', '');
    if (URL_RULES.whitelist.includes(domain)) {
      console.log('✅ PHASE 1: Domain is whitelisted');
      return {
        verdict: 'ALLOW',
        score: 0,
        riskLevel: 'SAFE',
        phases: ['Whitelist Check ✅']
      };
    }

    // Phase 2: Blacklist check
    console.log('🚨 Phase 2: Checking blacklist...');
    for (const rule of URL_RULES.blacklist) {
      if (new RegExp(rule.pattern, 'i').test(urlString)) {
        score += rule.risk;
        reasons.push(`Blacklist match: "${rule.pattern}" (+${rule.risk})`);
        console.log(`  ⚠️ Match: ${rule.pattern} | Risk: +${rule.risk} | Total: ${score}`);
      }
    }

    // Phase 3: Suspicious pattern check
    console.log('⚡ Phase 3: Checking suspicious patterns...');
    for (const rule of URL_RULES.suspicious) {
      if (new RegExp(rule.pattern, 'i').test(urlString)) {
        score += rule.risk;
        reasons.push(`Suspicious pattern: "${rule.pattern}" (+${rule.risk})`);
        console.log(`  ⚠️ Match: ${rule.pattern} | Risk: +${rule.risk} | Total: ${score}`);
      }
    }

    // Phase 4: URL structure analysis
    console.log('🔎 Phase 4: URL structure analysis...');
    if (urlString.includes('?') && urlString.split('?')[1].length > 100) {
      score += 15;
      reasons.push('Suspiciously long query string (+15)');
      console.log('  ⚠️ Long query string detected | Risk: +15 | Total:', score);
    }

    // Phase 5: Protocol check
    console.log('🔐 Phase 5: Protocol check...');
    if (!url.protocol.match(/^https?:/)) {
      score += 30;
      reasons.push(`Unusual protocol: ${url.protocol} (+30)`);
      console.log(`  ⚠️ Unusual protocol: ${url.protocol} | Risk: +30 | Total: ${score}`);
    }

    // Phase 6: Domain age simulation (would need API)
    console.log('📅 Phase 6: Domain age (skipped - needs API)...');

    // Phase 7: Try website API if available
    console.log('☁️ Phase 7: Checking website API...');
    let apiVerdict = null;
    try {
      const apiResponse = await fetch(`${CONFIG.WEBSITE_API}/scan/realtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlString })
      });
      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        console.log('  ✅ API Response:', apiData.verdict, '| Score:', apiData.score);
        apiVerdict = apiData;
      }
    } catch (e) {
      console.log('  ⚠️ API unavailable:', e.message);
    }

    // ==================== FINAL VERDICT ====================
    console.log('\n' + '═'.repeat(70));
    console.log('FINAL SCORE:', score);
    console.log('═'.repeat(70));

    let verdict, riskLevel;
    if (score >= CONFIG.THRESHOLDS.BLOCK) {
      verdict = 'BLOCK';
      riskLevel = 'CRITICAL';
    } else if (score >= CONFIG.THRESHOLDS.WARN) {
      verdict = 'WARN';
      riskLevel = 'SUSPICIOUS';
    } else {
      verdict = 'ALLOW';
      riskLevel = 'SAFE';
    }

    console.log(`\n✅ VERDICT: ${verdict}`);
    console.log(`📊 RISK LEVEL: ${riskLevel}`);
    console.log(`📈 SCORE: ${score}/${100}`);
    console.log('\n📝 Reasons:');
    if (reasons.length === 0) {
      console.log('  ✅ No suspicious patterns detected');
    } else {
      reasons.forEach(r => console.log(`  • ${r}`));
    }

    return {
      url: urlString,
      verdict,
      score,
      riskLevel,
      reasons,
      apiVerdict: apiVerdict ? 'Used website API' : 'Local analysis only'
    };

  } catch (error) {
    console.error('❌ Error analyzing URL:', error.message);
    return {
      verdict: 'ERROR',
      error: error.message
    };
  }
}

// ==================== MAIN TEST ====================
async function runTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🛡️ GUARDIANLINK URL ANALYSIS TEST');
  console.log('='.repeat(70));
  console.log('Testing URL categorization and risk scoring\n');

  const results = {};

  // Test GOOD URLs
  console.log('\n\n🟢 TESTING GOOD/SAFE URLs');
  console.log('═'.repeat(70));
  results.good = [];
  for (const url of TEST_URLS.GOOD) {
    const result = await analyzeURL(url);
    results.good.push(result);
    await sleep(500); // Delay between tests
  }

  // Test WARN URLs
  console.log('\n\n🟡 TESTING WARN/SUSPICIOUS URLs');
  console.log('═'.repeat(70));
  results.warn = [];
  for (const url of TEST_URLS.WARN) {
    const result = await analyzeURL(url);
    results.warn.push(result);
    await sleep(500);
  }

  // Test BLOCK URLs
  console.log('\n\n🔴 TESTING BLOCK/CRITICAL URLs');
  console.log('═'.repeat(70));
  results.block = [];
  for (const url of TEST_URLS.BLOCK) {
    const result = await analyzeURL(url);
    results.block.push(result);
    await sleep(500);
  }

  // Print Summary
  printSummary(results);
}

// ==================== HELPER FUNCTIONS ====================
function printSummary(results) {
  console.log('\n\n' + '═'.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(70));

  console.log('\n✅ GOOD URLs Test:');
  results.good.forEach(r => {
    const status = r.verdict === 'ALLOW' ? '✅' : '❌';
    console.log(`  ${status} ${r.url}: ${r.verdict} (${r.riskLevel}) Score: ${r.score}`);
  });

  console.log('\n⚠️ WARN URLs Test:');
  results.warn.forEach(r => {
    const status = r.verdict === 'WARN' ? '✅' : '❌';
    console.log(`  ${status} ${r.url}: ${r.verdict} (${r.riskLevel}) Score: ${r.score}`);
  });

  console.log('\n🔴 BLOCK URLs Test:');
  results.block.forEach(r => {
    const status = r.verdict === 'BLOCK' ? '✅' : '❌';
    console.log(`  ${status} ${r.url}: ${r.verdict} (${r.riskLevel}) Score: ${r.score}`);
  });

  // Count results
  const goodPass = results.good.filter(r => r.verdict === 'ALLOW').length;
  const warnPass = results.warn.filter(r => r.verdict === 'WARN').length;
  const blockPass = results.block.filter(r => r.verdict === 'BLOCK').length;

  const totalTests = results.good.length + results.warn.length + results.block.length;
  const totalPass = goodPass + warnPass + blockPass;

  console.log('\n' + '═'.repeat(70));
  console.log(`✅ PASSED: ${totalPass}/${totalTests}`);
  console.log(`  🟢 Good URLs: ${goodPass}/${results.good.length}`);
  console.log(`  🟡 Warn URLs: ${warnPass}/${results.warn.length}`);
  console.log(`  🔴 Block URLs: ${blockPass}/${results.block.length}`);
  console.log('═'.repeat(70));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run tests
runTests().catch(console.error);
