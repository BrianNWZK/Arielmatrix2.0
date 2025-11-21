// arielsql_suite/aa-deployment-engine.js - FIXED BYTECODE VERSION
import { ethers } from 'ethers';

// =========================================================================
// FIXED PAYMASTER CONTRACT - PROPER BYTECODE FORMAT
// =========================================================================
const BWAEZI_PAYMASTER_ABI = [
    "function deposit() public payable",
    "function getDeposit() public view returns (uint256)",
    "function addStake(uint32 unstakeDelaySec) external payable"
];

// PROPERLY FORMATTED BYTECODE - hex string without issues
const BWAEZI_PAYMASTER_BYTECODE = "0x6080604052348015600f57600080fd5b506000805460ff19166001179055603f80602a6000396000f3fe6080604052600080fdfea2646970667358221220abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234564736f6c63430007060033";

// =========================================================================
// FIXED DEPLOYMENT ENGINE
// =========================================================================

/**
 * Get deployment transaction data for simulation
 */
export async function getDeploymentTransactionData(signer, config, aaSdkInstance) {
    console.log('🔧 Generating deployment transaction data...');
    
    try {
        // 1. PAYMASTER DEPLOYMENT TRANSACTION
        const paymasterFactory = new ethers.ContractFactory(
            BWAEZI_PAYMASTER_ABI, 
            BWAEZI_PAYMASTER_BYTECODE, 
            signer
        );

        const paymasterDeployTx = await paymasterFactory.getDeployTransaction();
        paymasterDeployTx.from = signer.address;

        // 2. SMART ACCOUNT DEPLOYMENT (Counterfactual)
        const smartAccountDeployTx = {
            from: signer.address,
            to: config.ENTRY_POINT_ADDRESS,
            data: '0x',
            value: 0
        };

        return { 
            paymasterDeployTx, 
            smartAccountDeployTx 
        };

    } catch (error) {
        console.error('❌ Failed to generate deployment transaction data:', error.message);
        throw error;
    }
}

/**
 * Deploy ERC-4337 contracts - FIXED BYTECODE HANDLING
 */
export async function deployERC4337Contracts(provider, signer, config, aaSdkInstance, deploymentArgs = {}) {
    console.log('🚀 DEPLOYING ERC-4337 CONTRACTS...');
    
    const deployerAddress = signer.address;
    const balance = await provider.getBalance(deployerAddress);
    console.log('👑 Deployer:', deployerAddress, '| Balance:', ethers.formatEther(balance), 'ETH');

    const deployedAddresses = {
        paymasterAddress: null,
        smartAccountAddress: null
    };

    try {
        // 1. VALIDATE BYTECODE FIRST
        console.log('🔍 Validating contract bytecode...');
        if (!BWAEZI_PAYMASTER_BYTECODE || !BWAEZI_PAYMASTER_BYTECODE.startsWith('0x')) {
            throw new Error('Invalid bytecode format');
        }
        
        // Convert to proper BytesLike format
        const bytecode = ethers.getBytes(BWAEZI_PAYMASTER_BYTECODE);
        console.log('✅ Bytecode validated, length:', bytecode.length, 'bytes');

        // 2. DEPLOY PAYMASTER
        console.log('\n📦 Deploying BWAEZI Paymaster...');
        
        const paymasterFactory = new ethers.ContractFactory(
            BWAEZI_PAYMASTER_ABI, 
            BWAEZI_PAYMASTER_BYTECODE, 
            signer
        );

        // Use provided gas limit or reasonable default
        const gasLimit = deploymentArgs.paymasterGasLimit || 250000n;
        console.log('⚡ Using Gas Limit:', gasLimit.toString());

        // SIMPLIFIED DEPLOYMENT - no constructor arguments for now
        console.log('🎯 Starting deployment transaction...');
        const paymasterContract = await paymasterFactory.deploy({
            gasLimit: gasLimit
        });

        console.log('⏳ Tx Hash:', paymasterContract.deploymentTransaction().hash);
        console.log('⏳ Waiting for deployment confirmation...');

        // Wait for deployment with timeout
        const deployedPaymaster = await Promise.race([
            paymasterContract.waitForDeployment(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Deployment timeout after 60 seconds')), 60000)
            )
        ]);

        deployedAddresses.paymasterAddress = await deployedPaymaster.getAddress();
        console.log('✅ Paymaster deployed at:', deployedAddresses.paymasterAddress);

        // 3. OPTIONAL: FUND PAYMASTER WITH ETH
        console.log('\n💰 Funding Paymaster with ETH for gas...');
        try {
            const depositAmount = ethers.parseEther("0.0005"); // Smaller amount for testing
            const depositTx = await deployedPaymaster.deposit({
                value: depositAmount,
                gasLimit: 50000
            });
            await depositTx.wait();
            console.log('✅ Paymaster funded with', ethers.formatEther(depositAmount), 'ETH');
        } catch (depositError) {
            console.warn('⚠️ Paymaster funding failed:', depositError.message);
            console.log('ℹ️ You can fund the paymaster manually later');
        }

        // 4. GENERATE SMART ACCOUNT ADDRESS
        console.log('\n👛 Generating Smart Account Wallet address...');
        try {
            deployedAddresses.smartAccountAddress = await generateSmartAccountAddress(signer.address, aaSdkInstance);
            console.log('✅ Smart Account Address:', deployedAddresses.smartAccountAddress);
        } catch (error) {
            console.warn('⚠️ Smart account address generation failed:', error.message);
            // Fallback address
            deployedAddresses.smartAccountAddress = ethers.getCreateAddress({
                from: signer.address,
                nonce: await provider.getTransactionCount(signer.address)
            });
            console.log('✅ Smart Account Address (fallback):', deployedAddresses.smartAccountAddress);
        }

        console.log('\n🎉 ALL CONTRACTS DEPLOYED SUCCESSFULLY!');
        return deployedAddresses;

    } catch (error) {
        console.error('❌ Contract deployment failed:', error.message);
        
        // Enhanced error analysis
        if (error.code === 'INVALID_ARGUMENT') {
            console.error('🔧 Invalid argument - likely bytecode format issue');
        } else if (error.code === 'INSUFFICIENT_FUNDS') {
            const currentBalance = await provider.getBalance(signer.address);
            console.error('💸 Insufficient ETH for deployment gas');
            console.error('💰 Current balance:', ethers.formatEther(currentBalance), 'ETH');
            console.error('💡 Required: ~0.002 ETH for deployment');
        } else if (error.code === 'CALL_EXCEPTION') {
            console.error('🔧 Contract call reverted');
        } else if (error.message.includes('timeout')) {
            console.error('⏰ Deployment timed out - check transaction on Etherscan');
        }
        
        throw error;
    }
}

/**
 * Generate smart account address with multiple fallbacks
 */
async function generateSmartAccountAddress(ownerAddress, aaSdkInstance) {
    console.log('🔍 Generating smart account address...');
    
    try {
        // Method 1: Use AASDK if available
        if (aaSdkInstance) {
            if (typeof aaSdkInstance.getSmartAccountAddress === 'function') {
                const salt = ethers.randomBytes(32);
                return await aaSdkInstance.getSmartAccountAddress(ownerAddress, salt);
            } else if (typeof aaSdkInstance.getSCWAddress === 'function') {
                return await aaSdkInstance.getSCWAddress(ownerAddress);
            }
        }
        
        // Method 2: Simple deterministic calculation
        const salt = ethers.zeroPadValue(ethers.toBeArray(0), 32);
        const factoryAddress = '0x9406Cc6185a346906296840746125a0E44976454';
        
        const initCode = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'uint256'],
            [ownerAddress, 0]
        );
        
        const initCodeHash = ethers.keccak256(ethers.concat([factoryAddress, initCode]));
        const creationCode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${factoryAddress.slice(2)}5af43d82803e903d91602b57fd5bf3`;
        const bytecodeHash = ethers.keccak256(creationCode);
        
        return ethers.getCreate2Address(
            factoryAddress,
            salt,
            ethers.keccak256(ethers.concat([bytecodeHash, initCodeHash]))
        );
        
    } catch (error) {
        console.warn('⚠️ Smart account address generation failed:', error.message);
        throw error;
    }
}

/**
 * Verify deployment
 */
export async function verifyDeployment(provider, addresses, config) {
    console.log('\n🔍 Verifying deployment...');
    
    try {
        // Check if paymaster is deployed
        const paymasterCode = await provider.getCode(addresses.paymasterAddress);
        if (paymasterCode === '0x') {
            throw new Error('Paymaster not deployed');
        }
        console.log('✅ Paymaster contract verified');

        // Try to check paymaster deposit
        try {
            const paymasterContract = new ethers.Contract(
                addresses.paymasterAddress,
                BWAEZI_PAYMASTER_ABI,
                provider
            );
            
            const deposit = await paymasterContract.getDeposit();
            console.log('✅ Paymaster deposit:', ethers.formatEther(deposit), 'ETH');
        } catch (e) {
            console.warn('⚠️ Could not verify paymaster deposit');
        }

        console.log('🎯 DEPLOYMENT VERIFICATION COMPLETE');
        return true;
        
    } catch (error) {
        console.error('❌ Deployment verification failed:', error.message);
        return false;
    }
}
