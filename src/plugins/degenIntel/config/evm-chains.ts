/**
 * EVM Chain Configurations
 *
 * Defines supported EVM-compatible chains with their configurations
 * for use with viem and the EthereumChainService.
 */

import { mainnet, base, sepolia, polygon, arbitrum, optimism } from 'viem/chains';
import type { Chain } from 'viem';

/**
 * EVM Chain Configuration
 */
export interface EVMChainConfig {
  /** Chain ID (e.g., 1 for Ethereum mainnet) */
  chainId: number;
  /** Viem chain object for client creation */
  viemChain: Chain;
  /** Native token symbol (e.g., 'ETH') */
  nativeSymbol: string;
  /** Number of decimals for native token (usually 18) */
  nativeDecimals: number;
  /** Public RPC URL fallback */
  publicRpc: string;
  /** Block explorer URL */
  explorerUrl: string;
  /** Whether this is a testnet */
  isTestnet: boolean;
}

/**
 * Supported EVM Chains
 *
 * These chains are supported by the EthereumChainService.
 * Each chain maps to a configuration that includes viem chain
 * definition and connection details.
 */
export const EVM_CHAINS: Record<string, EVMChainConfig> = {
  ethereum: {
    chainId: 1,
    viemChain: mainnet,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    publicRpc: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    isTestnet: false,
  },
  base: {
    chainId: 8453,
    viemChain: base,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    publicRpc: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    isTestnet: false,
  },
  polygon: {
    chainId: 137,
    viemChain: polygon,
    nativeSymbol: 'MATIC',
    nativeDecimals: 18,
    publicRpc: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    isTestnet: false,
  },
  arbitrum: {
    chainId: 42161,
    viemChain: arbitrum,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    publicRpc: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    isTestnet: false,
  },
  optimism: {
    chainId: 10,
    viemChain: optimism,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    publicRpc: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    isTestnet: false,
  },
  sepolia: {
    chainId: 11155111,
    viemChain: sepolia,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    publicRpc: 'https://rpc.sepolia.org',
    explorerUrl: 'https://sepolia.etherscan.io',
    isTestnet: true,
  },
};

/**
 * Get chain configuration by name
 * @param chainName - Chain name (e.g., 'ethereum', 'base', 'sepolia')
 * @returns Chain configuration or undefined if not found
 */
export function getChainConfig(chainName: string): EVMChainConfig | undefined {
  return EVM_CHAINS[chainName.toLowerCase()];
}

/**
 * Get chain configuration by chain ID
 * @param chainId - EVM chain ID (e.g., 1, 8453, 11155111)
 * @returns Chain configuration or undefined if not found
 */
export function getChainConfigByChainId(chainId: number): EVMChainConfig | undefined {
  return Object.values(EVM_CHAINS).find(config => config.chainId === chainId);
}

/**
 * Get all supported chain names
 * @returns Array of supported chain names
 */
export function getSupportedChainNames(): string[] {
  return Object.keys(EVM_CHAINS);
}

/**
 * Get all mainnet chain names (excludes testnets)
 * @returns Array of mainnet chain names
 */
export function getMainnetChainNames(): string[] {
  return Object.entries(EVM_CHAINS)
    .filter(([_, config]) => !config.isTestnet)
    .map(([name]) => name);
}

/**
 * Get all testnet chain names
 * @returns Array of testnet chain names
 */
export function getTestnetChainNames(): string[] {
  return Object.entries(EVM_CHAINS)
    .filter(([_, config]) => config.isTestnet)
    .map(([name]) => name);
}

/**
 * Common ERC20 Token ABI (minimal for balance and transfer operations)
 */
export const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Environment variable keys for RPC URLs
 * These follow the pattern: {CHAIN_NAME}_RPC_URL
 */
export const RPC_ENV_KEYS: Record<string, string> = {
  ethereum: 'ETHEREUM_RPC_URL',
  base: 'BASE_RPC_URL',
  polygon: 'POLYGON_RPC_URL',
  arbitrum: 'ARBITRUM_RPC_URL',
  optimism: 'OPTIMISM_RPC_URL',
  sepolia: 'SEPOLIA_RPC_URL',
};

/**
 * Get RPC URL for a chain from environment or fallback to public RPC
 * @param chainName - Chain name
 * @param runtime - Agent runtime with getSetting method
 * @returns RPC URL
 */
export function getRpcUrl(chainName: string, runtime?: { getSetting?: (key: string) => string | undefined }): string {
  const envKey = RPC_ENV_KEYS[chainName.toLowerCase()];
  const config = getChainConfig(chainName);

  if (!config) {
    throw new Error(`Unknown chain: ${chainName}`);
  }

  // Try to get from runtime settings first
  if (runtime?.getSetting && envKey) {
    const customRpc = runtime.getSetting(envKey);
    if (customRpc) {
      return customRpc;
    }
  }

  // Try environment variable
  if (envKey && process.env[envKey]) {
    return process.env[envKey]!;
  }

  // Fallback to public RPC
  return config.publicRpc;
}
