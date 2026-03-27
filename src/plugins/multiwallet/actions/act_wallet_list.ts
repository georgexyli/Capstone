import {
  type Action,
  type ActionExample,
  type ActionResult,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  createUniqueUuid,
  logger,
} from '@elizaos/core';
import { v4 as uuidv4 } from 'uuid';
import { HasEntityIdFromMessage, takeItPrivate, messageReply, getAccountFromMessage } from '../../autonomous-trader/utils'
import CONSTANTS from '../../autonomous-trader/constants'
import { formatWalletBalance } from '../utils/format-cards'

// handle starting new form and collecting first field
export const userMetawalletList: Action = {
  name: 'USER_METAWALLET_LIST',
  similes: [
    'CHECK_BALANCE',
    'WALLET_BALANCE',
    'LIST_WALLETS',
    'SHOW_WALLETS',
    'MY_WALLETS',
    'GET_BALANCE',
    'SHOW_BALANCE',
  ],
  description: 'MUST be used when the user asks about their wallet balance, wants to see their wallets, or asks how much they have. This action shows wallet addresses and token balances. Use this instead of REPLY when the user says things like "what is my balance", "show my wallets", "how much ETH do I have", "list wallets", etc.',
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    //console.log('USER_METAWALLET_LIST validate', message?.metadata?.fromId)
    if (!await HasEntityIdFromMessage(runtime, message)) {
      console.warn('MULTIWALLET_TRANSFER validate - author not found')
      return false
    }

    const traderChainService = runtime.getService('INTEL_CHAIN') as any;
    if (!traderChainService) return false
    const traderStrategyService = runtime.getService('TRADER_STRATEGY') as any;
    if (!traderStrategyService) return false

    const account = await getAccountFromMessage(runtime, message)
    if (!account) return false;

    return true
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: { [key: string]: unknown } | undefined,
    callback?: HandlerCallback,
    responses?: any[]
  ): Promise<ActionResult | void | undefined> => {
    //console.log('USER_METAWALLET_LIST handler')

    // should we check to see if we already a wallet with this strategy? no
    // they can have multiple
    const account = await getAccountFromMessage(runtime, message)
    //console.log('account', account)

    if (!account.metawallets) {
      const output = takeItPrivate(runtime, message, 'You don\'t have any wallets, do you want to make one?')
      callback?.(output)
      return {
        success: true,
        text: 'You don\'t have any wallets, do you want to make one?'
      }
    }

    // metawallet
    //   strategy
    //   keypairs
    if (!Object.values(account.metawallets).length) {
      const output = takeItPrivate(runtime, message, 'You don\'t have any wallets yet. Would you like to create or import one?')
      callback?.(output)
      return {
        success: true,
        text: 'No wallets found'
      }
    }

    // Build plain text wallet list with balances
    let walletCount = 0;
    let responseText = '';

    for (const mw of account.metawallets) {
      for (const chainName in mw.keypairs) {
        const kp = mw.keypairs[chainName];
        walletCount++;

        const networkName = chainName.charAt(0).toUpperCase() + chainName.slice(1);
        const shortAddr = kp.publicKey.length > 14
          ? `${kp.publicKey.slice(0, 6)}...${kp.publicKey.slice(-4)}`
          : kp.publicKey;

        responseText += `Wallet ${walletCount} — ${networkName}\n`;
        responseText += `Address: ${shortAddr}\n`;

        // Fetch EVM balances
        if (['ethereum', 'sepolia', 'base', 'polygon', 'arbitrum', 'optimism'].includes(chainName)) {
          try {
            const ethService = runtime.getService('chain_ethereum') as any;
            if (ethService) {
              const nativeAssetId = `${chainName}:mainnet/native:eth`;
              const balanceResults = await ethService.getBalances([kp.publicKey], [nativeAssetId]);
              if (balanceResults && balanceResults.length > 0) {
                for (const bal of balanceResults) {
                  responseText += `${bal.symbol || 'ETH'}: ${bal.uiAmount || '0'}\n`;
                }
              } else {
                responseText += `ETH: 0\n`;
              }
            }
          } catch (e) {
            console.log('wallet list - EVM balance fetch failed:', e);
            responseText += `Balance: unable to fetch\n`;
          }
        }

        responseText += '\n';
      }
    }

    responseText += `${walletCount} wallet${walletCount !== 1 ? 's' : ''} found.`;

    const output = takeItPrivate(runtime, message, responseText);
    await callback?.(output);

    //const output = takeItPrivate(runtime, message, wStr)
    //callback(output)
    return {
      success: true,
      text: 'Wallet list completed'
    }
  },
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'What wallets do I have',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: "Here",
          actions: ['USER_METAWALLET_LIST'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'list wallets',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: "Here",
          actions: ['USER_METAWALLET_LIST'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: "what's my balance",
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Here are your wallets',
          actions: ['USER_METAWALLET_LIST'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'how much ETH do I have',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Here are your wallets',
          actions: ['USER_METAWALLET_LIST'],
        },
      },
    ],
  ] as ActionExample[][],
}