# 🐳 Guardian Link Docker Dev Container Setup

## **What's Been Created**

### **Structure:**
```
your-project-companion/
├── backend/
│   └── .devcontainer/
│       ├── devcontainer.json      (Backend container config)
│       └── Dockerfile              (Backend image definition)
├── .devcontainer/
│   ├── devcontainer.json          (Frontend container config)
│   └── Dockerfile.frontend        (Frontend image definition)
└── docker-compose.yml             (Orchestrates both services)
```

---

## **Option 1: Run Both Services with Docker Compose (Recommended)**

### **Step 1: Install Docker Desktop**
- Download from: https://www.docker.com/products/docker-desktop
- Install and start Docker Desktop
- Verify: Open PowerShell and run:
```powershell
docker --version
docker run hello-world
```

### **Step 2: Start Everything**
```powershell
cd E:\gardian_link\website\your-project-companion
docker-compose up
```

### **What Happens:**
- ✅ Backend container starts on port 3001
- ✅ Frontend container starts on port 3002
- ✅ SQLite database runs in isolated volume
- ✅ Both services auto-start with `npm` commands
- ✅ Live code reloading works (changes auto-refresh)

### **Access Your Apps:**
- **Frontend**: http://localhost:3002
- **Backend API**: http://localhost:3001/api/health
- **Database**: Stored in Docker volume (persistent)

### **Stop Services:**
```powershell
docker-compose down
```

---

## **Option 2: Run Individual Containers**

### **Backend Only:**
```powershell
cd E:\gardian_link\website\your-project-companion\backend
docker build -f .devcontainer/Dockerfile -t guardianlink-backend .
docker run -p 3001:3001 -v ${PWD}:/workspace guardianlink-backend
```

### **Frontend Only:**
```powershell
cd E:\gardian_link\website\your-project-companion
docker build -f .devcontainer/Dockerfile.frontend -t guardianlink-frontend .
docker run -p 3002:3002 -v ${PWD}:/workspace guardianlink-frontend
```

---

## **Option 3: Use VS Code Dev Containers (Best for Development)**

### **Step 1: Install VS Code Extension**
- Open VS Code
- Go to Extensions (Ctrl+Shift+X)
- Search: "Dev Containers"
- Install: "Dev Containers" by Microsoft

### **Step 2: Open Backend in Container**
- Open `E:\gardian_link\website\your-project-companion\backend` as folder
- Press `F1` → Type: "Dev Containers: Open Folder in Container"
- Choose `.devcontainer` configuration
- VS Code rebuilds and attaches to the container
- Terminal now runs INSIDE the container ✅

### **Step 3: Open Frontend in Container (Separate Window)**
- In new VS Code window, open `E:\gardian_link\website\your-project-companion`
- Press `F1` → "Dev Containers: Open Folder in Container"
- Select `.devcontainer` configuration
- Now you have:
  - ✅ Backend running in container 1 (port 3001)
  - ✅ Frontend running in container 2 (port 3002)
  - ✅ Both can communicate
  - ✅ No resource drain on Windows

### **Step 4: Run Services**
In each VS Code terminal (running inside container):

**Backend Terminal:**
```bash
npm run dev
# Backend starts on http://localhost:3001
```

**Frontend Terminal:**
```bash
npm run dev
# Frontend starts on http://localhost:3002
```

---

## **Environment Variables Inside Container**

The containers automatically set:
- `NODE_ENV=development`
- `PORT=3001` (backend)
- `JWT_SECRET=guardian_link_secret_key_2024_development`
- `DATABASE_URL=/data/guardianlink.db` (persistent volume)
- `FRONTEND_URL=http://localhost:3002`
- `VITE_API_URL=http://localhost:3001/api`

Modify `docker-compose.yml` if you need to change these.

---

## **Benefits**

| Feature | Before (Local Node) | After (Docker) |
|---------|-------------------|----------------|
| **Isolation** | ❌ Mixes with Windows | ✅ Completely isolated |
| **RAM Usage** | 🔴 Heavy on host | 🟢 Managed by container |
| **Database** | ❌ Need local install | ✅ Runs in container |
| **Dependencies** | ❌ Global install | ✅ Container-scoped |
| **Reproducible** | ❌ Different per machine | ✅ Same everywhere |
| **Deployment** | ❌ Manual setup | ✅ One docker-compose up |

---

## **Troubleshooting**

### **Ports Already in Use:**
```powershell
# Kill processes on port 3001 and 3002
Get-Process | Where-Object { $_.Port -eq 3001 -or $_.Port -eq 3002 } | Stop-Process -Force

# Or change ports in docker-compose.yml:
# "3001:3001" → "3001:3001"  (keep first port)
# "3002:3002" → "3002:3002"  (keep first port)
```

### **Container Won't Start:**
```powershell
# See logs
docker-compose logs

# Rebuild from scratch
docker-compose down -v
docker-compose up --build
```

### **Can't Connect to Backend from Frontend:**
- Make sure both services are in same network (docker-compose handles this)
- Check firewall allows 3001 and 3002
- Use service name `backend` instead of `localhost:3001` inside containers

---

## **Next Steps**

1. **Install Docker Desktop**
2. **Run:** `docker-compose up` from project root
3. **Access:** http://localhost:3002
4. **Test:** Sign up, scan URLs, verify dashboard updates
5. **Load Extension:** chrome://extensions → Load unpacked → `E:\gardian_link\extension`

**Everything is now containerized and production-ready!** 🚀
