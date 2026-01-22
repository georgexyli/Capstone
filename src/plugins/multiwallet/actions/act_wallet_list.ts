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
  ],
  description: 'Allows a user to list all wallet addresses they have ' + CONSTANTS.DESCONLYCALLME,
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

    // Build formatted wallet cards
    let walletCount = 0;
    for (const mw of account.metawallets) {
      for (const chainName in mw.keypairs) {
        const kp = mw.keypairs[chainName];
        walletCount++;

        // Get network display name
        const networkName = chainName.charAt(0).toUpperCase() + chainName.slice(1);

        // Format wallet card (without balances for now - could add balance fetching later)
        const walletCard = formatWalletBalance({
          address: kp.publicKey,
          network: networkName,
          tokens: [], // Empty for now - will show "No tokens found"
          totalUsdValue: undefined,
        });

        // Send each wallet as a separate message
        const output = takeItPrivate(runtime, message, walletCard);
        await callback?.(output);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Send summary
    const summaryText = `\n${walletCount} wallet${walletCount !== 1 ? 's' : ''} found.`;
    const summaryOutput = takeItPrivate(runtime, message, summaryText);
    await callback?.(summaryOutput);

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
          text: 'I want list all my wallets for you',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'What?',
        },
      },
    ],
  ] as ActionExample[][],
}