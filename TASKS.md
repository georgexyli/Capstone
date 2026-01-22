# Spartan Trading Agent - Development Roadmap

> **Last Updated:** 2026-01-22
> **Status:** Tasks 1-2 Complete, Task 3 Next

---

## Vision

**Spartan is a conversational AI trading broker.** Users chat with the agent naturally, and it executes trades on their behalf across multiple blockchains.

### The End Goal
```
User: "What's the price of ETH?"
Spartan: "ETH is currently $3,245. Want me to buy some?"

User: "Yeah, swap $100 of my USDC for ETH on Base"
Spartan: "Done. Swapped 100 USDC for 0.0308 ETH on Base. TX: 0x..."

User: "What's in my wallet?"
Spartan: "You have 0.5 ETH ($1,622), 500 USDC, and 1000 PEPE ($12) on Base."
```

### Core Capabilities
| Capability | Status | Notes |
|------------|--------|-------|
| Conversational AI | ✅ Done | Spartan character with personality |
| Wallet Import (Solana) | ✅ Done | Base58 private keys |
| Wallet Import (Ethereum) | ✅ Done | Hex/0x private keys (Task 1) |
| Trade Execution (Solana) | ✅ Done | Jupiter DEX integration |
| Trade Execution (Ethereum) | ✅ Done | Uniswap V3 integration (Task 2) |
| Price Lookups | ⏳ Next | Task 3 |
| Portfolio/Balance View | 📋 Planned | Task 4 |
| Trade Confirmations | 📋 Planned | Task 5 |

---

## Current Architecture

### Supported Chains
| Chain | Wallet | Trading | DEX |
|-------|--------|---------|-----|
| Solana | ✅ | ✅ | Jupiter |
| Ethereum | ✅ | ✅ | Uniswap V3 |
| Base | ✅ | ✅ | Uniswap V3 |
| Polygon | ✅ | ✅ | Uniswap V3 |
| Arbitrum | ✅ | ✅ | Uniswap V3 |
| Optimism | ✅ | ✅ | Uniswap V3 |
| Sepolia | ✅ | ✅ | Uniswap V3 |

### Key Files
| File | Purpose |
|------|---------|
| `src/index.ts` | Spartan character definition |
| `src/plugins/degenIntel/services/srv_ethereum.ts` | Ethereum chain service |
| `src/plugins/degenIntel/services/srv_chain.ts` | Multi-chain orchestrator |
| `src/plugins/multiwallet/actions/act_wallet_import.ts` | Wallet import action |
| `src/plugins/multiwallet/actions/act_wallet_swap.ts` | Swap execution action |
| `src/plugins/account/actions/act_reg_dev.ts` | Dev registration (testing) |

---

## Task 1: Ethereum Wallet Support ✅ COMPLETE

**Goal:** Allow users to import Ethereum wallets so the agent can trade on EVM chains.

### What Was Built
- `EthereumChainService` - Connects to 6 EVM chains via viem
- Wallet import for hex private keys (0x format)
- LLM recognizes "import my ETH wallet" commands
- Character knows it supports multi-chain trading

### Verified Working
```
✅ "dev register" → Creates account
✅ Paste ETH private key → WALLET_IMPORT detects and saves
✅ Account updated with ethereum keypair
```

---

## Task 2: Uniswap Trade Execution ✅ COMPLETE

**Goal:** Execute token swaps on EVM chains using Uniswap, just like Jupiter works for Solana.

### User Story
```
User: "Swap 0.1 ETH for USDC on Base"
Spartan: "Swapped 0.1 ETH for 324.50 USDC on Base. TX: 0x..."
```

### What Was Built

#### 2.1 Uniswap Contracts & ABIs Added
**File:** `src/plugins/degenIntel/config/evm-chains.ts`

- Added `UNISWAP_CONTRACTS` with SwapRouter02 and QuoterV2 addresses for all chains
- Added `SWAP_ROUTER_ABI` for `exactInputSingle` swaps
- Added `QUOTER_V2_ABI` for getting quotes
- Added `WETH_ABI` for wrapping/unwrapping ETH
- Added `UNISWAP_FEE_TIERS` (500, 3000, 10000)

#### 2.2 Swap Methods in EthereumChainService
**File:** `src/plugins/degenIntel/services/srv_ethereum.ts`

| Method | Description |
|--------|-------------|
| `getSwapQuote()` | Gets best quote across fee tiers, calculates slippage |
| `executeSwap()` | Handles ERC20 approval, executes swap via SwapRouter02 |
| `doSwapOnExchange()` | Legacy interface, combines quote + execute |

#### 2.3 Chain Routing in Swap Action
**File:** `src/plugins/multiwallet/actions/act_wallet_swap.ts`

- Added `isEthereumAddress()` and `isSolanaAddress()` helpers
- Detects chain from wallet address format
- Routes to Jupiter (Solana) or Uniswap (EVM) based on chain
- Added EVM swap similes and examples

### Uniswap Contracts Used
| Chain | SwapRouter02 | QuoterV2 |
|-------|--------------|----------|
| Ethereum | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` | `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` |
| Base | `0x2626664c2603336E57B271c5C0b26F421741e481` | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` |
| Sepolia | `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E` | `0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3` |

### Completed Checklist
- [x] Add Uniswap contract addresses and ABIs to evm-chains.ts
- [x] Implement `getSwapQuote()` method (tries all fee tiers, picks best)
- [x] Implement `executeSwap()` method (handles approval + swap)
- [x] Update `act_wallet_swap.ts` with chain routing
- [x] Add EVM swap similes and examples
- [x] Build and verify compilation
- [x] Deploy to Docker
- [ ] Test swap on Sepolia testnet (ready for testing)

---

## Task 3: Price Lookups 📋 PLANNED

**Goal:** User asks for a token price, agent responds with current market data.

### User Story
```
User: "What's the price of PEPE?"
Spartan: "PEPE is $0.000012, up 5% in 24h. Market cap $5B."
```

### Implementation Ideas
- CoinGecko API for prices
- Or use DEX quotes (Jupiter/Uniswap) for real-time prices
- Create `GET_PRICE` action

---

## Task 4: Portfolio View 📋 PLANNED

**Goal:** User asks what's in their wallet, agent shows balances.

### User Story
```
User: "What's in my wallet?"
Spartan: "On Base: 0.5 ETH ($1,622), 500 USDC, 1000 PEPE ($12)"
```

### Implementation Ideas
- Use existing `getBalances()` from chain services
- Create `GET_PORTFOLIO` or `CHECK_BALANCE` action
- Format response nicely with USD values

---

## Task 5: Trade Confirmations 📋 PLANNED

**Goal:** For large trades, ask user to confirm before executing.

### User Story
```
User: "Swap all my ETH for DOGE"
Spartan: "That's 2.5 ETH ($8,112). Are you sure? Reply 'yes' to confirm."
User: "yes"
Spartan: "Done. Swapped 2.5 ETH for 45,000 DOGE."
```

---

## Task 6: Sepolia Testing 📋 OPTIONAL

**Goal:** Test all functionality on testnet before mainnet.

Already supported - just need to:
1. Get test ETH from faucet
2. Import test wallet
3. Run test trades

---

## Task 7: Telegram UI 📋 OPTIONAL

**Goal:** Chat with Spartan via Telegram instead of web interface.

Lower priority - focus on core trading first.

---

## Progress Summary

| Task | Description | Status | Priority |
|------|-------------|--------|----------|
| 1 | Ethereum Wallet Support | ✅ Complete | - |
| 2 | Uniswap Trade Execution | ✅ Complete | - |
| 3 | Price Lookups | ⏳ Next | Medium |
| 4 | Portfolio View | 📋 Planned | Medium |
| 5 | Trade Confirmations | 📋 Planned | Medium |
| 6 | Sepolia Testing | 📋 Optional | Low |
| 7 | Telegram UI | 📋 Optional | Low |

---

## Environment Variables

```env
# Already configured
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
EVM_PROVIDER_URL=https://mainnet.base.org
RPC_URL=https://mainnet.base.org
DEV_MODE=true
```

---

## Resources

- [viem Docs](https://viem.sh/)
- [Uniswap V3 SDK](https://docs.uniswap.org/sdk/v3/overview)
- [Jupiter Docs](https://station.jup.ag/docs)
- [Sepolia Faucet](https://sepoliafaucet.com/)
