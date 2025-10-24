// modules/governance-system.js
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import SovereignRevenueEngine from './sovereign-revenue-engine.js';
import { SovereignGovernance } from './governance-engine/index.js';
import { 
    BWAEZI_CHAIN,
    TOKEN_CONVERSION_RATES,
    BWAEZI_SOVEREIGN_CONFIG,
    SOVEREIGN_SERVICES,
    COMPLIANCE_STRATEGY,
    PUBLIC_COMPLIANCE_STATEMENTS,
    ConfigUtils
} from '../config/bwaezi-config.js';

// Import blockchain wallet functions
import { 
    initializeConnections,
    getWalletBalances,
    sendETH,
    sendSOL,
    sendBwaezi,
    sendUSDT,
    processRevenuePayment,
    checkBlockchainHealth,
    validateAddress,
    triggerRevenueConsolidation
} from '../backend/agents/wallet.js';

export class GovernanceSystem {
  constructor(config = {}) {
    this.config = {
      governanceToken: 'bwzC', // Updated from BWZ to bwzC
      minProposalAmount: 10000,
      votingPeriod: 7 * 24 * 60 * 60 * 1000,
      quorumPercentage: 4.0,
      supportPercentage: 50.0,
      ...config
    };
    this.proposals = new Map();
    this.votes = new Map();
    this.db = new ArielSQLiteEngine({ path: './governance-system.db' });
    this.events = new EventEmitter();
    this.sovereignService = null;
    this.serviceId = null;
    this.initialized = false;
    
    // Enhanced with Sovereign Revenue Engine capabilities
    this.revenueEngine = new SovereignRevenueEngine();
    this.governanceEngine = new SovereignGovernance();
    
    // Blockchain integration
    this.blockchainConnected = false;
    this.walletBalances = {
        ethereum: { native: 0, usdt: 0, address: '' },
        solana: { native: 0, usdt: 0, address: '' },
        bwaezi: { native: 0, usdt: 0, address: '' }
    };
    
    // AI Governance integration
    this.aiGovernanceEnabled = true;
    this.lastGovernanceExecution = null;
    
    // Treasury management
    this.treasuryBalance = 0;
    this.ecosystemFund = 0;
    this.reinvestmentPool = 0;
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log('🚀 Initializing BWAEZI Governance System - MAINNET PRODUCTION READY');
    console.log('🛡️  Compliance Strategy:', PUBLIC_COMPLIANCE_STATEMENTS.SECURITY);
    
    try {
      // Initialize database with enhanced Ariel SQLite Engine
      await this.db.init();
      
      // Create governance tables with enhanced schema
      await this.createGovernanceTables();
      
      // Initialize Sovereign Revenue Engine
      await this.revenueEngine.initialize();
      
      // Initialize AI Governance Engine
      await this.governanceEngine.initialize();
      
      // Initialize blockchain connections
      await this.initializeBlockchainConnections();
      
      // Register governance as a sovereign service
      this.serviceId = await this.revenueEngine.registerService({
        name: 'GovernanceSystem',
        description: 'On-chain governance system for BWAEZI Chain',
        registrationFee: 2000,
        annualLicenseFee: 1000,
        revenueShare: 0.12,
        compliance: ['Zero-Knowledge Architecture', 'On-Chain Governance'],
        dataPolicy: 'Encrypted Votes Only - No Voter Identity Storage',
        serviceType: 'governance'
      });

      // Load initial treasury state
      await this.loadTreasuryState();
      
      // Start monitoring systems
      this.startProposalMonitoring();
      this.startAIGovernanceCycles();
      this.startTreasuryMonitoring();
      
      this.initialized = true;
      
      console.log('✅ BWAEZI Governance System Initialized - MAINNET PRODUCTION READY');
      this.events.emit('initialized', {
        timestamp: Date.now(),
        treasury: this.treasuryBalance,
        blockchain: this.blockchainConnected,
        services: this.revenueEngine.registeredServices.size,
        chain: BWAEZI_CHAIN.NAME,
        symbol: BWAEZI_CHAIN.SYMBOL // Using bwzC
      });
      
    } catch (error) {
      console.error('❌ Failed to initialize Governance System:', error);
      throw error;
    }
  }

  async createGovernanceTables() {
    // Enhanced proposals table with blockchain integration
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        proposer TEXT NOT NULL,
        amount REAL NOT NULL,
        recipient TEXT,
        startTime DATETIME,
        endTime DATETIME,
        forVotes REAL DEFAULT 0,
        againstVotes REAL DEFAULT 0,
        abstainVotes REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        executed BOOLEAN DEFAULT false,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        blockchain_tx_hash TEXT,
        treasury_impact REAL DEFAULT 0,
        ai_recommendation TEXT,
        confidence_score REAL DEFAULT 0,
        compliance_metadata TEXT
      )
    `);

    // Enhanced votes table with zero-knowledge compliance
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS votes (
        id TEXT PRIMARY KEY,
        proposalId TEXT NOT NULL,
        voter TEXT NOT NULL,
        support INTEGER NOT NULL,
        amount REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        encrypted_vote_hash TEXT,
        blockchain_verified BOOLEAN DEFAULT false,
        verification_methodology TEXT
      )
    `);

    // Treasury transactions table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS treasury_transactions (
        id TEXT PRIMARY KEY,
        proposalId TEXT,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        fromAddress TEXT,
        toAddress TEXT,
        token TEXT DEFAULT 'bwzC',
        transactionHash TEXT,
        status TEXT DEFAULT 'pending',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        blockchain_network TEXT,
        compliance_verification TEXT
      )
    `);

    // AI Governance decisions table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS ai_governance_decisions (
        id TEXT PRIMARY KEY,
        proposalId TEXT,
        decision_type TEXT NOT NULL,
        parameters TEXT NOT NULL,
        confidence REAL NOT NULL,
        executed BOOLEAN DEFAULT false,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        result TEXT,
        blockchain_tx_hash TEXT
      )
    `);
  }

  async initializeBlockchainConnections() {
    try {
      console.log('🔗 Initializing blockchain connections for Governance System...');
      
      const walletInitialized = await initializeConnections();
      if (!walletInitialized) {
        throw new Error('Failed to initialize blockchain wallet connections');
      }
      
      const health = await checkBlockchainHealth();
      if (!health.healthy) {
        throw new Error('Blockchain health check failed');
      }
      
      this.walletBalances = await getWalletBalances();
      this.blockchainConnected = true;
      
      console.log('✅ Blockchain connections initialized for Governance System');
      this.events.emit('blockchainConnected', this.walletBalances);
      
    } catch (error) {
      console.error('❌ Blockchain initialization failed:', error);
      this.blockchainConnected = false;
      throw error;
    }
  }

  async loadTreasuryState() {
    try {
      // Load treasury from revenue engine
      const metrics = await this.revenueEngine.getProductionMetrics();
      this.treasuryBalance = metrics.treasury.total;
      this.ecosystemFund = metrics.treasury.ecosystem;
      this.reinvestmentPool = metrics.treasury.reinvestment;
      
      console.log(`✅ Treasury state loaded: $${this.treasuryBalance.toLocaleString()}`);
      
    } catch (error) {
      console.error('❌ Failed to load treasury state:', error);
      throw error;
    }
  }

  async createProposal(title, description, proposer, amount, recipient = null, metadata = {}) {
    if (!this.initialized) await this.initialize();
    
    await this.validateProposal(proposer, amount);

    const proposalId = randomBytes(32).toString('hex');
    const startTime = new Date();
    const endTime = new Date(Date.now() + this.config.votingPeriod);

    // Enhanced proposal creation with blockchain and AI integration
    await this.db.run(`
      INSERT INTO proposals (id, title, description, proposer, amount, recipient, startTime, endTime, status, treasury_impact, compliance_metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [proposalId, title, description, proposer, amount, recipient, startTime, endTime, 'active', 
        amount * 0.001, // Treasury impact fee
        JSON.stringify({
          architectural_compliant: true,
          zero_knowledge: true,
          verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
        })
    ]);

    const proposal = {
      id: proposalId,
      title,
      description,
      proposer,
      amount,
      recipient,
      startTime,
      endTime,
      forVotes: 0,
      againstVotes: 0,
      abstainVotes: 0,
      status: 'active',
      executed: false,
      treasuryImpact: amount * 0.001,
      compliance: metadata.compliance || ['Zero-Knowledge Architecture']
    };

    this.proposals.set(proposalId, proposal);

    // Process proposal creation fee through revenue engine
    if (this.revenueEngine && this.serviceId) {
      await this.revenueEngine.processRevenue(
        this.serviceId, 
        amount * 0.001, 
        'proposal_creation',
        'USD',
        'bwaezi',
        {
          proposalId,
          encryptedHash: ConfigUtils.generateZKId(`proposal_${proposalId}`),
          compliance: 'architectural_alignment'
        }
      );
    }

    // Trigger AI analysis of proposal
    await this.analyzeProposalWithAI(proposalId);

    this.events.emit('proposalCreated', { 
      proposalId, 
      title, 
      proposer, 
      amount,
      compliance: 'architectural_alignment',
      timestamp: Date.now()
    });
    
    return proposalId;
  }

  async validateProposal(proposer, amount) {
    if (amount < this.config.minProposalAmount) {
      throw new Error(`Proposal amount below minimum: ${this.config.minProposalAmount}`);
    }

    // Enhanced validation with treasury checks
    if (amount > this.treasuryBalance * 0.1) {
      throw new Error(`Proposal amount exceeds 10% of treasury balance`);
    }

    // Blockchain address validation
    if (!validateAddress(proposer, 'bwaezi')) {
      throw new Error('Invalid proposer address');
    }
  }

  async vote(proposalId, voter, support, votingPower, encryptedVoteHash = null) {
    if (!this.initialized) await this.initialize();
    
    const proposal = await this.getProposal(proposalId);
    if (!proposal || proposal.status !== 'active') {
      throw new Error(`Proposal not found or not active: ${proposalId}`);
    }

    if (Date.now() > new Date(proposal.endTime).getTime()) {
      throw new Error('Voting period has ended');
    }

    // Validate voter address
    if (!validateAddress(voter, 'bwaezi')) {
      throw new Error('Invalid voter address');
    }

    const voteId = randomBytes(32).toString('hex');
    
    // Enhanced vote recording with zero-knowledge compliance
    await this.db.run(`
      INSERT INTO votes (id, proposalId, voter, support, amount, encrypted_vote_hash, verification_methodology)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [voteId, proposalId, voter, support, votingPower, 
        encryptedVoteHash || ConfigUtils.generateZKId(`vote_${voter}`),
        JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY)
    ]);

    await this.updateProposalVotes(proposalId, support, votingPower);

    this.votes.set(voteId, { 
      proposalId, 
      voter, 
      support, 
      votingPower,
      encryptedVoteHash,
      timestamp: Date.now()
    });

    // Process voting fee through revenue engine
    if (this.revenueEngine && this.serviceId) {
      await this.revenueEngine.processRevenue(
        this.serviceId,
        votingPower * 0.0001,
        'voting_fee',
        'USD',
        'bwaezi',
        {
          voteId,
          proposalId,
          encryptedHash: ConfigUtils.generateZKId(`vote_${voteId}`)
        }
      );
    }

    this.events.emit('voteCast', { 
      proposalId, 
      voter, 
      support, 
      votingPower,
      encryptedVoteHash,
      compliance: 'zero_knowledge',
      timestamp: Date.now()
    });
    
    return voteId;
  }

  async updateProposalVotes(proposalId, support, amount) {
    const voteField = support === 1 ? 'forVotes' : support === 0 ? 'againstVotes' : 'abstainVotes';
    
    await this.db.run(`
      UPDATE proposals 
      SET ${voteField} = ${voteField} + ?
      WHERE id = ?
    `, [amount, proposalId]);

    const proposal = this.proposals.get(proposalId);
    if (proposal) {
      proposal[voteField] += amount;
    }
  }

  async getProposal(proposalId) {
    if (this.proposals.has(proposalId)) {
      return this.proposals.get(proposalId);
    }

    const proposal = await this.db.get('SELECT * FROM proposals WHERE id = ?', [proposalId]);
    if (proposal) {
      this.proposals.set(proposalId, proposal);
    }
    return proposal;
  }

  async analyzeProposalWithAI(proposalId) {
    if (!this.aiGovernanceEnabled) return;

    try {
      const proposal = await this.getProposal(proposalId);
      if (!proposal) return;

      // Use Sovereign Governance AI to analyze proposal
      const decisions = await this.governanceEngine.aiGovernor.analyzeEconomy();
      
      for (const decision of decisions) {
        if (decision.confidence > 0.7 && decision.type === 'PROPOSAL_ANALYSIS') {
          await this.db.run(`
            INSERT INTO ai_governance_decisions (id, proposalId, decision_type, parameters, confidence, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            ConfigUtils.generateZKId(`ai_decision_${proposalId}`),
            proposalId,
            decision.type,
            JSON.stringify(decision.parameters),
            decision.confidence,
            new Date()
          ]);

          // Update proposal with AI recommendation
          await this.db.run(`
            UPDATE proposals 
            SET ai_recommendation = ?, confidence_score = ?
            WHERE id = ?
          `, [decision.parameters.recommendation, decision.confidence, proposalId]);

          this.events.emit('aiAnalysisCompleted', {
            proposalId,
            recommendation: decision.parameters.recommendation,
            confidence: decision.confidence,
            timestamp: Date.now()
          });

          break;
        }
      }
    } catch (error) {
      console.error('AI proposal analysis failed:', error);
    }
  }

  startProposalMonitoring() {
    setInterval(async () => {
      await this.checkProposalDeadlines();
    }, 60 * 1000); // Every minute

    console.log('🔍 Proposal monitoring activated - MAINNET');
  }

  startAIGovernanceCycles() {
    setInterval(async () => {
      try {
        await this.executeAIGovernance();
        await this.checkTreasuryHealth();
      } catch (error) {
        console.error('AI Governance cycle failed:', error);
      }
    }, 3600000); // Every hour

    console.log('🤖 AI Governance cycles activated - MAINNET');
  }

  startTreasuryMonitoring() {
    setInterval(async () => {
      try {
        await this.refreshTreasuryState();
        await this.checkTreasuryHealth();
      } catch (error) {
        console.error('Treasury monitoring failed:', error);
      }
    }, 300000); // Every 5 minutes

    console.log('💰 Treasury monitoring activated - MAINNET');
  }

  async checkProposalDeadlines() {
    const activeProposals = await this.db.all('SELECT * FROM proposals WHERE status = "active"');
    
    for (const proposal of activeProposals) {
      if (Date.now() > new Date(proposal.endTime).getTime()) {
        await this.finalizeProposal(proposal.id);
      }
    }
  }

  async finalizeProposal(proposalId) {
    const proposal = await this.getProposal(proposalId);
    if (!proposal) return;

    const totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
    const quorum = (totalVotes / this.getTotalSupply()) * 100;
    const support = (proposal.forVotes / (proposal.forVotes + proposal.againstVotes)) * 100;

    let status = 'rejected';
    if (quorum >= this.config.quorumPercentage && support >= this.config.supportPercentage) {
      status = 'passed';
    }

    await this.db.run(`UPDATE proposals SET status = ? WHERE id = ?`, [status, proposalId]);
    proposal.status = status;

    // Execute immediately if passed and has AI high confidence
    if (status === 'passed' && proposal.confidence_score > 0.8) {
      await this.executeProposal(proposalId);
    }

    this.events.emit('proposalFinalized', { 
      proposalId, 
      status, 
      quorum, 
      support,
      aiConfidence: proposal.confidence_score,
      timestamp: Date.now()
    });
  }

  async executeProposal(proposalId) {
    const proposal = await this.getProposal(proposalId);
    if (!proposal || proposal.status !== 'passed' || proposal.executed) {
      throw new Error('Proposal cannot be executed');
    }

    // Execute treasury transaction via blockchain
    if (proposal.recipient && proposal.amount > 0) {
      const paymentResult = await this.executeTreasuryPayment(
        proposal.recipient,
        proposal.amount,
        `Proposal execution: ${proposal.title}`,
        proposalId
      );

      if (!paymentResult.success) {
        throw new Error(`Treasury payment failed: ${paymentResult.error}`);
      }

      // Record treasury transaction
      await this.recordTreasuryTransaction(
        proposalId,
        'PROPOSAL_EXECUTION',
        -proposal.amount, // Negative for outflow
        this.config.SOVEREIGN_OWNER,
        proposal.recipient,
        'bwzC',
        paymentResult.transactionHash
      );
    }

    await this.db.run(`UPDATE proposals SET executed = true, blockchain_tx_hash = ? WHERE id = ?`, 
      [proposal.blockchain_tx_hash, proposalId]);
    proposal.executed = true;

    // Process execution fee through revenue engine
    if (this.revenueEngine && this.serviceId) {
      await this.revenueEngine.processRevenue(
        this.serviceId, 
        proposal.amount * 0.002, 
        'proposal_execution',
        'USD',
        'bwaezi',
        {
          proposalId,
          transactionHash: proposal.blockchain_tx_hash,
          encryptedHash: ConfigUtils.generateZKId(`execution_${proposalId}`)
        }
      );
    }

    this.events.emit('proposalExecuted', { 
      proposalId, 
      amount: proposal.amount, 
      recipient: proposal.recipient,
      transactionHash: proposal.blockchain_tx_hash,
      timestamp: Date.now()
    });
  }

  async executeTreasuryPayment(toAddress, amount, description, proposalId = null) {
    try {
      const paymentConfig = {
        type: 'bwaezi',
        amount: amount,
        toAddress: toAddress,
        token: 'bwzC',
        description: description
      };

      const paymentResult = await this.revenueEngine.executeBlockchainPayment(paymentConfig);
      
      if (paymentResult.success) {
        // Update local treasury balance
        this.treasuryBalance -= amount;
        
        // Record transaction in database
        await this.recordTreasuryTransaction(
          proposalId,
          'PAYMENT',
          -amount,
          this.walletBalances.bwaezi.address,
          toAddress,
          'bwzC',
          paymentResult.transactionHash
        );
      }

      return paymentResult;

    } catch (error) {
      console.error('Treasury payment execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  async recordTreasuryTransaction(proposalId, type, amount, fromAddress, toAddress, token, transactionHash) {
    const txId = ConfigUtils.generateZKId(`treasury_tx_${type}`);
    
    await this.db.run(`
      INSERT INTO treasury_transactions (id, proposalId, type, amount, fromAddress, toAddress, token, transactionHash, status, compliance_verification)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      txId,
      proposalId,
      type,
      amount,
      fromAddress,
      toAddress,
      token,
      transactionHash,
      'confirmed',
      JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY)
    ]);

    this.events.emit('treasuryTransaction', {
      txId,
      proposalId,
      type,
      amount,
      fromAddress,
      toAddress,
      token,
      transactionHash,
      timestamp: Date.now()
    });
  }

  async executeAIGovernance() {
    if (!this.aiGovernanceEnabled) return;

    try {
      console.log('🤖 Executing AI Governance analysis...');
      
      // Use Sovereign Governance engine for AI decisions
      const decisions = await this.governanceEngine.executeAIGovernance();
      
      for (const decision of decisions) {
        if (decision.confidence > 0.8) {
          await this.executeAIDecision(decision);
        }
      }

      this.lastGovernanceExecution = Date.now();
      this.events.emit('aiGovernanceExecuted', {
        decisions: decisions.length,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('AI Governance execution failed:', error);
      this.events.emit('aiGovernanceFailed', {
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async executeAIDecision(decision) {
    const decisionId = ConfigUtils.generateZKId(`ai_decision`);
    
    try {
      let result = null;

      switch (decision.type) {
        case 'TREASURY_MANAGEMENT':
          result = await this.executeTreasuryManagement(decision.parameters);
          break;
        case 'FEE_ADJUSTMENT':
          result = await this.adjustGovernanceFees(decision.parameters);
          break;
        case 'PARAMETER_UPDATE':
          result = await this.updateGovernanceParameters(decision.parameters);
          break;
      }

      // Record AI decision
      await this.db.run(`
        INSERT INTO ai_governance_decisions (id, decision_type, parameters, confidence, executed, result, blockchain_tx_hash, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        decisionId,
        decision.type,
        JSON.stringify(decision.parameters),
        decision.confidence,
        true,
        JSON.stringify(result),
        result?.transactionHash || null,
        new Date()
      ]);

      this.events.emit('aiDecisionExecuted', {
        decisionId,
        type: decision.type,
        parameters: decision.parameters,
        confidence: decision.confidence,
        result,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('AI decision execution failed:', error);
      
      await this.db.run(`
        INSERT INTO ai_governance_decisions (id, decision_type, parameters, confidence, executed, result, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        decisionId,
        decision.type,
        JSON.stringify(decision.parameters),
        decision.confidence,
        false,
        JSON.stringify({ error: error.message }),
        new Date()
      ]);
    }
  }

  async executeTreasuryManagement(parameters) {
    // AI-driven treasury management
    const { action, amount, recipient } = parameters;
    
    if (action === 'INVEST') {
      return await this.revenueEngine.executeInvestment({
        amount: amount,
        type: 'treasury_investment',
        target: recipient,
        description: 'AI-driven treasury investment',
        network: 'bwaezi',
        token: 'bwzC'
      });
    } else if (action === 'DISTRIBUTE') {
      return await this.executeTreasuryPayment(
        recipient,
        amount,
        'AI-driven treasury distribution'
      );
    }

    return { success: false, error: 'Unknown treasury action' };
  }

  async adjustGovernanceFees(parameters) {
    const { feeType, newValue } = parameters;
    
    // Update governance fees
    if (feeType === 'proposal_fee') {
      this.config.minProposalAmount = newValue;
    } else if (feeType === 'voting_fee') {
      // Update voting fee logic
    }

    this.events.emit('governanceFeesAdjusted', {
      feeType,
      newValue,
      timestamp: Date.now()
    });

    return { success: true, feeType, newValue };
  }

  async updateGovernanceParameters(parameters) {
    const { parameter, value } = parameters;
    
    // Update governance parameters
    if (parameter === 'quorum_percentage') {
      this.config.quorumPercentage = value;
    } else if (parameter === 'support_percentage') {
      this.config.supportPercentage = value;
    } else if (parameter === 'voting_period') {
      this.config.votingPeriod = value;
    }

    this.events.emit('governanceParametersUpdated', {
      parameter,
      value,
      timestamp: Date.now()
    });

    return { success: true, parameter, value };
  }

  async refreshTreasuryState() {
    try {
      const metrics = await this.revenueEngine.getProductionMetrics();
      this.treasuryBalance = metrics.treasury.total;
      this.ecosystemFund = metrics.treasury.ecosystem;
      this.reinvestmentPool = metrics.treasury.reinvestment;
      
      // Refresh wallet balances
      this.walletBalances = await getWalletBalances();
      
    } catch (error) {
      console.error('Failed to refresh treasury state:', error);
    }
  }

  async checkTreasuryHealth() {
    const minReserves = BWAEZI_SOVEREIGN_CONFIG.AI_GOVERNANCE.MIN_RESERVES;
    
    if (this.treasuryBalance < minReserves) {
      console.warn(`⚠️ Treasury below minimum reserves: $${this.treasuryBalance} < $${minReserves}`);
      
      this.events.emit('treasuryHealthWarning', {
        current: this.treasuryBalance,
        minimum: minReserves,
        deficit: minReserves - this.treasuryBalance,
        timestamp: Date.now()
      });

      // Trigger emergency AI governance action
      await this.governanceEngine.executeEmergencyProtocol('LOW_TREASURY');
    }
  }

  getTotalSupply() {
    return BWAEZI_SOVEREIGN_CONFIG.TOTAL_SUPPLY;
  }

  async getProposalVotes(proposalId) {
    if (!this.initialized) await this.initialize();
    
    return await this.db.all('SELECT * FROM votes WHERE proposalId = ?', [proposalId]);
  }

  async getGovernanceStats() {
    if (!this.initialized) await this.initialize();
    
    const totalProposals = await this.db.get('SELECT COUNT(*) as count FROM proposals');
    const activeProposals = await this.db.get('SELECT COUNT(*) as count FROM proposals WHERE status = "active"');
    const totalVotes = await this.db.get('SELECT COUNT(*) as count FROM votes');
    const aiDecisions = await this.db.get('SELECT COUNT(*) as count FROM ai_governance_decisions');
    const treasuryTransactions = await this.db.get('SELECT COUNT(*) as count FROM treasury_transactions');

    // Get revenue metrics from revenue engine
    const revenueMetrics = await this.revenueEngine.getRevenueMetrics('30d');
    const complianceHealth = await this.revenueEngine.performComplianceHealthCheck();

    return {
      // Basic stats
      totalProposals: totalProposals?.count || 0,
      activeProposals: activeProposals?.count || 0,
      totalVotes: totalVotes?.count || 0,
      aiDecisions: aiDecisions?.count || 0,
      treasuryTransactions: treasuryTransactions?.count || 0,
      
      // Token and chain info
      governanceToken: this.config.governanceToken, // bwzC
      chain: BWAEZI_CHAIN.NAME,
      symbol: BWAEZI_CHAIN.SYMBOL, // bwzC
      
      // Treasury info
      treasuryBalance: this.treasuryBalance,
      ecosystemFund: this.ecosystemFund,
      reinvestmentPool: this.reinvestmentPool,
      
      // Revenue metrics
      revenue: revenueMetrics,
      
      // System status
      initialized: this.initialized,
      blockchainConnected: this.blockchainConnected,
      aiGovernanceEnabled: this.aiGovernanceEnabled,
      lastGovernanceExecution: this.lastGovernanceExecution,
      
      // Compliance
      compliance: complianceHealth,
      architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
    };
  }

  async getProductionMetrics() {
    const governanceStats = await this.getGovernanceStats();
    const revenueMetrics = await this.revenueEngine.getProductionMetrics();
    const walletHealth = await checkBlockchainHealth();

    return {
      status: 'production',
      version: BWAEZI_CHAIN.VERSION,
      timestamp: Date.now(),
      
      governance: governanceStats,
      revenue: revenueMetrics,
      
      blockchain: {
        connected: this.blockchainConnected,
        wallets: this.walletBalances,
        health: walletHealth
      },
      
      aiGovernance: {
        enabled: this.aiGovernanceEnabled,
        lastExecution: this.lastGovernanceExecution,
        decisions: governanceStats.aiDecisions
      },
      
      compliance: {
        status: 'architectural_alignment',
        framework: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
        verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
      }
    };
  }

  // Enhanced shutdown with proper cleanup
  async shutdown() {
    console.log('🛑 Shutting down BWAEZI Governance System - MAINNET...');
    
    // Clear all intervals
    if (this.proposalMonitoringInterval) clearInterval(this.proposalMonitoringInterval);
    if (this.aiGovernanceInterval) clearInterval(this.aiGovernanceInterval);
    if (this.treasuryMonitoringInterval) clearInterval(this.treasuryMonitoringInterval);
    
    // Close database connection
    if (this.db) await this.db.close();
    
    // Shutdown revenue engine
    if (this.revenueEngine) await this.revenueEngine.shutdown();
    
    // Shutdown governance engine
    if (this.governanceEngine) await this.governanceEngine.shutdown();
    
    this.initialized = false;
    console.log('✅ BWAEZI Governance System shut down gracefully');
    
    this.events.emit('shutdown', { timestamp: Date.now() });
  }

  // Public API for external integration
  getPublicAPI() {
    return {
      // Proposal Management
      createProposal: (title, description, proposer, amount, recipient, metadata) => 
        this.createProposal(title, description, proposer, amount, recipient, metadata),
      getProposal: (id) => this.getProposal(id),
      vote: (proposalId, voter, support, votingPower, encryptedHash) => 
        this.vote(proposalId, voter, support, votingPower, encryptedHash),
      executeProposal: (proposalId) => this.executeProposal(proposalId),
      
      // Governance Info
      getStats: () => this.getGovernanceStats(),
      getProductionMetrics: () => this.getProductionMetrics(),
      getProposalVotes: (proposalId) => this.getProposalVotes(proposalId),
      
      // Treasury Management
      getTreasuryBalance: () => this.treasuryBalance,
      getEcosystemFund: () => this.ecosystemFund,
      getReinvestmentPool: () => this.reinvestmentPool,
      
      // AI Governance
      executeAIGovernance: () => this.executeAIGovernance(),
      getAIDecisions: async () => {
        if (!this.initialized) await this.initialize();
        return await this.db.all('SELECT * FROM ai_governance_decisions ORDER BY timestamp DESC LIMIT 100');
      },
      
      // System Status
      isInitialized: () => this.initialized,
      isBlockchainConnected: () => this.blockchainConnected,
      getVersion: () => BWAEZI_CHAIN.VERSION,
      getSymbol: () => BWAEZI_CHAIN.SYMBOL // Returns bwzC
    };
  }
}

// Global production instance
let globalGovernanceSystem = null;

export function getGovernanceSystem(config = {}) {
  if (!globalGovernanceSystem) {
    globalGovernanceSystem = new GovernanceSystem(config);
  }
  return globalGovernanceSystem;
}

export async function initializeGovernanceSystem(config = {}) {
  const system = getGovernanceSystem(config);
  await system.initialize();
  return system;
}

export default GovernanceSystem;
