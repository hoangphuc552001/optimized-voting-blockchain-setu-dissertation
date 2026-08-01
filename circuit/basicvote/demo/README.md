# ZKER demo

Interactive demonstration of the two-layer ZK-rollup voting system, built for the
dissertation viva. See **[DEMO-SCRIPT.md](DEMO-SCRIPT.md)** for the act-by-act
presentation script and the verified adversarial-scenario catalogue.

```bash
npx hardhat node        # terminal 1
npm run demo            # terminal 2  →  http://localhost:4000
```

Against the public testnet instead, with real Etherscan links on every transaction:

```bash
npm run demo:sepolia
```

## What this is

`operator/index.js` drives the single-layer (`VotingRollup`) architecture. This demo is its
two-layer counterpart: it reuses the same operator modules — `operator/stateTree.js` and
`operator/twoLayerBatcher.js` — but against `VotingRollupV2`, and exposes them over HTTP so a
browser can play the voter.

**Layer 1 proving happens in the browser.** The witness containing the voter's secret is
built in the page and never crosses the wire; the server receives only `{proof,
publicSignals}`. That makes the privacy claim demonstrable rather than asserted. (Provisioning
a simulated voter device does send credentials *outward* to the browser — the demo says so on
screen, because in a real deployment the voter would already hold them.)

## Layout

```
demo/
  server.js              express API + operator pipeline + fault injection
  sepolia.js             launcher for testnet mode (Windows-safe env setting)
  lib/chain.js           ethers wrapper: deploy/attach, submit, decode reverts, calldata
  lib/election.js        election parameters, voter credentials, forged registry
  lib/mempool.js         admission control, instrumented with per-check results
  lib/explorer.js        decoded blocks/txs/addresses + "what this reveals"
  tools/verifySepolia.js re-check the reference links before a viva
  sepolia-reference.json verified, already-mined public transactions
  public/                three-pane UI, client-side prover, attack console
  DEMO-SCRIPT.md         the presentation script
```

## Networks

| | `local` (default) | `sepolia` |
|---|---|---|
| Node | `npx hardhat node` | Alchemy, from `.env` |
| Batch latency | ~2 s | ~15 s (one block) |
| Cost | none | ~0.001 ETH per batch |
| Etherscan links | — | on every transaction |
| Unauthorised-caller tests | broadcast | simulated via `eth_call` |

Sepolia mode reuses the election in `sepolia-v2-addresses.json` when it is still
pristine, and refuses to start when it is not — the operator's tally tree begins empty,
so a contract whose `stateRoot` has advanced would fail every batch proof on
`preStateRoot`. `SEPOLIA_DEPLOY=1` deploys a fresh one (~0.02 ETH, ~2 min).

## Real public-chain evidence

`sepolia-reference.json` holds three verified transactions from the 20 March 2026
deployment, surfaced in the L1 pane **in every mode** — so even a fully local run can
point at public Ethereum without spending anything:

| | |
|---|---|
| [Batch of 16 votes](https://sepolia.etherscan.io/tx/0x87c9fc1ead7d73c6c9a93de99f745a92cb4e120d324977d72c44e28d0b42c0d8) | 653,707 gas · 40,857/vote · 1,156 B calldata |
| [Deployment](https://sepolia.etherscan.io/tx/0x76f0e3e2996d19c55404a9c014399ef76319cef560c6da71a85a385aced0920b) | 794,594 gas |
| [End voting](https://sepolia.etherscan.io/tx/0xaece2e3793d99a218f17f97d8cc76aedd09cd0b3965524b0eeb3ab3f39e4275b) | 34,383 gas |

That batch's `postStateRoot` is bit-identical to the local 16-vote run. Re-verify before
presenting with `node demo/tools/verifySepolia.js`.

The demo also adds `contracts/DemoBaselines.sol` (`PerVoteZKBallot`, `PlainBallot`) — the two
RQ3 comparators, deliberately sharing the rollup's storage pattern so the only difference
between the three gas figures is how much verification happens per vote.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/election` | public parameters, roster, addresses, circuit stats |
| `GET` | `/api/voter/:i/credentials` | provision a simulated voter device |
| `GET` | `/api/attack/forged-registry` | credentials for a self-registered rogue voter |
| `POST` | `/api/vote` | submit `{proof, publicSignals, maliciousOperator}` |
| `POST` | `/api/prefill` | generate real ballots server-side to fill a batch |
| `GET` | `/api/state` | mempool, operator tallies, chain state, batch history |
| `POST` | `/api/batch` | assemble → prove → submit, with optional operator faults |
| `POST` | `/api/baselines/measure` | replay settled votes through both comparators |
| `POST` | `/api/observer/verify` | re-verify a batch from chain calldata alone |
| `GET` | `/api/sepolia-reference` | verified public-chain transactions |
| `GET` | `/api/explorer/overview` | blocks, transactions, contracts |
| `GET` | `/api/explorer/tx/:hash` | decoded transaction + what it discloses |
| `GET` | `/api/explorer/address/:addr` | code size, balance, live contract state |
| `POST` | `/api/lifecycle/end-voting` | admin closes the election |
| `POST` | `/api/attack/end-voting-nonadmin` | expect `"Only admin"` |
| `POST` | `/api/attack/deploy-zero-verifier` | expect `"...cannot be zero"` |
| `POST` | `/api/attack/replay-batch` | expect `"Invalid batch state proof"` |
| `POST` | `/api/reset` | redeploy a fresh election |

Batch faults, passed as `{"attacks": {...}}` to `/api/batch`:

```json
{ "censorIndex": 0,
  "swapCandidate": { "index": 0, "to": 4 },
  "inflateTally": { "extra": 1 },
  "tamperProof": true }
```

## Two attacks that succeed

The demo ends on these deliberately; both are in DEMO-SCRIPT.md Act 7.

- **Censorship** — the operator drops a vote, the batch proof still verifies. Integrity holds,
  liveness does not. Already documented as Design Challenges / forced inclusion.
- **Ballot re-routing** — the operator sends a ballot to a different candidate and the batch
  still proves, because `BatchStateUpdate` binds only the nullifier set into
  `batchNullifierHash`, and `_spotCheckVoteProofs` never checks that a sampled proof's ballot
  is the one the batch applied. This one was found by building the demo; the suggested fix is
  a ballot commitment as a fifth public signal.
