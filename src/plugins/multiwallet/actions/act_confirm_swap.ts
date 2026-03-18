import {
    type Action,
    type ActionExample,
    type ActionResult,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    logger,
    createUniqueUuid,
    type UUID,
} from '@elizaos/core';
import { v4 as uuidv4 } from 'uuid';
import { takeItPrivate, HasEntityIdFromMessage, getEntityIdFromMessage } from '../../autonomous-trader/utils';
import {
    formatSwapSuccess,
    formatSwapFailed,
    formatInsufficientBalance,
    formatSwapCancelled,
    formatSwapExpired,
    formatSimulationFailed,
    formatTradeReceipt,
    getFaucetUrl,
} from '../utils/format-cards';

const PENDING_SWAP_TYPE = 'pending_swap_v0';
const SWAP_EXPIRY_MS = 60_000; // 60 seconds

// Lenient patterns - match anywhere in message, not just exact match
const CONFIRM_PATTERNS = /\b(yes|confirm|do it|execute|go ahead|approve|swap it|send it|proceed|i confirm|lets go|let's go)\b/i;
const CANCEL_PATTERNS = /\b(no|cancel|abort|stop|reject|nah|nope|don't|dont|nevermind|never mind)\b/i;

/**
 * Helper to push a message to the responses array for chat display
 */
function pushChatMessage(
    runtime: IAgentRuntime,
    message: Memory,
    text: string,
    responses?: Memory[]
): void {
    if (!responses) return;

    const responseMemory: Memory = {
        id: createUniqueUuid(runtime, `confirm-swap-response-${Date.now()}`) as UUID,
        entityId: runtime.agentId,
        agentId: runtime.agentId,
        roomId: message.roomId,
        content: {
            text,
            source: message.content?.source || 'unknown',
        },
        createdAt: Date.now(),
    };
    responses.push(responseMemory);
}

/**
 * Find the PENDING_SWAP component for a given entity
 */
async function findPendingSwap(runtime: IAgentRuntime, entityId: string) {
    const entity = await runtime.getEntityById(entityId as UUID);
    if (!entity || !entity.components) return null;

    const component = entity.components.find(c => c.type === PENDING_SWAP_TYPE && !c.data?.deleted);
    if (!component) return null;

    return component;
}

/**
 * Delete (clean up) a pending swap component
 */
async function deletePendingSwap(runtime: IAgentRuntime, component: any) {
    await runtime.updateComponent({
        ...component,
        type: PENDING_SWAP_TYPE,
        data: { deleted: true, deletedAt: Date.now() },
    });
}

export const confirmSwapAction: Action = {
    name: 'CONFIRM_SWAP',
    similes: [
        'CONFIRM_TRADE',
        'APPROVE_SWAP',
        'EXECUTE_SWAP',
        'CANCEL_SWAP',
        'ABORT_SWAP',
    ],
    description: 'MUST be used when the user has a pending swap awaiting confirmation. When the user says anything that could be confirming or cancelling a swap (like "yes", "confirm", "i confirm", "do it", "cancel", "no", etc), this action MUST be selected instead of REPLY. This action executes or cancels a previously quoted token swap.',
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        console.log('CONFIRM_SWAP validate called');

        if (!await HasEntityIdFromMessage(runtime, message)) {
            console.log('CONFIRM_SWAP validate - no entity');
            return false;
        }

        const entityId = await getEntityIdFromMessage(runtime, message);
        if (!entityId) {
            console.log('CONFIRM_SWAP validate - no entityId');
            return false;
        }

        const pendingComponent = await findPendingSwap(runtime, entityId);
        if (!pendingComponent || pendingComponent.data?.deleted) {
            console.log('CONFIRM_SWAP validate - no pending swap found');
            return false;
        }

        // Pending swap exists — always validate true so the LLM can route here
        console.log('CONFIRM_SWAP validate - PASSED, pending swap found');
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback,
        responses?: Memory[]
    ): Promise<ActionResult | void | undefined> => {
        logger.log('CONFIRM_SWAP Starting handler...');

        const entityId = await getEntityIdFromMessage(runtime, message);
        if (!entityId) {
            return { success: false, text: 'Entity not found', error: 'ENTITY_NOT_FOUND' };
        }

        const pendingComponent = await findPendingSwap(runtime, entityId);
        if (!pendingComponent || pendingComponent.data?.deleted) {
            callback?.(takeItPrivate(runtime, message, 'No pending swap found. Please initiate a new swap first.'));
            return { success: false, text: 'No pending swap found', error: 'NO_PENDING_SWAP' };
        }

        const pendingData = pendingComponent.data;
        const messageText = (message.content?.text || '').trim().toLowerCase();
        const isCancel = CANCEL_PATTERNS.test(messageText);

        // Check expiry
        const elapsed = Date.now() - pendingData.createdAt;
        if (elapsed > SWAP_EXPIRY_MS) {
            console.log('CONFIRM_SWAP - quote expired after', elapsed, 'ms');
            await deletePendingSwap(runtime, pendingComponent);
            const expiredText = formatSwapExpired();
            callback?.(takeItPrivate(runtime, message, expiredText));
            return { success: false, text: expiredText, error: 'QUOTE_EXPIRED' };
        }

        // Handle cancellation
        if (isCancel) {
            console.log('CONFIRM_SWAP - user cancelled');
            await deletePendingSwap(runtime, pendingComponent);
            const cancelledText = formatSwapCancelled();
            callback?.(takeItPrivate(runtime, message, cancelledText));
            return { success: true, text: cancelledText };
        }

        // If not cancel, treat as confirmation (the LLM routed here because the user confirmed)
        console.log('CONFIRM_SWAP - user confirmed, executing swap');

        if (pendingData.chain === 'solana') {
            return await executeSolanaSwap(runtime, message, pendingData, pendingComponent, callback, responses);
        } else {
            return await executeEvmSwap(runtime, message, pendingData, pendingComponent, callback, responses);
        }
    },
    examples: [
        [
            {
                name: '{{name1}}',
                content: { text: 'confirm' },
            },
            {
                name: '{{name2}}',
                content: {
                    text: 'Executing your swap now...',
                    actions: ['CONFIRM_SWAP'],
                },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: { text: 'yes' },
            },
            {
                name: '{{name2}}',
                content: {
                    text: 'Executing your swap now...',
                    actions: ['CONFIRM_SWAP'],
                },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: { text: 'i confirm' },
            },
            {
                name: '{{name2}}',
                content: {
                    text: 'Executing your swap now...',
                    actions: ['CONFIRM_SWAP'],
                },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: { text: 'do it' },
            },
            {
                name: '{{name2}}',
                content: {
                    text: 'Executing your swap now...',
                    actions: ['CONFIRM_SWAP'],
                },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: { text: 'cancel' },
            },
            {
                name: '{{name2}}',
                content: {
                    text: 'Swap cancelled.',
                    actions: ['CONFIRM_SWAP'],
                },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: { text: 'no' },
            },
            {
                name: '{{name2}}',
                content: {
                    text: 'Swap cancelled.',
                    actions: ['CONFIRM_SWAP'],
                },
            },
        ],
    ] as ActionExample[][],
};

// ========================================
// EVM SWAP EXECUTION
// ========================================
async function executeEvmSwap(
    runtime: IAgentRuntime,
    message: Memory,
    pendingData: any,
    pendingComponent: any,
    callback?: HandlerCallback,
    responses?: Memory[]
): Promise<ActionResult> {
    const ethService = runtime.getService('chain_ethereum') as any;
    if (!ethService) {
        await deletePendingSwap(runtime, pendingComponent);
        callback?.(takeItPrivate(runtime, message, 'Ethereum service not available'));
        return { success: false, text: 'Ethereum service not available', error: 'SERVICE_NOT_FOUND' };
    }

    try {
        // --- SIMULATION GATE: Pre-execution risk checks ---
        console.log('CONFIRM_SWAP - Running pre-execution simulation...');
        const simResult = await ethService.simulateSwap({
            tokenIn: pendingData.inputTokenCA,
            tokenOut: pendingData.outputTokenCA,
            amountIn: pendingData.amountInWei,
            amountOutMinimum: pendingData.amountOutMinimum,
            fee: pendingData.fee,
            privateKey: pendingData.privateKey,
            chainName: pendingData.chainName,
        });

        if (!simResult.success) {
            console.log('CONFIRM_SWAP - Simulation FAILED:', simResult.errorCode, simResult.error);
            await deletePendingSwap(runtime, pendingComponent);
            const responseText = formatSimulationFailed(simResult);
            pushChatMessage(runtime, message, responseText, responses);
            callback?.(takeItPrivate(runtime, message, responseText));
            return { success: false, text: responseText, error: simResult.errorCode || 'SIMULATION_FAILED' };
        }
        console.log('CONFIRM_SWAP - Simulation PASSED, proceeding to execution');
        // --- END SIMULATION GATE ---

        const confirmTimestamp = Date.now();
        const runId = uuidv4();

        const swapResult = await ethService.executeSwap({
            tokenIn: pendingData.inputTokenCA,
            tokenOut: pendingData.outputTokenCA,
            amountIn: pendingData.amountInWei,
            amountOutMinimum: pendingData.amountOutMinimum,
            fee: pendingData.fee,
            privateKey: pendingData.privateKey,
            chainName: pendingData.chainName,
        });

        const executionTimeMs = Date.now() - confirmTimestamp;

        // Always clean up
        await deletePendingSwap(runtime, pendingComponent);

        if (swapResult.success) {
            const outputDecimals = pendingData.outputDecimals || 18;

            // Use actual output from tx receipt if available, otherwise fall back to quoted
            const actualOutputRaw = swapResult.amountOut || pendingData.quoteAmountOut;
            const outputAmount = (Number(actualOutputRaw) / (10 ** outputDecimals)).toFixed(6);

            // Calculate realized slippage (quoted vs actual)
            const quotedOutput = Number(pendingData.quoteAmountOut) / (10 ** outputDecimals);
            const actualOutput = Number(actualOutputRaw) / (10 ** outputDecimals);
            const realizedSlippage = quotedOutput > 0
                ? (((quotedOutput - actualOutput) / quotedOutput) * 100).toFixed(2)
                : '0.00';

            // Calculate gas cost in ETH
            let gasCostEth = 'N/A';
            if (swapResult.gasUsed && swapResult.effectiveGasPrice) {
                const gasCostWei = BigInt(swapResult.gasUsed) * BigInt(swapResult.effectiveGasPrice);
                gasCostEth = (Number(gasCostWei) / 1e18).toFixed(6);
            }

            const executionTimeSec = (executionTimeMs / 1000).toFixed(1);

            const responseText = formatTradeReceipt({
                inputAmount: pendingData.inputAmount,
                inputSymbol: pendingData.inputSymbol,
                outputAmount,
                outputSymbol: pendingData.outputSymbol,
                txHash: swapResult.txHash,
                explorerUrl: swapResult.explorerUrl,
                network: pendingData.chainName.charAt(0).toUpperCase() + pendingData.chainName.slice(1),
                realizedSlippage,
                gasCostEth,
                executionTimeSec,
            });

            // Structured run log (no private keys)
            logger.info(JSON.stringify({
                type: 'TRADE_RUN_LOG',
                runId,
                timestamp: new Date().toISOString(),
                verdict: 'success',
                chain: pendingData.chainName,
                inputToken: pendingData.inputSymbol,
                outputToken: pendingData.outputSymbol,
                inputAmount: pendingData.inputAmount,
                outputAmount,
                quotedOutput: quotedOutput.toFixed(6),
                actualOutput: actualOutput.toFixed(6),
                realizedSlippage: `${realizedSlippage}%`,
                gasCostEth,
                executionTimeMs,
                txHash: swapResult.txHash,
                gasUsed: swapResult.gasUsed,
                stages: {
                    confirm: { timestamp: new Date(confirmTimestamp).toISOString(), status: 'ok' },
                    simulate: { status: 'ok' },
                    broadcast: { status: 'ok', txHash: swapResult.txHash },
                    receipt: { status: 'ok', gasUsed: swapResult.gasUsed, amountOut: actualOutputRaw },
                },
            }));

            pushChatMessage(runtime, message, responseText, responses);
            callback?.(takeItPrivate(runtime, message, responseText));
            return {
                success: true,
                text: responseText,
                data: {
                    runId,
                    txHash: swapResult.txHash,
                    chain: pendingData.chainName,
                    amount: pendingData.inputAmount,
                    inputToken: pendingData.inputSymbol,
                    outputToken: pendingData.outputSymbol,
                    outputAmount,
                    realizedSlippage,
                    gasCostEth,
                    executionTimeSec,
                },
            };
        } else {
            // Log failed trade
            logger.info(JSON.stringify({
                type: 'TRADE_RUN_LOG',
                runId,
                timestamp: new Date().toISOString(),
                verdict: 'failed',
                chain: pendingData.chainName,
                inputToken: pendingData.inputSymbol,
                outputToken: pendingData.outputSymbol,
                inputAmount: pendingData.inputAmount,
                error: swapResult.error,
                executionTimeMs,
            }));
            throw new Error(swapResult.error || 'Swap failed');
        }
    } catch (error) {
        await deletePendingSwap(runtime, pendingComponent);
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('CONFIRM_SWAP EVM error:', errorMsg);

        let responseText: string;
        if (errorMsg.includes('insufficient funds') || errorMsg.includes('exceeds the balance')) {
            responseText = formatInsufficientBalance(
                pendingData.inputSymbol || 'ETH',
                pendingData.inputAmount,
                '0',
                pendingData.chainName,
                getFaucetUrl(pendingData.chainName)
            );
        } else {
            responseText = formatSwapFailed({
                reason: 'Transaction failed',
                details: errorMsg.length > 200 ? errorMsg.slice(0, 200) + '...' : errorMsg,
                suggestion: 'Check your wallet balance and try again',
            });
        }

        pushChatMessage(runtime, message, responseText, responses);
        callback?.(takeItPrivate(runtime, message, responseText));
        return { success: false, text: responseText, error: errorMsg };
    }
}

// ========================================
// SOLANA SWAP EXECUTION
// ========================================
async function executeSolanaSwap(
    runtime: IAgentRuntime,
    message: Memory,
    pendingData: any,
    pendingComponent: any,
    callback?: HandlerCallback,
    responses?: Memory[]
): Promise<ActionResult> {
    const { Connection, Keypair, PublicKey, VersionedTransaction } = await import('@solana/web3.js');
    const bs58 = (await import('bs58')).default;
    const BigNumber = (await import('bignumber.js')).default;

    try {
        const connection = new Connection(
            runtime.getSetting('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com'
        );

        const secretKey = bs58.decode(pendingData.privateKey);
        const senderKeypair = Keypair.fromSecretKey(secretKey);

        // Re-fetch quote and execute via Jupiter
        const jupiterService = runtime.getService('JUPITER_SERVICE') as any;

        const inputTokenCA = pendingData.inputTokenCA;
        const outputTokenCA = pendingData.outputTokenCA;
        const amount = Number(pendingData.inputAmount);

        // Calculate adjusted amount
        const inputDecimals = inputTokenCA === 'So11111111111111111111111111111111111111112'
            ? 9
            : await getTokenDecimalsSolana(connection, inputTokenCA, PublicKey);
        const adjustedAmount = new BigNumber(amount).multipliedBy(new BigNumber(10).pow(inputDecimals));

        const quoteData = await jupiterService.getQuote({
            inputMint: inputTokenCA,
            outputMint: outputTokenCA,
            amount: adjustedAmount,
            slippageBps: 200,
        });

        const swapData = await jupiterService.executeSwap({
            quoteResponse: quoteData,
            userPublicKey: senderKeypair.publicKey.toBase58(),
            slippageBps: 200,
        });

        if (!swapData || !swapData.swapTransaction) {
            throw new Error(`Failed to get swap transaction: ${swapData?.error || 'No swap transaction returned'}`);
        }

        const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(transactionBuf);
        transaction.sign([senderKeypair]);

        const latestBlockhash = await connection.getLatestBlockhash();
        const txid = await connection.sendTransaction(transaction, {
            skipPreflight: false,
            maxRetries: 3,
            preflightCommitment: 'confirmed',
        });

        const confirmation = await connection.confirmTransaction(
            {
                signature: txid,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            },
            'confirmed'
        );

        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }

        // Extract output amount
        let outputAmount = 'Unknown';
        if (quoteData?.outAmount) {
            const outputDecimals = outputTokenCA === 'So11111111111111111111111111111111111111112'
                ? 9
                : await getTokenDecimalsSolana(connection, outputTokenCA, PublicKey);
            const outAmountBN = new BigNumber(quoteData.outAmount);
            outputAmount = outAmountBN.dividedBy(new BigNumber(10).pow(outputDecimals)).toString();
        }

        await deletePendingSwap(runtime, pendingComponent);

        const solscanLink = `https://solscan.io/tx/${txid}`;
        const responseText = formatSwapSuccess({
            inputAmount: pendingData.inputAmount,
            inputSymbol: pendingData.inputSymbol,
            outputAmount,
            outputSymbol: pendingData.outputSymbol,
            txHash: txid,
            explorerUrl: solscanLink,
            network: 'Solana',
        });

        pushChatMessage(runtime, message, responseText, responses);
        callback?.(takeItPrivate(runtime, message, responseText));
        return {
            success: true,
            text: responseText,
            data: {
                txid,
                chain: 'solana',
                amount: pendingData.inputAmount,
                inputToken: pendingData.inputSymbol,
                outputToken: pendingData.outputSymbol,
                outputAmount,
            },
        };
    } catch (error) {
        await deletePendingSwap(runtime, pendingComponent);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('CONFIRM_SWAP Solana error:', errorMessage);

        let responseText: string;
        if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
            responseText = formatInsufficientBalance(
                pendingData.inputSymbol || 'SOL',
                pendingData.inputAmount,
                '0',
                'solana'
            );
        } else {
            responseText = formatSwapFailed({
                reason: 'Transaction failed',
                details: errorMessage.length > 200 ? errorMessage.slice(0, 200) + '...' : errorMessage,
                suggestion: 'Check your wallet balance and try again',
            });
        }

        pushChatMessage(runtime, message, responseText, responses);
        callback?.(takeItPrivate(runtime, message, responseText));
        return { success: false, text: responseText, error: errorMessage };
    }
}

/**
 * Helper to get token decimals for Solana tokens
 */
async function getTokenDecimalsSolana(connection: any, mintAddress: string, PublicKey: any): Promise<number> {
    const mintPublicKey = new PublicKey(mintAddress);
    const tokenAccountInfo = await connection.getParsedAccountInfo(mintPublicKey);

    if (
        tokenAccountInfo.value &&
        typeof tokenAccountInfo.value.data === 'object' &&
        'parsed' in tokenAccountInfo.value.data
    ) {
        const parsedInfo = tokenAccountInfo.value.data.parsed?.info;
        if (parsedInfo && typeof parsedInfo?.decimals === 'number') {
            return parsedInfo.decimals;
        }
    }
    throw new Error('Unable to fetch token decimals');
}

export default confirmSwapAction;
