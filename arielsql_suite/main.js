// Usage: node main.js
import fs from "fs";
import path from "path";
import solc from "solc";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
dotenvExpand.expand(dotenv.config());

// --- RAW ADDRESSES (all lowercase) ---
const RAW = {
  scw: "0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2",
  balancer_vault: "0xba12222222228d8ba445958a75a0704d566bf2c8",
  bwzc: "0x54d1c2889b08cad0932266eade15ec884fa0cdc2",
  usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  weth: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  univ3_router: "0xe592427a0aece92de3edee1f18e0157c05861564",
  univ2_router: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
  sushi_router: "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f",
  quoter_v2: "0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6",
  entrypoint: "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789",
  chainlink_ethusd: "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419",
  chainlink_ethusd_secondary: "0x0000000000000000000000000000000000000000", // Placeholder
  univ3_bw_usdc: "0x261c64d4d96ebfa14398b52d93c9d063e3a619f8",
  univ3_bw_weth: "0x142c3dce0a5605fb385fae7760302fab761022aa",
  univ2_bw_usdc: "0xb3911905f8a6160ef89391442f85eca7c397859c",
  univ2_bw_weth: "0x6dF6F882ED69918349F75Fe397b37e62C04515b6",
  sushi_bw_usdc: "0x9d2f8f9a2e3c240decbbe23e9b3521e6ca2489d1",
  sushi_bw_weth: "0xe9e62c8cc585c21fb05fd82fb68e0129711869f9",
  bal_bw_usdc: "0x6659db7c55c701bc627fa2855bfbbc6d75d6fd7a",
  bal_bw_weth: "0x9b143788f52daa8c91cf5162fb1b981663a8a1ef",
  position_manager: "0xc36442b4a4522e871399cd717abdd847ab11fe88",
  // Dual paymasters (from your deployment logs)
  paymaster_a: "0x4e073aaa36cd51fd37298f87e3fce8437a08dd71",
  paymaster_b: "0x79a515d5a085d2b86aff104ec9c8c2152c9549c0"
};

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
  
  try {
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    if (output.errors) {
      const errs = output.errors.filter(e => e.severity === "error");
      if (errs.length) {
        console.log(`  ❌ Compilation failed: ${errs[0].message}`);
        return null;
      }
      // Show warnings
      output.errors.filter(e => e.severity === "warning").forEach(w => console.warn(`  ⚠️ ${w.message}`));
    }
    
    const compiled = output.contracts[fileName]?.WarehouseBalancerArb;
    if (!compiled) {
      console.log(`  ❌ Contract WarehouseBalancerArb not found in compilation output`);
      return null;
    }
    
    const bytecode = "0x" + compiled.evm.bytecode.object;
    const deployedBytecode = "0x" + compiled.evm.deployedBytecode.object;
    
    return {
      bytecode: bytecode,
      deployedBytecode: deployedBytecode,
      deployedSize: (compiled.evm.deployedBytecode.object.length / 2),
      creationSize: (compiled.evm.bytecode.object.length / 2),
      success: true,
      abi: compiled.abi
    };
  } catch (error) {
    console.log(`  ❌ Compilation error: ${error.message}`);
    return null;
  }
}

function analyzeBytecode(bytecode, name) {
  if (!bytecode) return;
  
  const size = bytecode.length / 2 - 1; // Remove 0x prefix
  console.log(`  Bytecode size: ${size.toLocaleString()} bytes`);
  
  // Check if matches your deployed size (16,589 bytes)
  if (size === 16589) {
    console.log(`  ✅ MATCHES your deployed size (16,589 bytes)!`);
  }
  
  // Show first 100 characters
  console.log(`  First 100 chars: ${bytecode.substring(0, 100)}...`);
  
  // Analyze for common patterns
  const hasConstructor = bytecode.includes("60806040") || bytecode.includes("6080604052");
  console.log(`  Has constructor: ${hasConstructor ? "Yes" : "No"}`);
  
  return size;
}

// --- Main: Compile Only ---
async function main() {
  console.log("=== Bytecode Size Analyzer (NO DEPLOYMENT) ===\n");
  const { fullPath } = findContractFile();
  console.log("Source file:", fullPath);
  
  // Read and analyze source
  const source = fs.readFileSync(fullPath, "utf8");
  const sourceSize = Buffer.byteLength(source, 'utf8');
  const lines = source.split('\n').length;
  
  console.log("\n" + "=".repeat(60));
  console.log("SOURCE FILE ANALYSIS");
  console.log("=".repeat(60));
  console.log(`Size: ${sourceSize.toLocaleString()} bytes`);
  console.log(`Lines: ${lines}`);
  console.log(`Characters: ${source.length.toLocaleString()}`);
  
  // Check for the 24,420 byte comment
  if (source.includes("24,420 bytes")) {
    console.log("\n⚠️  Found comment claiming 24,420 bytes in source code");
  }
  
  // Check if it has the struct constructor
  if (source.includes("struct DeploymentConfig")) {
    console.log("✅ Has struct-based constructor");
  } else if (source.includes("constructor(")) {
    console.log("❌ Has regular constructor (may have stack issues)");
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("COMPILATION TESTS");
  console.log("=".repeat(60));
  
  // Test different compiler settings
  const tests = [
    { name: "NO OPTIMIZATION, NO viaIR", opt: false, runs: 0, viaIR: false },
    { name: "NO OPTIMIZATION, WITH viaIR", opt: false, runs: 0, viaIR: true },
    { name: "OPT runs=1, viaIR (YOUR CURRENT)", opt: true, runs: 1, viaIR: true },
    { name: "OPT runs=200, viaIR", opt: true, runs: 200, viaIR: true },
    { name: "OPT runs=200, NO viaIR", opt: true, runs: 200, viaIR: false },
    { name: "OPT runs=1000, viaIR", opt: true, runs: 1000, viaIR: true },
  ];
  
  const results = [];
  
  for (const test of tests) {
    console.log(`\n🔧 Testing: ${test.name}`);
    console.log(`  Settings: optimizer=${test.opt}, runs=${test.runs}, viaIR=${test.viaIR}`);
    
    const result = compileWithSettings(source, "WarehouseBalancerArb.sol", test.opt, test.runs, test.viaIR);
    
    if (result && result.success) {
      console.log(`  ✅ Success: ${result.deployedSize.toLocaleString()} bytes`);
      results.push({
        name: test.name,
        size: result.deployedSize,
        settings: test,
        bytecode: result.deployedBytecode
      });
      
      analyzeBytecode(result.deployedBytecode, test.name);
    } else {
      console.log(`  ❌ Failed to compile`);
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(60));
  
  if (results.length === 0) {
    console.log("❌ No successful compilations!");
    return;
  }
  
  console.log("\n📊 Successful compilations:");
  results.forEach((r, i) => {
    const diffFromTarget = r.size - 16589;
    const diffStr = diffFromTarget === 0 ? "🎯 EXACT MATCH" : 
                   diffFromTarget > 0 ? `+${diffFromTarget}` : `${diffFromTarget}`;
    console.log(`${i+1}. ${r.name}: ${r.size.toLocaleString()} bytes (${diffStr})`);
  });
  
  // Find matches for 16,589 bytes
  const exactMatches = results.filter(r => r.size === 16589);
  const closeMatches = results.filter(r => Math.abs(r.size - 16589) <= 100);
  
  if (exactMatches.length > 0) {
    console.log("\n🎯 EXACT MATCHES FOUND for 16,589 bytes:");
    exactMatches.forEach(match => {
      console.log(`  • ${match.name}`);
      console.log(`    Settings: optimizer=${match.settings.opt}, runs=${match.settings.runs}, viaIR=${match.settings.viaIR}`);
    });
  } else if (closeMatches.length > 0) {
    console.log("\n🔍 CLOSE MATCHES to 16,589 bytes:");
    closeMatches.forEach(match => {
      const diff = match.size - 16589;
      console.log(`  • ${match.name}: ${match.size} bytes (${diff > 0 ? '+' : ''}${diff})`);
    });
  } else {
    console.log("\n❌ NO CLOSE MATCHES to 16,589 bytes");
  }
  
  // Compare bytecodes
  console.log("\n" + "=".repeat(60));
  console.log("BYTECODE COMPARISON");
  console.log("=".repeat(60));
  
  if (results.length >= 2) {
    console.log("\nComparing bytecodes (first 200 chars):");
    const reference = results[0].bytecode.substring(0, 200);
    console.log(`Reference (${results[0].name}): ${reference}`);
    
    for (let i = 1; i < results.length; i++) {
      const compare = results[i].bytecode.substring(0, 200);
      const isSame = reference === compare;
      console.log(`\n${results[i].name}:`);
      console.log(`  First 200 chars: ${compare}`);
      console.log(`  Same as reference: ${isSame ? "✅ YES" : "❌ NO"}`);
    }
  }
  
  // Save detailed results
  const analysisResults = {
    sourceFile: fullPath,
    sourceStats: {
      size: sourceSize,
      lines: lines,
      characters: source.length,
      hasStructConstructor: source.includes("struct DeploymentConfig"),
      claims24420Bytes: source.includes("24,420 bytes")
    },
    compilationResults: results.map(r => ({
      name: r.name,
      size: r.size,
      settings: r.settings,
      bytecodePrefix: r.bytecode.substring(0, 100)
    })),
    targetSize: 16589,
    exactMatches: exactMatches.map(m => m.name),
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync("bytecode-analysis.json", JSON.stringify(analysisResults, null, 2));
  console.log("\n📄 Detailed results saved to bytecode-analysis.json");
  
  // Final recommendations
  console.log("\n" + "=".repeat(60));
  console.log("RECOMMENDATIONS");
  console.log("=".repeat(60));
  
  const viaIRResults = results.filter(r => r.settings.viaIR);
  const noViaIRResults = results.filter(r => !r.settings.viaIR);
  
  if (noViaIRResults.length === 0) {
    console.log("🚨 CONTRACT REQUIRES viaIR TO COMPILE!");
    console.log("   This indicates 'Stack too deep' error in constructor.");
    console.log("   Solution: Use struct-based constructor as suggested.");
  }
  
  if (exactMatches.length > 0) {
    console.log(`\n✅ Found exact match for your deployed size (16,589 bytes)`);
    console.log(`   Use: ${exactMatches[0].name}`);
  }
  
  // Check if any produce close to 24,420 bytes
  const closeTo24420 = results.filter(r => Math.abs(r.size - 24420) <= 500);
  if (closeTo24420.length > 0) {
    console.log(`\n📏 Close to claimed 24,420 bytes:`);
    closeTo24420.forEach(r => {
      console.log(`   ${r.name}: ${r.size} bytes`);
    });
  }
  
  console.log("\n💡 Next steps:");
  console.log("1. Check which settings produce 16,589 bytes");
  console.log("2. If none match, your source may be different than deployed");
  console.log("3. Fix struct constructor if needed");
  console.log("4. Test with optimized settings for production");
}

// --- Run ---
main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
