#!/bin/bash
# cleanup-conflicts.sh
echo "🧹 Cleaning up file-directory conflicts..."

conflicts=("arielmatrix2.0" "config" "scripts" "contracts" "public" "frontend" "backend")

for item in "${conflicts[@]}"; do
    if [ -f "$item" ]; then
        echo "⚠️ Removing conflicting file: $item"
        rm -f "$item"
        mkdir -p "$item"
        echo "✅ Created directory: $item"
    elif [ -d "$item" ]; then
        echo "✅ $item is already a directory"
    else
        echo "ℹ️ $item does not exist"
    fi
done

echo "✅ Cleanup complete!"
