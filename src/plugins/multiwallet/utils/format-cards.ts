/**
 * UI Card Formatting Utilities
 *
 * Creates visually appealing text-based cards for swap operations,
 * wallet displays, and other trading UI elements.
 */

export interface SwapPreviewParams {
    inputAmount: string | number;
    inputSymbol: string;
    outputAmount: string | number;
    outputSymbol: string;
    rate?: string;
    slippage?: number;
    network: string;
    gasEstimate?: string;
    walletAddress?: string;
}

export interface SwapSuccessParams {
    inputAmount: string | number;
    inputSymbol: string;
    outputAmount: string | number;
    outputSymbol: string;
    txHash: string;
    explorerUrl: string;
    network: string;
    newBalances?: { symbol: string; amount: string; usdValue?: string }[];
}

export interface SwapFailedParams {
    reason: string;
    details?: string;
    suggestion?: string;
    helpUrl?: string;
    inputAmount?: string | number;
    inputSymbol?: string;
    walletBalance?: string;
    requiredAmount?: string;
}

export interface WalletBalanceParams {
    address: string;
    network: string;
    tokens: { symbol: string; amount: string; usdValue?: string }[];
    totalUsdValue?: string;
}

export interface TokenBalanceDisplay {
    symbol: string;
    amount: string;
    usdValue?: string;
}

/**
 * Truncate address for display (0x1234...abcd)
 */
function truncateAddress(address: string, startChars = 6, endChars = 4): string {
    if (address.length <= startChars + endChars + 3) return address;
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format number with commas and fixed decimals
 */
function formatNumber(value: string | number, decimals = 4): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';

    // For very small numbers, show more precision
    if (num > 0 && num < 0.0001) {
        return num.toExponential(2);
    }

    // For larger numbers, use comma formatting
    const fixed = num.toFixed(decimals);
    const [whole, decimal] = fixed.split('.');
    const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // Trim trailing zeros from decimal
    const trimmedDecimal = decimal?.replace(/0+$/, '');
    return trimmedDecimal ? `${withCommas}.${trimmedDecimal}` : withCommas;
}

/**
 * Pad string to fixed width
 */
function padRight(str: string, width: number): string {
    return str.length >= width ? str.slice(0, width) : str + ' '.repeat(width - str.length);
}

function padLeft(str: string, width: number): string {
    return str.length >= width ? str.slice(0, width) : ' '.repeat(width - str.length) + str;
}

/**
 * Create a horizontal line
 */
function line(width: number, char = '─'): string {
    return char.repeat(width);
}

// ============================================
// SWAP PREVIEW CARD
// ============================================

export function formatSwapPreview(params: SwapPreviewParams): string {
    const {
        inputAmount,
        inputSymbol,
        outputAmount,
        outputSymbol,
        rate,
        slippage = 1,
        network,
        gasEstimate,
        walletAddress,
    } = params;

    const inputStr = `${formatNumber(inputAmount)} ${inputSymbol}`;
    const outputStr = `~${formatNumber(outputAmount)} ${outputSymbol}`;

    let card = `
┌─────────────────────────────────────┐
│  SWAP PREVIEW                       │
├─────────────────────────────────────┤
│                                     │
│  ${inputStr}`;

    card += `
│       ↓`;

    card += `
│  ${outputStr}`;

    card += `
│                                     │`;

    if (rate) {
        card += `
│  Rate: ${rate}`;
    }

    card += `
│  Slippage: ${slippage}%`;
    card += `
│  Network: ${network}`;

    if (gasEstimate) {
        card += `
│  Est. Gas: ${gasEstimate}`;
    }

    if (walletAddress) {
        card += `
│  Wallet: ${truncateAddress(walletAddress)}`;
    }

    card += `
│                                     │
└─────────────────────────────────────┘`;

    return card.trim();
}

// ============================================
// SWAP SUCCESS CARD
// ============================================

export function formatSwapSuccess(params: SwapSuccessParams): string {
    const {
        inputAmount,
        inputSymbol,
        outputAmount,
        outputSymbol,
        txHash,
        explorerUrl,
        network,
        newBalances,
    } = params;

    const inputStr = `${formatNumber(inputAmount)} ${inputSymbol}`;
    const outputStr = `${formatNumber(outputAmount)} ${outputSymbol}`;
    const truncatedTx = truncateAddress(txHash, 10, 8);

    let card = `
✅ SWAP COMPLETE

   ${inputStr} → ${outputStr}

   Network: ${network}
   TX: ${truncatedTx}

   🔗 ${explorerUrl}`;

    if (newBalances && newBalances.length > 0) {
        card += `

   ─────────────────────
   Updated Balances:`;
        for (const token of newBalances) {
            const amountStr = formatNumber(token.amount);
            const usdStr = token.usdValue ? ` ($${formatNumber(token.usdValue, 2)})` : '';
            card += `
   ${token.symbol}: ${amountStr}${usdStr}`;
        }
    }

    return card.trim();
}

// ============================================
// SWAP FAILED CARD
// ============================================

export function formatSwapFailed(params: SwapFailedParams): string {
    const {
        reason,
        details,
        suggestion,
        helpUrl,
        inputAmount,
        inputSymbol,
        walletBalance,
        requiredAmount,
    } = params;

    let card = `
❌ SWAP FAILED

   Reason: ${reason}`;

    if (details) {
        card += `

   ${details}`;
    }

    if (walletBalance && requiredAmount && inputSymbol) {
        card += `

   You have: ${walletBalance} ${inputSymbol}
   You need: ${requiredAmount} ${inputSymbol} + gas`;
    }

    if (suggestion) {
        card += `

   💡 ${suggestion}`;
    }

    if (helpUrl) {
        card += `
   🔗 ${helpUrl}`;
    }

    return card.trim();
}

// ============================================
// WALLET BALANCE CARD
// ============================================

export function formatWalletBalance(params: WalletBalanceParams): string {
    const {
        address,
        network,
        tokens,
        totalUsdValue,
    } = params;

    const truncatedAddr = truncateAddress(address, 6, 4);
    const headerText = `${truncatedAddr} (${network})`;

    let card = `
┌─ WALLET ${'─'.repeat(Math.max(0, 34 - 8))}┐
│  ${padRight(headerText, 35)}│
├${'─'.repeat(37)}┤`;

    if (tokens.length === 0) {
        card += `
│  No tokens found                    │`;
    } else {
        for (const token of tokens) {
            const symbolStr = padRight(token.symbol, 8);
            const amountStr = padRight(formatNumber(token.amount), 12);
            const usdStr = token.usdValue ? `$${formatNumber(token.usdValue, 2)}` : '';
            const usdPadded = padLeft(usdStr, 12);
            card += `
│  ${symbolStr}${amountStr}${usdPadded} │`;
        }
    }

    if (totalUsdValue) {
        card += `
├${'─'.repeat(37)}┤
│  ${'Total'.padEnd(20)}${padLeft(`$${formatNumber(totalUsdValue, 2)}`, 14)} │`;
    }

    card += `
└${'─'.repeat(37)}┘`;

    return card.trim();
}

// ============================================
// SIMPLE BALANCE LINE (for quick display)
// ============================================

export function formatSimpleBalance(tokens: TokenBalanceDisplay[]): string {
    if (tokens.length === 0) return 'No tokens';

    return tokens
        .map(t => {
            const usd = t.usdValue ? ` ($${formatNumber(t.usdValue, 2)})` : '';
            return `${formatNumber(t.amount)} ${t.symbol}${usd}`;
        })
        .join(' | ');
}

// ============================================
// PROCESSING/LOADING INDICATOR
// ============================================

export function formatSwapProcessing(inputSymbol: string, outputSymbol: string, network: string): string {
    return `
⏳ Processing swap...

   ${inputSymbol} → ${outputSymbol}
   Network: ${network}

   Please wait...`.trim();
}

// ============================================
// INSUFFICIENT BALANCE ERROR (common case)
// ============================================

export function formatInsufficientBalance(
    inputSymbol: string,
    inputAmount: string | number,
    walletBalance: string | number,
    network: string,
    faucetUrl?: string
): string {
    const isTestnet = ['sepolia', 'goerli', 'mumbai'].includes(network.toLowerCase());

    let suggestion = 'Add more funds to your wallet';
    let helpUrl = '';

    if (isTestnet && faucetUrl) {
        suggestion = `Get testnet ${inputSymbol} from a faucet`;
        helpUrl = faucetUrl;
    }

    return formatSwapFailed({
        reason: 'Insufficient balance',
        inputAmount,
        inputSymbol,
        walletBalance: formatNumber(walletBalance),
        requiredAmount: formatNumber(inputAmount),
        suggestion,
        helpUrl,
    });
}

// ============================================
// FAUCET URLS BY NETWORK
// ============================================

export const FAUCET_URLS: Record<string, string> = {
    sepolia: 'https://sepoliafaucet.com',
    goerli: 'https://goerlifaucet.com',
    mumbai: 'https://faucet.polygon.technology',
};

export function getFaucetUrl(network: string): string | undefined {
    return FAUCET_URLS[network.toLowerCase()];
}

// ============================================
// SWAP CONFIRMATION PROMPT
// ============================================

export function formatSwapConfirmation(previewText: string): string {
    return `${previewText}

⚠️ Reply 'confirm' to execute or 'cancel' to abort.
⏰ This quote expires in 60 seconds.`;
}

// ============================================
// SWAP CANCELLED / EXPIRED MESSAGES
// ============================================

export function formatSwapCancelled(): string {
    return `🚫 Swap cancelled. No transaction was executed.`;
}

export function formatSwapExpired(): string {
    return `⏰ Quote expired. Please request a new swap to get a fresh quote.`;
}

// ============================================
// SIMULATION FAILED CARD
// ============================================

export interface SimulationResult {
    success: boolean;
    error?: string;
    errorCode?: string;
    details?: {
        balance?: string;
        required?: string;
        estimatedGas?: string;
        gasLimit?: string;
        simulatedOutput?: string;
        expectedOutput?: string;
    };
}

export function formatSimulationFailed(simResult: SimulationResult): string {
    const code = simResult.errorCode || 'UNKNOWN';
    const details = simResult.details || {};

    let card = `
🛑 SIMULATION FAILED

   ${simResult.error || 'Transaction would fail'}`;

    switch (code) {
        case 'INSUFFICIENT_BALANCE':
            if (details.balance && details.required) {
                card += `

   You have: ${details.balance}
   You need: ${details.required}`;
            }
            card += `

   💡 Add more funds to your wallet before trying again.`;
            break;

        case 'MISSING_ALLOWANCE':
            card += `

   💡 Token approval will be requested automatically when you retry the swap.`;
            break;

        case 'GAS_EXCEEDS_LIMIT':
            if (details.estimatedGas && details.gasLimit) {
                card += `

   Estimated gas: ${details.estimatedGas} units
   Maximum allowed: ${details.gasLimit} units`;
            }
            card += `

   💡 The transaction is too complex or network is congested. Try again later.`;
            break;

        case 'SLIPPAGE_EXCEEDED':
            card += `

   💡 The price has moved since your quote. Please request a new swap for a fresh quote.`;
            break;

        default:
            card += `

   💡 Please try again or request a new swap.`;
            break;
    }

    return card.trim();
}
