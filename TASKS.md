# Spartan EVM Integration Tasks

> **Last Updated:** 2026-01-22
> **Status:** Task 1 In Progress (~80% complete)

---

## Overview

This document tracks the implementation of Ethereum/EVM support for the Spartan trading agent. We're adding:
1. Ethereum RPC connection with wallet/signer setup
2. Uniswap DEX integration for token swaps
3. (Optional) Sepolia testnet simulation
4. (Optional) Telegram Frontend UI

---

## Current Architecture Summary

### Existing Infrastructure
- **Solana**: Fully implemented with Jupiter DEX integration
- **EVM Chain Service**: Now implemented via `EthereumChainService`
- **Multi-chain wallet structure**: Already supports multiple chains via `keypairs` Record
- **IChainService interface**: Defines contract for all chain services

### Key Files (Updated)
| File | Purpose |
|------|---------|
| `src/plugins/degenIntel/services/srv_ethereum.ts` | **NEW** - Ethereum chain service (viem-based) |
| `src/plugins/degenIntel/config/evm-chains.ts` | **NEW** - EVM chain configurations |
| `src/plugins/degenIntel/services/srv_chain.ts` | Multi-chain service orchestrator (now registers EVM) |
| `src/plugins/degenIntel/types.ts` | `IChainService` interface definition |
| `src/plugins/multiwallet/actions/act_wallet_import.ts` | Wallet import (needs Ethereum branch) |
| `src/plugins/account/actions/act_reg_dev.ts` | **NEW** - Dev registration bypass |
| `src/plugins/autonomous-trader/utils.ts` | Entity ID resolution (fixed) |

### Service Pattern
```typescript
// Services accessed via runtime
const solanaService = runtime.getService('chain_solana');
const ethService = runtime.getService('chain_ethereum');  // NOW AVAILABLE
const traderChainService = runtime.getService('INTEL_CHAIN');
```

---

## Task 1: Connect to Ethereum RPC & Setup Signer

### Status: `[~] In Progress (~80% complete)`

### What's Done

#### 1.1 EthereumChainService Created
**File:** `src/plugins/degenIntel/services/srv_ethereum.ts`

- Implements `IChainService` interface
- Uses **viem** (not ethers) for all EVM operations
- Supports 6 chains: ethereum, base, polygon, arbitrum, optimism, sepolia

| Method | Status | Notes |
|--------|--------|-------|
| `createWallet()` | ✅ Done | Uses viem's `generatePrivateKey()` + `privateKeyToAccount()` |
| `getPubkeysFromSecrets()` | ✅ Done | Derives addresses from hex private keys |
| `detectPubkeysFromString()` | ✅ Done | Regex: `/\b0x[a-fA-F0-9]{40}\b/g` |
| `detectPrivateKeysFromString()` | ✅ Done | Regex for 64 hex chars, validates by deriving address |
| `verifySignature()` | ✅ Done | Uses viem's `verifyMessage()` |
| `getBalances()` | ✅ Done | Native ETH + ERC20 balances via `publicClient` |
| `transfer()` | ✅ Done | Native ETH + ERC20 transfers via `walletClient` |

#### 1.2 EVM Chain Configuration
**File:** `src/plugins/degenIntel/config/evm-chains.ts`

```typescript
export const EVM_CHAINS = {
  ethereum: { chainId: 1, nativeSymbol: 'ETH', ... },
  base: { chainId: 8453, nativeSymbol: 'ETH', ... },
  polygon: { chainId: 137, nativeSymbol: 'MATIC', ... },
  arbitrum: { chainId: 42161, nativeSymbol: 'ETH', ... },
  optimism: { chainId: 10, nativeSymbol: 'ETH', ... },
  sepolia: { chainId: 11155111, nativeSymbol: 'ETH', ... },
};
```

#### 1.3 Service Registration
**File:** `src/plugins/degenIntel/services/srv_chain.ts`

- EthereumChainService registered on startup
- All 6 EVM chains auto-registered with TradeChainService
- Logs: "EVM chains registered successfully"

#### 1.4 Entity ID Resolution Fixed
**File:** `src/plugins/autonomous-trader/utils.ts`

- Fixed `getEntityIdFromMessage()` to prioritize `message.entityId` over `metadata.sourceId`
- This ensures DEV_REGISTRATION and WALLET_IMPORT use consistent entity IDs

#### 1.5 DEV_REGISTRATION Action
**File:** `src/plugins/account/actions/act_reg_dev.ts`

- Bypasses email verification when `DEV_MODE=true`
- Creates user component with `verified: true`
- Creates account entity and component
- Triggered by: "dev register" or "test register"

### What's Working (Verified)

```
✅ Ethereum key detection: "chain detection returned 6 chains"
✅ Account lookup: "verified: true", "account resolved"
✅ WALLET_IMPORT validation: "WALLET_IMPORT validate PASSED"
```

### What's NOT Done

#### 1.6 WALLET_IMPORT Handler - Ethereum Branch
**File:** `src/plugins/multiwallet/actions/act_wallet_import.ts`

The handler currently only saves Solana keys. Need to add:

```typescript
// After Solana key handling, add:
const ethereumDetected = detectedKeysByChain.find(
  result => result.chain?.toLowerCase().includes('ethereum') || ['base','polygon','arbitrum','optimism','sepolia'].includes(result.chain?.toLowerCase())
);
if (ethereumDetected?.keys?.[0]) {
  const ethKey = ethereumDetected.keys[0];
  newWallet.keypairs.ethereum = {
    privateKey: ethKey.key,
    publicKey: ethKey.address,
    type: 'imported',
    createdAt: Date.now(),
  };
}
```

#### 1.7 LLM Action Selection
The LLM sometimes chooses `REPLY` instead of `WALLET_IMPORT` when receiving a private key. Options:
- Add keywords to `similes` array
- Update agent system prompt to recognize hex private keys
- User can prefix with "import wallet:" for now

### Testing Results

| Test | Result |
|------|--------|
| Connect to RPC | ✅ Working (Sepolia confirmed) |
| Detect hex private key | ✅ Working (detected across 6 chains) |
| Account lookup | ✅ Working (after entity ID fix) |
| WALLET_IMPORT validation | ✅ PASSED |
| WALLET_IMPORT handler saves ETH key | ❌ Not implemented |

### Remaining Checklist
- [ ] Add Ethereum branch to WALLET_IMPORT handler
- [ ] Test end-to-end wallet import with ETH key
- [ ] Verify keypairs.ethereum is persisted correctly
- [ ] (Optional) Improve LLM action selection for private keys

---

## Task 2: Implement Uniswap Swap Execution

### Status: `[ ] Not Started`

### Objective
Implement token swaps on Ethereum using Uniswap V3, following the Jupiter pattern.

### Current State
- Jupiter swap fully implemented in `act_wallet_swap.ts`
- EthereumChainService provides the signer/provider infrastructure
- Need to add Uniswap SDK integration

### Implementation Steps

#### 2.1 Install Uniswap SDK
```bash
npm install @uniswap/v3-sdk @uniswap/sdk-core
```

#### 2.2 Create Uniswap Service
**New File:** `src/plugins/multiwallet/services/srv_uniswap.ts`

```typescript
export class UniswapService extends Service {
  static serviceName = 'UNISWAP_SERVICE';

  async getQuote(params: { inputToken, outputToken, amount, slippageBps, chainId }): Promise<QuoteResult>;
  async executeSwap(params: { quote, privateKey, chainId }): Promise<TransactionReceipt>;
}
```

#### 2.3 Create EVM Swap Action or Extend Existing
**File:** `src/plugins/multiwallet/actions/act_wallet_swap.ts`

Add chain routing:
```typescript
if (chain === 'solana') {
  return executeJupiterSwap(...);
} else if (['ethereum','base','polygon','arbitrum','optimism'].includes(chain)) {
  return executeUniswapSwap(...);
}
```

### Uniswap Contract Addresses
| Chain | Router V3 | WETH |
|-------|-----------|------|
| Ethereum | `0xE592427A0AEce92De3Edee1F18E0157C05861564` | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| Base | `0x2626664c2603336E57B271c5C0b26F421741e481` | `0x4200000000000000000000000000000000000006` |
| Sepolia | `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E` | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` |

### Files to Create/Modify
- [ ] `package.json` - Add Uniswap SDK
- [ ] `src/plugins/multiwallet/services/srv_uniswap.ts` - Create new
- [ ] `src/plugins/multiwallet/actions/act_wallet_swap.ts` - Add chain routing
- [ ] `src/plugins/multiwallet/index.ts` - Register service

---

## Task 3: Transaction Simulation on Sepolia (Optional)

### Status: `[ ] Not Started`

### Objective
Test all EVM functionality on Sepolia testnet before mainnet deployment.

### Sepolia Already Supported
The EthereumChainService already includes Sepolia configuration. Just need to:
1. Get test ETH from faucet: https://sepoliafaucet.com/
2. Import test wallet with `dev register` + private key
3. Execute test operations

---

## Task 4: Telegram Frontend UI (Optional)

### Status: `[ ] Not Started`

(Details unchanged from original)

---

## Progress Tracker

| Task | Status | Priority | Notes |
|------|--------|----------|-------|
| 1. ETH RPC + Signer | `[~] 80%` | High | Service done, handler needs ETH branch |
| 2. Uniswap Swaps | `[ ] Not Started` | High | Core trading functionality |
| 3. Sepolia Testing | `[ ] Not Started` | Medium | Infrastructure ready |
| 4. Telegram UI | `[ ] Not Started` | Low | Nice-to-have |

---

## Dependencies

**Already using:**
- `viem` - Used by EthereumChainService (modern, type-safe)

**To add for Task 2:**
```json
{
  "dependencies": {
    "@uniswap/v3-sdk": "^3.11.0",
    "@uniswap/sdk-core": "^4.2.0"
  }
}
```

---

## Environment Variables

```env
# Already configured
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
EVM_PROVIDER_URL=https://mainnet.base.org
RPC_URL=https://mainnet.base.org

# For dev testing
DEV_MODE=true
```

---

## Notes & Decisions

- **2026-01-21:** Initial investigation complete
- **2026-01-22:**
  - EthereumChainService implemented with viem (not ethers)
  - Follows existing `IChainService` interface pattern
  - 6 EVM chains supported out of the box
  - Fixed entity ID resolution bug in `getEntityIdFromMessage`
  - WALLET_IMPORT validation works, handler needs ETH branch
  - DEV_REGISTRATION created for testing without SMTP

---

## Resources

- [viem Docs](https://viem.sh/)
- [Uniswap V3 SDK Docs](https://docs.uniswap.org/sdk/v3/overview)
- [Sepolia Faucet](https://sepoliafaucet.com/)
- [Sepolia Etherscan](https://sepolia.etherscan.io/)
