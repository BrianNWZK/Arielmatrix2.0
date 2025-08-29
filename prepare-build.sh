#!/bin/bash
echo "🚀 Preparing build environment..."

# Ensure backend directory exists
mkdir -p backend

# Create backend package.json if it doesn't exist
if [ ! -f "backend/package.json" ]; then
    echo "📦 Creating backend/package.json"
    echo '{"name": "arielsql-backend", "version": "1.0.0"}' > backend/package.json
fi

# Remove any files that might conflict with directories
conflict_files=("arielmatrix2.0" "config" "scripts" "contracts" "public" "frontend")
for item in "${conflict_files[@]}"; do
    if [ -f "$item" ]; then
        echo "⚠️ Removing conflicting file: $item"
        rm -f "$item"
        mkdir -p "$item"
    fi
done

echo "✅ Build environment ready!"
