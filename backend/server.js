import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers.js';
import 'dotenv/config';

import { createBrianNwaezikeChain } from '../backend/blockchain/BrianNwaezikeChain.js';

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 10000;
const HOST = '0.0.0.0';

// 🌐 Public RPC Broadcast Endpoint
app.get('/bwaezi-rpc', async (req, res) => {
  try {
    const chain = await createBrianNwaezikeChain({
      rpcUrl: 'https://arielmatrix2-0-dxbr.onrender.com',
      chainId: 777777,
      contractAddress: '0x4B6E1F4249C03C2E28822A9F52d9C8d5B7E580A1'
    });

    const credentials = await chain.getRealCredentials();
    res.json({
      status: 'LIVE',
      rpcUrl: credentials.BWAEZI_RPC_URL,
      chainId: credentials.BWAEZI_CHAIN_ID,
      blockNumber: credentials.blockNumber,
      gasPrice: credentials.gasPrice,
      health: credentials.healthStatus,
      timestamp: credentials.timestamp
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// 🚀 Start Apollo GraphQL Server
const apolloServer = new ApolloServer({ typeDefs, resolvers });
await apolloServer.start();
app.use('/graphql', express.json(), expressMiddleware(apolloServer));

// 🧠 Start Express Server
app.listen(PORT, HOST, () => {
  console.log(`✅ ArielSQL RPC Server running at http://${HOST}:${PORT}`);
  console.log(`🌍 RPC broadcast available at http://${HOST}:${PORT}/bwaezi-rpc`);
});
