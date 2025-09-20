import http from "http";
import { serviceManager } from "./serviceManager.js";
import BrianNwaezikeChain from '../backend/blockchain/BrianNwaezikeChain.js';
import healthAgent from '../backend/agents/healthAgent.js';
import winston from 'winston';

import { registerAllServices } from "./serviceManager.js";
import payoutAgent from "../backend/agents/payoutAgent.js";

async function start() {
  console.log("🚀 Starting ArielMatrix2.0 + BwaeziChain...");
  await registerAllServices();
  payoutAgent.start();
  console.log("✅ All services registered and payout agent activated.");
}

start();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()]
});

(async () => {
  try {
    const chain = new BrianNwaezikeChain();
    await chain.initialize();
    logger.info("✅ BrianNwaezikeChain initialized.");
  } catch (err) {
    logger.error('❌ Chain initialization failed:', err);
    process.exit(1);
  }
})();

function startHealthServer() {
  const healthPort = process.env.HEALTH_PORT || 10001;

  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      try {
        const report = await healthAgent.run({}, logger);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: report.status,
          issues: report.issues,
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        logger.error("❌ HealthAgent failed:", err);
        res.writeHead(500);
        res.end(JSON.stringify({ status: "error", message: err.message }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(healthPort, "0.0.0.0", () => {
    logger.info(`🩺 Health server running on port ${healthPort}`);
  });

  return server;
}

function setupGracefulShutdown(manager, healthServer) {
  async function shutdown() {
    logger.info("🛑 Shutdown signal received, stopping services...");
    try {
      await manager.stop();
      if (healthServer) healthServer.close();
      logger.info("✅ Shutdown complete.");
    } catch (err) {
      logger.error("❌ Error during shutdown:", err);
    } finally {
      process.exit(0);
    }
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function startArielSQLSuite() {
  logger.info("🚀 Starting ArielSQL Ultimate Suite (Phase 3 Mainnet Ready)...");

  const serviceManager = new ServiceManager();

  try {
    await serviceManager.init();
    serviceManager.start();

    const healthServer = startHealthServer();
    setupGracefulShutdown(serviceManager, healthServer);

    logger.info("✅ ArielSQL Suite is live.");
  } catch (err) {
    logger.error("❌ Failed to start suite:", err);
    process.exit(1);
  }
}

startArielSQLSuite();
