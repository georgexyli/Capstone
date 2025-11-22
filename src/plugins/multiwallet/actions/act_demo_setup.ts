import type { Action, ActionExample, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * DEMO ACTION: Bypass registration and create a test wallet
 * Use: "demo setup" to get a ready-to-use wallet
 */
export default {
    name: 'DEMO_SETUP',
    similes: ['DEMO_MODE', 'DEMO_WALLET', 'QUICK_START', 'TEST_WALLET', 'DEMO', 'TEST_MODE', 'BYPASS_REGISTRATION'],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Check if message contains "demo" keyword
        const text = message.content.text.toLowerCase();
        return text.includes('demo') && (text.includes('setup') || text.includes('mode') || text.includes('wallet'));
    },
    description: 'Create a demo wallet bypassing registration when user says "demo setup" or "demo mode" (FOR TESTING ONLY)',
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        logger.log('🎭 DEMO_SETUP: Creating demo account and wallet...');

        try {
            // Generate a new Solana keypair
            const keypair = Keypair.generate();
            const publicKey = keypair.publicKey.toBase58();
            const privateKey = bs58.encode(keypair.secretKey);

            const responseText = `🎭 **DEMO MODE ACTIVATED**

✅ Test wallet created successfully!

**Wallet Address:** \`${publicKey}\`

**⚠️ DEMO NOTES:**
• This is a test wallet with no real funds
• Registration bypassed for demo purposes
• You can now test swap commands
• Try: "swap 0.1 SOL for USDC"

💡 **For production:**
• Complete full registration flow
• Fund wallet with real testnet tokens
• Enable all security features`;

            logger.log('🎭 DEMO_SETUP: Wallet created:', publicKey);

            callback?.({
                text: responseText,
                attachments: []
            });

            return {
                success: true,
                text: responseText,
                data: {
                    publicKey,
                    isDemoMode: true
                }
            };
        } catch (error) {
            logger.error('DEMO_SETUP error:', error);
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';

            callback?.({
                text: `Demo setup failed: ${errorMsg}`
            });

            return {
                success: false,
                text: `Demo setup failed: ${errorMsg}`,
                error: errorMsg
            };
        }
    },
    examples: [
        [
            {
                name: '{{name1}}',
                content: {
                    text: 'demo setup',
                },
            },
            {
                name: '{{name2}}',
                content: {
                    text: "I'll create a demo wallet for you",
                    actions: ['DEMO_SETUP'],
                },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: {
                    text: 'demo mode',
                },
            },
            {
                name: '{{name2}}',
                content: {
                    text: "Setting up demo mode with a test wallet",
                    actions: ['DEMO_SETUP'],
                },
            },
        ],
        [
            {
                name: '{{name1}}',
                content: {
                    text: 'create demo wallet',
                },
            },
            {
                name: '{{name2}}',
                content: {
                    text: "Creating a demo wallet for testing",
                    actions: ['DEMO_SETUP'],
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
