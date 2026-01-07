# Guardian Link Quick Start - Docker Setup (Windows)

Write-Host "🚀 Guardian Link - Docker Compose Quick Start" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not installed!" -ForegroundColor Red
    Write-Host "📥 Please download Docker Desktop from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Check if Docker daemon is running
try {
    docker info > $null 2>&1
    Write-Host "✅ Docker daemon is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker daemon is not running!" -ForegroundColor Red
    Write-Host "🔧 Please start Docker Desktop" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Get project root
$PROJECT_ROOT = Get-Location

Write-Host "📁 Project root: $PROJECT_ROOT" -ForegroundColor Yellow
Write-Host ""

# Check docker-compose.yml exists
if (-not (Test-Path "$PROJECT_ROOT/docker-compose.yml")) {
    Write-Host "❌ docker-compose.yml not found in project root!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ docker-compose.yml found" -ForegroundColor Green
Write-Host ""

# Build images
Write-Host "🔨 Building Docker images..." -ForegroundColor Cyan
docker-compose build

Write-Host ""
Write-Host "🎯 Starting services..." -ForegroundColor Cyan
Write-Host ""
Write-Host "   Backend will be available at:  http://localhost:3001" -ForegroundColor Green
Write-Host "   Frontend will be available at: http://localhost:3002" -ForegroundColor Green
Write-Host ""
Write-Host "   Press Ctrl+C to stop services" -ForegroundColor Yellow
Write-Host ""

# Start containers
docker-compose up

Write-Host ""
Write-Host "🛑 Services stopped" -ForegroundColor Yellow
Write-Host ""
Write-Host "To start again, run:" -ForegroundColor Cyan
Write-Host "  docker-compose up" -ForegroundColor Gray
