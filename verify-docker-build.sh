#!/bin/bash
echo "🔍 Verifying Docker build structure..."

# Check essential files
essential_files=("package.json" "Dockerfile" ".dockerignore")
for file in "${essential_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ ERROR: Missing essential file: $file"
        exit 1
    else
        echo "✅ Found: $file"
    fi
done

# Check directories
directories=("backend" "config" "scripts" "contracts" "public" "arielmatrix2.0")
for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
        echo "⚠️  WARNING: Directory not found: $dir (will be created during build)"
        mkdir -p "$dir"
    else
        echo "✅ Found directory: $dir"
    fi
done

# Check for at least one server file
server_files=("server.js" "backend/server.js" "dist/server.js")
found_server=false
for server_file in "${server_files[@]}"; do
    if [ -f "$server_file" ]; then
        echo "✅ Found server file: $server_file"
        found_server=true
    fi
done

if [ "$found_server" = false ]; then
    echo "⚠️  WARNING: No server.js file found in common locations"
fi

echo "✅ Docker build structure verification completed!"
