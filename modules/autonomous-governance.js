// modules/autonomous-governance.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createHmac } from 'crypto';

export class AutonomousGovernance {
    constructor(config = {}) {
        this.config = {
            governanceToken: 'BWZ',
            proposalThreshold: 10000,
            votingPeriod: 7 * 24 * 60 * 60 * 1000,
            executionDelay: 2 * 60 * 60 * 1000,
            quorumPercentage: 4,
            supportPercentage: 51,
            treasuryControlLimit: 0.05,
            emergencyThreshold: 75,
            ...config
        };
        this.proposals = new Map();
        this.voters = new Map();
        this.delegations = new Map();
        this.treasuryActions = new Map();
        this.governanceState = {
            totalSupply: 0,
            circulatingSupply: 0,
            activeProposals: 0,
            executedProposals: 0,
            treasuryBalance: 0,
            lastEpoch: Date.now()
        };
        this.db = new ArielSQLiteEngine({ path: './data/autonomous-governance.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.epochInterval = null;
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'AutonomousGovernance',
            description: 'Decentralized autonomous governance system with proposal management and voting',
            registrationFee: 15000,
            annualLicenseFee: 7500,
            revenueShare: 0.20,
            serviceType: 'governance_infrastructure',
            dataPolicy: 'Encrypted governance data only - No voter identity storage',
            compliance: ['Democratic Governance', 'Transparent Voting']
        });

        await this.loadGovernanceState();
        await this.startEpochCycle();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            governanceToken: this.config.governanceToken,
            proposalThreshold: this.config.proposalThreshold,
            votingPeriod: this.config.votingPeriod
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS governance_proposals (
                id TEXT PRIMARY KEY,
                proposer TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                proposalType TEXT NOT NULL,
                targets TEXT NOT NULL,
                values TEXT NOT NULL,
                calldatas TEXT NOT NULL,
                startBlock INTEGER NOT NULL,
                endBlock INTEGER NOT NULL,
                proposalHash TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                forVotes REAL DEFAULT 0,
                againstVotes REAL DEFAULT 0,
                abstainVotes REAL DEFAULT 0,
                totalVotes REAL DEFAULT 0,
                executed BOOLEAN DEFAULT false,
                executedAt DATETIME,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS governance_votes (
                id TEXT PRIMARY KEY,
                proposalId TEXT NOT NULL,
                voter TEXT NOT NULL,
                support INTEGER NOT NULL,
                votes REAL NOT NULL,
                reason TEXT,
                votedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                voteHash TEXT NOT NULL,
                FOREIGN KEY (proposalId) REFERENCES governance_proposals (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS voter_registry (
                address TEXT PRIMARY KEY,
                votingPower REAL DEFAULT 0,
                delegatedTo TEXT,
                lastVoted DATETIME,
                proposalsCreated INTEGER DEFAULT 0,
                totalVotes REAL DEFAULT 0,
                registeredAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS treasury_actions (
                id TEXT PRIMARY KEY,
                proposalId TEXT NOT NULL,
                actionType TEXT NOT NULL,
                amount REAL NOT NULL,
                recipient TEXT,
                token TEXT DEFAULT 'BWZ',
                executed BOOLEAN DEFAULT false,
                executedAt DATETIME,
                transactionHash TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS governance_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async loadGovernanceState() {
        const state = await this.db.all('SELECT * FROM governance_state');
        const stateMap = new Map(state.map(row => [row.key, row.value]));
        
        this.governanceState = {
            totalSupply: parseFloat(stateMap.get('totalSupply') || '0'),
            circulatingSupply: parseFloat(stateMap.get('circulatingSupply') || '0'),
            activeProposals: parseInt(stateMap.get('activeProposals') || '0'),
            executedProposals: parseInt(stateMap.get('executedProposals') || '0'),
            treasuryBalance: parseFloat(stateMap.get('treasuryBalance') || '0'),
            lastEpoch: parseInt(stateMap.get('lastEpoch') || Date.now())
        };
    }

    async createProposal(proposer, title, description, proposalType, targets, values, calldatas, startBlock, endBlock) {
        if (!this.initialized) await this.initialize();
        
        await this.validateProposer(proposer);
        await this.validateProposalParameters(targets, values, calldatas);

        const proposalId = this.generateProposalId();
        const proposalHash = this.calculateProposalHash(proposer, title, targets, values, calldatas);

        if (await this.isDuplicateProposal(proposalHash)) {
            throw new Error('Duplicate proposal detected');
        }

        const votingPower = await this.getVotingPower(proposer);
        if (votingPower < this.config.proposalThreshold) {
            throw new Error(`Insufficient voting power: ${votingPower} < ${this.config.proposalThreshold}`);
        }

        await this.db.run(`
            INSERT INTO governance_proposals (id, proposer, title, description, proposalType, targets, values, calldatas, startBlock, endBlock, proposalHash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [proposalId, proposer, title, description, proposalType, JSON.stringify(targets), JSON.stringify(values), JSON.stringify(calldatas), startBlock, endBlock, proposalHash]);

        await this.updateVoterStats(proposer, 'proposal_created');

        this.proposals.set(proposalId, {
            id: proposalId,
            proposer,
            title,
            description,
            proposalType,
            targets,
            values,
            calldatas,
            startBlock,
            endBlock,
            proposalHash,
            status: 'active',
            forVotes: 0,
            againstVotes: 0,
            abstainVotes: 0,
            totalVotes: 0,
            executed: false,
            createdAt: new Date()
        });

        this.governanceState.activeProposals++;

        this.events.emit('proposalCreated', {
            proposalId,
            proposer,
            title,
            proposalType,
            startBlock,
            endBlock,
            votingPower
        });

        return proposalId;
    }

    async castVote(proposalId, voter, support, reason = '') {
        if (!this.initialized) await this.initialize();
        
        const proposal = await this.getProposal(proposalId);
        if (!proposal) {
            throw new Error(`Proposal not found: ${proposalId}`);
        }

        if (proposal.status !== 'active') {
            throw new Error('Proposal is not active for voting');
        }

        if (Date.now() > proposal.endBlock) {
            throw new Error('Voting period has ended');
        }

        const votingPower = await this.getVotingPower(voter);
        if (votingPower <= 0) {
            throw new Error('No voting power available');
        }

        if (await this.hasVoted(proposalId, voter)) {
            throw new Error('Voter has already voted on this proposal');
        }

        const voteId = this.generateVoteId();
        const voteHash = this.calculateVoteHash(proposalId, voter, support, votingPower);

        await this.db.run(`
            INSERT INTO governance_votes (id, proposalId, voter, support, votes, reason, voteHash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [voteId, proposalId, voter, support, votingPower, reason, voteHash]);

        await this.updateProposalVotes(proposalId, support, votingPower);
        await this.updateVoterStats(voter, 'vote_cast', votingPower);

        this.events.emit('voteCast', {
            voteId,
            proposalId,
            voter,
            support,
            votes: votingPower,
            reason
        });

        return voteId;
    }

    async executeProposal(proposalId, executor) {
        if (!this.initialized) await this.initialize();
        
        const proposal = await this.getProposal(proposalId);
        if (!proposal) {
            throw new Error(`Proposal not found: ${proposalId}`);
        }

        if (proposal.executed) {
            throw new Error('Proposal already executed');
        }

        if (Date.now() < proposal.endBlock + this.config.executionDelay) {
            throw new Error('Execution delay period not yet passed');
        }

        const votingResults = await this.getVotingResults(proposalId);
        if (!this.isProposalSuccessful(votingResults)) {
            throw new Error('Proposal did not pass voting requirements');
        }

        await this.executeProposalActions(proposalId, proposal);

        await this.db.run(`
            UPDATE governance_proposals 
            SET status = 'executed', executed = true, executedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [proposalId]);

        proposal.status = 'executed';
        proposal.executed = true;
        proposal.executedAt = new Date();

        this.governanceState.activeProposals--;
        this.governanceState.executedProposals++;

        this.events.emit('proposalExecuted', {
            proposalId,
            executor,
            votingResults,
            executedAt: new Date()
        });

        return true;
    }

    async executeProposalActions(proposalId, proposal) {
        const { targets, values, calldatas, proposalType } = proposal;

        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            const value = values[i];
            const calldata = calldatas[i];

            switch (proposalType) {
                case 'treasury_transfer':
                    await this.executeTreasuryTransfer(target, value, calldata, proposalId);
                    break;
                case 'parameter_change':
                    await this.executeParameterChange(target, value, calldata);
                    break;
                case 'contract_upgrade':
                    await this.executeContractUpgrade(target, value, calldata);
                    break;
                case 'emergency_action':
                    await this.executeEmergencyAction(target, value, calldata);
                    break;
                default:
                    throw new Error(`Unknown proposal type: ${proposalType}`);
            }
        }
    }

    async executeTreasuryTransfer(recipient, amount, token, proposalId) {
        const actionId = this.generateActionId();
        
        if (amount > this.governanceState.treasuryBalance * this.config.treasuryControlLimit) {
            throw new Error('Transfer amount exceeds treasury control limit');
        }

        await this.db.run(`
            INSERT INTO treasury_actions (id, proposalId, actionType, amount, recipient, token, executed)
            VALUES (?, ?, 'transfer', ?, ?, ?, true)
        `, [actionId, proposalId, amount, recipient, token]);

        this.governanceState.treasuryBalance -= amount;

        this.events.emit('treasuryActionExecuted', {
            actionId,
            proposalId,
            actionType: 'transfer',
            amount,
            recipient,
            token
        });
    }

    async delegateVotes(delegator, delegatee) {
        if (!this.initialized) await this.initialize();
        
        if (delegator === delegatee) {
            throw new Error('Cannot delegate to self');
        }

        const delegatorPower = await this.getVotingPower(delegator);
        if (delegatorPower <= 0) {
            throw new Error('No voting power to delegate');
        }

        const currentDelegate = await this.getCurrentDelegate(delegator);
        if (currentDelegate === delegatee) {
            throw new Error('Already delegated to this address');
        }

        await this.db.run(`
            INSERT OR REPLACE INTO voter_registry (address, delegatedTo, lastVoted)
            VALUES (?, ?, ?)
        `, [delegator, delegatee, new Date()]);

        this.delegations.set(delegator, delegatee);

        this.events.emit('votesDelegated', {
            delegator,
            delegatee,
            votingPower: delegatorPower,
            timestamp: new Date()
        });

        return true;
    }

    async getVotingPower(address) {
        const voter = await this.db.get('SELECT * FROM voter_registry WHERE address = ?', [address]);
        if (!voter) return 0;

        if (voter.delegatedTo && voter.delegatedTo !== address) {
            return 0;
        }

        const delegatedPower = await this.db.get(`
            SELECT SUM(votingPower) as totalPower 
            FROM voter_registry 
            WHERE delegatedTo = ?
        `, [address]);

        return (voter.votingPower || 0) + (delegatedPower?.totalPower || 0);
    }

    async getVotingResults(proposalId) {
        const votes = await this.db.all(`
            SELECT support, SUM(votes) as totalVotes
            FROM governance_votes
            WHERE proposalId = ?
            GROUP BY support
        `, [proposalId]);

        const results = {
            for: 0,
            against: 0,
            abstain: 0,
            total: 0
        };

        votes.forEach(vote => {
            switch (vote.support) {
                case 1: results.for = vote.totalVotes; break;
                case 0: results.against = vote.totalVotes; break;
                case 2: results.abstain = vote.totalVotes; break;
            }
            results.total += vote.totalVotes;
        });

        return results;
    }

    isProposalSuccessful(results) {
        const quorumRequired = this.governanceState.circulatingSupply * (this.config.quorumPercentage / 100);
        if (results.total < quorumRequired) {
            return false;
        }

        const supportPercentage = (results.for / (results.for + results.against)) * 100;
        return supportPercentage >= this.config.supportPercentage;
    }

    async validateProposer(proposer) {
        const blacklisted = await this.isBlacklisted(proposer);
        if (blacklisted) {
            throw new Error('Proposer is blacklisted');
        }

        const recentProposals = await this.db.get(`
            SELECT COUNT(*) as count 
            FROM governance_proposals 
            WHERE proposer = ? AND createdAt >= datetime('now', '-7 days')
        `, [proposer]);

        if (recentProposals.count > 3) {
            throw new Error('Too many proposals created recently');
        }
    }

    async validateProposalParameters(targets, values, calldatas) {
        if (!Array.isArray(targets) || !Array.isArray(values) || !Array.isArray(calldatas)) {
            throw new Error('Targets, values, and calldatas must be arrays');
        }

        if (targets.length !== values.length || targets.length !== calldatas.length) {
            throw new Error('Targets, values, and calldatas arrays must have same length');
        }

        if (targets.length > 10) {
            throw new Error('Too many actions in proposal');
        }

        const totalValue = values.reduce((sum, value) => sum + parseFloat(value), 0);
        if (totalValue > this.governanceState.treasuryBalance * this.config.treasuryControlLimit) {
            throw new Error('Total proposal value exceeds treasury control limit');
        }
    }

    async updateVoterStats(address, action, value = 0) {
        const updates = [];
        const params = [];

        switch (action) {
            case 'proposal_created':
                updates.push('proposalsCreated = proposalsCreated + 1');
                break;
            case 'vote_cast':
                updates.push('totalVotes = totalVotes + ?', 'lastVoted = CURRENT_TIMESTAMP');
                params.push(value);
                break;
        }

        if (updates.length > 0) {
            await this.db.run(`
                INSERT OR REPLACE INTO voter_registry (address, ${updates.join(', ')})
                VALUES (?, ${updates.map(() => '?').join(', ')})
            `, [address, ...params]);
        }
    }

    async updateProposalVotes(proposalId, support, votes) {
        const fieldMap = {
            1: 'forVotes',
            0: 'againstVotes',
            2: 'abstainVotes'
        };

        const field = fieldMap[support];
        if (!field) return;

        await this.db.run(`
            UPDATE governance_proposals 
            SET ${field} = ${field} + ?, totalVotes = totalVotes + ?
            WHERE id = ?
        `, [votes, votes, proposalId]);

        const proposal = this.proposals.get(proposalId);
        if (proposal) {
            proposal[field] += votes;
            proposal.totalVotes += votes;
        }
    }

    async getProposal(proposalId) {
        if (this.proposals.has(proposalId)) {
            return this.proposals.get(proposalId);
        }

        const proposal = await this.db.get('SELECT * FROM governance_proposals WHERE id = ?', [proposalId]);
        if (proposal) {
            proposal.targets = JSON.parse(proposal.targets);
            proposal.values = JSON.parse(proposal.values);
            proposal.calldatas = JSON.parse(proposal.calldatas);
            this.proposals.set(proposalId, proposal);
        }
        return proposal;
    }

    async hasVoted(proposalId, voter) {
        const vote = await this.db.get('SELECT id FROM governance_votes WHERE proposalId = ? AND voter = ?', [proposalId, voter]);
        return !!vote;
    }

    async getCurrentDelegate(address) {
        const voter = await this.db.get('SELECT delegatedTo FROM voter_registry WHERE address = ?', [address]);
        return voter?.delegatedTo || null;
    }

    async isBlacklisted(address) {
        return false;
    }

    async isDuplicateProposal(proposalHash) {
        const existing = await this.db.get('SELECT id FROM governance_proposals WHERE proposalHash = ?', [proposalHash]);
        return !!existing;
    }

    generateProposalId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `prop_${timestamp}_${random}`;
    }

    generateVoteId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `vote_${timestamp}_${random}`;
    }

    generateActionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `action_${timestamp}_${random}`;
    }

    calculateProposalHash(proposer, title, targets, values, calldatas) {
        const data = `${proposer}-${title}-${JSON.stringify(targets)}-${JSON.stringify(values)}-${JSON.stringify(calldatas)}`;
        return createHash('sha256').update(data).digest('hex');
    }

    calculateVoteHash(proposalId, voter, support, votes) {
        const data = `${proposalId}-${voter}-${support}-${votes}-${Date.now()}`;
        return createHash('sha256').update(data).digest('hex');
    }

    async startEpochCycle() {
        this.epochInterval = setInterval(async () => {
            await this.processEpoch();
        }, 24 * 60 * 60 * 1000);

        console.log('🔄 Autonomous governance epoch cycle started');
    }

    async processEpoch() {
        try {
            await this.updateVotingPower();
            await this.processExpiredProposals();
            await this.updateGovernanceState();
            
            this.governanceState.lastEpoch = Date.now();

            this.events.emit('epochProcessed', {
                epoch: this.governanceState.lastEpoch,
                activeProposals: this.governanceState.activeProposals,
                treasuryBalance: this.governanceState.treasuryBalance
            });
        } catch (error) {
            console.error('❌ Epoch processing failed:', error);
        }
    }

    async updateVotingPower() {
        const metrics = await this.sovereignService.getProductionMetrics();
        this.governanceState.treasuryBalance = metrics.treasury.total;
        
        await this.db.run(`
            UPDATE governance_state 
            SET value = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE key = 'treasuryBalance'
        `, [this.governanceState.treasuryBalance.toString()]);
    }

    async processExpiredProposals() {
        const expiredProposals = await this.db.all(`
            SELECT * FROM governance_proposals 
            WHERE endBlock < ? AND status = 'active'
        `, [Date.now()]);

        for (const proposal of expiredProposals) {
            const results = await this.getVotingResults(proposal.id);
            const status = this.isProposalSuccessful(results) ? 'passed' : 'rejected';

            await this.db.run(`
                UPDATE governance_proposals 
                SET status = ?
                WHERE id = ?
            `, [status, proposal.id]);

            this.governanceState.activeProposals--;

            this.events.emit('proposalExpired', {
                proposalId: proposal.id,
                status,
                votingResults: results
            });
        }
    }

    async updateGovernanceState() {
        const stateUpdates = [
            ['totalSupply', this.governanceState.totalSupply.toString()],
            ['circulatingSupply', this.governanceState.circulatingSupply.toString()],
            ['activeProposals', this.governanceState.activeProposals.toString()],
            ['executedProposals', this.governanceState.executedProposals.toString()],
            ['treasuryBalance', this.governanceState.treasuryBalance.toString()],
            ['lastEpoch', this.governanceState.lastEpoch.toString()]
        ];

        for (const [key, value] of stateUpdates) {
            await this.db.run(`
                INSERT OR REPLACE INTO governance_state (key, value, updatedAt)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `, [key, value]);
        }
    }

    async getGovernanceMetrics() {
        const proposalStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalProposals,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeProposals,
                SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executedProposals,
                SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passedProposals,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejectedProposals
            FROM governance_proposals
        `);

        const voterStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalVoters,
                SUM(votingPower) as totalVotingPower,
                AVG(totalVotes) as avgVotesPerVoter,
                COUNT(CASE WHEN lastVoted >= datetime('now', '-30 days') THEN 1 END) as activeVoters
            FROM voter_registry
        `);

        const recentActivity = await this.db.all(`
            SELECT 
                strftime('%Y-%m-%d', createdAt) as date,
                COUNT(*) as proposals,
                SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed
            FROM governance_proposals
            WHERE createdAt >= datetime('now', '-30 days')
            GROUP BY date
            ORDER BY date DESC
        `);

        return {
            proposalStats,
            voterStats,
            recentActivity,
            governanceState: this.governanceState,
            config: this.config,
            timestamp: new Date()
        };
    }
}

export default AutonomousGovernance;
