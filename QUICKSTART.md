# GuardianLink - Quick Start Guide

## ⚡ Installation (30 seconds)

### Step 1: Locate the Extension
```
Navigate to: e:\gardian_link\extension
```

### Step 2: Open Chrome Extensions
```
Go to: chrome://extensions/
```

### Step 3: Enable Developer Mode
- Look for toggle in **top-right corner**
- Click to enable

### Step 4: Load Extension
- Click blue **"Load unpacked"** button
- Navigate to `e:\gardian_link\extension`
- Click **"Select Folder"**

### Step 5: Verify Installation
- Extension icon appears in Chrome toolbar
- Click icon to see dashboard
- You're done! 🎉

---

## 🧪 Quick Test (2 minutes)

### Test 1: Blocked URL
1. Click this link: `https://fake-amazon.tk`
2. Expected: **RED WARNING PAGE** appears
3. Click "← Go Back" to cancel

### Test 2: Warning URL
1. Click this link: `https://bit.ly/test-url`
2. Expected: **YELLOW INLINE WARNING** at top-right
3. You can still proceed

### Test 3: Safe URL
1. Click this link: `https://google.com`
2. Expected: **NO WARNING**, page loads normally
3. Check dashboard to see it was logged as SAFE

### Test 4: Dashboard
1. Click extension icon in toolbar
2. See all analyzed URLs
3. Click any URL to see full details
4. Try exporting logs

---

## 📋 What Just Happened?

| Component | What It Does |
|-----------|-------------|
| **Manifest V3** | Defines extension, permissions, scripts |
| **Background Script** | Analyzes URLs, applies 9 security rules |
| **Content Script** | Intercepts clicks/pastes on web pages |
| **Rule Engine** | Checks: keywords, shorteners, IP addresses, encoding |
| **Domain Reputation** | Checks blacklist, domain age, TLD reputation |
| **Decision Engine** | Combines scores (0-100) → verdict |
| **Warning Page** | Shows blocked/suspicious URLs with reasons |
| **Dashboard** | Logs and displays all analyzed URLs |

---

## 🎯 Key Features

✅ **Real-time Analysis** - Analyzes before page loads
✅ **Offline First** - No external calls, completely local
✅ **9 Detection Rules** - URL length, shorteners, keywords, typosquatting, IPs, parameters, encoding, subdomains, TLDs
✅ **Smart Scoring** - Risk score 0-100 based on multiple factors
✅ **User Control** - Can "Proceed Anyway" for warnings
✅ **Full Logging** - Every URL logged with analysis details
✅ **Export Logs** - Download as JSON for analysis
✅ **Zero Data Collection** - Everything stays on your device

---

## 🚨 Risk Levels

| Score | Level | Verdict | Action |
|-------|-------|---------|--------|
| 0-14 | SAFE | ALLOW | Normal navigation |
| 15-34 | LOW | WARN | Show warning, allow bypass |
| 35-54 | MEDIUM | WARN | Show warning, allow bypass |
| 55-74 | HIGH | BLOCK | Show warning, prevent navigation |
| 75-100 | CRITICAL | BLOCK | Show warning, prevent navigation |

---

## 📊 Sample Test URLs

### Will Be BLOCKED (Malicious)
```
https://fake-amazon.tk                    ← Phishing site
https://paypa1.xyz                        ← Typosquatting
https://goog1e-secure.top                 ← Google phishing
https://microsoft-verify.tk               ← Microsoft scam
https://apple-update.xyz                  ← Apple scam
https://192.168.1.1/admin                 ← IP-based admin
https://banking-secure.top                ← Generic banking phishing
```

### Will Show WARNINGS (Suspicious)
```
https://bit.ly/verify-account             ← Shortener + keyword
https://bit.ly/tinyurl.com/login          ← Multiple suspicious
https://login-secure-verify.xyz           ← Keywords + TLD
https://reward-claim.work/kyc?verify=yes  ← Reward scam pattern
```

### Will Be ALLOWED (Safe)
```
https://google.com
https://github.com
https://stackoverflow.com
https://wikipedia.org
https://amazon.com
https://microsoft.com
https://apple.com
```

---

## 🔧 Troubleshooting

### Extension not showing?
1. Go to `chrome://extensions/`
2. Look for "GuardianLink"
3. Make sure it's enabled (toggle on)
4. Click the pin icon to show in toolbar

### Not intercepting clicks?
1. Reload the webpage (Ctrl+R)
2. Check Console (F12 → Console)
3. Look for: "GuardianLink content script loaded"
4. If missing, reload extension

### Getting too many warnings?
1. These are working as intended!
2. Click "Proceed Anyway" to continue
3. Or increase thresholds in `background.js`

### Want to see all logs?
1. Click extension icon
2. You're already in the dashboard!
3. See all analyzed URLs
4. Filter by verdict (Blocked/Warned/Allowed)
5. Export as JSON

---

## 📁 File Structure

```
e:\gardian_link\
├── extension/                 ← LOAD THIS FOLDER
│   ├── manifest.json
│   ├── background.js         ← Core analysis
│   ├── content.js            ← Click/paste interception
│   ├── rules/
│   │   ├── ruleEngine.js
│   │   └── urlRules.js
│   ├── reputation/
│   │   ├── domainReputation.js
│   │   └── blacklist.json
│   ├── decision/
│   │   └── decisionEngine.js
│   ├── ui/
│   │   ├── warning.html
│   │   ├── warning.js
│   │   ├── dashboard.html
│   │   └── dashboard.js
│   └── utils/
│       ├── urlParser.js
│       └── cache.js
├── README.md                  ← Full documentation
└── QUICKSTART.md              ← This file
```

---

## 💡 How It Works in 10 Seconds

1. You click a link ➜ Content script intercepts
2. URL sent to background script ➜ Analyzes with rules
3. Rules generate risk score ➜ Checks domain reputation
4. Decision engine combines scores ➜ Makes verdict
5. If BLOCK (score ≥55) ➜ Shows warning page, prevents navigation
6. If WARN (score 15-54) ➜ Shows inline warning, allows bypass
7. If ALLOW (score <15) ➜ Normal navigation
8. All logged to dashboard ➜ You can view, filter, export

---

## ✨ Next Steps

1. ✅ Install the extension (if not done)
2. ✅ Test with sample URLs above
3. ✅ Explore the dashboard
4. ✅ Read full [README.md](README.md) for details
5. ✅ Customize rules if needed (edit background.js)
6. ✅ Share feedback/improvements

---

## 🎓 Learning Resources

- Full README: See `README.md` for comprehensive guide
- Chrome API: https://developer.chrome.com/docs/extensions/
- Security: https://owasp.org/www-community/attacks/phishing

---

**GuardianLink v1.0.0** - Stop malicious URLs before they load.
Built for security. Designed for simplicity. Runs completely locally.
