.PHONY: help setup install dev-web dev-api dev-ai docker-up docker-down clean

# Default target
help:
	@echo "Warung AI - Setup & Development"
	@echo ""
	@echo "First-Time Setup:"
	@echo "  make setup      - Initial setup (env + deps)"
	@echo ""
	@echo "Development (pick your service):"
	@echo "  make dev-web    - Web developer (:3000)"
	@echo "  make dev-api    - API developer (:3001)"
	@echo "  make dev-ai     - AI developer (:8001)"
	@echo ""
	@echo "Docker (all services):"
	@echo "  make docker-up  - Start everything"
	@echo "  make docker-down - Stop everything"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean      - Remove build artifacts"

# Setup
setup:
	@echo "🚀 Setting up Warung AI..."
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✅ Created .env"; \
	else \
		echo "✅ .env exists"; \
	fi
	@echo ""
	@echo "Installing dependencies..."
	@echo "📦 Web (Next.js)..."
	cd web && bun install --silent
	@echo "📦 API (Hono)..."
	cd api && bun install --silent
	@echo "📦 AI (FastAPI)..."
	cd ai && uv sync --quiet
	@echo ""
	@echo "✅ Setup complete!"
	@echo ""
	@echo "Next steps:"
	@echo "  Web dev:  make dev-web"
	@echo "  API dev:  make dev-api"
	@echo "  AI dev:   make dev-ai"
	@echo "  All:      make docker-up"

# Docker
docker-up:
	@echo "Starting all services with Docker..."
	docker-compose up -d
	@echo ""
	@echo "Services running:"
	@echo "  Web: http://localhost:3000"
	@echo "  API: http://localhost:3001"
	@echo "  DB:  localhost:5432"
	@echo "  AI:  Internal only (BFF pattern)"
	@echo ""
	@echo "View logs: docker-compose logs -f"
	@echo "Stop:      make docker-down"

docker-down:
	@echo "Stopping all Docker services..."
	docker-compose down

docker-build:
	@echo "Rebuilding all Docker images..."
	docker-compose up --build -d

# Database
db-migrate:
	@echo "Running database migrations..."
	cd api && bun run migrate

db-seed:
	@echo "Seeding database with test data..."
	cd api && bun run seed

# Cleanup
clean:
	@echo "Cleaning build artifacts..."
	cd web && rm -rf .next dist
	cd api && rm -rf dist
	cd ai && find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@echo "Clean complete"

clean-all: clean
	@echo "Removing all dependencies..."
	cd web && rm -rf node_modules
	cd api && rm -rf node_modules
	cd ai && rm -rf .venv
	@echo "Full clean complete"

# Development
dev-web:
	@echo "Starting web development server on :3000"
	cd web && bun run dev

dev-api:
	@echo "Starting API development server on :3001"
	cd api && bun run dev

dev-ai:
	@echo "Starting AI development server on :8001"
	cd ai && uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8001

# Testing
test: test-web test-api test-ai

test-web:
	@echo "Testing web service..."
	cd web && bun test

test-api:
	@echo "Testing API service..."
	cd api && bun test

test-ai:
	@echo "Testing AI service..."
	cd ai && uv run pytest
