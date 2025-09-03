#!/bin/bash
set -ueo pipefail

rm -f .env
ln aws/.env .env
zip -r aws-pack.zip . -x "*.git*" "node_modules/*"
rm -f .env
ln local/.env .env
