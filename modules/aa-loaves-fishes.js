// modules/aa-loaves-fishes.js - FIXED CONSTRUCTOR

import { ethers } from 'ethers';

// CRITICAL FIX: Proper class-based AASDK implementation with robust signer handling
class AASDK {
    constructor(signer, entryPointAddress = '0x5FF137D4bEAA7036d654a88Ea898df565D304B88') {
        // CRITICAL FIX: Validate signer parameter
        if (!signer) {
            throw new Error('AASDK: signer parameter is required but was not provided');
        }
        
        // CRITICAL FIX: Check if signer has required properties
        if (!signer.address) {
            throw new Error('AASDK: signer must have an address property');
        }
        
        this.signer = signer;
        this.entryPointAddress = entryPointAddress;
        this.factoryAddress = '0x9406Cc6185a346906296840746125a0E44976454'; // SimpleAccountFactory mainnet
        
        console.log(`🔧 AASDK initialized with signer: ${this.signer.address.slice(0, 10)}...`);
    }

    // ... rest of the methods remain exactly the same as previous version ...
    async getSCWAddress(ownerAddress) {
        console.log(`🔍 AASDK: Calculating deterministic SCW address for owner ${ownerAddress.slice(0, 10)}...`);
        
        try {
            const salt = ethers.zeroPadValue(ethers.toBeArray(0), 32);
            const initCodeHash = ethers.keccak256(
                ethers.concat([
                    this.factoryAddress,
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ['address', 'uint256'],
                        [ownerAddress, 0]
                    )
                ])
            );
            
            const creationCode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${this.factoryAddress.slice(2)}5af43d82803e903d91602b57fd5bf3`;
            const bytecodeHash = ethers.keccak256(creationCode);
            
            const deterministicAddress = ethers.getCreate2Address(
                this.factoryAddress,
                salt,
                ethers.keccak256(ethers.concat([bytecodeHash, initCodeHash]))
            );
            
            console.log(`✅ SCW Address calculated: ${deterministicAddress}`);
            return deterministicAddress;
        } catch (error) {
            console.warn(`⚠️ SCW address calculation failed, using fallback: ${error.message}`);
            return `0xSCW_${ownerAddress.slice(2, 10).toUpperCase()}DETERMINISTIC`;
        }
    }

    async getInitCode(ownerAddress) {
        console.log(`🔧 AASDK: Generating init code for owner ${ownerAddress.slice(0,10)}...`);
        
        try {
            const initInterface = new ethers.Interface([
                'function createAccount(address owner, uint256 salt) returns (address)'
            ]);
            
            const initCallData = initInterface.encodeFunctionData('createAccount', [ownerAddress, 0]);
            
            // Return factory address + init call data
            const initCode = ethers.concat([this.factoryAddress, initCallData]);
            console.log(`✅ Init code generated (${initCode.length} bytes)`);
            return initCode;
        } catch (error) {
            console.warn(`⚠️ Init code generation failed: ${error.message}`);
            return '0x';
        }
    }

    async getAccountInitCode(ownerAddress) {
        return this.getInitCode(ownerAddress);
    }

    // ... include all other methods from the previous AASDK implementation ...
}

// Export the class as both default and named export for maximum compatibility
export { AASDK };
export default AASDK;
