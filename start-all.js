#!/usr/bin/env node
// Starts both orchestrator and server together
const { spawn } = require('child_process');
const path = require('path');

// Change to script directory
process.chdir(__dirname);

// Start server in background
console.log('Starting API server...');
const server = spawn('node', ['server-launcher.js'], {
  stdio: 'inherit',
  detached: false
});

// Wait a bit for server to start
setTimeout(() => {
  console.log('Starting orchestrator...');
  const orchestrator = spawn('npx', ['ts-node', 'src/index.ts'], {
    stdio: 'inherit',
    detached: false
  });

  orchestrator.on('exit', (code) => {
    console.log(`Orchestrator exited with code ${code}`);
    process.exit(code);
  });
}, 3000);

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

// Handle termination
process.on('SIGTERM', () => {
  server.kill();
  process.exit(0);
});
