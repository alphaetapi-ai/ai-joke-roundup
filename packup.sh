#!/bin/bash
set -ueo pipefail

zip -r aws-pack.zip . -x "*.git*" "node_modules/*"
