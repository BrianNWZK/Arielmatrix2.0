// Usage: node compile-test.js
import fs from "fs";
import path from "path";
import solc from "solc";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
dotenvExpand.expand(dotenv.config());

// --- Helpers ---
function findContractFile() {
  const baseDir = "arielsql_suite/scripts";
  const files = fs.readdirSync(baseDir);
  const target = files.find(
    f =>
      f.endsWith(".sol") &&
      f.toLowerCase().includes("warehouse") &&
      f.toLowerCase().includes("balancerarb")
  );
  if (!target) throw new Error(`Solidity file not found in ${baseDir}.`);
  return { baseDir, file: target, fullPath: path.join(baseDir, target) };
}

function compileWithSettings(source, fileName, optimizerEnabled, runs = 200, viaIR = false) {
  const input = {
    language: "Solidity",
    sources: { [fileName]: { content: source } },
    settings: {
      optimizer: { 
        enabled: optimizerEnabled, 
        runs: runs 
      },
      viaIR: viaIR,
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
    }
  };
  
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    const errs = output.errors.filter(e => e.severity === "error");
    if (errs.length) {
      errs.forEach(e => console.error(e.formattedMessage));
      throw new Error("Compilation failed");
    }
    output.errors.filter(e => e.severity === "warning").forEach(w => console.warn("Warning:", w.formattedMessage));
  }
  
  const compiled = output.contracts[fileName]?.WarehouseBalancerArb;
  if (!compiled) throw new Error("Contract WarehouseBalancerArb not found.");
  
  return {
    abi: compiled.abi,
    bytecode: "0x" + compiled.evm.bytecode.object,
    deployedBytecode: "0x" + compiled.evm.deployedBytecode.object,
    deployedSize: (compiled.evm.deployedBytecode.object.length / 2),
    creationSize: (compiled.evm.bytecode.object.length / 2)
  };
}

function analyzeBytecode(bytecode) {
  const size = bytecode.length / 2 - 1; // Remove 0x prefix
  console.log(`  Bytecode size: ${size} bytes`);
  console.log(`  Bytecode (first 100 chars): ${bytecode.substring(0, 100)}...`);
  
  // Analyze function selectors (first 4 bytes of function signatures)
  const functionPattern = /60606040|60806040/g;
  const matches = bytecode.match(functionPattern);
  console.log(`  Function entry points found: ${matches ? matches.length : 0}`);
  
  return size;
}

async function main() {
  console.log("=== Bytecode Size Analyzer ===\n");
  const { fullPath } = findContractFile();
  console.log("Source file:", fullPath);
  
  // Get source file stats
  const source = fs.readFileSync(fullPath, "utf8");
  const sourceSize = Buffer.byteLength(source, 'utf8');
  const lines = source.split('\n').length;
  
  console.log(`Source file stats:`);
  console.log(`  Size: ${sourceSize} bytes`);
  console.log(`  Lines: ${lines}`);
  console.log(`  Characters: ${source.length}`);
  
  // Check for the comment about 24,420 bytes
  if (source.includes("24,420 bytes")) {
    console.log("\n⚠️  Found comment claiming 24,420 bytes in source code");
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: NO OPTIMIZATION");
  console.log("=".repeat(60));
  const noOpt = compileWithSettings(source, "test.sol", false);
  console.log(`  Deployed size: ${noOpt.deployedSize} bytes`);
  console.log(`  Creation size: ${noOpt.creationSize} bytes`);
  
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: OPTIMIZATION (runs: 200, no viaIR)");
  console.log("=".repeat(60));
  const opt200 = compileWithSettings(source, "test.sol", true, 200, false);
  console.log(`  Deployed size: ${opt200.deployedSize} bytes`);
  console.log(`  Creation size: ${opt200.creationSize} bytes`);
  
  console.log("\n" + "=".repeat(60));
  console.log("TEST 3: OPTIMIZATION (runs: 1, viaIR) - YOUR CURRENT SETTINGS");
  console.log("=".repeat(60));
  const opt1viaIR = compileWithSettings(source, "test.sol", true, 1, true);
  console.log(`  Deployed size: ${opt1viaIR.deployedSize} bytes`);
  console.log(`  Creation size: ${opt1viaIR.creationSize} bytes`);
  
  console.log("\n" + "=".repeat(60));
  console.log("TEST 4: OPTIMIZATION (runs: 1000, no viaIR)");
  console.log("=".repeat(60));
  const opt1000 = compileWithSettings(source, "test.sol", true, 1000, false);
  console.log(`  Deployed size: ${opt1000.deployedSize} bytes`);
  console.log(`  Creation size: ${opt1000.creationSize} bytes`);
  
  console.log("\n" + "=".repeat(60));
  console.log("SIZE COMPARISON SUMMARY");
  console.log("=".repeat(60));
  console.log(`No optimization:        ${noOpt.deployedSize} bytes`);
  console.log(`Optimized (runs=200):   ${opt200.deployedSize} bytes (${((noOpt.deployedSize - opt200.deployedSize) / noOpt.deployedSize * 100).toFixed(1)}% smaller)`);
  console.log(`Optimized (runs=1):     ${opt1viaIR.deployedSize} bytes (${((noOpt.deployedSize - opt1viaIR.deployedSize) / noOpt.deployedSize * 100).toFixed(1)}% smaller)`);
  console.log(`Optimized (runs=1000):  ${opt1000.deployedSize} bytes (${((noOpt.deployedSize - opt1000.deployedSize) / noOpt.deployedSize * 100).toFixed(1)}% smaller)`);
  
  console.log("\n" + "=".repeat(60));
  console.log("BYTECODE COMPARISON");
  console.log("=".repeat(60));
  
  // Compare bytecodes
  const testBytecodes = [
    { name: "NO OPT", bytecode: noOpt.deployedBytecode },
    { name: "OPT200", bytecode: opt200.deployedBytecode },
    { name: "OPT1viaIR", bytecode: opt1viaIR.deployedBytecode },
    { name: "OPT1000", bytecode: opt1000.deployedBytecode }
  ];
  
  // Find the most common bytecode (likely your deployed one)
  const bytecodeCounts = {};
  testBytecodes.forEach(t => {
    const key = t.bytecode.substring(0, 200); // Compare first 200 chars
    bytecodeCounts[key] = (bytecodeCounts[key] || 0) + 1;
  });
  
  console.log("\nBytecode differences:");
  for (let i = 0; i < testBytecodes.length; i++) {
    for (let j = i + 1; j < testBytecodes.length; j++) {
      const a = testBytecodes[i];
      const b = testBytecodes[j];
      const diff = a.bytecode === b.bytecode ? "IDENTICAL" : "DIFFERENT";
      console.log(`  ${a.name} vs ${b.name}: ${diff}`);
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("RECOMMENDATIONS");
  console.log("=".repeat(60));
  
  if (opt1viaIR.deployedSize < noOpt.deployedSize * 0.7) {
    console.log("⚠️  WARNING: Aggressive optimization (runs=1, viaIR) removes more than 30% of code!");
    console.log("   This suggests significant dead code elimination.");
    console.log("   Check compiler warnings for unused variables/functions.");
  }
  
  if (opt200.deployedSize > noOpt.deployedSize * 0.95) {
    console.log("✅ Good: Standard optimization (runs=200) preserves most code.");
    console.log("   This is recommended for production.");
  }
  
  // Save results
  const results = {
    sourceFile: fullPath,
    sourceSize: sourceSize,
    lines: lines,
    compiledSizes: {
      noOptimization: noOpt.deployedSize,
      optimized200: opt200.deployedSize,
      optimized1viaIR: opt1viaIR.deployedSize,
      optimized1000: opt1000.deployedSize
    },
    recommendations: {
      currentSettings: opt1viaIR.deployedSize === 16589 ? "Matches your deployed size" : "Different from deployed",
      suggestedSettings: opt200.deployedSize < 24560 ? "runs=200 (fits in limit)" : "Too large, needs optimization"
    },
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync("compile-analysis.json", JSON.stringify(results, null, 2));
  console.log("\n📊 Results saved to compile-analysis.json");
  
  // Final check
  console.log("\n" + "=".repeat(60));
  console.log("YOUR CURRENT DEPLOYED SIZE: 16,589 bytes");
  console.log("=".repeat(60));
  
  if (opt1viaIR.deployedSize === 16589) {
    console.log("✅ Your current compiler settings produce 16,589 bytes");
    console.log("   This matches your deployed contract size.");
  } else {
    console.log(`❌ Your current settings produce ${opt1viaIR.deployedSize} bytes`);
    console.log("   This does NOT match your deployed contract (16,589 bytes)");
    console.log("   The source file may be different than what was originally deployed.");
  }
}

// --- Run ---
main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
