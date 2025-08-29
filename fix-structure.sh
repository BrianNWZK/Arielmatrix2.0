#!/bin/bash
echo "🔧 Fixing project structure..."

# Remove any files that should be directories
conflicts=("arielmatrix2.0" "config" "scripts" "contracts" "public" "frontend")
for item in "${conflicts[@]}"; do
    if [ -f "$item" ]; then
        echo "⚠️ Removing file $item to create directory"
        rm -f "$item"
        mkdir -p "$item"
    fi
done

# Create essential directories
mkdir -p \
    backend/agents \
    backend/blockchain \
    backend/database \
    backend/contracts \
    public/scripts \
    frontend/public \
    frontend/src/components \
    frontend/src/styles

# Create minimal package.json if missing
if [ ! -f "package.json" ]; then
    echo '{"name": "arielsql-suite", "version": "1.0.0"}' > package.json
fi

if [ ! -f "backend/package.json" ]; then
    echo '{"name": "arielsql-backend", "version": "1.0.0"}' > backend/package.json
fi

echo "✅ Project structure fixed!"
