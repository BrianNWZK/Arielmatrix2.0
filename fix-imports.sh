#!/bin/bash
# FIX-IMPORTS.SH: Bulk removal of cyclic imports from all 50+ modules in the 'modules' directory.

MODULES_DIR="modules"
REVENUE_ENGINE_IMPORT_REGEX="^import.*sovereign-revenue-engine\.js.*$"
CONFIG_IMPORT_REGEX="^import.*config/bwaezi-config\.js.*$"
TOTAL_FILES=0
IMPORTS_REMOVED=0

echo "🚀 Starting bulk import refactoring in the $MODULES_DIR directory..."
echo "This script removes synchronous, cyclic imports of Revenue Engine and Config."

if [ ! -d "$MODULES_DIR" ]; then
    echo "❌ Error: '$MODULES_DIR' directory not found. Aborting."
    exit 1
fi

find "$MODULES_DIR" -type f -name "*.js" | while read -r FILE; do
    TOTAL_FILES=$((TOTAL_FILES + 1))
    
    # 1. Remove SovereignRevenueEngine import
    if grep -qE "$REVENUE_ENGINE_IMPORT_REGEX" "$FILE"; then
        sed -i '' -E "/$REVENUE_ENGINE_IMPORT_REGEX/d" "$FILE"
        echo "   - Removed Revenue Engine import from $FILE"
        IMPORTS_REMOVED=$((IMPORTS_REMOVED + 1))
    fi
    
    # 2. Remove bwaezi-config import
    if grep -qE "$CONFIG_IMPORT_REGEX" "$FILE"; then
        # The config must now be passed into the constructor of these modules by the Orchestrator
        # This keeps the module clean and breaks the cycle
        sed -i '' -E "/$CONFIG_IMPORT_REGEX/d" "$FILE"
        echo "   - Removed BWAEZI Config import from $FILE"
        IMPORTS_REMOVED=$((IMPORTS_REMOVED + 1))
    fi

done

echo "✅ Bulk Refactoring Complete."
echo "Total JavaScript files scanned: $TOTAL_FILES"
echo "Total cyclic imports removed: $IMPORTS_REMOVED"
echo "The 50+ modules must now receive their dependencies (config, revenueEngine) via constructor or setter in main.js."
