#!/usr/bin/env node
// Simple launcher that ensures correct working directory
const path = require('path');

// Change to script directory (repo root)
process.chdir(__dirname);

// Register ts-node and run the server
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs'
  }
});

// Now require the TypeScript server file
require('./src/server.ts');

