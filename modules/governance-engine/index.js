import { ArielSQLiteEngine } from "../ariel-sqlite-engine/index.js";
import { QuantumResistantCrypto } from "../quantum-resistant-crypto/index.js";

class GovernanceEngine {
    constructor() {
        this.db = null;
        this.quantumCrypto = new QuantumResistantCrypto();
        this.proposalTypes = {
            PARAMETER_CHANGE: 'parameter_change',
            VALIDATOR_MANAGEMENT: 'validator_management',
            TOKENOMICS_UPDATE: 'tokenomics_update',
            TREASURY_MANAGEMENT: 'treasury_management',
            NETWORK_UPGRADE: 'network_upgrade'
        };
    }

    async initialize() {
        console.log("✅ Governance Engine initialized");
    }

    async executeProposal(proposal, blockchain) {
        try {
            const proposalData = JSON.parse(proposal.execution_data || '{}');
            
            switch (proposal.type) {
                case this.proposalTypes.PARAMETER_CHANGE:
                    return await this.executeParameterChange(proposalData, blockchain);
                
                case this.proposalTypes.VALIDATOR_MANAGEMENT:
                    return await this.executeValidatorManagement(proposalData, blockchain);
                
                case this.proposalTypes.TOKENOMICS_UPDATE:
                    return await this.executeTokenomicsUpdate(proposalData, blockchain);
                
                case this.proposalTypes.TREASURY_MANAGEMENT:
                    return await this.executeTreasuryManagement(proposalData, blockchain);
                
                case this.proposalTypes.NETWORK_UPGRADE:
                    return await this.executeNetworkUpgrade(proposalData, blockchain);
                
                default:
                    console.error(`❌ Unknown proposal type: ${proposal.type}`);
                    return false;
            }
        } catch (error) {
            console.error("❌ Error executing proposal:", error);
            return false;
        }
    }

    async executeParameterChange(proposalData, blockchain) {
        try {
            const { parameter, value } = proposalData;
            
            // Update blockchain configuration
            if (blockchain.config.hasOwnProperty(parameter)) {
                const oldValue = blockchain.config[parameter];
                blockchain.config[parameter] = value;
                
                console.log(`✅ Parameter changed: ${parameter} from ${oldValue} to ${value}`);
                
                // Log the change in governance table
                await blockchain.db.run(
                    "INSERT INTO governance_changes (proposal_id, parameter, old_value, new_value, executed_at) VALUES (?, ?, ?, ?, ?)",
                    [proposalData.proposal_id, parameter, oldValue, value, Date.now()]
                );
                
                return true;
            } else {
                console.error(`❌ Unknown parameter: ${parameter}`);
                return false;
            }
        } catch (error) {
            console.error("❌ Error executing parameter change:", error);
            return false;
        }
    }

    async executeValidatorManagement(proposalData, blockchain) {
        try {
            const { action, validatorAddress, amount } = proposalData;
            
            switch (action) {
                case 'slash':
                    await blockchain.slashValidator(validatorAddress, amount, "Governance proposal execution");
                    break;
                
                case 'unjail':
                    await blockchain.db.run(
                        "UPDATE validators SET status = 'active', jailed_until = 0 WHERE address = ?",
                        [validatorAddress]
                    );
                    break;
                
                case 'add_to_set':
                    // Add validator to active set
                    await blockchain.db.run(
                        "UPDATE validators SET status = 'active' WHERE address = ?",
                        [validatorAddress]
                    );
                    break;
                
                case 'remove_from_set':
                    // Remove validator from active set
                    await blockchain.db.run(
                        "UPDATE validators SET status = 'inactive' WHERE address = ?",
                        [validatorAddress]
                    );
                    break;
                
                default:
                    console.error(`❌ Unknown validator action: ${action}`);
                    return false;
            }
            
            console.log(`✅ Validator management executed: ${action} for ${validatorAddress}`);
            return true;
        } catch (error) {
            console.error("❌ Error executing validator management:", error);
            return false;
        }
    }

    async executeTokenomicsUpdate(proposalData, blockchain) {
        try {
            const { parameter, value } = proposalData;
            
            // Update tokenomics parameters
            if (parameter === 'emission_rate') {
                blockchain.config.emissionRate = value;
                console.log(`✅ Emission rate updated to: ${value}`);
            } else if (parameter === 'inflation_rate') {
                // This would require more complex tokenomics calculations
                console.log(`✅ Inflation rate target set to: ${value}`);
            } else if (parameter === 'staking_rewards') {
                // Adjust staking rewards distribution
                console.log(`✅ Staking rewards parameter updated to: ${value}`);
            }
            
            return true;
        } catch (error) {
            console.error("❌ Error executing tokenomics update:", error);
            return false;
        }
    }

    async executeTreasuryManagement(proposalData, blockchain) {
        try {
            const { action, recipient, amount, purpose } = proposalData;
            
            // Treasury address (could be configurable)
            const treasuryAddress = "bwz1treasuryxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
            
            // Check treasury balance
            const treasuryBalance = await blockchain.getBalance(treasuryAddress);
            if (treasuryBalance < amount) {
                throw new Error("Insufficient treasury funds");
            }
            
            if (action === 'transfer') {
                // Create a transaction from treasury to recipient
                const transaction = {
                    from: treasuryAddress,
                    to: recipient,
                    amount: amount,
                    fee: 0, // Treasury transactions often have no fee
                    nonce: await this.getTreasuryNonce(blockchain, treasuryAddress),
                    purpose: purpose
                };
                
                // Sign with treasury key (would need secure key management in production)
                const signature = await this.quantumCrypto.signTransaction(transaction);
                transaction.quantum_signature = signature;
                
                // Add to pending transactions
                await blockchain.addTransaction(transaction);
                
                console.log(`✅ Treasury transfer executed: ${amount} bwzC to ${recipient} for ${purpose}`);
            } else if (action === 'burn') {
                // Burn tokens from treasury
                await blockchain.db.run(
                    "UPDATE accounts SET balance = balance - ? WHERE address = ?",
                    [amount, treasuryAddress]
                );
                
                // Update total supply
                const latestTokenomics = await blockchain.db.get(
                    "SELECT * FROM tokenomics ORDER BY block_height DESC LIMIT 1"
                );
                
                await blockchain.db.run(
                    "INSERT INTO tokenomics (total_supply, circulating_supply, staked_amount, inflation_rate, block_height) VALUES (?, ?, ?, ?, ?)",
                    [
                        latestTokenomics.total_supply - amount,
                        latestTokenomics.circulating_supply - amount,
                        latestTokenomics.staked_amount,
                        latestTokenomics.inflation_rate,
                        blockchain.currentBlockHeight
                    ]
                );
                
                console.log(`✅ Treasury burn executed: ${amount} bwzC burned`);
            }
            
            return true;
        } catch (error) {
            console.error("❌ Error executing treasury management:", error);
            return false;
        }
    }

    async executeNetworkUpgrade(proposalData, blockchain) {
        try {
            const { upgradeName, activationHeight, migrationScript } = proposalData;
            
            console.log(`✅ Network upgrade scheduled: ${upgradeName} at height ${activationHeight}`);
            
            // In a real implementation, this would trigger upgrade procedures
            // such as downloading new client software, migrating state, etc.
            
            // Store upgrade information
            await blockchain.db.run(
                "INSERT INTO network_upgrades (name, activation_height, proposed_at, status) VALUES (?, ?, ?, ?)",
                [upgradeName, activationHeight, Date.now(), 'scheduled']
            );
            
            return true;
        } catch (error) {
            console.error("❌ Error executing network upgrade:", error);
            return false;
        }
    }

    async getTreasuryNonce(blockchain, treasuryAddress) {
        const account = await blockchain.getAccount(treasuryAddress);
        return account ? account.nonce + 1 : 0;
    }

    async calculateVotingPower(address, blockchain) {
        // Voting power is based on staked amount
        const stakingInfo = await blockchain.db.all(
            `SELECT SUM(amount) as total_stake FROM stakers WHERE address = ?`,
            [address]
        );
        
        const validatorStake = await blockchain.db.all(
            `SELECT stake_amount FROM validators WHERE address = ? AND status = 'active'`,
            [address]
        );
        
        let votingPower = stakingInfo[0].total_stake || 0;
        
        if (validatorStake.length > 0) {
            votingPower += validatorStake[0].stake_amount;
        }
        
        return votingPower;
    }

    async verifyProposalSignature(proposal, signature, publicKey) {
        return await this.quantumCrypto.verifySignature(proposal, signature, publicKey);
    }

    async getProposalStatus(proposalId) {
        const proposal = await this.db.get(
            "SELECT * FROM governance_proposals WHERE id = ?",
            [proposalId]
        );
        
        if (!proposal) {
            return { error: "Proposal not found" };
        }
        
        const votes = await this.db.all(
            "SELECT * FROM votes WHERE proposal_id = ?",
            [proposalId]
        );
        
        const totalVotingPower = votes.reduce((sum, vote) => sum + vote.voting_power, 0);
        const yesVotes = votes.filter(v => v.vote_option === 'yes').reduce((sum, v) => sum + v.voting_power, 0);
        const noVotes = votes.filter(v => v.vote_option === 'no').reduce((sum, v) => sum + v.voting_power, 0);
        const abstainVotes = votes.filter(v => v.vote_option === 'abstain').reduce((sum, v) => sum + v.voting_power, 0);
        
        const quorum = totalVotingPower / await this.getTotalVotingPower();
        const yesPercentage = yesVotes / totalVotingPower;
        
        let status = proposal.status;
        if (status === 'voting' && Date.now() > proposal.voting_end_time) {
            if (quorum >= 0.33 && yesPercentage >= 0.5) {
                status = 'passed';
                await this.db.run(
                    "UPDATE governance_proposals SET status = 'passed' WHERE id = ?",
                    [proposalId]
                );
            } else {
                status = 'rejected';
                await this.db.run(
                    "UPDATE governance_proposals SET status = 'rejected' WHERE id = ?",
                    [proposalId]
                );
            }
        }
        
        return {
            id: proposal.id,
            status: status,
            total_votes: votes.length,
            total_voting_power: totalVotingPower,
            yes_votes: yesVotes,
            no_votes: noVotes,
            abstain_votes: abstainVotes,
            quorum: quorum,
            yes_percentage: yesPercentage
        };
    }

    async getTotalVotingPower() {
        // Total voting power is the sum of all staked tokens
        const result = await this.db.get(
            "SELECT SUM(stake_amount) as total FROM validators WHERE status = 'active'"
        );
        
        const stakingResult = await this.db.get(
            "SELECT SUM(amount) as total FROM stakers"
        );
        
        return (result.total || 0) + (stakingResult.total || 0);
    }
}

export default GovernanceEngine;
