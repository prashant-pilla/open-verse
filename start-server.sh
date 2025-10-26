#!/bin/bash
cd "$(dirname "$0")"
exec npx ts-node src/server.ts

