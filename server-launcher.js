#!/usr/bin/env node
// Simple launcher that ensures correct working directory
const path = require('path');
const { execSync } = require('child_process');

// Change to script directory (repo root)
process.chdir(__dirname);

// Run ts-node with the server file
execSync('npx ts-node src/server.ts', { stdio: 'inherit' });

