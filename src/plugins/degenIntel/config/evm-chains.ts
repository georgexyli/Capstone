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
 * Uniswap V3 Contract Addresses per Chain
 * SwapRouter02 is the recommended router for swaps
 */
export const UNISWAP_CONTRACTS: Record<string, {
  swapRouter: `0x${string}`;
  quoterV2: `0x${string}`;
  weth: `0x${string}`;
}> = {
  ethereum: {
    swapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // SwapRouter02
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  base: {
    swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481', // SwapRouter02
    quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    weth: '0x4200000000000000000000000000000000000006',
  },
  polygon: {
    swapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // SwapRouter02
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
  },
  arbitrum: {
    swapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // SwapRouter02
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  optimism: {
    swapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // SwapRouter02
    quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    weth: '0x4200000000000000000000000000000000000006',
  },
  sepolia: {
    swapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // SwapRouter02
    quoterV2: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
    weth: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  },
};

/**
 * Uniswap V3 SwapRouter02 ABI (minimal for exactInputSingle)
 */
export const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

/**
 * Uniswap V3 QuoterV2 ABI (minimal for quoteExactInputSingle)
 */
export const QUOTER_V2_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * WETH ABI (minimal for deposit/withdraw)
 */
export const WETH_ABI = [
  {
    inputs: [],
    name: 'deposit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'wad', type: 'uint256' }],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'guy', type: 'address' },
      { name: 'wad', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'src', type: 'address' },
      { name: 'dst', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Common Uniswap V3 fee tiers (in basis points * 100)
 * 500 = 0.05%, 3000 = 0.3%, 10000 = 1%
 */
export const UNISWAP_FEE_TIERS = [500, 3000, 10000] as const;

/**
 * Get Uniswap contracts for a chain
 */
export function getUniswapContracts(chainName: string) {
  return UNISWAP_CONTRACTS[chainName.toLowerCase()];
}

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
