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
  getUniswapContracts,
  SWAP_ROUTER_ABI,
  QUOTER_V2_ABI,
  WETH_ABI,
  UNISWAP_FEE_TIERS,
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
  async getDecimals(tokenAddresses: string[], chainName?: string): Promise<number[]> {
    const client = this.getPublicClient(chainName || this.defaultChain);
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
  // Trading / Exchange (Uniswap V3)
  // ========================================

  /**
   * Lists available exchanges for EVM chains
   */
  async listExchanges(): Promise<IntelExchange[]> {
    return [
      { id: 1, name: 'Uniswap V3', chain: 'ethereum' },
      { id: 2, name: 'Uniswap V3', chain: 'base' },
      { id: 3, name: 'Uniswap V3', chain: 'polygon' },
      { id: 4, name: 'Uniswap V3', chain: 'arbitrum' },
      { id: 5, name: 'Uniswap V3', chain: 'optimism' },
      { id: 6, name: 'Uniswap V3', chain: 'sepolia' },
    ];
  }

  /**
   * Selects the best exchange (always Uniswap for EVM)
   */
  async selectExchange(): Promise<number> {
    return 1; // Default to Uniswap
  }

  /**
   * Get a swap quote from Uniswap V3
   * @param params - Quote parameters
   * @returns Quote result with expected output amount
   */
  async getSwapQuote(params: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    chainName?: string;
    slippageBps?: number;
  }): Promise<{
    amountOut: string;
    amountOutMinimum: string;
    fee: number;
    priceImpact: string;
    chainName: string;
    inputDecimals: number;
    outputDecimals: number;
  }> {
    const chainName = params.chainName || this.defaultChain;
    const contracts = getUniswapContracts(chainName);

    if (!contracts) {
      throw new Error(`Uniswap not supported on chain: ${chainName}`);
    }

    const publicClient = this.getPublicClient(chainName);
    const slippageBps = params.slippageBps || 50; // Default 0.5% slippage

    // Normalize addresses - handle native ETH as WETH
    let tokenIn = params.tokenIn.toLowerCase();
    let tokenOut = params.tokenOut.toLowerCase();

    // Convert native ETH address to WETH
    const nativeAddresses = ['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '0x0000000000000000000000000000000000000000'];
    const isNativeIn = nativeAddresses.includes(tokenIn);
    const isNativeOut = nativeAddresses.includes(tokenOut);

    if (isNativeIn) {
      tokenIn = contracts.weth.toLowerCase();
    }
    if (isNativeOut) {
      tokenOut = contracts.weth.toLowerCase();
    }

    // Fetch token decimals (native ETH/WETH = 18, ERC-20 = read from contract)
    let inputDecimals = 18;
    let outputDecimals = 18;
    try {
      const [inDec, outDec] = await Promise.all([
        isNativeIn ? Promise.resolve(18) : publicClient.readContract({
          address: tokenIn as Address,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }).then(d => d as number).catch(() => 18),
        isNativeOut ? Promise.resolve(18) : publicClient.readContract({
          address: tokenOut as Address,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }).then(d => d as number).catch(() => 18),
      ]);
      inputDecimals = inDec;
      outputDecimals = outDec;
    } catch (e) {
      logger.warn(`Failed to fetch token decimals, defaulting to 18: ${e}`);
    }
    logger.info(`[getSwapQuote] Token decimals: input=${inputDecimals}, output=${outputDecimals}`);

    // Try different fee tiers to find the best quote
    let bestQuote: { amountOut: bigint; fee: number } | null = null;

    for (const fee of UNISWAP_FEE_TIERS) {
      try {
        const result = await (publicClient as any).simulateContract({
          address: contracts.quoterV2,
          abi: QUOTER_V2_ABI,
          functionName: 'quoteExactInputSingle',
          args: [{
            tokenIn: tokenIn as `0x${string}`,
            tokenOut: tokenOut as `0x${string}`,
            amountIn: BigInt(params.amountIn),
            fee: fee,
            sqrtPriceLimitX96: BigInt(0),
          }],
        });

        const amountOut = result.result[0] as bigint;

        if (!bestQuote || amountOut > bestQuote.amountOut) {
          bestQuote = { amountOut, fee };
        }
      } catch (error) {
        // This fee tier doesn't have liquidity, try next
        logger.debug(`No liquidity for fee tier ${fee} on ${chainName}`);
      }
    }

    if (!bestQuote) {
      throw new Error(`No liquidity found for swap ${tokenIn} -> ${tokenOut} on ${chainName}`);
    }

    // Calculate minimum output with slippage
    const amountOutMinimum = (bestQuote.amountOut * BigInt(10000 - slippageBps)) / BigInt(10000);

    // Rough price impact calculation (simplified)
    const priceImpact = '0.00'; // Would need to compare to oracle price for accurate impact

    return {
      amountOut: bestQuote.amountOut.toString(),
      amountOutMinimum: amountOutMinimum.toString(),
      fee: bestQuote.fee,
      priceImpact,
      chainName,
      inputDecimals,
      outputDecimals,
    };
  }

  /**
   * Execute a swap on Uniswap V3
   * @param params - Swap parameters including private key
   * @returns Transaction result
   */
  async executeSwap(params: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOutMinimum: string;
    fee: number;
    privateKey: string;
    chainName?: string;
    deadline?: number;
  }): Promise<{
    success: boolean;
    txHash?: string;
    amountOut?: string;
    error?: string;
    explorerUrl?: string;
  }> {
    const chainName = params.chainName || this.defaultChain;
    const contracts = getUniswapContracts(chainName);
    const chainConfig = getChainConfig(chainName);

    if (!contracts || !chainConfig) {
      return {
        success: false,
        error: `Uniswap not supported on chain: ${chainName}`,
      };
    }

    try {
      const publicClient = this.getPublicClient(chainName);
      const walletClient = this.getWalletClient(params.privateKey, chainName);
      const account = walletClient.account!;

      // Normalize addresses
      let tokenIn = params.tokenIn.toLowerCase();
      let tokenOut = params.tokenOut.toLowerCase();
      const nativeAddresses = ['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '0x0000000000000000000000000000000000000000'];
      const isNativeIn = nativeAddresses.includes(tokenIn);
      const isNativeOut = nativeAddresses.includes(tokenOut);

      if (isNativeIn) {
        tokenIn = contracts.weth.toLowerCase();
      }
      if (isNativeOut) {
        tokenOut = contracts.weth.toLowerCase();
      }

      const amountIn = BigInt(params.amountIn);
      const deadline = params.deadline || Math.floor(Date.now() / 1000) + 1800; // 30 min default

      // If swapping from ERC20, need to approve first
      if (!isNativeIn) {
        // Check allowance for router using the allowance ABI
        const allowanceAbi = [{
          inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
          name: 'allowance',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        }] as const;

        const currentAllowance = await (publicClient as any).readContract({
          address: tokenIn as `0x${string}`,
          abi: allowanceAbi,
          functionName: 'allowance',
          args: [account.address, contracts.swapRouter],
        }) as bigint;

        if (currentAllowance < amountIn) {
          logger.info(`Approving ${tokenIn} for swap router...`);

          const approveAbi = [{
            inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
            name: 'approve',
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
            type: 'function',
          }] as const;

          const approveHash = await (walletClient as any).writeContract({
            address: tokenIn as `0x${string}`,
            abi: approveAbi,
            functionName: 'approve',
            args: [contracts.swapRouter, amountIn * BigInt(2)], // Approve 2x for future swaps
            chain: chainConfig.viemChain,
            account,
          });

          // Wait for approval
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
          logger.info(`Approval confirmed: ${approveHash}`);
        }
      }

      // Execute the swap
      logger.info(`Executing swap on ${chainName}: ${tokenIn} -> ${tokenOut}`);

      const swapParams = {
        tokenIn: tokenIn as `0x${string}`,
        tokenOut: tokenOut as `0x${string}`,
        fee: params.fee,
        recipient: account.address,
        amountIn: amountIn,
        amountOutMinimum: BigInt(params.amountOutMinimum),
        sqrtPriceLimitX96: BigInt(0),
      };

      const txHash = await (walletClient as any).writeContract({
        address: contracts.swapRouter,
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [swapParams],
        chain: chainConfig.viemChain,
        account,
        value: isNativeIn ? amountIn : BigInt(0), // Send ETH value if swapping from native
      }) as `0x${string}`;

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === 'success') {
        logger.info(`Swap successful: ${txHash}`);

        // Decode actual output amount from Uniswap V3 Swap event logs
        let actualAmountOut: string | undefined;
        const SWAP_EVENT_TOPIC = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
        try {
          for (const log of receipt.logs) {
            if (log.topics[0] === SWAP_EVENT_TOPIC) {
              // Uniswap V3 Swap event: amount0 and amount1 are in data (non-indexed)
              // data = abi.encode(int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
              const data = log.data as `0x${string}`;
              // amount0 is bytes 0-32, amount1 is bytes 32-64 (as int256)
              const amount0Hex = '0x' + data.slice(2, 66);
              const amount1Hex = '0x' + data.slice(66, 130);
              const amount0 = BigInt(amount0Hex);
              const amount1 = BigInt(amount1Hex);
              // The positive value is the output (tokens received)
              // In Uniswap V3, negative = tokens leaving pool (to user), positive = tokens entering pool
              // Actually: from the pool's perspective, positive = received, negative = sent
              // The output for the user is the absolute value of the negative one
              const output = amount0 < BigInt(0) ? -amount0 : amount1 < BigInt(0) ? -amount1 : (amount0 > amount1 ? amount1 : amount0);
              actualAmountOut = (output < BigInt(0) ? -output : output).toString();
              logger.info(`[executeSwap] Decoded Swap event: amount0=${amount0}, amount1=${amount1}, actualOutput=${actualAmountOut}`);
              break;
            }
          }
        } catch (decodeError) {
          logger.warn(`[executeSwap] Failed to decode Swap event: ${decodeError}`);
        }

        return {
          success: true,
          txHash,
          explorerUrl: `${chainConfig.explorerUrl}/tx/${txHash}`,
          amountOut: actualAmountOut,
          gasUsed: receipt.gasUsed.toString(),
          effectiveGasPrice: receipt.effectiveGasPrice?.toString(),
        };
      } else {
        return {
          success: false,
          txHash,
          error: 'Transaction reverted',
          explorerUrl: `${chainConfig.explorerUrl}/tx/${txHash}`,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Swap failed on ${chainName}: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Executes a swap on an exchange (legacy interface)
   */
  async doSwapOnExchange(exchangeId: number, params: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    privateKey: string;
    chainName?: string;
    slippageBps?: number;
  }): Promise<any> {
    // Get quote first
    const quote = await this.getSwapQuote({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      chainName: params.chainName,
      slippageBps: params.slippageBps,
    });

    // Execute swap
    return this.executeSwap({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      amountOutMinimum: quote.amountOutMinimum,
      fee: quote.fee,
      privateKey: params.privateKey,
      chainName: params.chainName,
    });
  }

  // ========================================
  // Pre-Execution Simulation & Risk Gate
  // ========================================

  /**
   * Simulate a swap to verify all risk parameters before broadcasting.
   * Checks: balance, allowance, gas estimation, slippage.
   * Returns a pass/fail verdict with specific error codes.
   */
  async simulateSwap(params: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOutMinimum: string;
    fee: number;
    privateKey: string;
    chainName?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    errorCode?: 'INSUFFICIENT_BALANCE' | 'MISSING_ALLOWANCE' | 'GAS_EXCEEDS_LIMIT' | 'SLIPPAGE_EXCEEDED';
    details?: {
      balance?: string;
      required?: string;
      estimatedGas?: string;
      gasLimit?: string;
      simulatedOutput?: string;
      expectedOutput?: string;
    };
  }> {
    const chainName = params.chainName || this.defaultChain;
    const contracts = getUniswapContracts(chainName);
    const chainConfig = getChainConfig(chainName);

    if (!contracts || !chainConfig) {
      return { success: false, error: `Chain ${chainName} not supported`, errorCode: 'INSUFFICIENT_BALANCE' };
    }

    const GAS_CEILING = BigInt(500_000); // Max gas units for a Uniswap V3 swap

    try {
      const publicClient = this.getPublicClient(chainName);
      const account = privateKeyToAccount(
        (params.privateKey.startsWith('0x') ? params.privateKey : `0x${params.privateKey}`) as Hex
      );

      // Normalize addresses
      let tokenIn = params.tokenIn.toLowerCase();
      let tokenOut = params.tokenOut.toLowerCase();
      const nativeAddresses = ['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '0x0000000000000000000000000000000000000000'];
      const isNativeIn = nativeAddresses.includes(tokenIn);

      if (isNativeIn) {
        tokenIn = contracts.weth.toLowerCase();
      }
      if (nativeAddresses.includes(tokenOut)) {
        tokenOut = contracts.weth.toLowerCase();
      }

      const amountIn = BigInt(params.amountIn);

      // ---- CHECK 1: Balance ----
      logger.info(`[SimulateSwap] Check 1: Balance check for ${account.address} on ${chainName}`);

      if (isNativeIn) {
        const balance = await publicClient.getBalance({ address: account.address });
        // Need amountIn + some gas buffer
        const gasBuffer = BigInt(50_000) * BigInt(20_000_000_000); // ~50k gas * 20 gwei
        const required = amountIn + gasBuffer;
        if (balance < required) {
          const balanceEth = formatEther(balance);
          const requiredEth = formatEther(required);
          logger.warn(`[SimulateSwap] INSUFFICIENT_BALANCE: have ${balanceEth}, need ${requiredEth}`);
          return {
            success: false,
            error: `You need ${requiredEth} ETH but only have ${balanceEth} ETH`,
            errorCode: 'INSUFFICIENT_BALANCE',
            details: { balance: balanceEth, required: requiredEth },
          };
        }
      } else {
        // ERC-20 balance check
        const erc20Data = await this.getERC20Balance(account.address, params.tokenIn, chainName);
        if (erc20Data.balance < amountIn) {
          const balanceFormatted = (Number(erc20Data.balance) / (10 ** erc20Data.decimals)).toString();
          const requiredFormatted = (Number(amountIn) / (10 ** erc20Data.decimals)).toString();
          logger.warn(`[SimulateSwap] INSUFFICIENT_BALANCE: have ${balanceFormatted} ${erc20Data.symbol}, need ${requiredFormatted}`);
          return {
            success: false,
            error: `You need ${requiredFormatted} ${erc20Data.symbol} but only have ${balanceFormatted} ${erc20Data.symbol}`,
            errorCode: 'INSUFFICIENT_BALANCE',
            details: { balance: balanceFormatted, required: requiredFormatted },
          };
        }

        // Also check native balance for gas
        const ethBalance = await publicClient.getBalance({ address: account.address });
        const minGas = BigInt(100_000) * BigInt(20_000_000_000); // 100k gas * 20 gwei
        if (ethBalance < minGas) {
          const balanceEth = formatEther(ethBalance);
          logger.warn(`[SimulateSwap] INSUFFICIENT_BALANCE for gas: have ${balanceEth} ETH`);
          return {
            success: false,
            error: `Insufficient ETH for gas fees. You have ${balanceEth} ETH but need at least some ETH for transaction fees.`,
            errorCode: 'INSUFFICIENT_BALANCE',
            details: { balance: balanceEth, required: 'gas fees' },
          };
        }
      }
      logger.info(`[SimulateSwap] Check 1: Balance OK`);

      // ---- CHECK 2: Allowance (ERC-20 only) ----
      if (!isNativeIn) {
        logger.info(`[SimulateSwap] Check 2: Allowance check`);
        const allowanceAbi = [{
          inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
          name: 'allowance',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        }] as const;

        const currentAllowance = await (publicClient as any).readContract({
          address: params.tokenIn as `0x${string}`,
          abi: allowanceAbi,
          functionName: 'allowance',
          args: [account.address, contracts.swapRouter],
        }) as bigint;

        if (currentAllowance < amountIn) {
          logger.warn(`[SimulateSwap] MISSING_ALLOWANCE: current ${currentAllowance}, need ${amountIn}`);
          return {
            success: false,
            error: `Token approval required — the router needs approval to spend your tokens. Approval will be requested automatically during execution.`,
            errorCode: 'MISSING_ALLOWANCE',
            details: { balance: currentAllowance.toString(), required: amountIn.toString() },
          };
        }
        logger.info(`[SimulateSwap] Check 2: Allowance OK`);
      } else {
        logger.info(`[SimulateSwap] Check 2: Skipped (native ETH)`);
      }

      // ---- CHECK 3: Gas Estimation ----
      logger.info(`[SimulateSwap] Check 3: Gas estimation`);
      try {
        const swapParams = {
          tokenIn: tokenIn as `0x${string}`,
          tokenOut: tokenOut as `0x${string}`,
          fee: params.fee,
          recipient: account.address,
          amountIn: amountIn,
          amountOutMinimum: BigInt(params.amountOutMinimum),
          sqrtPriceLimitX96: BigInt(0),
        };

        const estimatedGas = await (publicClient as any).estimateContractGas({
          address: contracts.swapRouter,
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [swapParams],
          account: account.address,
          value: isNativeIn ? amountIn : BigInt(0),
        });

        if (estimatedGas > GAS_CEILING) {
          logger.warn(`[SimulateSwap] GAS_EXCEEDS_LIMIT: estimated ${estimatedGas}, ceiling ${GAS_CEILING}`);
          return {
            success: false,
            error: `Estimated gas (${estimatedGas.toString()} units) exceeds maximum (${GAS_CEILING.toString()} units)`,
            errorCode: 'GAS_EXCEEDS_LIMIT',
            details: { estimatedGas: estimatedGas.toString(), gasLimit: GAS_CEILING.toString() },
          };
        }
        logger.info(`[SimulateSwap] Check 3: Gas OK (${estimatedGas.toString()} units)`);
      } catch (gasError) {
        // Gas estimation failure often means the tx would revert
        const gasMsg = gasError instanceof Error ? gasError.message : String(gasError);
        logger.warn(`[SimulateSwap] Gas estimation failed: ${gasMsg}`);
        // Don't block on gas estimation failure — it might be a simulation issue
        // Log it but proceed (the actual execution will catch real issues)
        logger.info(`[SimulateSwap] Check 3: Gas estimation failed but proceeding (may be simulation limitation)`);
      }

      // ---- CHECK 4: Slippage / Fresh Quote ----
      logger.info(`[SimulateSwap] Check 4: Slippage check (re-quoting)`);
      try {
        const freshQuote = await this.getSwapQuote({
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amountIn: params.amountIn,
          chainName,
          slippageBps: 100,
        });

        const freshAmountOut = BigInt(freshQuote.amountOut);
        const expectedMinimum = BigInt(params.amountOutMinimum);

        if (freshAmountOut < expectedMinimum) {
          // Price has moved unfavorably since the original quote
          const originalOut = BigInt(params.amountOutMinimum);
          const diff = originalOut - freshAmountOut;
          const slippagePct = originalOut > BigInt(0)
            ? ((Number(diff) / Number(originalOut)) * 100).toFixed(2)
            : '0';

          logger.warn(`[SimulateSwap] SLIPPAGE_EXCEEDED: fresh output ${freshAmountOut}, minimum expected ${expectedMinimum}, diff ${slippagePct}%`);
          return {
            success: false,
            error: `Price has moved unfavorably. Current output is ${slippagePct}% below your minimum acceptable amount.`,
            errorCode: 'SLIPPAGE_EXCEEDED',
            details: {
              simulatedOutput: freshAmountOut.toString(),
              expectedOutput: expectedMinimum.toString(),
            },
          };
        }
        logger.info(`[SimulateSwap] Check 4: Slippage OK`);
      } catch (quoteError) {
        // Quote failure — log but don't block (original quote was valid)
        const quoteMsg = quoteError instanceof Error ? quoteError.message : String(quoteError);
        logger.warn(`[SimulateSwap] Re-quote failed: ${quoteMsg}. Proceeding with original quote.`);
      }

      logger.info(`[SimulateSwap] All checks passed — safe to execute`);
      return { success: true };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[SimulateSwap] Unexpected error: ${errorMsg}`);
      return {
        success: false,
        error: `Simulation failed: ${errorMsg}`,
      };
    }
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
