import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  type HandlerOptions,
  type ActionExample,
  type UUID,
  createUniqueUuid,
} from '@elizaos/core';
import { v4 as uuidv4 } from 'uuid';
import { takeItPrivate, HasEntityIdFromMessage, getEntityIdFromMessage, getDataFromMessage } from '../../autonomous-trader/utils'
import CONSTANTS from '../../autonomous-trader/constants'

// DEV ONLY: Bypass email verification for testing
// Triggered by: "dev register" or "test register"
export const devRegistration: Action = {
  name: 'DEV_REGISTRATION',
  similes: [],
  description: 'DEV ONLY: Bypasses email verification for testing wallet import. Say "dev register" to use.',
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    // Only enable in development
    const isDev = process.env.NODE_ENV !== 'production' || process.env.DEV_MODE === 'true';
    if (!isDev) {
      return false;
    }

    const text = message.content.text?.toLowerCase() || '';
    // Only trigger on explicit dev commands
    if (!text.includes('dev register') && !text.includes('test register') && !text.includes('dev signup')) {
      return false;
    }

    if (!await HasEntityIdFromMessage(runtime, message)) {
      console.warn('DEV_REGISTRATION validate - author not found');
      return false;
    }

    // Check if already registered
    const reg = await getDataFromMessage(runtime, message);
    if (reg?.verified) {
      console.log('DEV_REGISTRATION validate - already verified');
      return false;
    }

    console.log('DEV_REGISTRATION validate - PASSED');
    return true;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: HandlerOptions,
    callback?: HandlerCallback,
    responses?: Memory[]
  ) => {
    console.log('DEV_REGISTRATION handler - Creating dev account');

    const roomDetails = await runtime.getRoom(message.roomId);
    if (!roomDetails) {
      console.error('Room not found:', message.roomId);
      return;
    }

    // Use message.entityId directly - getEntityIdFromMessage can return wrong ID
    const entityId = message.entityId;
    if (!entityId) {
      console.error('Entity ID not found');
      return;
    }
    console.log('DEV_REGISTRATION - Using entityId:', entityId);

    // Generate a fake dev email based on entity ID
    const devEmail = `dev-${entityId.slice(0, 8)}@test.local`;
    const emailEntityId = createUniqueUuid(runtime, devEmail);

    console.log('DEV_REGISTRATION - Creating user component for', entityId, 'with email', devEmail);

    // Check if user component already exists
    const existingData = await getDataFromMessage(runtime, message);
    if (existingData) {
      // Update existing component to verified
      const intUserService = runtime.getService('AUTONOMOUS_TRADER_INTERFACE_USERS') as any;
      if (intUserService) {
        existingData.verified = true;
        await intUserService.interface_user_update(existingData);
        console.log('DEV_REGISTRATION - Updated existing user to verified');
      }
    } else {
      // Create new user component with verified=true
      await runtime.createComponent({
        id: uuidv4() as UUID,  // Use random UUID, not deterministic
        agentId: runtime.agentId,
        worldId: roomDetails.worldId || runtime.agentId,
        roomId: message.roomId,
        sourceEntityId: message.entityId,
        entityId: entityId as UUID,
        type: CONSTANTS.COMPONENT_USER_TYPE,
        data: {
          address: devEmail,
          code: 'DEV000',
          verified: true,  // Skip verification
        },
        createdAt: Date.now(),
      });
      console.log('DEV_REGISTRATION - Created verified user component');
    }

    // IMPORTANT: Create the account ENTITY first (before the component)
    try {
      console.log('DEV_REGISTRATION - Looking up account entity', emailEntityId);
      const accountEntity = await runtime.getEntityById(emailEntityId);
      console.log('DEV_REGISTRATION - Account entity exists:', !!accountEntity);
      if (!accountEntity) {
        console.log('DEV_REGISTRATION - Creating account entity', emailEntityId);
        await runtime.createEntity({
          id: emailEntityId,
          names: [],
          metadata: {},
          agentId: runtime.agentId,
        });
        console.log('DEV_REGISTRATION - Account entity created');
      }

      // Now create the account component attached to the entity
      console.log('DEV_REGISTRATION - Creating account component with worldId:', roomDetails.worldId);
      await runtime.createComponent({
        id: uuidv4() as UUID,
        agentId: runtime.agentId as UUID,
        worldId: roomDetails.worldId as UUID,
        roomId: message.roomId,
        sourceEntityId: message.entityId as UUID,
        entityId: emailEntityId,
        type: CONSTANTS.COMPONENT_ACCOUNT_TYPE,
        data: {
          metawallets: [],
        },
        createdAt: Date.now(),
      });
      console.log('DEV_REGISTRATION - Created account component');
    } catch (err) {
      console.error('DEV_REGISTRATION - Error creating account entity/component:', err);
    }

    // Update spartan data to track this account
    const agentEntityId = createUniqueUuid(runtime, runtime.agentId);
    const agentEntity = await runtime.getEntityById(agentEntityId);
    if (agentEntity?.components) {
      let spartanData = agentEntity.components.find(c => c.type === CONSTANTS.SPARTAN_SERVICE_TYPE);
      if (spartanData) {
        if (!Array.isArray(spartanData.data.accounts)) spartanData.data.accounts = [];
        if (!Array.isArray(spartanData.data.users)) spartanData.data.users = [];
        if (spartanData.data.accounts.indexOf(emailEntityId) === -1) {
          spartanData.data.accounts.push(emailEntityId);
        }
        if (spartanData.data.users.indexOf(entityId) === -1) {
          spartanData.data.users.push(entityId);
        }
        await runtime.updateComponent({
          ...spartanData,
          data: spartanData.data,
        });
        console.log('DEV_REGISTRATION - Updated spartan data');
      }
    }

    const content = takeItPrivate(
      runtime,
      message,
      `DEV MODE: Account created and verified!\nEmail: ${devEmail}\nYou can now import wallets. Try sending a private key.`
    );
    callback?.(content);
  },
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'dev register',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'DEV MODE: Account created and verified!',
          actions: ['DEV_REGISTRATION'],
        },
      },
    ],
  ] as ActionExample[][],
};
