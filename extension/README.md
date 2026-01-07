# 🔒 GuardianLink Browser Extension

<div align="center">
  <strong>Real-Time Malicious URL Detection for Chrome</strong>  
  <br/>
  <em>Stops phishing & malware BEFORE the page loads</em>

  [![Version](https://img.shields.io/badge/Version-2.0.0-brightgreen?style=for-the-badge)](manifest.json)
  [![Chrome API](https://img.shields.io/badge/API-Manifest_V3-blue?style=for-the-badge&logo=googlechrome)](manifest.json)
</div>

---

## ✨ What It Does

The GuardianLink extension runs in your Chrome browser and **automatically analyzes every URL** you click on, paste, or submit in a form.

### Key Capabilities
- ⚡ **Real-time Scanning** – Analyzes URLs in milliseconds before navigation
- 🔒 **Offline Detection** – Works completely offline with local heuristic rules
- 🌐 **Backend Integration** – Connects to GuardianLink dashboard for advanced threat checks
- 🛑 **Smart Blocking** – Blocks dangerous URLs instantly or shows warnings
- 📊 **Dashboard Sync** – Logs all analyzed URLs to your account
- 🔐 **Privacy First** – All URL analysis uses encryption; no browsing history stored

---

## 🎯 Detection Features

### Local Analysis (Offline)
The extension checks URLs for:
- ✅ Abnormally long URLs (>500 characters)
- ✅ URL shorteners (bit.ly, tinyurl, etc.)
- ✅ Suspicious keywords (login, verify, reward, cashback, etc.)
- ✅ Typosquatting patterns (g00gle, paytm-secure, etc.)
- ✅ IP-based URLs instead of domains
- ✅ Excessive query parameters
- ✅ Encoded/obfuscated URLs
- ✅ Suspicious subdomains
- ✅ Questionable TLDs (.tk, .xyz, .top, etc.)

### Online Analysis (When Connected)
When linked to your GuardianLink account, extends checks with:
- ✅ VirusTotal antivirus database (25 pts)
- ✅ AbuseIPDB threat intelligence (15 pts)
- ✅ SSL certificate validation (15 pts)
- ✅ Domain age & reputation (10 pts)
- ✅ Content analysis for phishing (15 pts)
- ✅ Redirect chain analysis (10 pts)
- ✅ Security headers validation (10 pts)
- ✅ Google Safe Browsing database (15 pts)

---

## 📦 Installation

### Step 1: Download the Extension

Clone or download the repository:
```bash
git clone <repo-url>
cd gardian_link/extension
```

### Step 2: Open Chrome Extensions Manager

1. Open Chrome browser
2. Type `chrome://extensions/` in the address bar (or go to Menu → More Tools → Extensions)
3. Enable **"Developer mode"** using the toggle in the top-right corner

### Step 3: Load Unpacked

1. Click the **"Load unpacked"** button
2. Navigate to the `extension/` folder
3. Click **"Select Folder"**

### Step 4: Verify Installation

✅ Extension icon appears in the Chrome toolbar (top-right)  
✅ Click the icon to open GuardianLink Dashboard  
✅ You should see "GuardianLink Dashboard" with statistics

---

## 🚀 Usage

### Basic Operation

1. **Automatic Scanning** – Simply browse normally; the extension monitors all URLs
2. **Click Any Link** – Extension analyzes it instantly
3. **Paste a URL** – Extension checks URLs pasted into the page
4. **Form Submission** – URLs submitted via forms are analyzed

### What Happens When a Threat is Detected

#### 🛑 CRITICAL or HIGH Risk
- **Navigation is blocked**
- Warning page shows clearly why
- Risk score and detected threats listed
- "Go Back" button is primary action
- "Proceed Anyway" disabled for CRITICAL threats

#### ⚠️ MEDIUM or LOW Risk
- **Warning page appears** (user can bypass)
- Detailed threat analysis shown
- "Proceed Anyway" button allows override
- "Go Back" remains available

#### ✅ SAFE
- Navigation continues immediately
- No warnings shown
- URL added to dashboard history

### Dashboard Features

Click the extension icon to open the Dashboard:

- **📊 Statistics** – View counts of blocked, warned, and analyzed URLs
- **📋 Scan History** – Browse all analyzed URLs with detailed info
- **🔍 Filter & Search** – Filter by verdict (Blocked, Warned, Allowed)
- **📄 URL Details** – Click any URL to see complete analysis
- **⬇️ Export** – Download logs as JSON
- **🗑️ Clear History** – Reset log (with confirmation)
- **⚙️ Settings** – Configure extension behavior

---

## 🔌 How It Communicates With GuardianLink Dashboard

### Auto-Registration
When you log in to your GuardianLink account in the dashboard:
- Extension automatically registers with your account
- No manual configuration needed

### Connection Status
Dashboard shows:
- 🟢 **Connected** – Extension is active & syncing
- 🔴 **Disconnected** – Extension offline or not linked

### Data Sync
- All URLs analyzed locally are logged to your account
- Threat analysis results stored for history
- Your scan history remains private

---

## 📋 Permissions Explained

The extension requests these permissions:

| Permission | Why Needed |
|-----------|-----------|
| `storage` | Store URL analysis logs locally |
| `tabs` | Detect when you navigate to a new URL |
| `activeTab` | Access current tab's URL |
| `webNavigation` | Intercept URLs before page loads |
| `scripting` | Inject warning pages |
| `notifications` | Show browser notifications for blocks |
| `downloads` | Block dangerous file downloads |
| `<all_urls>` | Analyze every URL you visit |
| `localhost:*` | Connect to backend server |

---

## 🛠️ Development Setup

### Prerequisites
- Node.js 14+ (for building)
- Chrome browser
- A code editor (VS Code recommended)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd gardian_link/extension
   ```

2. **Load in Chrome** (see Installation above)

3. **View Logs**
   - Go to `chrome://extensions/`
   - Click "Details" on GuardianLink
   - Click "Errors" to see any console errors

4. **Make Changes**
   - Edit JavaScript files in the extension folder
   - Go to `chrome://extensions/` and click ↻ to reload
   - Test your changes

### Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration & permissions |
| `background.js` | Service worker (listens for URL changes) |
| `content.js` | Injects code into web pages |
| `decision/decisionEngine.js` | Analyzes URLs & calculates risk score |
| `rules/ruleEngine.js` | Pattern matching for heuristics |
| `reputation/domainReputation.js` | Checks domain age & reputation |
| `ui/dashboard.html` | Main dashboard interface |
| `ui/warning.html` | Warning page for blocked URLs |

---

## 🔒 Security Considerations

### Data Privacy
- ✅ All analysis happens locally (no cloud processing)
- ✅ URLs only sent to your GuardianLink account (encrypted)
- ✅ No browsing history shared with third parties
- ✅ Threat intelligence API keys are backend-only

### Permissions Safety
- ❌ Extension never modifies pages
- ❌ Extension never injected ads or tracking
- ❌ Extension never sells user data
- ✅ Open source – code is auditable

---

## 🐛 Troubleshooting

### Extension not blocking anything
1. Check that extension is enabled in `chrome://extensions/`
2. Refresh the page and try again
3. Check browser console for errors

### Not connected to dashboard
1. Log in to GuardianLink website first
2. Check that backend server is running (http://localhost:3001)
3. Look for connection errors in `chrome://extensions/Details` → Errors

### Warning page looks broken
1. Make sure all files are in the extension folder
2. Try reloading the extension in `chrome://extensions/`
3. Clear browser cache (Ctrl+Shift+Delete)

---

## 📚 Related Documentation

- 🌐 **[Website Guide](../website/README.md)** – Dashboard & backend
- 🛡️ **[Main README](../README.md)** – Project overview
- 📖 **[Manifest Reference](manifest.json)** – Extension configuration

---

## 🤝 Contributing

Found a bug? Have a feature idea? We'd love your help!

1. Create an issue describing the problem
2. Fork the extension folder
3. Make your changes
4. Submit a pull request

---

<div align="center">
  <br/>
  <strong>Protecting the web, one URL at a time ✓</strong>
</div>
