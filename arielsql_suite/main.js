import http from "http";
import { ServiceManager } from "./serviceManager.js";
import BrianNwaezikeChain from './backend/blockchain/BrianNwaezikeChain.js';

(async () => {
  try {
    const chain = new BrianNwaezikeChain();
    await chain.initialize();
  } catch (err) {
    console.error('❌ Startup failed:', err);
    process.exit(1);
  }
})();

function startHealthServer() {
  const healthPort = process.env.HEALTH_PORT || 10001;

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", uptime: process.uptime() }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(healthPort, "0.0.0.0", () => {
    console.log(`❤ Health server running on port ${healthPort}`);
  });

  return server;
}

function setupGracefulShutdown(manager, healthServer) {
  async function shutdown() {
    console.log("🛑 Shutdown signal received, stopping services...");
    try {
      await manager.stop();
      if (healthServer) healthServer.close();
      console.log("✅ Shutdown complete.");
    } catch (err) {
      console.error("❌ Error during shutdown:", err);
    } finally {
      process.exit(0);
    }
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function startArielSQLSuite() {
  console.log("🚀 Starting ArielSQL Ultimate Suite (Phase 3 Mainnet Ready)...");

  const serviceManager = new ServiceManager();

  try {
    await serviceManager.init();
    serviceManager.start();
    const healthServer = startHealthServer();
    setupGracefulShutdown(serviceManager, healthServer);
    console.log("✅ ArielSQL Suite is live.");
  } catch (err) {
    console.error("❌ Failed to start suite:", err);
    process.exit(1);
  }
}

startArielSQLSuite();
