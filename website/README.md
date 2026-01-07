# 🌐 GuardianLink Dashboard

<div align="center">
  <strong>Web Platform for URL Security Analysis & Management</strong>  
  <br/>
  <em>Dashboard, API Backend, and User Account Management</em>

  [![Frontend](https://img.shields.io/badge/Frontend-React_18-blue?style=for-the-badge&logo=react)](src/)
  [![Backend](https://img.shields.io/badge/Backend-Node.js-green?style=for-the-badge&logo=node.js)](backend/)
  [![Docker](https://img.shields.io/badge/Docker-Ready-orange?style=for-the-badge&logo=docker)](DOCKER_SETUP.md)
</div>

---

## ✨ At a Glance

| Category | Details |
|----------|---------|
| **Purpose** | Dashboard for analyzing suspicious URLs & managing security |
| **Frontend** | React 18, TypeScript, Vite, shadcn/ui |
| **Backend** | Node.js, Express, SQLite |
| **Key Features** | User auth, URL scanning, threat analysis, scan history |
| **Deployment** | Docker or local development |

<div align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite" />
</div>

---

## 🎯 What This Dashboard Does

### For Users
- 🔐 **Create Account** – Register & login with email
- 🔍 **Scan URLs** – Manually paste and analyze suspicious links
- 📊 **See Results** – Get detailed threat analysis with risk scores
- 📈 **View History** – Browse all past scans with full details
- 🔗 **Link Extension** – Auto-connect your browser extension
- 📱 **Check Status** – See if extension is online & synced

### Security Analysis (8 Phases)
1. **VirusTotal** – Check against 25+ antivirus engines (25 pts)
2. **AbuseIPDB** – IP-based threat intelligence (15 pts)
3. **SSL Certificate** – HTTPS validity & certificate chain (15 pts)
4. **Domain Age** – Analyze domain registration patterns (10 pts)
5. **Content Analysis** – Detect phishing keywords (15 pts)
6. **Redirect Chains** – Check for suspicious redirects (10 pts)
7. **Security Headers** – Validate CSP, HSTS, etc. (10 pts)
8. **Google Safe Browsing** – Check Google's threat database (15 pts)

### Risk Scoring
- **🔴 CRITICAL** (75+) – Immediate threat, block access
- **🟠 HIGH** (55-74) – High risk, block with warning
- **🟡 MEDIUM** (35-54) – Suspicious, warn user
- **🟢 LOW** (15-34) – Minor risk, show notice
- **✅ SAFE** (0-14) – No threats detected

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 14+ ([download](https://nodejs.org))
- **npm** 8+
- **Chrome** browser (for extension linking)

### Installation

```bash
# 1. Clone repository
git clone <repo-url>
cd gardian_link/website

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
cd backend
npm install
cd ..

# 4. Create environment file
cp backend/.env.example backend/.env
# Edit backend/.env and add your API keys

# 5. Start backend server (Terminal 1)
cd backend
npm start
# Server runs on http://localhost:3001

# 6. Start frontend (Terminal 2)
npm run dev
# Dashboard runs on http://localhost:3000

# 7. Open browser
# Go to http://localhost:3000
```

---

## ⚙️ Configuration

### Environment Variables

Create `backend/.env` with these variables:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Security
JWT_SECRET=your_secret_key_change_in_production_12345

# Database
DATABASE_URL=./guardianlink.db

# External APIs
VIRUSTOTAL_API_KEY=your_key_here
ABUSEIPDB_API_KEY=your_key_here
GOOGLE_SAFE_BROWSING_API_KEY=your_key_here

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

### Getting API Keys

#### 🔹 VirusTotal
1. Go to [virustotal.com](https://www.virustotal.com)
2. Sign up for free account
3. Click your profile → API key
4. Copy key to `.env`

#### 🔹 AbuseIPDB
1. Go to [abuseipdb.com](https://www.abuseipdb.com)
2. Create account
3. Go to Account → API
4. Copy API key

#### 🔹 Google Safe Browsing
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project
3. Enable "Safe Browsing API"
4. Create API key
5. Copy to `.env`

---

## 📦 Project Structure

```
website/
├── src/                          # Frontend (React)
│   ├── App.tsx                  # Main app component
│   ├── pages/
│   │   ├── Index.tsx            # Home page
│   │   ├── Login.tsx            # Login page
│   │   ├── Signup.tsx           # Registration page
│   │   ├── Dashboard.tsx        # Main dashboard
│   │   └── NotFound.tsx         # 404 page
│   ├── components/
│   │   ├── URLScanner.tsx       # URL input & analysis
│   │   ├── RiskScore.tsx        # Risk visualization
│   │   ├── ScanPhase.tsx        # Analysis phase display
│   │   └── ui/                  # shadcn/ui components
│   ├── hooks/
│   │   ├── use-mobile.tsx       # Responsive design hook
│   │   └── use-toast.ts         # Toast notifications
│   └── lib/
│       └── utils.ts             # Utilities
│
├── backend/                      # Backend (Node.js)
│   ├── server.js                # Express server & routes
│   ├── lib/
│   │   ├── heuristicsManager.js # Local threat detection
│   │   └── rulesManager.js      # Rule engine
│   ├── data/
│   │   ├── heuristics.json      # Detection patterns
│   │   └── rules.json           # Blocking rules
│   ├── scripts/
│   │   └── validateHeuristics.js # Validation tool
│   └── package.json
│
├── public/                       # Static assets
├── package.json                 # Frontend dependencies
├── vite.config.ts               # Vite build config
├── tsconfig.json                # TypeScript config
└── index.html                   # Entry point

```

---

## 🖥️ API Endpoints

### Authentication
- `POST /api/auth/signup` – Register new user
- `POST /api/auth/login` – Login user
- `GET /api/auth/me` – Get current user info
- `POST /api/auth/logout` – Logout user

### URL Scanning
- `POST /api/scan` – Analyze a single URL
- `GET /api/scan/history` – Get user's scan history
- `GET /api/scan/:id` – Get details of a specific scan

### Extension
- `POST /api/extension/register` – Register extension with account
- `GET /api/extension/status` – Check connection status
- `POST /api/extension/log` – Log URL analysis from extension

### Health
- `GET /api/health` – Check backend status

---

## 🐳 Docker Setup

Run the entire stack in Docker:

```bash
# 1. Install Docker & Docker Compose
# Download from docker.com

# 2. Start services
docker-compose up -d

# 3. Access dashboard
# Frontend: http://localhost:3000
# Backend:  http://localhost:3001

# 4. View logs
docker-compose logs -f

# 5. Stop services
docker-compose down
```

See [DOCKER_SETUP.md](DOCKER_SETUP.md) for details.

---

## 🔌 Extension Integration

### How It Works
1. User logs into GuardianLink dashboard
2. Browser extension detects login automatically
3. Extension registers with user's account
4. Dashboard shows "Extension Connected" ✓
5. All extension scans appear in dashboard history

### Manual Setup (if auto-registration fails)
1. In extension, click ⚙️ Settings
2. Paste your account token from dashboard
3. Click "Link Extension"
4. Refresh dashboard – should show "Connected"

---

## 🚢 Building for Production

### Build Frontend
```bash
npm run build
# Creates optimized files in dist/
```

### Build Docker Image
```bash
docker build -t guardianlink:latest .
docker push your-registry/guardianlink:latest
```

### Deploy to Cloud
See deployment guides for:
- AWS (EC2, ECS, Lambda)
- Google Cloud (App Engine, Cloud Run)
- Azure (App Service, Container Instances)
- Heroku (PaaS)

---

## 🧪 Testing

### Frontend Tests
```bash
npm run test
npm run test:watch
```

### Backend Tests
```bash
cd backend
npm test
```

### Manual Testing Checklist
- [ ] User registration works
- [ ] Login/logout works
- [ ] URL scanning returns results
- [ ] Threat scores calculated correctly
- [ ] Extension connects automatically
- [ ] Scan history displays properly

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000 or 3001
lsof -i :3000
# Kill the process
kill -9 <PID>
```

### API Key Errors
- ✅ Make sure all keys are in `backend/.env`
- ✅ Restart backend after adding keys
- ✅ Check that keys are valid and not expired

### Extension Not Connecting
1. Make sure backend is running on localhost:3001
2. Check that you're logged in on dashboard
3. Look for CORS errors in browser console
4. Reload extension in `chrome://extensions/`

### Database Errors
```bash
# Reset database
rm backend/guardianlink.db
# Restart backend – will create new DB
npm start
```

---

## 📊 Performance Tips

- Use SQLite query caching for repeated lookups
- Implement backend URL analysis caching
- Batch extension requests to reduce API calls
- Use service workers for offline dashboard

---

## 📚 Related Documentation

- 🔒 **[Extension Guide](../extension/README.md)** – Browser extension
- 🛡️ **[Main README](../README.md)** – Project overview
- 🐳 **[Docker Setup](DOCKER_SETUP.md)** – Containerization

---

## 🤝 Contributing

Found a bug? Have an improvement? We'd love your help!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Submit a pull request

---

## 📄 License

This project is licensed under the **MIT License** – see the [LICENSE](../LICENSE) file for details.

---

<div align="center">
  <br/>
  <strong>Making URL security simple and accessible for everyone</strong>
</div>

- **VirusTotal**: https://www.virustotal.com/gui/my-apikey
- **AbuseIPDB**: https://www.abuseipdb.com/api
- **Google Safe Browsing**: https://developers.google.com/safe-browsing/v4/get-started

## 📊 System Architecture

### Extension Flow
```
User navigates URL
  ↓
Extension intercepts (content.js)
  ↓
Shows loading overlay
  ↓
Sends to backend (background.js)
  ↓
Backend analyzes (8 security phases)
  ↓
Decision: BLOCK/WARN/ALLOW
  ↓
Warning page or proceed
```

### Frontend Flow
```
User enters URL in scanner
  ↓
Frontend sends to backend
  ↓
Backend returns detailed analysis
  ↓
Display results with visualizations
  ↓
Track in scan history
```

## 🧪 Testing

### Test Malicious URLs
```
http://115.51.15.36:59872/i
http://127.0.0.1:5500/test.html (localhost - can bypass)
https://grufuncinlhar.floresflorcravovermelho.cfd/
```

### Verification Checklist
- [ ] Loading overlay appears when clicking links
- [ ] Warning page shows for blocked URLs
- [ ] Can bypass localhost URLs (5 min bypass window)
- [ ] Cannot bypass production malware URLs
- [ ] Dashboard shows extension connection status
- [ ] Manual URL scanning works
- [ ] Score calculation is accurate

## 📁 Project Structure

```
guardianlink/
├── extension/              # Chrome Extension
│   ├── background.js       # Service worker
│   ├── content.js          # Content script
│   ├── manifest.json       # Extension config
│   ├── ui/                 # Warning/Dashboard UI
│   ├── reputation/         # Threat intelligence
│   ├── rules/              # URL rules engine
│   └── utils/              # Utilities
│
└── website/your-project-companion/
    ├── backend/            # Node.js API Server
    │   ├── server.js       # Express app
    │   ├── lib/            # Libraries
    │   └── data/           # Rules/blacklist
    │
    └── src/                # React Frontend
        ├── pages/          # Page components
        ├── components/     # UI components
        ├── hooks/          # React hooks
        └── lib/            # Utilities
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Create user account
- `POST /api/auth/login` - User login

### Extension
- `POST /api/extension/register` - Register extension with user
- `GET /api/extension/verify` - Verify extension token

### Scanning
- `POST /api/scan` - Scan URL (authenticated user)
- `POST /api/scan/realtime` - Scan URL (extension)
- `GET /api/scans` - Get user's scan history

### Health
- `GET /api/health` - Check backend status

## 🛡️ Threat Scoring

| Score Range | Decision | Risk Level |
|----------|----------|-----------|
| 0-30 | BLOCK | CRITICAL |
| 30-60 | WARN | MEDIUM |
| 60-100 | ALLOW | SAFE |

### Scoring Factors

**Critical Threats:**
- Executable files (score: 60)
- IP-based URLs with non-standard ports (score: 45)
- Suspicious TLDs (.cfd, .cc, .tk, etc.) (score: 35)

**High Risk:**
- Typosquatting domains (score: 40)
- URL shorteners (score: 20)
- Suspicious patterns (score: 65)

## 🚀 Deployment

### Docker
```bash
# Build and run with Docker
docker-compose up -d

# Backend runs on :3001
# Frontend runs on :3000
```

### Production Setup
1. Update `.env` with production secrets
2. Set `NODE_ENV=production`
3. Use secure database
4. Enable HTTPS
5. Update CORS settings
6. Deploy to hosting platform

## 📝 Development

### Adding New Security Checks
1. Add detection function to `background.js`
2. Include in scoring system
3. Update warning page
4. Test with sample URLs

### Extending Rules System
1. Add rules to `backend/data/rules.json`
2. Update `rulesManager.js`
3. Reload extension to apply

## 🤝 Contributing

Contributions welcome! Please:
1. Fork repository
2. Create feature branch
3. Test thoroughly
4. Submit pull request

## 📄 License

MIT License - See LICENSE file for details

## 🔗 Links

- **Issue Tracker**: GitHub Issues
- **Documentation**: See README files in subfolders
- **Contact**: Support for GuardianLink

## ⚠️ Security Notice

- Never commit `.env` files with real API keys
- Always use HTTPS in production
- Regularly update dependencies
- Report security issues responsibly
- Use strong JWT_SECRET in production

## 🐛 Troubleshooting

### Extension not detecting URLs
- Reload extension (chrome://extensions → refresh)
- Check backend is running (http://localhost:3001/api/health)
- Enable extension in chrome://extensions

### API keys not working
- Verify keys are in `.env`
- Check API quota limits
- Ensure APIs are enabled in respective dashboards

### Frontend can't connect to backend
- Check backend is running on :3001
- Verify CORS settings
- Check firewall/network

## 📊 Performance

- Analysis time: ~1-3 seconds per URL
- Bypass cache duration: 5 minutes (localhost)
- Max concurrent scans: 100
- Database retention: Unlimited

---

**Made with ❤️ by GuardianLink Team**

Stay safe online! 🛡️
