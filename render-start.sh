#!/bin/bash
# Render start script - ensures orchestrator AND server run together
node server-launcher.js &
sleep 5
npx ts-node src/index.ts
