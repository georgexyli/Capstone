import {
  createUniqueUuid,
  logger,
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  HandlerOptions,
} from '@elizaos/core';
import { v4 as uuidv4 } from 'uuid';
import { HasEntityIdFromMessage, getAccountFromMessage, takeItPrivate, messageReply, getDataFromMessage, accountMockComponent } from '../../autonomous-trader/utils'
import CONSTANTS from '../../autonomous-trader/constants'
const { Keypair } = require('@solana/web3.js');
import bs58 from 'bs58'

// handle starting new form and collecting first field
export const walletImportAction: Action = {
  name: 'WALLET_IMPORT',
  similes: [
  ],
  description: 'Allows a user to import a wallet without a strategy',
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    console.log('WALLET_IMPORT validate called');

    runtime.logger.debug(
      `WALLET_IMPORT validate start messageId=${message.id ?? 'unknown'} roomId=${message.roomId}`
    );
    console.log(`WALLET_IMPORT validate start messageId=${message.id ?? 'unknown'}`);

    const traderChainService = runtime.getService('INTEL_CHAIN') as any;
    if (!traderChainService) {
      console.log('WALLET_IMPORT validate FAILED: INTEL_CHAIN service missing');
      runtime.logger.debug('WALLET_IMPORT validate skipped: INTEL_CHAIN service missing');
      return false;
    }
    console.log('WALLET_IMPORT validate: INTEL_CHAIN service found');

    const traderStrategyService = runtime.getService('TRADER_STRATEGY') as any;
    if (!traderStrategyService) {
      console.log('WALLET_IMPORT validate FAILED: TRADER_STRATEGY service missing');
      runtime.logger.debug('WALLET_IMPORT validate skipped: TRADER_STRATEGY service missing');
      return false;
    }
    console.log('WALLET_IMPORT validate: TRADER_STRATEGY service found');

    const intAccountService = runtime.getService('AUTONOMOUS_TRADER_INTERFACE_ACCOUNTS') as any;
    if (!intAccountService) {
      console.log('WALLET_IMPORT validate FAILED: AUTONOMOUS_TRADER_INTERFACE_ACCOUNTS service missing');
      runtime.logger.debug('WALLET_IMPORT validate skipped: AUTONOMOUS_TRADER_INTERFACE_ACCOUNTS service missing');
      return false;
    }
    console.log('WALLET_IMPORT validate: AUTONOMOUS_TRADER_INTERFACE_ACCOUNTS service found');

    const hasEntity = await HasEntityIdFromMessage(runtime, message);
    if (!hasEntity) {
      console.log('WALLET_IMPORT validate FAILED: author entity not found');
      runtime.logger.debug(
        `WALLET_IMPORT validate skipped: author entity not found messageId=${message.id ?? 'unknown'}`
      );
      return false;
    }
    console.log('WALLET_IMPORT validate: entity found');

    const solanaService = runtime.getService('chain_solana') as any;
    if (!solanaService) {
      console.log('WALLET_IMPORT validate FAILED: chain_solana service missing');
      runtime.logger.debug('WALLET_IMPORT validate skipped: chain_solana service missing');
      return false;
    }
    console.log('WALLET_IMPORT validate: chain_solana service found');

    const messageText = message.content.text ?? '';
    console.log(`WALLET_IMPORT validate: message text length=${messageText.length}, sample="${messageText.slice(0, 100)}"`);
    runtime.logger.debug(
      `WALLET_IMPORT validate analyzing message text length=${messageText.length} sample=${messageText.slice(0, 80)}`
    );

    let detectedKeysByChain: Array<{ chain: string; keys: any[] }> = [];
    try {
      detectedKeysByChain = await traderChainService.detectPrivateKeysFromString(messageText);
      console.log(`WALLET_IMPORT validate: chain detection returned ${detectedKeysByChain.length} chains:`, JSON.stringify(detectedKeysByChain.map(c => ({ chain: c.chain, keyCount: c.keys?.length }))));
      runtime.logger.debug(
        `WALLET_IMPORT validate chain detection results chains=${detectedKeysByChain.length}`
      );
    } catch (error) {
      const err = error as Error;
      console.log(`WALLET_IMPORT validate: chain detection error: ${err.message}`);
      runtime.logger.error(
        `WALLET_IMPORT validate failed to run chain detection: ${err.message}`
      );
    }

    // Check for Solana keys
    const solanaDetected = detectedKeysByChain.find(
      result => result.chain?.toLowerCase() === 'solana'
    );
    const solanaKeys = solanaDetected?.keys ?? [];
    console.log(`WALLET_IMPORT validate: solana keys detected: ${solanaKeys.length}`);

    // Check for Ethereum keys
    const ethereumDetected = detectedKeysByChain.find(
      result => result.chain?.toLowerCase() === 'ethereum' || result.chain?.toLowerCase() === 'evm'
    );
    const ethereumKeys = ethereumDetected?.keys ?? [];
    console.log(`WALLET_IMPORT validate: ethereum keys detected: ${ethereumKeys.length}`);

    // Also check ethereum service directly
    const ethereumService = runtime.getService('chain_ethereum') as any;
    console.log(`WALLET_IMPORT validate: chain_ethereum service available: ${!!ethereumService}`);

    // If no keys detected via chain service, try Solana fallback
    if (!solanaKeys.length && !ethereumKeys.length) {
      console.log('WALLET_IMPORT validate: no keys from chain service, trying fallback detection');
      runtime.logger.debug('WALLET_IMPORT validate falling back to direct Solana detection');
      const keys = solanaService.detectPrivateKeysFromString(messageText);
      console.log(`WALLET_IMPORT validate: solana fallback detected ${keys.length} keys`);
      runtime.logger.debug(`WALLET_IMPORT validate solana fallback detected keys count=${keys.length}`);
      if (!keys.length) {
        console.log('WALLET_IMPORT validate FAILED: no private keys detected anywhere');
        runtime.logger.debug('WALLET_IMPORT validate skipped: no private keys detected');
        return false;
      }
    } else {
      console.log(`WALLET_IMPORT validate: keys detected via chain service: solana=${solanaKeys.length}, ethereum=${ethereumKeys.length}`);
      runtime.logger.debug(
        `WALLET_IMPORT validate keys detected via chain service: solana=${solanaKeys.length}, ethereum=${ethereumKeys.length}`
      );
    }

    console.log('WALLET_IMPORT validate: checking account...');
    const account = await getAccountFromMessage(runtime, message);
    if (!account) {
      console.log('WALLET_IMPORT validate FAILED: account not resolved');
      runtime.logger.debug(
        `WALLET_IMPORT validate skipped: account not resolved messageId=${message.id ?? 'unknown'}`
      );
      return false; // require account
    }
    console.log(`WALLET_IMPORT validate: account resolved, entityId=${account?.entityId}`);

    console.log(`WALLET_IMPORT validate PASSED - accountId=${account?.entityId ?? 'unknown'}`);
    runtime.logger.debug(
      `WALLET_IMPORT validate passed messageId=${message.id ?? 'unknown'} accountId=${account?.entityId ?? 'unknown'}`
    );

    return true
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: HandlerOptions,
    callback?: HandlerCallback,
    responses?: Memory[]
  ): Promise<void> => {
    console.log('WALLET_IMPORT handler')

    // using the service to get this/components might be good way
    //const email = await getDataFromMessage(runtime, message)
    const account = await getAccountFromMessage(runtime, message)
    if (!account) {
      runtime.logger.info('Not registered')
      return
    }

    const roomDetails = await runtime.getRoom(message.roomId);

    const traderStrategyService = runtime.getService('TRADER_STRATEGY') as any;
    const stratgiesList = await traderStrategyService.listActiveStrategies(account)
    // maybe we use an LLM call to get their exact meaning
    const containsStrats = stratgiesList.filter(word => message.content.text?.includes(word))
    console.log('containsStrats', containsStrats)
    //takeItPrivate(runtime, message, 'Hrm you\'ve selected a strategy, time to make a wallet')

    // should we check to see if we already a wallet with this strategy? no
    // they can have multiple


    // create meta wallet container on this registration
    // or import into existing meta wallet?

    // which chains
    const traderChainService = runtime.getService('INTEL_CHAIN') as any;
    const chains = await traderChainService.listActiveChains()
    console.log('chains', chains)

    const solanaService = runtime.getService('chain_solana') as any;
    const messageText = message.content.text ?? '';
    let detectedKeysByChain: Array<{ chain: string; keys: any[] }> = [];
    try {
      detectedKeysByChain = await traderChainService.detectPrivateKeysFromString(messageText);
      runtime.logger.debug(
        `WALLET_IMPORT handler chain detection results chains=${detectedKeysByChain.length}`
      );
    } catch (error) {
      const err = error as Error;
      runtime.logger.error(
        `WALLET_IMPORT handler failed to run chain detection: ${err.message}`
      );
    }

    const solanaDetected = detectedKeysByChain.find(
      result => result.chain?.toLowerCase() === 'solana'
    );

    let solanaKey = solanaDetected?.keys?.[0];
    if (!solanaKey) {
      const fallbackKeys = solanaService.detectPrivateKeysFromString(messageText);
      runtime.logger.debug(
        `WALLET_IMPORT handler solana fallback detected keys count=${fallbackKeys.length}`
      );
      solanaKey = fallbackKeys[0];
    } else {
      runtime.logger.debug('WALLET_IMPORT handler using solana key detected via chain service');
    }

    // Check for Ethereum keys in addition to Solana
    const ethereumDetected = detectedKeysByChain.find(
      result => result.chain?.toLowerCase() === 'ethereum' || result.chain?.toLowerCase() === 'evm'
    );
    const ethereumKey = ethereumDetected?.keys?.[0];

    // Need at least one key type to proceed
    if (!solanaKey?.bytes && !ethereumKey) {
      runtime.logger.warn('WALLET_IMPORT handler unable to resolve any private key');
      return;
    }

    // Build keypairs object with available chains
    const keypairs: Record<string, any> = {};

    // Handle Solana key if present
    if (solanaKey?.bytes) {
      const keypair = Keypair.fromSecretKey(solanaKey.bytes);
      keypairs.solana = {
        privateKey: bs58.encode(keypair.secretKey),
        publicKey: keypair.publicKey.toBase58(),
        type: 'imported',
        createdAt: Date.now(),
      };
    }

    // Handle Ethereum key if present
    if (ethereumKey) {
      try {
        // Get the Ethereum service to derive the address
        const ethService = runtime.getService('chain_ethereum') as any;
        if (ethService) {
          const ethAddress = ethService.getPubkeyFromSecret(ethereumKey.key);
          keypairs.ethereum = {
            privateKey: ethereumKey.key,
            publicKey: ethAddress,
            type: 'imported',
            createdAt: Date.now(),
          };
        } else {
          // Fallback: derive address using viem directly
          const { privateKeyToAccount } = require('viem/accounts');
          const normalizedKey = ethereumKey.key.startsWith('0x') ? ethereumKey.key : `0x${ethereumKey.key}`;
          const account = privateKeyToAccount(normalizedKey);
          keypairs.ethereum = {
            privateKey: normalizedKey,
            publicKey: account.address,
            type: 'imported',
            createdAt: Date.now(),
          };
        }
      } catch (error) {
        runtime.logger.warn('WALLET_IMPORT handler failed to process Ethereum key:', error);
      }
    }

    console.log('account', account)
    //callback(takeItPrivate(runtime, message, 'Thinking about making a meta-wallet'))

    if (account.metawallets === undefined) account.metawallets = []
    const strat = containsStrats?.[0] || 'No trading strategy'
    const newWallet = {
      strategy: strat,
      keypairs,
    }
    console.log('newWallet', newWallet)

    // Build response message showing all imported chains
    let str = '\n'
    str += '  Strategy: ' + strat + '\n'

    if (keypairs.solana) {
      str += '  Chain: solana\n'
      str += '    Public key: ' + keypairs.solana.publicKey + ' (This is the wallet address that you can publicly send to people)\n'
    }

    if (keypairs.ethereum) {
      str += '  Chain: ethereum (EVM)\n'
      str += '    Public key: ' + keypairs.ethereum.publicKey + ' (This address works on Ethereum, Base, Polygon, and other EVM chains)\n'
    }

    callback?.(takeItPrivate(runtime, message, 'Made a meta-wallet ' + str + ' please fund it to start trading'))

    account.metawallets.push(newWallet)
    // dev mode
    //newData.metawallets = [newWallet]
    //await interface_account_update(runtime, account)
    const intAccountService = runtime.getService('AUTONOMOUS_TRADER_INTERFACE_ACCOUNTS') as any;
    console.log('account', account)
    const component = accountMockComponent(account)
    console.log('component', component)
    await intAccountService.interface_account_upsert(message, component)
    /*
    await runtime.updateComponent({
      id: account.componentId,
      worldId: roomDetails.worldId,
      roomId: message.roomId,
      sourceEntityId: message.entityId,
      entityId: account.entityId,
      type: CONSTANTS.COMPONENT_ACCOUNT_TYPE,
      data: newData,
      agentId: runtime.agentId,
    });
    */
  },
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'I want to import a wallet with this (base58 encoded) private key 4Vw7qoDQYMkicLcp1NSsyTjev8k7CvKBVWEUsRJgXMqsHB3iAVcQ11yiRiKXnLAXynHzNQQUrhC788fE9rcN1Ar4',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: "I'll import that now",
          actions: ['WALLET_IMPORT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Import wallet from 4Vw7qoDQYMkicLcp1NSsyTjev8k7CvKBVWEUsRJgXMqsHB3iAVcQ11yiRiKXnLAXynHzNQQUrhC788fE9rcN1Ar4',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: "I'll import that now",
          actions: ['WALLET_IMPORT'],
        },
      },
    ],
  ] as ActionExample[][],
}