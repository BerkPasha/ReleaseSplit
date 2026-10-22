# ReleaseSplit

> Built with Arc Studio - money-powered apps in minutes

USDC escrow + automatic payment splitting for freelancers and small teams on Arc Mainnet.

---

## What This App Does

ReleaseSplit lets a payer escrow USDC for a job, designate an approver and 2-3 recipients with immutable payout percentages. The approver releases funds to all recipients atomically before a deadline. If the deadline passes without release, only the payer can reclaim the funds. No platform fees, no admin, no upgradeability.

## Smart Contracts

| Contract | Chain | Address | Explorer |
|---|---|---|---|
| ReleaseSplit | Arc Mainnet (5042) | 0x8891521e3eb78a900e0664e802fb6549b4b4a819 | https://explorer.arc.io/address/0x8891521e3eb78a900e0664e802fb6549b4b4a819 |
| ReleaseSplit | Arc Testnet (5042002) | 0x9472cf2e3cf010430f3daf84d71adec5d5f3fe71 | https://explorer.testnet.arc.io/address/0x9472cf2e3cf010430f3daf84d71adec5d5f3fe71 |

The frontend targets the Arc Mainnet deployment.

Mainnet deploy tx: 0x6b57b351c71175e121006b4c828318df07f9caa6b2f4ae8a7928095ab6d49db6 (block 27261403, deployer 0x72043b08c4e865b9eb6712e80ef2780a5648af9f, deployed with Rabby via `deploy/mainnet/`). Runtime bytecode is identical to the testnet deployment; re-check with `node deploy/mainnet/verify.mjs <mainnet deploy tx>`.

Testnet deploy tx: 0xe03473e9a02fa3f7a7c81e1871632b2c671fb280e47636e7ea85028049e7fbc2

## Contract API

`createDeal(address approver, address[] wallets, uint16[] bps, uint256 amount, uint256 deadline) → dealId`
`fundDeal(uint256 dealId)` — payer calls; requires prior USDC approval
`releaseDeal(uint256 dealId)` — approver calls before deadline
`refundDeal(uint256 dealId)` — payer calls after deadline
`getDeal(uint256 dealId)` → (payer, approver, address[3] wallets, uint16[3] bps, uint8 count, uint256 amount, uint256 deadline, uint8 state)
`usdcAddress()` → 0x3600000000000000000000000000000000000000

States: 0=Created, 1=Funded, 2=Released, 3=Refunded

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, tests in `contracts/test/`. Build: `forge build`, test: `forge test`.
- Chain: Arc Mainnet (Chain ID: 5042); originally deployed and tested on Arc Testnet (Chain ID: 5042002)
- Token: USDC ERC-20, 6 decimals, 0x3600000000000000000000000000000000000000

## Security Review

- Balanced security review: clean (no Critical/High findings after 2 rounds of fixes)
- bps type fixed from uint8 → uint16 (would have prevented all deals from being created)
- Slither: Low/Informational only (timestamp comparisons by design, false-positive uninitialized locals)
- 43 Foundry unit tests pass (happy paths, reverts, fuzz, invariants)
- Known limitation: push-based payout — if a recipient address is USDC-blocklisted after deal creation, releaseDeal will revert; payer can recover via refund after deadline

## Key Files

- `src/App.tsx` — thin composition root
- `src/components/` — UI components
- `contracts/ReleaseSplit.sol` — escrow contract
- `contracts/test/ReleaseSplit.t.sol` — 43 unit + fuzz + invariant tests
- `deploy/mainnet/` — Rabby deploy page (`serve.mjs` + `index.html`) and read-only `verify.mjs` for the Arc Mainnet deployment
