# Render Deployment Guide

## ✅ Pre-Deployment Checklist

### 1. **SECURITY: Remove Sensitive Data from Git**
```bash
# If you've already committed .env file, remove it from history:
git filter-branch --tree-filter 'rm -f .env' HEAD

# Remove the file locally
rm .env

# Never commit API keys!
```

### 2. **Regenerate API Keys**
Your keys in `.env` are **compromised** if the file was committed. Regenerate them:
- VirusTotal: https://www.virustotal.com/gui/home/upload
- AbuseIPDB: https://www.abuseipdb.com/
- WhoisXML API: https://www.whoisxmlapi.com/
- Google Safe Browsing: https://developers.google.com/safe-browsing/v4/get-started

### 3. **Install Dependencies**
```bash
cd website/backend
npm install
```

## 🚀 Deploy to Render

### Step 1: Connect GitHub Repository
1. Go to https://render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Select the `website` folder as the root directory

### Step 2: Configure Build & Start Commands
- **Build Command**: `npm ci`
- **Start Command**: `npm start`
- **Root Directory**: `website/backend`

### Step 3: Add PostgreSQL Database
1. In Render Dashboard, click "New +" → "PostgreSQL"
2. Create a new PostgreSQL instance (free tier available)
3. Render will automatically set `DATABASE_URL` environment variable

### Step 4: Set Environment Variables
In Render Dashboard → Environment Variables, add:

```
NODE_ENV=production
PORT=3001
VIRUSTOTAL_API_KEY=your_key_here
ABUSEIPDB_API_KEY=your_key_here
WHOIS_API_KEY=your_key_here
GOOGLE_SAFE_BROWSING_API_KEY=your_key_here
JWT_SECRET=generate_a_secure_random_string
FRONTEND_URL=your_frontend_url
RATE_LIMIT=100
```

> **Note**: `DATABASE_URL` is auto-set by Render when you add PostgreSQL

### Step 5: Deploy
1. Click "Create Web Service"
2. Render will automatically build and deploy
3. Check the deployment logs for any errors

## 📊 Testing Your Deployment

Once deployed, test the health check:
```bash
curl https://your-render-url.onrender.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-11T...",
  "version": "2.0",
  "components": {
    "database": "connected",
    "cache": "enabled"
  }
}
```

## 🔄 After Deployment

### Connect Extension to Backend
Update your extension to use your Render backend URL:
- In `extension/manifest.json` or environment config
- Change API endpoint from `localhost:3001` to your Render URL

### Monitor Logs
```bash
# Render Dashboard → Logs
# Watch for database connections and API calls
```

## 🆘 Troubleshooting

### Database Connection Error
- Verify `DATABASE_URL` is set in Render Dashboard
- Check if PostgreSQL instance is running
- Render auto-creates tables on first connection

### API Key Errors
- Verify all API keys are set in Render Environment Variables
- Test API keys in `.env.example` format first locally

### Port Issues
- Render automatically assigns PORT if not specified
- The app uses `process.env.PORT || 3001`

## 📝 Development vs Production

**Local Development:**
```bash
DATABASE_URL=postgresql://localhost:5432/guardianlink
NODE_ENV=development
```

**Production (Render):**
```bash
DATABASE_URL=provided_by_render_automatically
NODE_ENV=production
```

## 💡 Pro Tips

1. **Never commit `.env`** - Use `.env.example` for reference
2. **Always use environment variables** for secrets
3. **Test locally first** before deploying
4. **Check Render logs** if something breaks
5. **Set up alerts** for deployment failures

---

Your backend is now ready for production! 🎉
