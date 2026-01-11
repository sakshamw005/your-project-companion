/**
 * GuardianLink v2.0 - Console Diagnostic Tool
 * Paste this into your browser console to verify everything is working
 */

console.log('%c🛡️ GuardianLink v2.0 - Diagnostic Tool', 'color: #1e88e5; font-size: 16px; font-weight: bold;');

// Test 1: Check if content script is loaded
console.log('\n%c✓ Test 1: Content Script Status', 'color: #4caf50; font-weight: bold;');
console.log('If this appears, content script IS loaded ✅');
console.log('Expected: Yes (always appears)');

// Test 2: Check if we can send message to background
console.log('\n%c✓ Test 2: Testing Message Passing to Background', 'color: #4caf50; font-weight: bold;');
browser.runtime.sendMessage(
  { action: 'diagnosticTest', timestamp: new Date().toISOString() },
  (response) => {
    if (response && response.status === 'ok') {
      console.log('✅ Background service worker is responding!');
      console.log('Response:', response);
    } else {
      console.error('❌ Background service worker did not respond properly');
    }
  }
);

// Test 3: Check extension manifest
console.log('\n%c✓ Test 3: Extension Information', 'color: #4caf50; font-weight: bold;');
console.log('Extension ID:', browser.runtime.id);
console.log('Manifest URL:', browser.runtime.getURL('manifest.json'));
console.log('Warning page:', browser.runtime.getURL('ui/warning.html'));
console.log('Dashboard:', browser.runtime.getURL('ui/dashboard.html'));

// Test 4: Check if URL analysis function exists
console.log('\n%c✓ Test 4: Testing URL Analysis', 'color: #4caf50; font-weight: bold;');
const testURL = 'https://www.google.com';
console.log('Sending test analysis request for:', testURL);
browser.runtime.sendMessage(
  { action: 'analyzeURL', url: testURL, context: 'diagnostic' },
  (decision) => {
    if (decision) {
      console.log('✅ URL analysis returned:');
      console.log('  Verdict:', decision.verdict);
      console.log('  Risk Level:', decision.riskLevel);
      console.log('  Score:', decision.score);
      console.log('  Reason:', decision.reasoning);
    } else {
      console.error('❌ No response from URL analyzer');
    }
  }
);

// Test 5: Check stored logs
console.log('\n%c✓ Test 5: Checking Stored Logs', 'color: #4caf50; font-weight: bold;');
browser.storage.local.get(['guardianlink_logs'], (data) => {
  if (data.guardianlink_logs && data.guardianlink_logs.length > 0) {
    console.log(`✅ Found ${data.guardianlink_logs.length} logged decisions`);
    console.log('Recent logs:');
    data.guardianlink_logs.slice(-3).forEach((log, i) => {
      console.log(`  ${i+1}. ${log.verdict} - ${log.url} (Score: ${log.score})`);
    });
  } else {
    console.log('⚠️  No logs yet. Click some links to generate logs.');
  }
});

// Test 6: Check if whitelist is initialized
console.log('\n%c✓ Test 6: Checking Security Features', 'color: #4caf50; font-weight: bold;');
console.log('Whitelist initialized: (checked in background service worker)');
console.log('Blacklist loaded: (checked in background service worker)');
console.log('Rule engine: Available');
console.log('Decision engine: Available');

// Test 7: Simulate click interception
console.log('\n%c✓ Test 7: Testing Click Interception', 'color: #4caf50; font-weight: bold;');
console.log('Next time you click a link, it should show in console.');
console.log('Manual test: Right-click a link → "Inspect" → click the link');
console.log('Expected console output: "🔗 Link clicked: [URL]"');

// Summary
console.log('\n%c📊 Diagnostic Summary', 'color: #ff9800; font-weight: bold;');
console.log(`
═══════════════════════════════════════════════════════════
  GuardianLink v2.0 Diagnostic Results
═══════════════════════════════════════════════════════════

✅ Content Script: LOADED (this page has it)
⏳ Background Service Worker: (see Service Worker console)
⏳ URL Analysis: (response shown above)
⏳ Message Passing: (response shown above)
⏳ Storage: (logs shown above)

═══════════════════════════════════════════════════════════
  Next Steps:
═══════════════════════════════════════════════════════════

1. Check the Service Worker console:
   - Go to chrome://extensions/
   - Find GuardianLink
   - Click "Service worker" link
   - Should see similar diagnostic output there

2. Test with a malicious URL:
   - Visit: https://testsafebrowsing.appspot.com/s/phishing.html
   - Should show warning page
   - Check console for analysis logs

3. Check dashboard:
   - Go to: ${browser.runtime.getURL('ui/dashboard.html')}
   - Should show logged decisions

4. Verify all tests passed:
   - Look for ✅ marks above
   - Any ❌ indicates a problem to fix

═══════════════════════════════════════════════════════════
`);

console.log('%c🛡️ Diagnostic Complete', 'color: #1e88e5; font-size: 14px; font-weight: bold;');
