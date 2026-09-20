#!/usr/bin/env sh
set -e
npx wrangler r2 bucket create love-invite-media || true
npx wrangler deploy
