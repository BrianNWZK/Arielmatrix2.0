import json
import os
import glob
import time
from web3 import Web3
from eth_account import Account

# Enhanced network configurations with multiple RPC endpoints for redundancy
NETWORK_CONFIGS = {
    'sepolia': {
        'chainId': 11155111,
        'name': 'Ethereum Sepolia',
        'explorer': 'https://sepolia.etherscan.io',
        'rpcUrls': [
            'https://rpc.sepolia.org', # Primary public Sepolia RPC
            'https://eth-sepolia.g.alchemy.com/v2/demo', # Alchemy Sepolia fallback (might need API key for prod)
            'https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID', # Infura Sepolia fallback (replace with your project ID)
            'https://ethereum-sepolia.publicnode.com' # Another public node
        ],
        'nativeCurrency': {
            'name': 'Sepolia Ether',
            'symbol': 'ETH',
            'decimals': 18
        }
    },
    'polygon': {
        'chainId': 137,
        'name': 'Polygon Mainnet',
        'explorer': 'https://polygonscan.com',
        'rpcUrls': [
            'https://polygon-rpc.com',
            'https://rpc-mainnet.maticvigil.com',
            'https://nd-144-848-522.p2pify.com/8390b396e95c479e950882e37cf7135e' # Public Polygon node
        ],
        'nativeCurrency': {
            'name': 'MATIC',
            'symbol': 'MATIC',
            'decimals': 18
        }
    },
    'mumbai': {
        'chainId': 80001,
        'name': 'Polygon Mumbai',
        'explorer': 'https://mumbai.polygonscan.com',
        'rpcUrls': [
            'https://rpc-mumbai.maticvigil.com',
            'https://polygon-mumbai.infura.io/v3/YOUR_INFURA_PROJECT_ID' # Infura Mumbai (replace)
        ],
        'nativeCurrency': {
            'name': 'MATIC',
            'symbol': 'MATIC',
            'decimals': 18
        }
    },
    'bsc': {
        'chainId': 56,
        'name': 'BNB Smart Chain',
        'explorer': 'https://bscscan.com',
        'rpcUrls': [
            'https://bsc-dataseed.binance.org/',
            'https://bsc-dataseed1.defibit.io/'
        ],
        'nativeCurrency': {
            'name': 'BNB',
            'symbol': 'BNB',
            'decimals': 18
        }
    },
    'bsc-testnet': {
        'chainId': 97,
        'name': 'BNB Testnet',
        'explorer': 'https://testnet.bscscan.com',
        'rpcUrls': [
            'https://data-seed-prebsc-1-s1.binance.org:8545/',
            'https://data-seed-prebsc-2-s1.binance.org:8545/'
        ],
        'nativeCurrency': {
            'name': 'BNB',
            'symbol': 'BNB',
            'decimals': 18
        }
    }
}


class DeployManager:
    def __init__(self, w3_instance=None):
        self.w3 = w3_instance
        self.deployed_contracts = {}

    async def _get_latest_artifact_path(self, contract_name):
        """
        Dynamically finds the most recently modified Hardhat artifact directory
        and constructs the full path to the contract's JSON artifact file.
        It can now handle both APIKeyGenerator.sol and RevenueDistributor.sol paths.
        """
        contract_file_map = {
            "QuantumAPIKeyGenerator": "APIKeyGenerator.sol",
            "RevenueDistributor": "RevenueDistributor.sol"
        }

        if contract_name not in contract_file_map:
            raise ValueError(f"Unknown contract name: {contract_name}. "
                             f"Supported contracts are: {', '.join(contract_file_map.keys())}")

        solidity_file_name = contract_file_map[contract_name]

        artifact_dirs = glob.glob('artifacts-*')

        if not artifact_dirs:
            raise FileNotFoundError("No Hardhat artifact directory found matching 'artifacts-*'. "
                                    "Please ensure your contracts are compiled using Hardhat (npx hardhat compile).")

        latest_artifact_dir = None
        latest_mod_time = 0

        for adir in artifact_dirs:
            if os.path.isdir(adir):
                mod_time = os.path.getmtime(adir)
                if mod_time > latest_mod_time:
                    latest_mod_time = mod_time
                    latest_artifact_dir = adir
        
        if not latest_artifact_dir:
            raise FileNotFoundError("Could not determine the latest Hardhat artifact directory. "
                                    "Ensure Hardhat compilation completes successfully.")

        artifact_file_path = os.path.join(
            latest_artifact_dir,
            'contracts',
            solidity_file_name,
            f'{contract_name}.json'
        )

        if not os.path.exists(artifact_file_path):
            raise FileNotFoundError(f"Contract artifact '{contract_name}.json' not found at "
                                    f"'{artifact_file_path}' within the latest artifact directory '{latest_artifact_dir}'. "
                                    f"Please ensure your contract is compiled correctly.")
        
        print(f"✅ Successfully located artifact for {contract_name} at {artifact_file_path}")
        return artifact_file_path

    def load_contract_artifacts(self, contract_name):
        """
        Loads the ABI and bytecode for a given contract from its Hardhat artifact.
        """
        artifact_path = self._get_latest_artifact_path(contract_name)
        with open(artifact_path, 'r') as f:
            artifact = json.load(f)

        abi = artifact.get('abi')
        bytecode = artifact.get('bytecode')

        if not abi:
            raise ValueError(f"ABI not found in artifact for {contract_name} at {artifact_path}")
        if not bytecode:
            raise ValueError(f"Bytecode not found in artifact for {contract_name} at {artifact_path}")
        
        print(f"✅ Successfully loaded ABI and Bytecode for {contract_name} from {artifact_path}")
        return abi, bytecode

    async def deploy_contract(self, contract_name, *constructor_args):
        """
        Deploys a contract using its ABI and bytecode.
        This version will always attempt to deploy and will raise an error if critical components are missing.
        """
        try:
            abi, bytecode = self.load_contract_artifacts(contract_name)
            
            if not self.w3.is_connected():
                raise ConnectionError("Web3 is not connected to an Ethereum node. "
                                      "Please ensure your node is running and the RPC URL is correct.")

            private_key = os.environ.get('PRIVATE_KEY')
            if not private_key or "PLACEHOLDER" in private_key:
                raise ValueError("PRIVATE_KEY environment variable is missing or a placeholder. Cannot sign transactions.")
            
            if not private_key.startswith('0x'):
                private_key = '0x' + private_key
            
            deployer_account = Account.from_key(private_key)
            deployer_address = deployer_account.address
            
            print(f"Deploying {contract_name} from account: {deployer_address}")

            Contract = self.w3.eth.contract(abi=abi, bytecode=bytecode)

            # Build the deployment transaction
            transaction = Contract.constructor(*constructor_args).build_transaction({
                'chainId': self.w3.eth.chain_id,
                'gasPrice': self.w3.eth.gas_price,
                'from': deployer_address,
                'nonce': self.w3.eth.get_transaction_count(deployer_address),
            })

            # Sign the transaction
            signed_txn = self.w3.eth.account.sign_transaction(transaction, private_key=private_key)
            
            # Send the transaction
            tx_hash = self.w3.eth.send_raw_transaction(signed_txn.rawTransaction)
            
            print(f"⏳ Transaction sent for {contract_name}. Tx Hash: {tx_hash.hex()}")
            
            # Wait for the transaction receipt
            tx_receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
            deployed_address = tx_receipt.contractAddress

            if not deployed_address:
                raise Exception(f"Contract deployment failed for {contract_name}: No address returned in receipt.")

            print(f"✅ Contract {contract_name} deployed to: {deployed_address}")
            self.deployed_contracts[contract_name] = deployed_address
            return deployed_address

        except Exception as e:
            # Catch all exceptions during deployment and re-raise to indicate failure
            print(f"❌ Error during deployment of {contract_name}: {e}")
            raise # Re-raise the exception to terminate the script cleanly

async def main():
    rpc_url_env = os.environ.get('RPC_URL')
    web3_instance = None
    connected_rpc = None

    # 1. Try connecting using the RPC_URL from environment variables first
    if rpc_url_env and "PLACEHOLDER" not in rpc_url_env:
        print(f"Attempting to connect to RPC_URL from environment: {rpc_url_env}")
        try:
            potential_w3 = Web3(Web3.HTTPProvider(rpc_url_env))
            if potential_w3.is_connected():
                web3_instance = potential_w3
                connected_rpc = rpc_url_env
                print(f"✅ Successfully connected to RPC from environment: {rpc_url_env}")
            else:
                print(f"⚠️ Failed to connect to RPC from environment: {rpc_url_env}. Trying fallbacks.")
        except Exception as e:
            print(f"⚠️ Error with RPC_URL from environment {rpc_url_env}: {e}. Trying fallbacks.")
    else:
        print("🚨 RPC_URL environment variable is missing or a placeholder. Trying defined network fallbacks.")

    # 2. If environment RPC failed or wasn't provided, try NETWORK_CONFIGS fallbacks (defaulting to Sepolia)
    if not web3_instance:
        default_network_key = 'sepolia' # You can make this configurable if needed
        network_config = NETWORK_CONFIGS.get(default_network_key)

        if not network_config:
            raise ValueError(f"Configuration for default network '{default_network_key}' not found.")

        print(f"Attempting to connect to {network_config['name']} using multiple RPCs...")
        for rpc_url in network_config['rpcUrls']:
            try:
                potential_w3 = Web3(Web3.HTTPProvider(rpc_url))
                if potential_w3.is_connected():
                    web3_instance = potential_w3
                    connected_rpc = rpc_url
                    print(f"✅ Successfully connected to {network_config['name']} via fallback RPC: {rpc_url}")
                    break # Exit loop on first successful connection
                else:
                    print(f"⚠️ Failed to connect to fallback RPC: {rpc_url}")
            except Exception as e:
                print(f"⚠️ Error with fallback RPC {rpc_url}: {e}")

    # Final check: Ensure Web3 is connected before proceeding with deployment attempts
    if not web3_instance or not web3_instance.is_connected():
        raise ConnectionError("Critical: Web3 is not connected to any Ethereum node after all attempts. Cannot perform real deployments.")

    deploy_mgr = DeployManager(w3_instance=web3_instance)
    deployed_addresses = {}

    print("\n" + "="*50 + "\n")
    print("Attempting to deploy QuantumAPIKeyGenerator...")
    
    # Define a default price feed address for Sepolia (ETH/USD)
    # This is a fixed, *real* address on Sepolia, not a placeholder.
    # Reference: https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum-sepolia
    sepolia_eth_usd_price_feed_address = "0x694AA1769357215Ee4EfB405d6fD64cbbE9d5f7B"
    deployed_api_key_generator = await deploy_mgr.deploy_contract("QuantumAPIKeyGenerator", sepolia_eth_usd_price_feed_address)

    if deployed_api_key_generator:
        deployed_addresses["API_KEY_GENERATOR_ADDRESS"] = deployed_api_key_generator
    else:
        # This case should ideally not be reached if deploy_contract raises on failure
        raise Exception("QuantumAPIKeyGenerator deployment failed unexpectedly.")

    print("\n" + "="*50 + "\n")
    print("Attempting to deploy RevenueDistributor...")

    usdt_wallets_env = os.environ.get('USDT_WALLETS')
    gas_wallet_env = os.environ.get('GAS_WALLET')
    usdt_token_address_env = os.environ.get('USDT_TOKEN_ADDRESS')

    # Strict validation for PRIVATE_KEY
    private_key_env = os.environ.get('PRIVATE_KEY')
    if not private_key_env or "PLACEHOLDER" in private_key_env:
        raise ValueError("PRIVATE_KEY environment variable is missing or a placeholder. This is crucial for signing transactions.")
    
    # Strict validation for USDT_WALLETS
    if not usdt_wallets_env or "PLACEHOLDER" in usdt_wallets_env:
        raise ValueError("USDT_WALLETS environment variable is missing or a placeholder. This is required for RevenueDistributor deployment.")
    
    recipient_wallets = []
    for addr_str in usdt_wallets_env.split(','):
        stripped_addr = addr_str.strip()
        if Web3.is_address(stripped_addr):
            recipient_wallets.append(stripped_addr)
        else:
            raise ValueError(f"Invalid Ethereum address found in USDT_WALLETS: {stripped_addr}. Please ensure all addresses are valid.")
    
    if not recipient_wallets:
        raise ValueError("USDT_WALLETS contains no valid Ethereum addresses after parsing. This is required for RevenueDistributor deployment.")
    print(f"Using recipient wallets from ENV: {recipient_wallets}")
    
    # Strict validation for GAS_WALLET (derived from PRIVATE_KEY if not set)
    gas_wallet_address = None
    if gas_wallet_env and "PLACEHOLDER" not in gas_wallet_env and Web3.is_address(gas_wallet_env):
        gas_wallet_address = gas_wallet_env
        print(f"Using gas wallet from ENV: {gas_wallet_address}")
    else:
        print("⚠️ GAS_WALLET environment variable is missing, a placeholder, or invalid. Attempting to derive from PRIVATE_KEY...")
        try:
            # PRIVATE_KEY is already validated at this point
            pk = private_key_env if private_key_env.startswith('0x') else '0x' + private_key_env
            account = Account.from_key(pk)
            gas_wallet_address = account.address
            print(f"✅ Derived gas wallet address from PRIVATE_KEY: {gas_wallet_address}")
        except Exception as e:
            raise ValueError(f"Failed to derive valid gas wallet address from PRIVATE_KEY for GAS_WALLET: {e}")

    if not gas_wallet_address or not Web3.is_address(gas_wallet_address):
        # This check is mostly redundant due to the above logic, but good for final safety
        raise ValueError("Critical: No valid gas wallet address could be determined for deployment.")

    # Strict validation for USDT_TOKEN_ADDRESS
    if not usdt_token_address_env or "PLACEHOLDER" in usdt_token_address_env or not Web3.is_address(usdt_token_address_env):
        raise ValueError("USDT_TOKEN_ADDRESS environment variable is missing, a placeholder, or not a valid address. This is required for RevenueDistributor deployment.")
    usdt_token_address = usdt_token_address_env
    print(f"Using USDT token address from ENV: {usdt_token_address}")


    deployed_revenue_distributor = await deploy_mgr.deploy_contract(
        "RevenueDistributor",
        recipient_wallets,
        gas_wallet_address,
        usdt_token_address
    )

    if deployed_revenue_distributor:
        deployed_addresses["SMART_CONTRACT_ADDRESS"] = deployed_revenue_distributor
    else:
        # This case should ideally not be reached if deploy_contract raises on failure
        raise Exception("RevenueDistributor deployment failed unexpectedly.")
    
    # Output the deployed addresses as JSON for the calling script only if all successful
    print(json.dumps(deployed_addresses))

if __name__ == "__main__":
    import asyncio
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"Script terminated due to critical error: {e}", file=os.stderr)
        # Exit with a non-zero code to indicate failure
        exit(1)

