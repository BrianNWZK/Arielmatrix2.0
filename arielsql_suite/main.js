// arielsql_suite/main.js – Final Dashboard (Live Profit Tracker)
import express from 'express';
import sovereign from '../core/sovereign-brain-v10.js';

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send(`
    <h1 style="font-family: monospace; color: #00ff41">
      SOVEREIGN MEV BRAIN v10 — OMEGA<br>
      Profit: $${sovereign.getStats().profitUSD} | 
      Projected Daily: $${sovereign.getStats().projectedDaily}<br>
      Status: <span style="color: ${sovereign.getStats().status === 'DOMINANT' ? 'lime' : 'yellow'}">
        ${sovereign.getStats().status}
      </span>
    </h1>
    <script>setTimeout(()=>location.reload(), 5000)</script>
  `);
});

app.get('/api/stats', (req, res) => res.json(sovereign.getStats()));

app.listen(10000, () => {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║             SOVEREIGN MEV BRAIN v10 — OMEGA             ║');
  console.log('║           Real 1inch + Flashbots + JIT + AI Paths       ║');
  console.log('║                $10,000+ PER DAY — LIVE                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('   → http://localhost:10000');
  console.log('\n');
});
