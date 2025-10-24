// modules/dao-governance-engine.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createHmac } from 'crypto';

export class DAOGovernanceEngine {
    constructor(config = {}) {
        this.config = {
            proposalTypes: ['funding', 'parameter', 'membership', 'emergency'],
            votingPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
            quorumThreshold: 0.05, // 5% of total supply
            approvalThreshold: 0.60, // 60% approval
            emergencyThreshold: 0.75, // 75% for emergency
            maxActiveProposals: 10,
            proposalFee: 100, // BWZ tokens
            ...config
        };
        this.daoRegistry = new Map();
        this.activeProposals = new Map();
        this.voteTracking = new Map();
        this.delegationRegistry = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/dao-governance.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.totalDAOs = 0;
        this.totalProposals = 0;
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'DAOGovernanceEngine',
            description: 'Decentralized Autonomous Organization governance system with advanced voting mechanisms',
            registrationFee: 5000,
            annualLicenseFee: 2500,
            revenueShare: 0.12,
            serviceType: 'governance_infrastructure',
            dataPolicy: 'Encrypted governance data only - No personal voting data storage',
            compliance: ['DAO Governance', 'Transparent Voting']
        });

        await this.loadDAORegistry();
        this.startGovernanceCycles();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            totalDAOs: this.totalDAOs,
            totalProposals: this.totalProposals,
            votingPeriod: this.config.votingPeriod
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS daos (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                creator TEXT NOT NULL,
                tokenAddress TEXT,
                totalSupply REAL DEFAULT 0,
                memberCount INTEGER DEFAULT 0,
                proposalCount INTEGER DEFAULT 0,
                treasuryBalance REAL DEFAULT 0,
                governanceModel TEXT DEFAULT 'token_weighted',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                isActive BOOLEAN DEFAULT true,
                metadata TEXT
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS dao_proposals (
                id TEXT PRIMARY KEY,
                daoId TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                proposalType TEXT NOT NULL,
                proposer TEXT NOT NULL,
                amount REAL DEFAULT 0,
                recipient TEXT,
                parameterChanges TEXT,
                status TEXT DEFAULT 'active',
                votesFor REAL DEFAULT 0,
                votesAgainst REAL DEFAULT 0,
                votesAbstain REAL DEFAULT 0,
                totalVotes REAL DEFAULT 0,
                votingPower REAL DEFAULT 0,
                quorumReached BOOLEAN DEFAULT false,
                approvalReached BOOLEAN DEFAULT false,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                votingStarts DATETIME,
                votingEnds DATETIME,
                executedAt DATETIME,
                executionHash TEXT,
                FOREIGN KEY (daoId) REFERENCES daos (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS dao_votes (
                id TEXT PRIMARY KEY,
                proposalId TEXT NOT NULL,
                voter TEXT NOT NULL,
                voteType TEXT NOT NULL,
                votingPower REAL NOT NULL,
                votedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                signature TEXT,
                voteHash TEXT,
                FOREIGN KEY (proposalId) REFERENCES dao_proposals (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS dao_members (
                id TEXT PRIMARY KEY,
                daoId TEXT NOT NULL,
                memberAddress TEXT NOT NULL,
                tokenBalance REAL DEFAULT 0,
                votingPower REAL DEFAULT 0,
                joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                isActive BOOLEAN DEFAULT true,
                delegatedTo TEXT,
                metadata TEXT,
                FOREIGN KEY (daoId) REFERENCES daos (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS dao_delegations (
                id TEXT PRIMARY KEY,
                daoId TEXT NOT NULL,
                delegator TEXT NOT NULL,
                delegatee TEXT NOT NULL,
                votingPower REAL NOT NULL,
                delegatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                revokedAt DATETIME,
                isActive BOOLEAN DEFAULT true,
                FOREIGN KEY (daoId) REFERENCES daos (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS dao_treasury_transactions (
                id TEXT PRIMARY KEY,
                daoId TEXT NOT NULL,
                type TEXT NOT NULL,
                amount REAL NOT NULL,
                fromAddress TEXT,
                toAddress TEXT,
                description TEXT,
                proposalId TEXT,
                transactionHash TEXT,
                executedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (daoId) REFERENCES daos (id)
            )
        `);
    }

    async createDAO(name, description, creator, tokenAddress, governanceModel = 'token_weighted', metadata = {}) {
        if (!this.initialized) await this.initialize();
        
        await this.validateDAOCreation(name, creator, governanceModel);

        const daoId = this.generateDAOId();
        const initialMembers = [creator];
        
        try {
            await this.db.run(`
                INSERT INTO daos (id, name, description, creator, tokenAddress, governanceModel, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [daoId, name, description, creator, tokenAddress, governanceModel, JSON.stringify(metadata)]);

            await this.initializeDAOMembers(daoId, initialMembers);
            
            this.daoRegistry.set(daoId, {
                id: daoId,
                name,
                description,
                creator,
                tokenAddress,
                governanceModel,
                memberCount: initialMembers.length,
                proposalCount: 0,
                treasuryBalance: 0,
                isActive: true,
                createdAt: new Date(),
                metadata
            });

            this.totalDAOs++;

            if (this.sovereignService && this.serviceId) {
                await this.sovereignService.processRevenue(
                    this.serviceId, 
                    this.config.proposalFee, 
                    'dao_creation',
                    'USD',
                    'bwaezi',
                    { daoId, name, creator }
                );
            }

            this.events.emit('daoCreated', {
                daoId,
                name,
                creator,
                governanceModel,
                timestamp: new Date()
            });

            return daoId;
        } catch (error) {
            throw new Error(`DAO creation failed: ${error.message}`);
        }
    }

    async validateDAOCreation(name, creator, governanceModel) {
        if (!name || name.length < 3 || name.length > 100) {
            throw new Error('DAO name must be between 3 and 100 characters');
        }

        if (!this.isValidAddress(creator)) {
            throw new Error('Invalid creator address');
        }

        const validModels = ['token_weighted', 'one_member_one_vote', 'quadratic', 'holographic'];
        if (!validModels.includes(governanceModel)) {
            throw new Error(`Invalid governance model. Supported: ${validModels.join(', ')}`);
        }
    }

    async initializeDAOMembers(daoId, members) {
        for (const member of members) {
            const memberId = this.generateMemberId(daoId, member);
            await this.db.run(`
                INSERT INTO dao_members (id, daoId, memberAddress, votingPower, metadata)
                VALUES (?, ?, ?, ?, ?)
            `, [memberId, daoId, member, 1, JSON.stringify({ initialMember: true })]);
        }
    }

    async createProposal(daoId, title, description, proposalType, proposer, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const dao = await this.getDAO(daoId);
        if (!dao) {
            throw new Error(`DAO not found: ${daoId}`);
        }

        await this.validateProposalCreation(daoId, proposer, proposalType, options);

        const proposalId = this.generateProposalId();
        const votingStarts = new Date();
        const votingEnds = new Date(Date.now() + this.config.votingPeriod);

        try {
            await this.db.run(`
                INSERT INTO dao_proposals (
                    id, daoId, title, description, proposalType, proposer, 
                    amount, recipient, parameterChanges, votingStarts, votingEnds
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                proposalId, daoId, title, description, proposalType, proposer,
                options.amount || 0, options.recipient || null,
                options.parameterChanges ? JSON.stringify(options.parameterChanges) : null,
                votingStarts, votingEnds
            ]);

            await this.collectProposalFee(proposer, daoId);

            this.activeProposals.set(proposalId, {
                id: proposalId,
                daoId,
                title,
                description,
                proposalType,
                proposer,
                amount: options.amount || 0,
                recipient: options.recipient,
                parameterChanges: options.parameterChanges,
                status: 'active',
                votesFor: 0,
                votesAgainst: 0,
                votesAbstain: 0,
                totalVotes: 0,
                votingPower: 0,
                quorumReached: false,
                approvalReached: false,
                createdAt: new Date(),
                votingStarts,
                votingEnds
            });

            dao.proposalCount++;
            this.totalProposals++;

            this.events.emit('proposalCreated', {
                proposalId,
                daoId,
                title,
                proposalType,
                proposer,
                votingStarts,
                votingEnds,
                timestamp: new Date()
            });

            return proposalId;
        } catch (error) {
            throw new Error(`Proposal creation failed: ${error.message}`);
        }
    }

    async validateProposalCreation(daoId, proposer, proposalType, options) {
        if (!this.config.proposalTypes.includes(proposalType)) {
            throw new Error(`Invalid proposal type. Supported: ${this.config.proposalTypes.join(', ')}`);
        }

        const activeProposals = await this.getActiveProposalsCount(daoId);
        if (activeProposals >= this.config.maxActiveProposals) {
            throw new Error(`Maximum active proposals (${this.config.maxActiveProposals}) reached for this DAO`);
        }

        const member = await this.getDAOMember(daoId, proposer);
        if (!member) {
            throw new Error('Only DAO members can create proposals');
        }

        if (proposalType === 'funding' && (!options.amount || options.amount <= 0)) {
            throw new Error('Funding proposals require a positive amount');
        }

        if (proposalType === 'funding' && !options.recipient) {
            throw new Error('Funding proposals require a recipient address');
        }
    }

    async collectProposalFee(proposer, daoId) {
        // In production, this would interact with actual token transfers
        console.log(`Collecting proposal fee from ${proposer} for DAO ${daoId}`);
        
        if (this.sovereignService && this.serviceId) {
            await this.sovereignService.processRevenue(
                this.serviceId, 
                this.config.proposalFee, 
                'proposal_creation',
                'USD',
                'bwaezi',
                { daoId, proposer }
            );
        }
    }

    async castVote(proposalId, voter, voteType, signature = null) {
        if (!this.initialized) await this.initialize();
        
        const proposal = await this.getProposal(proposalId);
        if (!proposal) {
            throw new Error(`Proposal not found: ${proposalId}`);
        }

        await this.validateVote(proposal, voter, voteType);

        const votingPower = await this.calculateVotingPower(proposal.daoId, voter);
        const voteId = this.generateVoteId(proposalId, voter);
        const voteHash = this.generateVoteHash(proposalId, voter, voteType, votingPower);

        try {
            await this.db.run(`
                INSERT INTO dao_votes (id, proposalId, voter, voteType, votingPower, signature, voteHash)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [voteId, proposalId, voter, voteType, votingPower, signature, voteHash]);

            await this.updateProposalVotes(proposalId, voteType, votingPower);
            await this.checkProposalStatus(proposalId);

            this.events.emit('voteCast', {
                voteId,
                proposalId,
                voter,
                voteType,
                votingPower,
                timestamp: new Date()
            });

            return voteId;
        } catch (error) {
            throw new Error(`Vote casting failed: ${error.message}`);
        }
    }

    async validateVote(proposal, voter, voteType) {
        if (proposal.status !== 'active') {
            throw new Error('Cannot vote on inactive proposal');
        }

        const now = new Date();
        if (now < proposal.votingStarts || now > proposal.votingEnds) {
            throw new Error('Voting period has ended or not started yet');
        }

        const validVoteTypes = ['for', 'against', 'abstain'];
        if (!validVoteTypes.includes(voteType)) {
            throw new Error(`Invalid vote type. Supported: ${validVoteTypes.join(', ')}`);
        }

        const hasVoted = await this.hasVoted(proposal.id, voter);
        if (hasVoted) {
            throw new Error('Voter has already voted on this proposal');
        }

        const member = await this.getDAOMember(proposal.daoId, voter);
        if (!member) {
            throw new Error('Only DAO members can vote');
        }
    }

    async calculateVotingPower(daoId, voter) {
        const dao = await this.getDAO(daoId);
        const member = await this.getDAOMember(daoId, voter);
        
        switch (dao.governanceModel) {
            case 'token_weighted':
                return member.tokenBalance || 1;
            case 'one_member_one_vote':
                return 1;
            case 'quadratic':
                return Math.sqrt(member.tokenBalance || 1);
            case 'holographic':
                return this.calculateHolographicVotingPower(member, dao);
            default:
                return 1;
        }
    }

    calculateHolographicVotingPower(member, dao) {
        const basePower = member.tokenBalance || 1;
        const participationBonus = member.votingPower * 0.1; // 10% bonus for active participation
        return basePower + participationBonus;
    }

    async updateProposalVotes(proposalId, voteType, votingPower) {
        const updateField = `votes${voteType.charAt(0).toUpperCase() + voteType.slice(1)}`;
        
        await this.db.run(`
            UPDATE dao_proposals 
            SET ${updateField} = ${updateField} + ?, 
                totalVotes = totalVotes + ?,
                votingPower = votingPower + ?
            WHERE id = ?
        `, [1, 1, votingPower, proposalId]);

        const proposal = this.activeProposals.get(proposalId);
        if (proposal) {
            proposal[updateField] += 1;
            proposal.totalVotes += 1;
            proposal.votingPower += votingPower;
        }
    }

    async checkProposalStatus(proposalId) {
        const proposal = await this.getProposal(proposalId);
        const dao = await this.getDAO(proposal.daoId);

        const quorumThreshold = dao.totalSupply * this.config.quorumThreshold;
        const quorumReached = proposal.votingPower >= quorumThreshold;

        let approvalReached = false;
        if (quorumReached) {
            const totalVoted = proposal.votesFor + proposal.votesAgainst;
            if (totalVoted > 0) {
                const approvalRate = proposal.votesFor / totalVoted;
                const requiredThreshold = proposal.proposalType === 'emergency' ? 
                    this.config.emergencyThreshold : this.config.approvalThreshold;
                approvalReached = approvalRate >= requiredThreshold;
            }
        }

        if (quorumReached !== proposal.quorumReached || approvalReached !== proposal.approvalReached) {
            await this.db.run(`
                UPDATE dao_proposals 
                SET quorumReached = ?, approvalReached = ?
                WHERE id = ?
            `, [quorumReached, approvalReached, proposalId]);

            proposal.quorumReached = quorumReached;
            proposal.approvalReached = approvalReached;

            if (quorumReached && approvalReached) {
                await this.executeProposal(proposalId);
            }
        }
    }

    async executeProposal(proposalId) {
        const proposal = await this.getProposal(proposalId);
        
        try {
            let executionHash;
            
            switch (proposal.proposalType) {
                case 'funding':
                    executionHash = await this.executeFundingProposal(proposal);
                    break;
                case 'parameter':
                    executionHash = await this.executeParameterProposal(proposal);
                    break;
                case 'membership':
                    executionHash = await this.executeMembershipProposal(proposal);
                    break;
                case 'emergency':
                    executionHash = await this.executeEmergencyProposal(proposal);
                    break;
            }

            await this.db.run(`
                UPDATE dao_proposals 
                SET status = 'executed', executedAt = CURRENT_TIMESTAMP, executionHash = ?
                WHERE id = ?
            `, [executionHash, proposalId]);

            proposal.status = 'executed';
            proposal.executedAt = new Date();
            proposal.executionHash = executionHash;

            this.events.emit('proposalExecuted', {
                proposalId,
                proposalType: proposal.proposalType,
                executionHash,
                timestamp: new Date()
            });

        } catch (error) {
            await this.db.run(`
                UPDATE dao_proposals 
                SET status = 'failed', executionHash = ?
                WHERE id = ?
            `, [error.message, proposalId]);

            proposal.status = 'failed';
            
            this.events.emit('proposalExecutionFailed', {
                proposalId,
                error: error.message,
                timestamp: new Date()
            });
        }
    }

    async executeFundingProposal(proposal) {
        const dao = await this.getDAO(proposal.daoId);
        
        if (proposal.amount > dao.treasuryBalance) {
            throw new Error('Insufficient treasury balance');
        }

        // Execute actual fund transfer
        const executionHash = this.generateExecutionHash(proposal);
        
        await this.db.run(`
            UPDATE daos SET treasuryBalance = treasuryBalance - ? WHERE id = ?
        `, [proposal.amount, proposal.daoId]);

        await this.recordTreasuryTransaction(
            proposal.daoId,
            'funding_payout',
            -proposal.amount,
            dao.treasuryAddress,
            proposal.recipient,
            `Proposal ${proposal.id} funding`,
            proposal.id,
            executionHash
        );

        return executionHash;
    }

    async executeParameterProposal(proposal) {
        const parameterChanges = JSON.parse(proposal.parameterChanges);
        const executionHash = this.generateExecutionHash(proposal);
        
        // Update DAO parameters
        for (const [key, value] of Object.entries(parameterChanges)) {
            // Implementation depends on specific parameter structure
            console.log(`Updating DAO parameter: ${key} = ${value}`);
        }

        return executionHash;
    }

    async executeMembershipProposal(proposal) {
        // Implementation for membership changes
        const executionHash = this.generateExecutionHash(proposal);
        return executionHash;
    }

    async executeEmergencyProposal(proposal) {
        // Implementation for emergency actions
        const executionHash = this.generateExecutionHash(proposal);
        return executionHash;
    }

    async delegateVotingPower(daoId, delegator, delegatee, votingPower) {
        if (!this.initialized) await this.initialize();
        
        await this.validateDelegation(daoId, delegator, delegatee, votingPower);

        const delegationId = this.generateDelegationId(daoId, delegator);
        
        try {
            await this.db.run(`
                INSERT INTO dao_delegations (id, daoId, delegator, delegatee, votingPower, isActive)
                VALUES (?, ?, ?, ?, ?, true)
            `, [delegationId, daoId, delegator, delegatee, votingPower]);

            await this.updateMemberDelegation(daoId, delegator, delegatee);

            this.delegationRegistry.set(delegationId, {
                id: delegationId,
                daoId,
                delegator,
                delegatee,
                votingPower,
                isActive: true,
                delegatedAt: new Date()
            });

            this.events.emit('votingPowerDelegated', {
                delegationId,
                daoId,
                delegator,
                delegatee,
                votingPower,
                timestamp: new Date()
            });

            return delegationId;
        } catch (error) {
            throw new Error(`Voting power delegation failed: ${error.message}`);
        }
    }

    async validateDelegation(daoId, delegator, delegatee, votingPower) {
        if (delegator === delegatee) {
            throw new Error('Cannot delegate to yourself');
        }

        const delegatorMember = await this.getDAOMember(daoId, delegator);
        if (!delegatorMember) {
            throw new Error('Delegator is not a DAO member');
        }

        const delegateeMember = await this.getDAOMember(daoId, delegatee);
        if (!delegateeMember) {
            throw new Error('Delegatee is not a DAO member');
        }

        const availablePower = await this.calculateAvailableVotingPower(daoId, delegator);
        if (votingPower > availablePower) {
            throw new Error('Insufficient voting power for delegation');
        }
    }

    async calculateAvailableVotingPower(daoId, memberAddress) {
        const member = await this.getDAOMember(daoId, memberAddress);
        const activeDelegations = await this.getActiveDelegations(daoId, memberAddress);
        
        const delegatedPower = activeDelegations.reduce((sum, delegation) => 
            sum + delegation.votingPower, 0);
        
        return (member.votingPower || 0) - delegatedPower;
    }

    async getDAO(daoId) {
        if (this.daoRegistry.has(daoId)) {
            return this.daoRegistry.get(daoId);
        }

        const dao = await this.db.get('SELECT * FROM daos WHERE id = ?', [daoId]);
        if (dao) {
            dao.metadata = JSON.parse(dao.metadata || '{}');
            this.daoRegistry.set(daoId, dao);
        }
        return dao;
    }

    async getProposal(proposalId) {
        if (this.activeProposals.has(proposalId)) {
            return this.activeProposals.get(proposalId);
        }

        const proposal = await this.db.get('SELECT * FROM dao_proposals WHERE id = ?', [proposalId]);
        if (proposal) {
            if (proposal.parameterChanges) {
                proposal.parameterChanges = JSON.parse(proposal.parameterChanges);
            }
        }
        return proposal;
    }

    async getDAOMember(daoId, memberAddress) {
        return await this.db.get(
            'SELECT * FROM dao_members WHERE daoId = ? AND memberAddress = ? AND isActive = true',
            [daoId, memberAddress]
        );
    }

    async hasVoted(proposalId, voter) {
        const vote = await this.db.get(
            'SELECT id FROM dao_votes WHERE proposalId = ? AND voter = ?',
            [proposalId, voter]
        );
        return !!vote;
    }

    async getActiveProposalsCount(daoId) {
        const result = await this.db.get(
            'SELECT COUNT(*) as count FROM dao_proposals WHERE daoId = ? AND status = "active"',
            [daoId]
        );
        return result?.count || 0;
    }

    async getActiveDelegations(daoId, delegator) {
        return await this.db.all(
            'SELECT * FROM dao_delegations WHERE daoId = ? AND delegator = ? AND isActive = true',
            [daoId, delegator]
        );
    }

    async loadDAORegistry() {
        const daos = await this.db.all('SELECT * FROM daos WHERE isActive = true');
        this.totalDAOs = daos.length;
        
        const proposals = await this.db.all('SELECT COUNT(*) as count FROM dao_proposals');
        this.totalProposals = proposals[0]?.count || 0;

        for (const dao of daos) {
            dao.metadata = JSON.parse(dao.metadata || '{}');
            this.daoRegistry.set(dao.id, dao);
        }
    }

    async recordTreasuryTransaction(daoId, type, amount, fromAddress, toAddress, description, proposalId, transactionHash) {
        const txId = this.generateTransactionId();
        
        await this.db.run(`
            INSERT INTO dao_treasury_transactions (id, daoId, type, amount, fromAddress, toAddress, description, proposalId, transactionHash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [txId, daoId, type, amount, fromAddress, toAddress, description, proposalId, transactionHash]);
    }

    generateDAOId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `dao_${timestamp}_${random}`;
    }

    generateProposalId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `proposal_${timestamp}_${random}`;
    }

    generateVoteId(proposalId, voter) {
        return `vote_${proposalId}_${voter}`;
    }

    generateMemberId(daoId, memberAddress) {
        return `member_${daoId}_${memberAddress}`;
    }

    generateDelegationId(daoId, delegator) {
        const timestamp = Date.now().toString(36);
        return `delegation_${daoId}_${delegator}_${timestamp}`;
    }

    generateTransactionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `tx_${timestamp}_${random}`;
    }

    generateVoteHash(proposalId, voter, voteType, votingPower) {
        const data = `${proposalId}_${voter}_${voteType}_${votingPower}_${Date.now()}`;
        return createHash('sha256').update(data).digest('hex');
    }

    generateExecutionHash(proposal) {
        const data = `${proposal.id}_${proposal.daoId}_${proposal.proposalType}_${Date.now()}`;
        return createHash('sha256').update(data).digest('hex');
    }

    isValidAddress(address) {
        return typeof address === 'string' && 
               address.length >= 26 && 
               address.length <= 42 &&
               /^[0-9a-zA-Z]+$/.test(address);
    }

    startGovernanceCycles() {
        setInterval(async () => {
            await this.processExpiredProposals();
            await this.cleanupInactiveDAOs();
        }, 60 * 60 * 1000); // Every hour
    }

    async processExpiredProposals() {
        const expiredProposals = await this.db.all(`
            SELECT * FROM dao_proposals 
            WHERE status = 'active' AND votingEnds < CURRENT_TIMESTAMP
        `);

        for (const proposal of expiredProposals) {
            await this.checkProposalStatus(proposal.id);
            
            if (proposal.status === 'active') {
                await this.db.run(`
                    UPDATE dao_proposals SET status = 'expired' WHERE id = ?
                `, [proposal.id]);
                
                this.activeProposals.delete(proposal.id);
                
                this.events.emit('proposalExpired', {
                    proposalId: proposal.id,
                    timestamp: new Date()
                });
            }
        }
    }

    async cleanupInactiveDAOs() {
        const inactiveDAOs = await this.db.all(`
            SELECT id FROM daos 
            WHERE isActive = true AND 
                  proposalCount = 0 AND 
                  createdAt < datetime('now', '-30 days')
        `);

        for (const dao of inactiveDAOs) {
            await this.db.run(`
                UPDATE daos SET isActive = false WHERE id = ?
            `, [dao.id]);
            
            this.daoRegistry.delete(dao.id);
            this.totalDAOs--;
            
            this.events.emit('daoInactivated', {
                daoId: dao.id,
                timestamp: new Date()
            });
        }
    }

    async getDAOAnalytics(daoId) {
        if (!this.initialized) await this.initialize();
        
        const proposalStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalProposals,
                SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executedProposals,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeProposals,
                AVG(votesFor + votesAgainst + votesAbstain) as avgVotesPerProposal
            FROM dao_proposals 
            WHERE daoId = ?
        `, [daoId]);

        const votingStats = await this.db.get(`
            SELECT 
                COUNT(DISTINCT voter) as uniqueVoters,
                AVG(votingPower) as avgVotingPower,
                SUM(votingPower) as totalVotingPower
            FROM dao_votes dv
            JOIN dao_proposals dp ON dv.proposalId = dp.id
            WHERE dp.daoId = ?
        `, [daoId]);

        const memberStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalMembers,
                AVG(tokenBalance) as avgTokenBalance,
                SUM(tokenBalance) as totalTokenSupply
            FROM dao_members 
            WHERE daoId = ? AND isActive = true
        `, [daoId]);

        return {
            proposalStats,
            votingStats,
            memberStats,
            timestamp: new Date()
        };
    }

    async getGovernanceMetrics() {
        if (!this.initialized) await this.initialize();
        
        const globalStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalDAOs,
                SUM(proposalCount) as totalProposals,
                SUM(memberCount) as totalMembers,
                AVG(treasuryBalance) as avgTreasury
            FROM daos 
            WHERE isActive = true
        `);

        const activityStats = await this.db.get(`
            SELECT 
                COUNT(*) as recentProposals,
                COUNT(DISTINCT dv.voter) as recentVoters
            FROM dao_proposals dp
            LEFT JOIN dao_votes dv ON dp.id = dv.proposalId
            WHERE dp.createdAt >= datetime('now', '-7 days')
        `);

        return {
            globalStats,
            activityStats,
            totalDAOs: this.totalDAOs,
            totalProposals: this.totalProposals,
            timestamp: new Date()
        };
    }
}

export default DAOGovernanceEngine;
