# Remaining Implementation Tickets

> **Project**: DeFi AI Agent (ECE496 Capstone - Team 2025251)
> **Date Created**: 2026-03-17
> **Final Demo Target**: April 2026

---

## TICKET-1: Human Confirmation Gate

**SyRS**: #2
**Priority**: High
**Estimated Effort**: Medium

### Summary

Before any transaction is broadcast to the blockchain, the system must present the user with a human-readable summary of the proposed trade and require explicit confirmation. Currently, the swap pipeline (in `act_wallet_swap.ts` and `act_open_position.ts`) goes straight from quote to execution with no confirmation step.

### Context

- The current swap flow: user message -> NLU parse -> Jupiter/Uniswap quote -> sign -> broadcast
- There is no intermediate step where the user sees what is about to happen and approves it
- This is a hard requirement from the SyRS: "no transaction is broadcast without a recorded Confirm event"
- The confirmation gate sits between the **Router & Quote Engine** (module 2) and **Simulation & Risk** (module 4) in the architecture diagram

### Requirements

1. After the router returns a proposed route and quote, the system must display a **human-readable summary** to the user containing:
   - Input token and amount (e.g., "0.1 ETH")
   - Output token and estimated received amount (e.g., "~245.32 USDC")
   - Estimated gas fee in ETH and USD equivalent
   - Maximum slippage tolerance
   - Network (e.g., "Sepolia Testnet")
2. The user must explicitly respond with confirmation (e.g., "yes", "confirm", or a button tap) before execution proceeds
3. If the user responds with anything other than confirmation (e.g., "no", "cancel", silence/timeout), the pipeline must **abort** and inform the user
4. A timeout of **60 seconds** should apply — if the user does not confirm within that window, the trade is cancelled (quotes go stale)
5. The confirmation event must be **logged** with a timestamp for audit purposes

### Acceptance Criteria

- [ ] Attempting to trigger a swap without confirming results in the system halting and displaying "confirmation required"
- [ ] The summary is formatted clearly and contains all required fields
- [ ] A "no" or timeout results in a clean cancellation with a user-facing message
- [ ] Confirmation events are persisted in the run log

### Key Files

- `src/plugins/multiwallet/actions/act_wallet_swap.ts` — main EVM swap action, inject gate before execution
- `src/plugins/trading/actions/act_open_position.ts` — Solana swap action, same pattern needed
- `src/plugins/trading/interfaces/int_positions.ts` — reference for how state is persisted

---

## TICKET-2: Pre-Execution Simulation & Risk Gate

**SyRS**: #4, #6
**Priority**: High
**Estimated Effort**: Large

### Summary

After user confirmation, the proposed transaction must be fully simulated on Sepolia before broadcasting. The simulation verifies that the transaction will succeed and that all risk parameters (balances, allowances, gas, slippage) are within acceptable bounds. If any check fails, execution is blocked with a precise, actionable error message.

### Context

- Currently, transactions go directly to broadcast after signing — there is no dry-run step
- Sepolia supports `eth_call` for simulation, which executes the transaction against current state without actually submitting it
- This module sits between the **Human Confirmation Gate** (module 3) and the **Spartan->EVM Interop Layer** (module 5) in the architecture
- The implementation plan specifies this must produce a `SimResult` and `RiskVerdict` (pass/fail)
- SyRS #6 (gas limit enforcement) is handled here — if estimated gas exceeds the user's max, abort

### Requirements

1. After the user confirms, execute an `eth_call` simulation using the exact calldata, routing logic, and gas parameters that would be used in the real transaction
2. During simulation, enforce the following **hard invariants**:
   - **Balance check**: user has sufficient input token balance
   - **Allowance check**: the Uniswap router has sufficient ERC-20 approval to spend the input token (if not native ETH)
   - **Gas ceiling**: estimated gas does not exceed a predefined maximum (or user-specified max)
   - **Slippage bounds**: the simulated output amount falls within the user's declared slippage tolerance
3. If any invariant fails, execution must be **immediately blocked** with a specific error:
   - `INSUFFICIENT_BALANCE`: "You need X ETH but only have Y"
   - `MISSING_ALLOWANCE`: "Token approval required — approve the router to spend your [TOKEN]"
   - `GAS_EXCEEDS_LIMIT`: "Estimated gas (X gwei) exceeds your maximum (Y gwei)"
   - `SLIPPAGE_EXCEEDED`: "Expected output differs from quote by X%, which exceeds your Y% tolerance"
4. Only transactions that pass **all** simulation checks proceed to signing and broadcast
5. Simulation results (pass/fail, individual check outcomes, simulated output) must be logged

### Acceptance Criteria

- [ ] A normal valid trade passes simulation and proceeds to execution
- [ ] A trade with insufficient funds is blocked with `INSUFFICIENT_BALANCE` error and clear message
- [ ] A trade where price moved too much is blocked with `SLIPPAGE_EXCEEDED` error
- [ ] Setting a very low gas limit causes the system to cancel with `GAS_EXCEEDS_LIMIT` warning
- [ ] A trade requiring ERC-20 approval that hasn't been granted is blocked with `MISSING_ALLOWANCE`
- [ ] All simulation results are logged with timestamps

### Key Files

- `src/plugins/multiwallet/actions/act_wallet_swap.ts` — insert simulation step after confirmation, before signing
- Uniswap router ABI — needed for `eth_call` simulation against the router contract
- viem's `simulateContract` or raw `eth_call` via the RPC provider

### Technical Notes

- Use `eth_call` with the same calldata that would be sent in the real transaction
- For balance/allowance checks, use `balanceOf()` and `allowance()` calls on the ERC-20 contract
- Gas estimation can use `eth_estimateGas` and compare against ceiling
- Consider caching the simulation result so it doesn't need to be re-run at broadcast time

---

## TICKET-3: Post-Trade Rendering & Audit Trail

**SyRS**: #7, #8 (partial)
**Priority**: Medium
**Estimated Effort**: Medium

### Summary

After a transaction is broadcast and confirmed on-chain, the system must render a detailed post-trade report to the user and persist a structured audit log of the entire pipeline run. Currently, the user gets a basic success/failure message with a tx hash — this needs to be expanded into a full trade receipt with realized execution metrics.

### Context

- Current post-swap output (in `act_wallet_swap.ts`) is a simple success message with a block explorer link
- The implementation plan requires showing: actual output amount, realized slippage vs tolerance, gas used
- SyRS #7 requires logging every pipeline stage (parse -> route -> simulate -> sign -> send) with a run ID
- This module appears as **Post-Trade Rendering & Audit** in the architecture diagram (outputs section)
- The **Run Logger & Telemetry** module (module 9) is marked as complete — this ticket extends it to produce user-facing output

### Requirements

1. After a successful transaction receipt, display to the user:
   - **Transaction hash** with block explorer link (Sepolia Etherscan)
   - **Input**: token and amount spent
   - **Output**: token and actual amount received (decoded from tx receipt/logs)
   - **Realized slippage**: percentage difference between quoted output and actual output
   - **Gas used**: actual gas consumed in the transaction (in ETH and USD equivalent)
   - **Execution time**: seconds from user confirmation to mined receipt
2. Generate a structured **run log** for each trade that captures:
   - `runId`: unique identifier (UUID)
   - `timestamp`: ISO timestamp for each stage
   - Pipeline stages with status: `parse` -> `route` -> `confirm` -> `simulate` -> `sign` -> `broadcast` -> `receipt`
   - Input parameters at each stage
   - Output/result at each stage
   - Final verdict (success/failure + reason)
3. Run logs must **never** contain private keys or signing material
4. Run logs should be persisted (MySQL database or structured log file)
5. For **failed** transactions, the error message must be actionable (SyRS #8):
   - Network error: "Transaction failed due to network issues. Please try again."
   - Insufficient funds: "Not enough [TOKEN] in your wallet. You need X but have Y."
   - Reverted transaction: "Transaction reverted on-chain. [Reason if available]"

### Acceptance Criteria

- [ ] After a successful swap, the user sees a formatted receipt with all fields from requirement 1
- [ ] After each run, structured logs can be inspected and contain all pipeline stages with timestamps
- [ ] No private keys appear anywhere in the logs
- [ ] Failed transactions produce clear, actionable error messages that tell the user what went wrong and how to fix it
- [ ] Run logs include a unique `runId` that can be used to trace a specific execution

### Key Files

- `src/plugins/multiwallet/actions/act_wallet_swap.ts` — extend the post-swap response formatting
- Transaction receipt decoding — parse Uniswap swap event logs to extract actual output amount
- MySQL schema or log persistence layer for run logs

### Technical Notes

- Uniswap V2 emits `Swap(address,uint256,uint256,uint256,uint256,address)` events
- Uniswap V3 emits `Swap(address,address,int256,int256,uint160,uint128,int24)` events
- Decode these from the transaction receipt to get actual amounts swapped
- Realized slippage = `(quotedOutput - actualOutput) / quotedOutput * 100`
- Gas used = `receipt.gasUsed * receipt.effectiveGasPrice`

---

## TICKET-4: Verification & Performance Testing

**SyRS**: #1, #4, #5, #8, #12, #13
**Priority**: Medium (after tickets 1-3 are complete)
**Estimated Effort**: Medium

### Summary

Run the full verification test suite defined in Section 4.0 of the implementation plan. This validates that all 13 SyRS requirements are met with documented evidence. Results feed directly into the final report and demo.

### Context

- The implementation plan defines specific pass/fail tests for each of the 13 requirements
- Several requirements need **quantitative measurement** (20+ trades for latency, 20 swaps for slippage)
- This is not a code-writing task — it's a structured test execution and documentation task
- Results should be captured in a format suitable for the final report

### Test Plan

#### Test A: NLU Intent Parsing (SyRS #1)
- Send **20+ example messages** (mix of valid and invalid)
- Valid examples: "swap 0.1 ETH to USDC", "trade 0.5 ETH for DAI on sepolia", "exchange 1 ETH to WBTC"
- Invalid examples: "swap ETH" (missing amount), "swap -1 ETH to USDC" (negative), "buy me a coffee" (unrelated)
- **Pass criteria**: >= 95% of valid commands parsed correctly, invalid commands return clear error messages

#### Test B: Human Confirmation Gate (SyRS #2)
- Attempt to trigger a transaction without confirming
- **Pass criteria**: system stops and displays "confirmation required" — no tx is broadcast

#### Test C: Valid Transaction Data (SyRS #3)
- Run a swap on Sepolia, inspect the raw transaction calldata
- **Pass criteria**: calldata matches expected Uniswap v2/v3 router ABI encoding, tx is accepted by the network

#### Test D: Simulation & Risk Gate (SyRS #4)
- Simulate three cases: (a) normal trade, (b) insufficient funds, (c) slippage too high
- **Pass criteria**: errors are correctly detected and explained with actionable messages

#### Test E: Sepolia Execution (SyRS #5)
- Send several test transactions
- **Pass criteria**: all return valid tx hashes and success receipts

#### Test F: Gas Limit Enforcement (SyRS #6)
- Set a very low gas limit and attempt a trade
- **Pass criteria**: system cancels and warns that the fee is too high

#### Test G: Pipeline Logging (SyRS #7)
- After each run, inspect logs
- **Pass criteria**: all pipeline steps appear with timestamps, no private keys stored

#### Test H: Error Handling (SyRS #8)
- Intentionally cause: network error, insufficient funds, bad input
- **Pass criteria**: each failure produces a clear, actionable message

#### Test I: Non-Custodial Signing (SyRS #9)
- Code review: verify no key upload paths exist
- Run without a local signer
- **Pass criteria**: system refuses to proceed, keys stay private

#### Test J: No Autonomous Trading (SyRS #10)
- Leave bot idle with no user input for 5+ minutes
- **Pass criteria**: no transactions created automatically

#### Test K: Latency Measurement (SyRS #12)
- Send **20 trades** on Sepolia, record time from "confirm" to "mined"
- **Pass criteria**: median <= 12s, 95th percentile <= 25s

#### Test L: Slippage Compliance (SyRS #13)
- Run **20 swaps** with different slippage settings (0.5%, 1%, 2%, 5%)
- **Pass criteria**: >= 95% of swaps finish within user's set tolerance

### Deliverable

A **verification report** (markdown or PDF) with:
- Test ID, description, result (pass/fail), evidence (tx hash, screenshot, log excerpt)
- Summary table of all 13 SyRS requirements and their status
- Latency distribution chart (if possible)
- Slippage distribution chart (if possible)

---

## Dependency Graph

```
TICKET-1 (Confirmation Gate)
    ↓
TICKET-2 (Simulation & Risk) — depends on TICKET-1 (confirmation must happen first)
    ↓
TICKET-3 (Post-Trade Audit) — depends on TICKET-2 (needs simulation data to log)
    ↓
TICKET-4 (Verification) — depends on TICKETS 1-3 (tests the complete pipeline)
```

## Quick Reference: Architecture Module Status

| # | Module | Status |
|---|--------|--------|
| 1 | NLU & Intent Parser | Done |
| 2 | Router & Quote Engine (EVM) | Done |
| 3 | Human Confirmation Gate | **TICKET-1** |
| 4 | Simulation & Risk (Sepolia) | **TICKET-2** |
| 5 | Spartan -> EVM Interop Layer | Done |
| 6 | Transaction Builder (ABI) | Done |
| 7 | Client-Side Signature | Done |
| 8 | Broadcaster (RPC) | Done |
| 9 | Run Logger & Telemetry | Done (extended by **TICKET-3**) |
| - | Post-Trade Rendering & Audit | **TICKET-3** |
