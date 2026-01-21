/**
 * Ethereum Chain Service
 *
 * Implements the IChainService interface for EVM-compatible blockchains.
 * Supports Ethereum mainnet, Base, Polygon, Arbitrum, Optimism, and Sepolia testnet.
 */

import { Service, logger } from '@elizaos/core';
import type { IAgentRuntime } from '@elizaos/core';
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import type {
  IChainService,
  IntelTokenBalance,
  IntelPortfolio,
  IntelTransferParams,
  IntelTransferResult,
  IntelTokenMetadata,
  IntelDetectedKey,
  IntelExchange,
} from '../types';
import {
  EVM_CHAINS,
  ERC20_ABI,
  getChainConfig,
  getRpcUrl,
  type EVMChainConfig,
} from '../config/evm-chains';

/**
 * Regex patterns for detecting Ethereum addresses and private keys
 */
const ETH_ADDRESS_PATTERN = /\b0x[a-fA-F0-9]{40}\b/g;
const ETH_PRIVATE_KEY_PATTERN = /\b(0x)?[a-fA-F0-9]{64}\b/g;

/**
 * EthereumChainService - Multi-chain EVM service
 *
 * Provides wallet management, balance queries, and transfer functionality
 * for EVM-compatible blockchains using viem.
 */
export class EthereumChainService extends Service implements IChainService {
  static serviceType = 'chain_ethereum';
  capabilityDescription = 'The agent can interact with EVM-compatible blockchains';

  private isRunning = false;
  private publicClients: Map<string, PublicClient> = new Map();
  private defaultChain: string = 'ethereum';

  constructor(public runtime: IAgentRuntime) {
    super(runtime);
  }

  /**
   * Get or create a public client for the specified chain
   */
  private getPublicClient(chainName: string = this.defaultChain): PublicClient {
    const normalizedChain = chainName.toLowerCase();
    const config = getChainConfig(normalizedChain);

    if (!config) {
      throw new Error(`Unsupported EVM chain: ${chainName}`);
    }

    if (!this.publicClients.has(normalizedChain)) {
      const rpcUrl = getRpcUrl(normalizedChain, this.runtime);
      const client = createPublicClient({
        chain: config.viemChain,
        transport: http(rpcUrl),
      });
      this.publicClients.set(normalizedChain, client);
    }

    return this.publicClients.get(normalizedChain)!;
  }

  /**
   * Create a wallet client for the specified chain and private key
   */
  private getWalletClient(privateKey: string, chainName: string = this.defaultChain): WalletClient {
    const normalizedChain = chainName.toLowerCase();
    const config = getChainConfig(normalizedChain);

    if (!config) {
      throw new Error(`Unsupported EVM chain: ${chainName}`);
    }

    const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const account = privateKeyToAccount(normalizedKey as Hex);
    const rpcUrl = getRpcUrl(normalizedChain, this.runtime);

    return createWalletClient({
      account,
      chain: config.viemChain,
      transport: http(rpcUrl),
    });
  }

  /**
   * Normalize a private key to include 0x prefix
   */
  private normalizePrivateKey(key: string): Hex {
    return (key.startsWith('0x') ? key : `0x${key}`) as Hex;
  }

  /**
   * Derive address from private key
   */
  private deriveAddress(privateKey: string): Address {
    const normalizedKey = this.normalizePrivateKey(privateKey);
    const account = privateKeyToAccount(normalizedKey);
    return account.address;
  }

  // ========================================
  // Wallet & Key Management
  // ========================================

  /**
   * Creates a new Ethereum wallet/keypair
   */
  async createWallet(): Promise<{ publicKey: string; privateKey: string }> {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    return {
      publicKey: account.address,
      privateKey: privateKey,
    };
  }

  /**
   * Derives public keys (addresses) from an array of private keys
   */
  getPubkeysFromSecrets(privateKeys: string[]): string[] {
    return privateKeys.map(key => {
      try {
        return this.deriveAddress(key);
      } catch (error) {
        logger.debug(`Failed to derive address from key: ${error}`);
        return '';
      }
    }).filter(addr => addr !== '');
  }

  /**
   * Derives a single public key from a private key
   */
  getPubkeyFromSecret(privateKey: string): string {
    return this.deriveAddress(privateKey);
  }

  /**
   * Detects Ethereum addresses from text
   */
  detectPubkeysFromString(input: string, options?: any): string[] {
    const matches = input.match(ETH_ADDRESS_PATTERN);
    if (!matches) return [];

    // Filter out duplicates and validate
    const uniqueAddresses = Array.from(new Set(matches));
    return uniqueAddresses.filter(addr => this.isValidAddress(addr));
  }

  /**
   * Detects private keys from text and validates them
   */
  detectPrivateKeysFromString(input: string): IntelDetectedKey[] {
    const detectedKeys: IntelDetectedKey[] = [];
    const matches = input.match(ETH_PRIVATE_KEY_PATTERN);

    if (!matches) return [];

    // Process unique matches
    const uniqueMatches = Array.from(new Set(matches));

    for (const match of uniqueMatches) {
      try {
        // Normalize the key
        const normalizedKey = this.normalizePrivateKey(match);

        // Validate by deriving address
        const account = privateKeyToAccount(normalizedKey);

        if (account.address) {
          detectedKeys.push({
            key: normalizedKey,
            format: 'hex',
          });
        }
      } catch (error) {
        // Invalid key, skip
        logger.debug(`Invalid Ethereum private key detected: ${match.substring(0, 10)}...`);
      }
    }

    return detectedKeys;
  }

  // ========================================
  // Address Validation
  // ========================================

  /**
   * Validates an Ethereum address
   */
  isValidAddress(publicKey: string): boolean {
    // Check basic format
    if (!publicKey.match(/^0x[a-fA-F0-9]{40}$/)) {
      return false;
    }
    return true;
  }

  /**
   * Validates multiple addresses
   */
  AreValidAddresses(publicKeys: string[]): boolean[] {
    return publicKeys.map(key => this.isValidAddress(key));
  }

  /**
   * Determines the type of each address
   * For EVM, we return 'wallet' for EOAs
   */
  getAddressesTypes(publicKeys: string[]): Record<string, string> {
    const types: Record<string, string> = {};
    for (const key of publicKeys) {
      if (this.isValidAddress(key)) {
        // In EVM, we can't easily distinguish without on-chain check
        // For now, assume wallet
        types[key] = 'wallet';
      }
    }
    return types;
  }

  // ========================================
  // Signature Operations
  // ========================================

  /**
   * Signs messages with their respective private keys
   */
  async signMessages(
    requests: Array<{ privateKey: string; message: string }>
  ): Promise<Array<{ signature: string; publicKey: string }>> {
    const results: Array<{ signature: string; publicKey: string }> = [];

    for (const { privateKey, message } of requests) {
      try {
        const normalizedKey = this.normalizePrivateKey(privateKey);
        const account = privateKeyToAccount(normalizedKey);
        const signature = await account.signMessage({ message });

        results.push({
          signature,
          publicKey: account.address,
        });
      } catch (error) {
        logger.error(`Failed to sign message: ${error}`);
      }
    }

    return results;
  }

  /**
   * Verifies a message signature
   */
  verifySignature(publicKey: string, message: string, signature: string): boolean {
    try {
      // Import verifyMessage from viem
      const { verifyMessage } = require('viem');
      return verifyMessage({
        address: publicKey as Address,
        message,
        signature: signature as Hex,
      });
    } catch (error) {
      logger.error(`Signature verification failed: ${error}`);
      return false;
    }
  }

  // ========================================
  // Balance & Portfolio Operations
  // ========================================

  /**
   * Gets native ETH balance for addresses
   */
  private async getNativeBalances(
    publicKeys: string[],
    chainName: string = this.defaultChain
  ): Promise<Record<string, bigint>> {
    const client = this.getPublicClient(chainName);
    const balances: Record<string, bigint> = {};

    await Promise.all(
      publicKeys.map(async (address) => {
        try {
          const balance = await client.getBalance({ address: address as Address });
          balances[address] = balance;
        } catch (error) {
          logger.error(`Failed to get balance for ${address}: ${error}`);
          balances[address] = BigInt(0);
        }
      })
    );

    return balances;
  }

  /**
   * Gets ERC20 token balance for an address
   */
  private async getERC20Balance(
    address: string,
    tokenAddress: string,
    chainName: string = this.defaultChain
  ): Promise<{ balance: bigint; decimals: number; symbol: string; name: string }> {
    const client = this.getPublicClient(chainName);

    try {
      const [balance, decimals, symbol, name] = await Promise.all([
        client.readContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address as Address],
        }),
        client.readContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
        client.readContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }),
        client.readContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: 'name',
        }),
      ]);

      return {
        balance: balance as bigint,
        decimals: decimals as number,
        symbol: symbol as string,
        name: name as string,
      };
    } catch (error) {
      logger.error(`Failed to get ERC20 balance for ${tokenAddress}: ${error}`);
      return { balance: BigInt(0), decimals: 18, symbol: 'UNKNOWN', name: 'Unknown Token' };
    }
  }

  /**
   * Gets balances for wallet/token combinations
   */
  async getBalances(publicKeys: string[], caipAssetIds: string[]): Promise<IntelTokenBalance[]> {
    const results: IntelTokenBalance[] = [];

    for (const publicKey of publicKeys) {
      for (const caipAssetId of caipAssetIds) {
        try {
          // Parse CAIP asset ID
          const { chainName, assetType, assetAddress, decimals: defaultDecimals } =
            this.parseCAIPAssetId(caipAssetId);

          const config = getChainConfig(chainName);
          if (!config) continue;

          if (assetType === 'native') {
            // Native balance (ETH, MATIC, etc.)
            const balances = await this.getNativeBalances([publicKey], chainName);
            const balance = balances[publicKey] || BigInt(0);
            const uiAmount = formatEther(balance);

            results.push({
              caipAssetId,
              publicKey,
              symbol: config.nativeSymbol,
              name: config.nativeSymbol,
              decimals: config.nativeDecimals,
              balance: balance.toString(),
              uiAmount,
            });
          } else {
            // ERC20 token balance
            const tokenInfo = await this.getERC20Balance(publicKey, assetAddress, chainName);

            results.push({
              caipAssetId,
              publicKey,
              symbol: tokenInfo.symbol,
              name: tokenInfo.name,
              decimals: tokenInfo.decimals,
              balance: tokenInfo.balance.toString(),
              uiAmount: (Number(tokenInfo.balance) / Math.pow(10, tokenInfo.decimals)).toString(),
            });
          }
        } catch (error) {
          logger.error(`Failed to get balance for ${publicKey} / ${caipAssetId}: ${error}`);
        }
      }
    }

    return results;
  }

  /**
   * Gets complete portfolio for wallets
   */
  async getPortfolio(publicKeys: string[]): Promise<IntelPortfolio[]> {
    const results: IntelPortfolio[] = [];

    // For each supported chain
    for (const [chainName, config] of Object.entries(EVM_CHAINS)) {
      for (const publicKey of publicKeys) {
        try {
          const balances = await this.getNativeBalances([publicKey], chainName);
          const balance = balances[publicKey] || BigInt(0);

          results.push({
            chain: chainName,
            publicKey,
            nativeBalance: {
              caipAssetId: `${chainName}:mainnet/native:${config.nativeSymbol}`,
              symbol: config.nativeSymbol,
              balance: balance.toString(),
              uiAmount: formatEther(balance),
            },
            tokens: [], // Token discovery would require indexer integration
            lastUpdated: Date.now(),
          });
        } catch (error) {
          logger.error(`Failed to get portfolio for ${publicKey} on ${chainName}: ${error}`);
        }
      }
    }

    return results;
  }

  // ========================================
  // Token Metadata
  // ========================================

  /**
   * Gets token metadata for CAIP asset IDs
   */
  async getTokenDetails(caipAssetIds: string[]): Promise<Record<string, IntelTokenMetadata>> {
    const results: Record<string, IntelTokenMetadata> = {};

    for (const caipAssetId of caipAssetIds) {
      try {
        const { chainName, assetType, assetAddress } = this.parseCAIPAssetId(caipAssetId);
        const config = getChainConfig(chainName);

        if (!config) continue;

        if (assetType === 'native') {
          results[caipAssetId] = {
            caipAssetId,
            symbol: config.nativeSymbol,
            name: config.nativeSymbol,
            decimals: config.nativeDecimals,
          };
        } else {
          const client = this.getPublicClient(chainName);
          const [decimals, symbol, name, totalSupply] = await Promise.all([
            client.readContract({
              address: assetAddress as Address,
              abi: ERC20_ABI,
              functionName: 'decimals',
            }),
            client.readContract({
              address: assetAddress as Address,
              abi: ERC20_ABI,
              functionName: 'symbol',
            }),
            client.readContract({
              address: assetAddress as Address,
              abi: ERC20_ABI,
              functionName: 'name',
            }),
            client.readContract({
              address: assetAddress as Address,
              abi: ERC20_ABI,
              functionName: 'totalSupply',
            }),
          ]);

          results[caipAssetId] = {
            caipAssetId,
            symbol: symbol as string,
            name: name as string,
            decimals: decimals as number,
            supply: (totalSupply as bigint).toString(),
          };
        }
      } catch (error) {
        logger.error(`Failed to get token details for ${caipAssetId}: ${error}`);
      }
    }

    return results;
  }

  /**
   * Gets symbols for token addresses
   */
  async getTokensSymbols(tokenAddresses: string[]): Promise<Record<string, string | null>> {
    const results: Record<string, string | null> = {};
    const client = this.getPublicClient();

    for (const address of tokenAddresses) {
      try {
        const symbol = await client.readContract({
          address: address as Address,
          abi: ERC20_ABI,
          functionName: 'symbol',
        });
        results[address] = symbol as string;
      } catch (error) {
        results[address] = null;
      }
    }

    return results;
  }

  /**
   * Gets decimals for token addresses
   */
  async getDecimals(tokenAddresses: string[]): Promise<number[]> {
    const client = this.getPublicClient();
    const results: number[] = [];

    for (const address of tokenAddresses) {
      try {
        const decimals = await client.readContract({
          address: address as Address,
          abi: ERC20_ABI,
          functionName: 'decimals',
        });
        results.push(decimals as number);
      } catch (error) {
        results.push(18); // Default to 18
      }
    }

    return results;
  }

  /**
   * Gets circulating supply for tokens
   */
  async getCirculatingSupplies(tokenAddresses: string[]): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    const client = this.getPublicClient();

    for (const address of tokenAddresses) {
      try {
        const supply = await client.readContract({
          address: address as Address,
          abi: ERC20_ABI,
          functionName: 'totalSupply',
        });
        results[address] = (supply as bigint).toString();
      } catch (error) {
        results[address] = '0';
      }
    }

    return results;
  }

  // ========================================
  // Transfers
  // ========================================

  /**
   * Executes token transfers
   */
  async transfer(params: IntelTransferParams[]): Promise<IntelTransferResult[]> {
    const results: IntelTransferResult[] = [];

    for (const { from, to, amount, caipAssetId } of params) {
      try {
        const { chainName, assetType, assetAddress } = this.parseCAIPAssetId(caipAssetId);
        const config = getChainConfig(chainName);

        if (!config) {
          results.push({
            success: false,
            error: `Unsupported chain: ${chainName}`,
            chain: chainName,
            from: this.deriveAddress(from),
            to,
            caipAssetId,
          });
          continue;
        }

        const walletClient = this.getWalletClient(from, chainName);
        const publicClient = this.getPublicClient(chainName);
        const fromAddress = this.deriveAddress(from);

        let txHash: Hex;

        if (assetType === 'native') {
          // Native transfer (ETH, MATIC, etc.)
          txHash = await walletClient.sendTransaction({
            to: to as Address,
            value: BigInt(amount),
          });
        } else {
          // ERC20 transfer
          txHash = await walletClient.writeContract({
            address: assetAddress as Address,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [to as Address, BigInt(amount)],
          });
        }

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        results.push({
          success: receipt.status === 'success',
          txHash,
          chain: chainName,
          from: fromAddress,
          to,
          caipAssetId,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Transfer failed: ${errorMsg}`);

        results.push({
          success: false,
          error: errorMsg,
          caipAssetId,
          to,
        });
      }
    }

    return results;
  }

  // ========================================
  // Trading / Exchange (placeholder)
  // ========================================

  /**
   * Lists available exchanges for EVM chains
   */
  async listExchanges(): Promise<IntelExchange[]> {
    // Placeholder - would integrate with Uniswap, 1inch, etc.
    return [
      { id: 1, name: 'Uniswap', chain: 'ethereum' },
      { id: 2, name: 'Uniswap', chain: 'base' },
      { id: 3, name: 'QuickSwap', chain: 'polygon' },
    ];
  }

  /**
   * Selects the best exchange (placeholder)
   */
  async selectExchange(): Promise<number> {
    return 1; // Default to first exchange
  }

  /**
   * Executes a swap on an exchange (placeholder)
   */
  async doSwapOnExchange(exchangeId: number, params: any): Promise<any> {
    throw new Error('Swap functionality not yet implemented for EVM chains');
  }

  // ========================================
  // Helper Methods
  // ========================================

  /**
   * Parse CAIP asset ID into components
   * Format: chainNs:chainRef/assetNs:assetRef
   * Example: ethereum:mainnet/erc20:0x...
   */
  private parseCAIPAssetId(caipAssetId: string): {
    chainName: string;
    chainRef: string;
    assetType: string;
    assetAddress: string;
    decimals?: number;
  } {
    const slashIdx = caipAssetId.indexOf('/');
    if (slashIdx === -1) {
      throw new Error(`Invalid CAIP asset ID: ${caipAssetId}`);
    }

    const chainPart = caipAssetId.slice(0, slashIdx);
    const assetPart = caipAssetId.slice(slashIdx + 1);

    // Parse chain
    const chainColonIdx = chainPart.indexOf(':');
    const chainName = chainColonIdx === -1 ? chainPart : chainPart.slice(0, chainColonIdx);
    const chainRef = chainColonIdx === -1 ? 'mainnet' : chainPart.slice(chainColonIdx + 1);

    // Parse asset
    const assetColonIdx = assetPart.indexOf(':');
    const assetType = assetColonIdx === -1 ? 'native' : assetPart.slice(0, assetColonIdx);
    const assetAddress = assetColonIdx === -1 ? assetPart : assetPart.slice(assetColonIdx + 1);

    return {
      chainName: chainName.toLowerCase(),
      chainRef,
      assetType,
      assetAddress,
    };
  }

  // ========================================
  // Service Lifecycle
  // ========================================

  static async start(runtime: IAgentRuntime): Promise<EthereumChainService> {
    const service = new EthereumChainService(runtime);
    await service.start();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(this.serviceType);
    if (!service) {
      throw new Error(`${this.serviceType} service not found`);
    }
    await service.stop();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('EthereumChainService is already running');
      return;
    }

    try {
      logger.info('Starting EthereumChainService...');

      // Pre-initialize clients for commonly used chains
      this.getPublicClient('ethereum');
      this.getPublicClient('base');

      this.isRunning = true;
      logger.info('EthereumChainService started successfully');
    } catch (error) {
      logger.error(`Error starting EthereumChainService: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('EthereumChainService is not running');
      return;
    }

    try {
      logger.info('Stopping EthereumChainService...');
      this.publicClients.clear();
      this.isRunning = false;
      logger.info('EthereumChainService stopped successfully');
    } catch (error) {
      logger.error(`Error stopping EthereumChainService: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  isServiceRunning(): boolean {
    return this.isRunning;
  }
}
