#!/usr/bin/env bash

# ==========================================
# SelfHeal Release & Publish Pipeline
# ==========================================

# 1. Clean release directory
rm -rf release
mkdir release

echo "🚀 Starting SelfHeal packaging pipeline..."

# 2. Package the main CLI runner (npm pack)
echo "📦 Packaging core CLI library..."
npm pack
# Move the generated tarball to the release folder
mv selfheal-*.tgz release/

# 3. Compile and Package the VS Code extension
echo "🧩 Compiling and packaging VS Code Extension..."
cd vscode-extension

# Compile TS ensuring latest changes are built
npm run compile

# Package the extension using vsce natively
npx vsce package
mv selfheal-vscode-*.vsix ../release/
cd ..

echo "🎉 Build Complete! Release artifacts are ready in the ./release folder:"
ls -lh release/
