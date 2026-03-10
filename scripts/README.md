# Scripts

Utility scripts for development, deployment, and maintenance tasks.

## Overview

This folder contains helper scripts for common tasks:
- Setting up development environment
- Database migrations
- Azure resource provisioning
- Deployment automation
- Data seeding
- Testing utilities

## Structure

```
scripts/
├── setup/
│   ├── init-dev.sh              # Initialize development environment
│   ├── install-dependencies.sh  # Install all project dependencies
│   └── setup-azure.sh           # Create Azure resources
├── deploy/
│   ├── deploy-backend.sh        # Deploy backend to Azure
│   ├── deploy-frontend.sh       # Deploy frontend to Azure
│   └── deploy-all.sh            # Deploy entire application
├── db/
│   ├── migrate.sh               # Run database migrations
│   ├── seed.sh                  # Seed database with test data
│   └── backup.sh                # Backup database
├── dev/
│   ├── start-all.sh             # Start all services for development
│   ├── reset-db.sh              # Reset local database
│   └── generate-types.sh        # Generate TypeScript types from DB
└── utils/
    ├── check-costs.sh           # Check Azure costs
    ├── cleanup-storage.sh       # Clean up old files in blob storage
    └── generate-api-keys.sh     # Generate user API keys
```

## Usage

### Setup Scripts

#### Initialize Development Environment
```bash
./scripts/setup/init-dev.sh
```
This will:
- Check and install required tools (Node.js, Azure CLI, etc.)
- Install npm dependencies for all projects
- Create .env files from templates
- Set up local database
- Configure Azurite (Azure Storage emulator)

#### Set Up Azure Resources
```bash
./scripts/setup/setup-azure.sh
```
Creates all required Azure resources:
- Resource Group
- App Service Plan (Free F1)
- App Service (Linux Web App)
- Storage Account with containers
- Queue Storage

Low-cost database options:

```bash
# No DB (lowest cost, provision later)
./scripts/setup/setup-azure.sh --database none

# Cosmos DB serverless (+ free tier request)
./scripts/setup/setup-azure.sh --database cosmos

# PostgreSQL Flexible Server (Burstable B1ms)
./scripts/setup/setup-azure.sh --database postgres
```

The script writes generated values to:

```bash
scripts/setup/.azure-output.env
```

This file includes `AZURE_STORAGE_CONNECTION_STRING`, `WEBAPP_URL`, queue/container names, and database connection values when a DB option is selected.

### Development Scripts

#### Start All Services
```bash
./scripts/dev/start-all.sh
```
Starts:
- Backend API server (port 3000)
- Frontend dev server (port 3001)
- Azurite storage emulator
- Database (if not running)

#### Reset Database
```bash
./scripts/dev/reset-db.sh
```
- Drops all tables
- Runs migrations
- Seeds with test data

### Deployment Scripts

#### Deploy Backend
```bash
./scripts/deploy/deploy-backend.sh
```
- Builds backend
- Runs tests
- Deploys to Azure App Service
- Runs database migrations

#### Deploy Frontend
```bash
./scripts/deploy/deploy-frontend.sh
```
- Builds React app
- Deploys to Azure Static Web Apps or App Service
- Updates CDN

#### Deploy Everything
```bash
./scripts/deploy/deploy-all.sh
```
Deploys both frontend and backend in correct order.

### Database Scripts

#### Run Migrations
```bash
./scripts/db/migrate.sh
```

#### Seed Database
```bash
./scripts/db/seed.sh [--production]
```
Seeds database with:
- Test users (dev only)
- Sample podcasts metadata
- Example jobs

### Utility Scripts

#### Check Azure Costs
```bash
./scripts/utils/check-costs.sh
```
Shows current month Azure spending.

#### Cleanup Storage
```bash
./scripts/utils/cleanup-storage.sh [--days 7]
```
Deletes:
- Audio files older than 7 days
- Temporary files
- Failed job artifacts

#### Generate API Key
```bash
./scripts/utils/generate-api-keys.sh <user-email>
```
Generates a new API key for a user.

## Requirements

Scripts require:
- **Bash** (zsh compatible)
- **Node.js** 18+
- **Azure CLI** (`brew install azure-cli`)
- **jq** for JSON parsing (`brew install jq`)
- **PostgreSQL CLI tools** (if using PostgreSQL)

## Environment Variables

Scripts read from `.env` files or these environment variables:

```bash
# Azure
AZURE_SUBSCRIPTION_ID=xxx
AZURE_RESOURCE_GROUP=transcribedd-rg
AZURE_LOCATION=eastus

# Database
DATABASE_URL=postgresql://...
# or
COSMOS_ENDPOINT=https://...

# Storage
AZURE_STORAGE_CONNECTION_STRING=...

# App Service
AZURE_APP_SERVICE_NAME=transcribedd-api
```

## Creating New Scripts

When creating a new script:

1. **Add to appropriate folder** (setup/deploy/db/dev/utils)
2. **Make executable**: `chmod +x script-name.sh`
3. **Add shebang**: `#!/bin/bash` (or `#!/usr/bin/env bash`)
4. **Add help message**: Support `--help` flag
5. **Check dependencies**: Verify required tools are installed
6. **Error handling**: Set `set -euo pipefail`
7. **Document**: Add description to this README

### Script Template

```bash
#!/bin/bash
set -euo pipefail

# Script description
# Usage: ./script-name.sh [options]

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Help message
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Usage: $0 [options]"
    echo ""
    echo "Description of what this script does"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    exit 0
fi

# Check dependencies
command -v node >/dev/null 2>&1 || { 
    echo -e "${RED}Error: Node.js is required${NC}" >&2
    exit 1
}

# Main logic here
echo -e "${GREEN}✓ Script completed successfully${NC}"
```

## CI/CD Integration

These scripts are used in GitHub Actions workflows:

- `.github/workflows/deploy-backend.yml` → `scripts/deploy/deploy-backend.sh`
- `.github/workflows/deploy-frontend.yml` → `scripts/deploy/deploy-frontend.sh`

## Testing Scripts

Test scripts locally before committing:

```bash
# Lint shell scripts
shellcheck scripts/**/*.sh

# Test individual script
bash -n script-name.sh  # Syntax check
./script-name.sh --help  # Help output
```

## Common Issues

### Permission Denied
```bash
chmod +x scripts/**/*.sh
```

### Azure CLI Not Logged In
```bash
az login
az account set --subscription <subscription-id>
```

### Environment Variables Not Set
```bash
# Copy and edit .env
cp .env.example .env
# Then source it
source .env
```

## Contributing

When adding new scripts:
- Keep them focused on one task
- Make them idempotent (safe to run multiple times)
- Add proper error handling
- Document in this README
- Test on clean environment
