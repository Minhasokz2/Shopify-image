#!/bin/bash
set -e

echo "Installing all dependencies (including devDeps for build)..."
npm ci

echo "Building all workspaces..."
npm run build

echo "Build complete!"
