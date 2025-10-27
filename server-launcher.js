#!/usr/bin/env node
// Simple launcher that ensures correct working directory
const path = require('path');
const fs = require('fs');

// Change to script directory (repo root)
process.chdir(__dirname);

// Debug: Check if src/server.ts exists
const serverPath = path.join(__dirname, 'src', 'server.ts');
console.log('Looking for server at:', serverPath);
console.log('File exists:', fs.existsSync(serverPath));
console.log('__dirname:', __dirname);
console.log('Full contents of __dirname:', fs.readdirSync(__dirname));
console.log('Does src dir exist?', fs.existsSync(path.join(__dirname, 'src')));
if (fs.existsSync(path.join(__dirname, 'src'))) {
  console.log('Contents of src dir:', fs.readdirSync(path.join(__dirname, 'src')).slice(0, 10));
}

// Register ts-node and run the server
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs'
  }
});

// Now require the TypeScript server file using absolute path
require(serverPath);

