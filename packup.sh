#!/bin/bash
set -ueo pipefail

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Switch to AWS environment
rm -f .env
ln aws/.env .env

# Create AWS package - exclude source files and dev dependencies
zip -r aws-pack.zip . -x "*.git*" "node_modules/*" "local/*" "aws/*" "src/*" "*.ts" "tsconfig.json"

# Restore local environment
rm -f .env
ln local/.env .env

echo "AWS package created: aws-pack.zip"
