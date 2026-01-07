#!/bin/bash
# Guardian Link Quick Start - Docker Setup

echo "🚀 Guardian Link - Docker Compose Quick Start"
echo "=============================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    echo "📥 Please download Docker Desktop from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "✅ Docker found: $(docker --version)"
echo ""

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon is not running!"
    echo "🔧 Please start Docker Desktop"
    exit 1
fi

echo "✅ Docker daemon is running"
echo ""

# Get project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "📁 Project root: $PROJECT_ROOT"
echo ""

# Check docker-compose.yml exists
if [ ! -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    echo "❌ docker-compose.yml not found in project root!"
    exit 1
fi

echo "✅ docker-compose.yml found"
echo ""

# Build images
echo "🔨 Building Docker images..."
docker-compose -f "$PROJECT_ROOT/docker-compose.yml" build

echo ""
echo "🎯 Starting services..."
echo ""
echo "   Backend will be available at:  http://localhost:3001"
echo "   Frontend will be available at: http://localhost:3002"
echo ""
echo "   Press Ctrl+C to stop services"
echo ""

# Start containers
docker-compose -f "$PROJECT_ROOT/docker-compose.yml" up

echo ""
echo "🛑 Services stopped"
echo ""
echo "To start again, run:"
echo "  docker-compose up"
