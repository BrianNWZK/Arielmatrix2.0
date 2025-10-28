// arielsql_suite/main.js - ABSOLUTE MINIMAL PORT BINDING
import http from "http";
import express from "express";

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

app.use(express.json());

// CRITICAL: Instant health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ready', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ message: 'ArielSQL Server - PORT ACTIVE', port: PORT });
});

// 🚨 START SERVER IMMEDIATELY - NO ASYNC, NO PROMISES
const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log(`🎉 SERVER BOUND TO PORT ${PORT}`);
  console.log(`🌐 http://${HOST}:${PORT}`);
  console.log(`🔧 Health: http://${HOST}:${PORT}/health`);
});

// Handle errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`🔄 Port ${PORT} busy, trying ${parseInt(PORT) + 1}...`);
    const altServer = http.createServer(app);
    altServer.listen(parseInt(PORT) + 1, HOST, () => {
      console.log(`✅ Bound to port ${parseInt(PORT) + 1}`);
    });
  }
});

// 🚨 Export nothing - this is a standalone server
export default {};
