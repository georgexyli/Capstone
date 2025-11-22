import { Service, logger } from '@elizaos/core';
import type { IAgentRuntime } from '@elizaos/core';

/**
 * Mock Jupiter Service for demo purposes
 * Simulates Jupiter DEX API responses without requiring actual Jupiter plugin
 */
export class MockJupiterService extends Service {
  static serviceType = 'JUPITER_SERVICE';

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    logger.log('🎭 MockJupiterService initialized (DEMO MODE)');
  }

  /**
   * Mock quote fetching
   * Returns realistic-looking quote data
   */
  async getQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: any;
    slippageBps?: number;
  }) {
    logger.log('🎭 DEMO: Mock getQuote called', params);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Calculate mock output amount (simulate ~$100 SOL price)
    // params.amount is already in lamports (e.g., 100000000 for 0.1 SOL with 9 decimals)
    // If swapping SOL to USDC: 1 SOL ≈ 100 USDC
    const inputAmountLamports = typeof params.amount === 'string'
      ? parseFloat(params.amount)
      : parseFloat(params.amount.toString());

    // Input is in lamports (9 decimals), output should be in USDC base units (6 decimals)
    // 0.1 SOL = 100000000 lamports → ~10 USDC = 10000000 base units
    // Conversion: lamports * (10^6 / 10^9) * price * (1 - slippage)
    // Simplified: lamports / 1000 * price * 0.95
    const mockOutAmount = Math.floor((inputAmountLamports / 1000) * 100 * 0.95);

    return {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      inAmount: inputAmount.toString(),
      outAmount: mockOutAmount.toString(),
      priceImpactPct: 0.5, // 0.5% price impact
      slippageBps: params.slippageBps || 200,
      routePlan: [
        {
          swapInfo: {
            ammKey: 'DEMO_AMM_KEY',
            label: 'Mock DEX',
            inputMint: params.inputMint,
            outputMint: params.outputMint,
            inAmount: inputAmount.toString(),
            outAmount: mockOutAmount.toString(),
            feeAmount: '0',
            feeMint: params.inputMint
          },
          percent: 100
        }
      ],
      otherAmountThreshold: mockOutAmount.toString(),
      swapMode: 'ExactIn',
      fees: {
        signatureFee: 5000,
        openOrdersDeposits: [],
        ataDeposits: [],
        totalFeeAndDeposits: 5000,
        minimumSOLForTransaction: 5000
      }
    };
  }

  /**
   * Mock swap execution
   * Returns fake but valid-looking transaction data
   */
  async executeSwap(params: {
    quoteResponse: any;
    userPublicKey: string;
    slippageBps?: number;
  }) {
    logger.log('🎭 DEMO: Mock executeSwap called', {
      userPublicKey: params.userPublicKey,
      slippageBps: params.slippageBps
    });

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Generate fake but realistic-looking base64 transaction
    // Real Jupiter returns base64-encoded Solana transaction
    const fakeTransactionData = {
      timestamp: Date.now(),
      user: params.userPublicKey,
      quote: params.quoteResponse,
      demo: true
    };

    const fakeTransaction = Buffer.from(
      JSON.stringify(fakeTransactionData)
    ).toString('base64');

    return {
      swapTransaction: fakeTransaction,
      lastValidBlockHeight: 999999999,
      prioritizationFeeLamports: 5000
    };
  }

  /**
   * Check if service is in demo mode
   */
  isDemoMode(): boolean {
    return true;
  }
}

export default MockJupiterService;
