#!/usr/bin/env node
// Simple launcher that ensures correct working directory for orchestrator
const path = require('path');

// Change to repo root
process.chdir(__dirname);

// Register ts-node and run the orchestrator entry
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs' }
});

require(path.join(__dirname, 'src', 'index.ts'));


