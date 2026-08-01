# ZKER — Live Demonstration Script

A ~20 minute demonstration of the two-layer ZK-rollup voting system, structured so that
every claim in the dissertation is *shown* rather than asserted.

All figures in this document were measured on the local Hardhat node during development.
Yours will differ slightly in gas (never) and timing (yes) but not in outcome.

---

## 0. Setup

Three terminals, in this order. Steps 1–2 take ~15 s; leave them running.

```bash
npx hardhat node
```

```bash
node demo/server.js
```

Then open <http://localhost:4000>.

The server auto-deploys a fresh election on start-up and on every **Reset election**, so the
demo is repeatable: the same click sequence always produces the same state roots.

**Prerequisites** (already satisfied in this repo): compiled circuits in `build/vote_proof/`
and `build/batch_state/`, and `npx hardhat compile` run at least once. If the server exits
complaining about missing artifacts, it prints exactly which ones.

**Optional knobs**

| Variable | Default | Effect |
|---|---|---|
| `SPOT_CHECK_COUNT` | `2` | how many individual proofs L1 verifies per batch |
| `DEMO_PORT` | `4000` | UI port |
| `DEMO_NETWORK` | `local` | `sepolia` submits to the public testnet instead |
| `SEPOLIA_DEPLOY` | unset | `1` forces a fresh Sepolia deployment |

### Running against real Ethereum

```bash
npm run demo:sepolia
```

Reads `ALCHEMY_URL` and `PRIVATE_KEY` from `.env`. Everything works the same, but
every transaction gets a real Etherscan page and the UI shows a **View on Etherscan**
button on each one.

What changes on Sepolia:

- **A batch takes ~15 s instead of ~2 s** — proving is unchanged, but you wait a block.
- **Each batch costs roughly 0.001 ETH**; a fresh five-contract deployment about 0.02 ETH.
- **Unauthorised-caller scenarios are simulated with `eth_call`** rather than broadcast.
  There is only one funded key, and a transaction destined to revert still costs gas and
  a block of waiting. The revert reason is identical — it comes from the same `require`.
  The UI labels these "simulated via eth_call".
- **A failure that is *not* a protocol rejection is labelled as such.** An empty wallet or
  an RPC timeout will not light up the defence ladder, because it proves nothing.

The demo refuses to start if the deployed contract is not in its initial state, rather
than failing confusingly mid-demo — the operator's tally tree starts empty, so a contract
whose `stateRoot` has already advanced would make every batch proof fail on `preStateRoot`.
If you see that message, deploy a fresh election:

```bash
set SEPOLIA_DEPLOY=1 && npm run demo:sepolia
```

**You do not need Sepolia to show real Ethereum.** See Act 5b — three verified,
already-mined transactions are linked from the **Ledger · L1** page in every mode, including local.

---

### Where things live

The UI is a left-nav dashboard. Six pages, and a top bar plus defence ladder that stay
pinned across all of them.

| Page | Holds |
|---|---|
| **Voter Terminal** | identity, ballot, private/public witness split, proof console |
| **Operator Console** | what the operator cannot see, batch controls, pipeline, operator-side faults |
| **Mempool** | pending ballots, admission checks, running tally |
| **Ledger · L1** | contract state, batches, gas comparison, Sepolia links, observer, lifecycle |
| **Block Explorer** | decoded transactions and what each one discloses |
| **Attack Panel** | voter-side fault selector, contract-level attacks, scenario catalogue |

---

## The mental model to establish first

Say this before touching anything. It is the frame the whole demo hangs on:

> There are three parties on screen, and they are three *different trust domains*. The
> **Voter Terminal** is the voter's own device. **Operator Console** is an off-chain
> operator I do not have to trust. **Ledger** is Ethereum, which is the only thing anybody
> has to trust. Watch what crosses each boundary — the top bar and the defence ladder at
> the foot of the page stay pinned, so you can follow state across all three.

---

## Act 1 — One voter, one proof  (3 min)

| Do | Say | Watch for |
|---|---|---|
| Click **Voter 1** in the identity list, then **Grace Hopper** | "This is one voter's device." | both witness boxes fill in |
| Point at the amber **Private — stays here** card | "The secret and the ten Merkle path elements. These are the witness. They never leave this tab." | `voterSecret`, `10 sibling hashes (hidden)` |
| Point at the green **Public** box | "This is everything the outside world gets: a nullifier, a candidate, a vote, and the two public parameters." | five signals |
| Click **Generate & submit proof** | "6,179 constraints, proved in the browser with snarkjs' WASM prover." | stage bar runs, then a confirmation dialog with the nullifier and the eight proof elements |

**The line to land:** *the proof is 8 field elements — about 256 bytes — and it will still be
256 bytes in Act 3 when it carries sixteen votes.*

---

## Act 2 — What the operator knows  (2 min)

Switch to **Operator Console**, then **Mempool**. Do not rush past this.

| Do | Say | Watch for |
|---|---|---|
| On **Operator Console**, point at **What the operator cannot see** | "It knows *a* ballot for Grace Hopper exists and that it came from *some* registered voter. It cannot tell you which of the sixteen." | struck-through list |
| Switch to **Mempool**, point at **Admission checks** | "The operator verified the proof itself — 287 ms — before accepting anything." | six green ticks |

Those two cards are RQ2 in two screenshots. Both are worth keeping for the thesis.

Now cast **two or three more** votes as different voters — each takes about a second — so
the mempool has some content.

---

## Act 3 — Batching  (3 min)

A batch of 3 makes a poor gas story (the fixed verification cost has nothing to amortise
against). Fill the batch first:

| Do | Say | Watch for |
|---|---|---|
| On **Operator Console**, click **Fill with simulated devices** | "Filling the remaining slots with simulated devices — these are real proofs, generated the same way; I'm just not clicking sixteen times." | mempool 16 / 16 |
| Click **Assemble batch & submit to L1** | "One state transition, one proof, one transaction." | ~1.6 s of proving |

Read the step list out loud as it lands:

```
✓ collect from mempool                      16 vote(s) taken
✓ assemble state transitions                2154579143…7152 → 8240366879…9753
✓ generate batch proof (100,116 constraints)  1.59 s → 8 field elements (~256 bytes)
✓ operator self-check (snarkjs verify)      verify → true
✓ submit to Ethereum L1                     1,099,749 gas · 68,734 gas/vote · 2 spot-checked
```

**The line to land:** *sixteen votes, 100,116 constraints, and the thing that goes on chain
is still 256 bytes.*

---

## Act 4 — What it cost  (2 min)

| Do | Say | Watch for |
|---|---|---|
| On **Ledger · L1**, click **Measure baselines** | "Now the same sixteen ballots through two comparators: one Groth16 verification per vote, and a completely public non-ZK ballot." | three bars |

Measured at batch = 16:

| Path | Gas / vote | |
|---|---:|---|
| ZK rollup | **68,734** | private, batched |
| per-vote ZK | 291,806 | private, unbatched — **4.2× dearer** |
| non-ZK public ballot | 62,188 | no privacy at all |

**The honest reading, and the better line than a simple win:**

> Batching buys back 76% of the cost of doing zero-knowledge on chain. What's left is a
> ~10% premium over publishing every ballot in the clear. Privacy costs about a tenth of a
> ballot — that is the actual answer to RQ3, and it's a stronger claim than "ZK is cheaper",
> because it's the one an election commissioner would have to sign off on.

If you have time, show the curve by re-running with a smaller batch: at n=3 the rollup costs
266,201 gas/vote and barely beats per-vote ZK. The fixed verification cost is the whole story
and batch size is the only lever. That is the Hardhat sweep of the thesis, live.

---

## Act 5 — Public verifiability  (2 min)

The strongest three minutes available to you. Do not skip it.

| Do | Say | Watch for |
|---|---|---|
| On **Ledger · L1**, click **Independently verify latest batch** | "This path talks to the node, not to my operator. It pulls the raw calldata back off chain, rebuilds the public signals from the emitted event, and re-runs `groth16 verify` against the published verification key." | four green ticks |

```
✓ fetch calldata from the node        1,988 bytes from block 18
✓ read BatchSubmitted event           batch 0: 2154579143…7152 → 8240366879…9753, 16 votes
✓ reconstruct public signals          [preStateRoot, postStateRoot, batchNullifierHash, voterMerkleRoot]
✓ snarkjs groth16 verify              OK! in 7 ms — no trust in the operator required
```

**The line to land:** *nobody in this room has to trust me, or my operator. 1,988 bytes of
public calldata and 7 milliseconds is the entire audit.*

---

## Act 5b — The same thing, on public Ethereum  (1 min)

The obvious objection to everything so far is *"that's your own laptop."* Answer it
immediately, with the **On public Ethereum** card on the **Ledger · L1** page. These are real,
already-mined Sepolia transactions from 20 March 2026 — no network dependency at demo
time beyond opening a link, and nothing to spend.

| Do | Say |
|---|---|
| Click the **submitBatch** Etherscan link | "Same contract, same circuits, public Ethereum. Sixteen ballots, one transaction." |

| | Sepolia, 20 Mar 2026 |
|---|---|
| Batch transaction | [`0x87c9fc1e…b42c0d8`](https://sepolia.etherscan.io/tx/0x87c9fc1ead7d73c6c9a93de99f745a92cb4e120d324977d72c44e28d0b42c0d8) |
| Block | 10,484,638 |
| Votes | 16 |
| Gas | 653,707 → **40,857 per vote** |
| Calldata | 1,156 bytes |
| Contract | [`0x69FA7d7E…7aD04e`](https://sepolia.etherscan.io/address/0x69FA7d7Ef06351da557197d50e1505aeF97aD04e) |

**The strongest single fact available to you:** that transaction's `postStateRoot` is
`8240366879…3522789753` — **bit-identical** to the local 16-vote run in Act 3. The same
sixteen ballots produce the same commitment on your laptop and on public Ethereum. That
is reproducibility you can point at, not claim.

Two caveats worth stating rather than hiding:

- That deployment used `spotCheckCount = 0`, which is why 40,857 gas/vote beats the 68,734
  measured locally with two spot-checks. Same code, different assurance setting — and the
  difference *is* the price of on-chain spot-checking.
- Voting on that contract has ended, so it is a finished artifact. Live Sepolia demoing
  needs a fresh deployment (see Setup).

Re-verify the links before the viva — a dead Etherscan link on the projector is worse
than none:

```bash
node demo/tools/verifySepolia.js
```

---

## Act 6 — Adversarial act  (7 min)

Open **Attack Panel**. The defence ladder pinned at the foot of every page now earns its
place, and the scenario catalogue on this page is your cheat sheet. Frame it once:

> An attack dies at the lowest rung that can catch it, and the lower it dies the stronger the
> guarantee. Watch which rung lights up.

### 6a. Four attacks that die in mathematics — L0  (2 min)

On **Attack Panel**, pick a **Voter-side fault** — the hint tells you which rung it should
die at — then **Arm & go to Voter Terminal** and click **Attempt proof**. Nothing is sent;
the request never reaches the network.

| Fault | Circuit line | Constraint |
|---|---|---|
| Non-binary vote (vote = 2) | `VoteProof.circom:73` | `vote * (1 - vote) === 0` |
| Out-of-range candidate (= 7) | `VoteProof.circom:80` | `candidateCheck.out === 1` |
| Ineligible voter | `VoteProof.circom:62` | `computedHash[voterLevels] === voterMerkleRoot` |
| Forged nullifier | `VoteProof.circom:69` | `nullifierHasher.out === nullifierHash` |

Do at least the first and the third. The error names the exact line of the circuit.

**The line to land — this is the single most important sentence in the demo:**

> Nothing rejected that ballot. There is no rejection. The prover was asked to produce a
> witness for a false statement and there isn't one. An invalid vote in this system is not
> refused — it is *unrepresentable*.

### 6b. Two attacks that survive the circuit and die at Ethereum — L3  (2 min)

These produce **genuinely valid** Groth16 proofs. The circuit has nothing to object to; only
the chain knows which election and which voter registry are the real ones.

| Do | Result |
|---|---|
| Fault = **Cross-election replay**, tick **Malicious operator**, prove & send | operator flags it, forwards anyway |
| **Fill** with count 3, then **Assemble batch** | reverts `"Vote proof election ID mismatch"` |
| Reset. Fault = **Self-registered voter**, **Malicious operator** on, prove & send, **Fill** with count 2, batch | reverts `"Vote proof merkle root mismatch"` |

Say: *"the proof is real. The operator is complicit. Ethereum still says no."*

Note the step the UI prints about reordering — **spot-checking is a sampling defence.** With
`spotCheck = 2` of 16, an unmoved malicious ballot escapes checking with probability 0.88.
The demo moves it into the window and tells you so. That honesty is itself a finding worth a
sentence in the thesis: on-chain spot-checking bounds an attacker's *expected* gain, it does
not eliminate it.

### 6c. Double voting, twice over — L2 and L3  (2 min)

Two independent defences. Show both; the contrast is the point.

| Do | Dies at | Result |
|---|---|---|
| Voter 1 votes. Voter 1 votes again (**Malicious operator** on). Batch. | **L2** | batch proof generation fails at `BatchStateUpdate.circom:104` — `duplicateAndReal[pairIdx] === 0` |
| Reset. Voter 1 votes, batch settles. Voter 1 votes again (**Malicious operator** on), batch. | **L3** | reverts `"Duplicate nullifier"` |

Say: *"same attack, two batches apart, caught by two completely different mechanisms — a
pairwise circuit constraint and an on-chain registry. Neither alone is sufficient: the
circuit can't see previous batches, and the chain can't see inside one."*

### 6d. A dishonest operator — L2  (1 min)

| Do | Result |
|---|---|
| Open **Operator-side faults**, tick **Inflate the tally**, batch | blocked at `BatchStateUpdate.circom:68` — `stateNewValues[i] === stateOldValues[i] + votes[i] * (1 - isNoOp[i])` |
| Tick **Tamper with the batch proof** instead, batch | reverts `"Invalid batch state proof"` |

Say: *"the operator cannot inflate a tally even in private. It can't build the witness. It
can lie to me; it cannot lie to the constraint system."*

### 6e. Contract guards — L3  (30 s)

Four buttons, four reverts. Run them as a rapid-fire block:

| Button | Revert |
|---|---|
| **End voting as non-admin** | `"Only admin"` |
| **Deploy with zero verifier** | `"VoteVerifier address cannot be zero"` |
| **Replay latest batch** | `"Invalid batch state proof"` |
| **End voting (admin)**, then **Assemble batch** | `"Voting not active"` |

The replay one is worth a beat: it does **not** fail on the nullifier registry as you might
expect. `preStateRoot` is read from the contract's *current* `stateRoot`, which has already
advanced, so state-root chaining rejects the replay before the registry is ever consulted.
Two independent defences again, and the outer one fires first.

---

## Act 7 — The two attacks that succeed  (2 min)

**End on these.** Demonstrating the limits of your own system is worth more in a viva than
any number of successes, and both of these are already positions your thesis takes — one
explicitly, one that this demo discovered.

### 7a. Censorship — the known gap

| Do | Result |
|---|---|
| Reset, **Fill** count 5, tick **Censor vote #0**, batch | **accepted.** 5 votes in, 4 counted. Candidate 0's tally is 0. |

The batch proof verifies. The chain is happy. The ladder lights up **⚠ Not caught**.

Say: *"integrity held perfectly and the vote is still gone. The operator has liveness power,
exactly as Section 1.6 says, and forced inclusion is the mitigation I left as future work.
This is the demo of a limitation, not a bug."*

### 7b. Ballot re-routing — a finding this demo surfaced

| Do | Result |
|---|---|
| Reset, **Fill** count 5 (candidates 0,1,2,3,4), tick **Re-route vote #0 → candidate 4**, batch | **accepted.** Tally becomes `{0:0, 1:1, 2:1, 3:1, 4:2}` |

The re-routed ballot was even *spot-checked* on chain — its public signals say `candidate=0`
while the state transition applied `candidate=4`, and the contract accepted both.

**Why:** `BatchStateUpdate` takes `candidates[]` and `votes[]` as *private* inputs and binds
only the nullifier set into `batchNullifierHash`. Nothing ties a ballot in the Layer-2 state
transition to the Layer-1 proof that authorised it, and `_spotCheckVoteProofs` verifies that
each sampled proof is valid without checking that its ballot is the one the batch applied.

**The fix to state in the thesis** (as analysis, not implementation): commit to the ballots,
not just the nullifiers — e.g. make the batch circuit compute
`ballotCommitment = Poseidon(η₀, c₀, v₀, …)` over the same tuples, expose it as a fourth
public signal, and have the contract recompute it from the spot-checked public signals.
Equivalently, bind each `nullifierList[i]` to its `(candidate, vote)` on chain.

Say: *"I found this by building the adversarial demo rather than by reading the circuit, which
is itself an argument for adversarial demonstration as a verification technique."*

---

## Verified scenario catalogue

Everything below was executed against the local node during development. Use this as the
source table for the thesis's adversarial-testing section.

| # | Scenario | Injected where | Dies at | Observed outcome |
|---|---|---|---|---|
| 1 | Non-binary vote | browser | **L0** | witness fails, `VoteProof.circom:73` |
| 2 | Out-of-range candidate | browser | **L0** | witness fails, `VoteProof.circom:80` |
| 3 | Ineligible voter | browser | **L0** | witness fails, `VoteProof.circom:62` |
| 4 | Forged nullifier | browser | **L0** | witness fails, `VoteProof.circom:69` |
| 5 | Tampered proof (`pi_a[0]+1`) | browser | L1 | `snarkjs verify → false` |
| 6 | Tampered public signal | browser | L1 | `snarkjs verify → false` |
| 7 | Tampered proof, operator complicit | browser + operator | **L3** | `"Invalid individual vote proof"` |
| 8 | Cross-election replay | browser | L1 → **L3** | `"Vote proof election ID mismatch"` |
| 9 | Self-registered voter registry | browser | L1 → **L3** | `"Vote proof merkle root mismatch"` |
| 10 | Double vote, same batch | browser | **L2** | batch witness fails, `BatchStateUpdate.circom:104` |
| 11 | Double vote, later batch | browser | **L3** | `"Duplicate nullifier"` |
| 12 | Operator inflates tally | operator | **L2** | batch witness fails, `BatchStateUpdate.circom:68` |
| 13 | Operator tampers batch proof | operator | **L3** | `"Invalid batch state proof"` |
| 14 | Replay an accepted batch | chain | **L3** | `"Invalid batch state proof"` (state-root chaining) |
| 15 | Batch after voting closed | chain | **L3** | `"Voting not active"` |
| 16 | Non-admin ends voting | chain | **L3** | `"Only admin"` |
| 17 | Deploy with zero verifier | chain | **L3** | `"VoteVerifier address cannot be zero"` |
| **A** | **Operator censors a vote** | operator | **none** | accepted; vote silently absent |
| **B** | **Operator re-routes a ballot** | operator | **none** | accepted; tally altered |

L0 = voter circuit · L1 = operator admission · L2 = batch circuit · L3 = Ethereum

---

## Measured figures

| Quantity | Value |
|---|---|
| `VoteProof` | 6,179 constraints · 21 private / 5 public inputs · zkey 2.64 MB |
| `BatchStateUpdate` | 100,116 constraints · 192 private / 4 public inputs · zkey 42.57 MB |
| Layer-1 proving (browser, WASM) | ~0.31 s |
| Layer-2 proving (server, WASM) | ~1.6 s per 16-vote batch |
| Proof size, either layer | 8 field elements ≈ 256 bytes |
| Batch calldata on chain | 1,988 bytes |
| Independent verification | ~7 ms |
| Gas, batch = 16 | 1,099,749 total · **68,734 / vote** |
| Gas, batch = 8 | 914,441 total · 114,305 / vote |
| Gas, batch = 3 | 798,604 total · 266,201 / vote |
| Gas, per-vote ZK baseline | ~291,806 / vote |
| Gas, non-ZK public ballot | ~62,188 / vote |

**Caveat to state in the thesis:** `PlainBallot` is deliberately minimal — a nullifier flag
and a tally increment, nothing else. It is a *floor*, and therefore a harsher comparator than
the non-ZK baseline used in the Sepolia measurements. The rollup coming out ~10% above it is
a stronger, more defensible framing than a headline saving against a heavier baseline.

---

## Timing

| Act | Minutes |
|---|---|
| 1 · one voter, one proof | 3 |
| 2 · what the operator knows | 2 |
| 3 · batching | 3 |
| 4 · what it cost | 2 |
| 5 · public verifiability | 2 |
| 5b · the same thing on public Ethereum | 1 |
| 6 · adversarial | 7 |
| 7 · the two that succeed | 2 |
| | **22** |

Trim Act 6e first (contract guards — they are the least surprising), then Act 4's batch-size
curve. Never trim Act 5 or Act 7.

---

## Practical notes

- **Record it beforehand.** Live cryptography on projector-room wifi is a bad bet. Everything
  here is local, but the laptop still has to cooperate.
- **The batch proof takes ~1.6 s.** Fill it by narrating what the operator cannot see.
- **Reset between attack scenarios.** The button redeploys the contracts and clears
  everything; it takes about a second.
- **A failed batch rolls back.** Votes return to the mempool and the state tree is restored,
  so a demonstrated attack does not cost you the ballots you cast by hand.
- **The prefill endpoint is a stage aid, and say so.** Those are real proofs; the only
  shortcut is who ran the prover.
- **If a proof seems slow the first time**, it's the 2.64 MB zkey downloading. Cast one
  throwaway vote before the audience arrives.

---

## Mapping to the dissertation

| Demo act | Section it evidences |
|---|---|
| 1, 2 | §1.4 System Model · §5.2 anonymity — RQ2 |
| 3 | §4.3 Off-Chain Rollup Operator |
| 4 | §5.2 Performance Evaluation — RQ3 |
| 5 | §5.4 public verifiability |
| 6a | Table: circuit- and proof-level guarantees |
| 6b–6e | Table: contract-level adversarial tests (adds scenarios 7–9, 14) |
| 7a | §1.7 Design Challenges — operator censorship |
| 7b | **new** — L1↔L2 binding gap; belongs in Limitations and Future Work |

Scenarios 5–9 and 14 are not currently in either adversarial table. They are cheap additions
and they strengthen the section, because each one is caught by a *different* guard.
