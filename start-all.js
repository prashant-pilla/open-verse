#!/usr/bin/env node
// Starts both orchestrator and server together
const { spawn } = require('child_process');
const path = require('path');

// Change to script directory
process.chdir(__dirname);

// Start server in background via ts-node launcher (resolves TS paths reliably)
console.log('Starting API server...');
const server = spawn('node', [path.join(__dirname, 'server-launcher.js')], {
  stdio: 'inherit',
  detached: false
});

function startOrchestrator() {
  console.log('Starting orchestrator...');
  const orchestrator = spawn('node', [path.join(__dirname, 'dist', 'index.js')], {
    stdio: 'inherit',
    detached: false
  });

  orchestrator.on('exit', (code) => {
    console.log(`Orchestrator exited with code ${code}`);
    // Respawn after short delay without exiting the whole process
    setTimeout(() => startOrchestrator(), 5000);
  });
}

// Wait a bit for server to start
setTimeout(() => {
  startOrchestrator();
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
