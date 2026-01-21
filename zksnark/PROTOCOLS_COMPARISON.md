# Protocols comparison — Schnorr vs Groth16 (SNARK)

This document compares two protocols demonstrated in this repository:
- `schnorr.js` — a simple Schnorr identification-style protocol implementation
- `snark.js` — a Groth16 SNARK example (using `snarkjs`)

Use this note to understand definitions, how each protocol is used in practice, their security/utility trade-offs, and when to prefer one over the other.

---

## 1. Short definitions

- **Schnorr (identification / signature family)**  
  A cryptographic protocol that enables a prover to demonstrate knowledge of a discrete-log secret (private key) without revealing it. It is interactive in its classical form (commitment → challenge → response), and can be converted to a non-interactive proof via Fiat–Shamir. See `schnorr.js` for a tiny worked example of the commitment-challenge-response flow.

- **Groth16 (zk-SNARK)**  
  A succinct non-interactive argument of knowledge built for arithmetic circuits. Groth16 proofs are very small and fast to verify but require a (circuit-specific) trusted setup. `snark.js` in this repo demonstrates generating a witness, producing a Groth16 proof and verifying it with `snarkjs`.

- **STARK (zk‑STARK)**  
  A transparent (no trusted setup) proof system based on collision‑resistant hash functions and polynomial IOPs. STARKs provide arguments for arithmetic/Boolean computations with a focus on transparency and post‑quantum safety. See `stark.py` for a small illustrative example (requires a STARK library/runtime).
 
- **Bulletproofs**  
  A family of non‑interactive zero‑knowledge proofs built from Pedersen commitments and inner‑product arguments. Bulletproofs are transparent (no trusted setup) and are commonly used for range proofs and confidential transactions; they support proof aggregation to reduce total size. See `bulletproof.py` for a minimal Pedersen commitment + range proof example.

- **Fiat–Shamir transform**  
  A generic technique to convert an interactive sigma protocol (commitment → challenge → response) into a non‑interactive proof by replacing the verifier's random challenge with a deterministic hash of the commitment and public context (the random oracle heuristic). See `fiatsharmir.py` for a simple demonstration of turning Schnorr-style identification into a non‑interactive flow using hashing.

---

## 2. How they work (high level)

- **Schnorr (example in `schnorr.js`)**
  - Prover chooses random `r`, computes commitment `t = g^r`.
  - Verifier returns random challenge `e`.
  - Prover returns response `s = r + e·x` (mod group order).
  - Verifier checks `g^s ?= t * y^e`. If equal, the prover knows `x`.
  - The file `schnorr.js` shows key generation, commitment, response and a rejected-proof case.

- **Groth16 SNARK (example in `snark.js`)**
  - Start with a circuit describing the relation (e.g., `a + b = out`).
  - Compile the circuit to WASM and R1CS, generate a witness from inputs.
  - Perform a trusted setup (phase 1 + phase 2) to produce a proving key (`.zkey`) and verification key.
  - Use the proving key and witness to produce a compact proof (Groth16).
  - Verifier uses verification key and public signals to check the proof. `snark.js` shows the prove/verify calls with `snarkjs`.

---

## 3. Security properties

- **Schnorr**
  - Security based on the discrete logarithm assumption in the chosen group.
  - Zero-knowledge in the sense of identification: the verifier learns nothing beyond the fact that the prover knows the secret.
  - No trusted setup is needed.
  - Not immediately suitable for proving general circuit properties (it's for statements like "I know x such that y = g^x").

- **Groth16 SNARK**
  - Soundness and zero-knowledge under pairing-based assumptions (elliptic curve pairings).
  - Requires a trusted setup: if the ceremony is compromised an attacker may forge proofs for that circuit.
  - Extremely succinct proofs and very fast verification even for large circuits.
  - Can express arbitrary arithmetic circuits (general statements).

- **STARK**
  - Transparent: no trusted setup is required.
  - Security relies on collision‑resistant hashes and probabilistic checks (interactive oracle proofs converted to non‑interactive via Fiat–Shamir).
  - Tend to produce larger proofs than Groth16 (kilobytes) but are considered post‑quantum resistant (hash‑based assumptions).
  - Very scalable: STARK constructions are designed to handle large computations efficiently (in prover parallelism and prover amortization).
 
- **Bulletproofs**
  - Transparent: no trusted setup.
  - Security based on discrete-log / inner-product arguments (elliptic curve assumptions).
  - Well suited for range proofs and confidential transactions; proofs are compact and can be aggregated.
  - Proof sizes are typically larger than Groth16 (hundreds of bytes to a few KB), and verification cost is moderate but aggregation reduces overhead.

- **Ring Signatures**
  - Provide signer anonymity within a set (the "ring") — verifier can confirm a ring member signed but cannot tell which one.
  - Security relies on discrete-log assumptions (elliptic curve groups in common implementations).
  - Basic ring signatures are unlinkable (multiple signatures by same signer cannot be linked); some variants (linkable ring signatures) intentionally provide linkability (e.g., to prevent double-spending).
  - No trusted setup required.

---

## 4. Pros / Cons summary

### Schnorr
- Pros:
  - Simple, minimal cryptographic assumptions (DL).
  - No trusted setup.
  - Low computational and implementation complexity for identification/signature tasks.
  - Interactive protocol can be made non-interactive by Fiat–Shamir for many use cases.
- Cons:
  - Not a general-purpose proof system for arbitrary computation.
  - Proof size and expressiveness limited to statements expressible as discrete-log relations.

### Groth16 (SNARK)
- Pros:
  - Succinct proofs (tiny size) and very fast verification.
  - Expressive: can prove any relation expressible in arithmetic circuits.
  - Widely used in privacy-preserving systems that need compact proofs.
- Cons:
  - Requires a (per-circuit) trusted setup; if compromised, security fails.
  - Prover work can be heavy (witness generation + proof creation).
  - More complex toolchain (circuit compiler, ptau files, zkey management).

### STARK
- Pros:
  - No trusted setup (transparent ceremony).
  - Based on hash assumptions — better post‑quantum security than pairing/DL‑based systems.
  - Designed for large-scale computations and rollups where prover parallelism and auditability matter.
- Cons:
  - Proofs are larger (kilobytes rather than hundreds of bytes).
  - Prover costs can be high; toolchain and implementations are more specialized.
  - Verification, while efficient, can be heavier than Groth16 in some metrics (proof size and on‑chain cost tradeoffs).

---

## 5. Practical trade-offs and when to use which

- Use **Schnorr** when:
  - You only need to prove knowledge of a key or sign/identify (authentication, signatures).
  - You want minimal setup and low complexity.
  - You do not need to prove large or general computations.

- Use **Groth16 SNARK** when:
  - You need to prove correctness of arbitrary computations without revealing inputs (complex, privacy-preserving statements).
  - You need very small proofs and fast verification (on-chain verification, constrained verifiers).
  - You can accept the deployment and ceremony complexity (or use a universal/ceremony approach and publish trusted artifacts).
 
- Use **STARK** when:
  - You need transparency (no trusted setup) and stronger post‑quantum assumptions.
  - You target very large computations where STARK prover scalability and batching amortization pay off (e.g., rollups, data‑availability proofs).
  - You accept larger proof sizes in exchange for transparency and hash‑based assumptions.
 
- Use **Bulletproofs** when:
  - You need transparent range proofs or commitment proofs (confidential transactions, confidential tallies).
  - You want no trusted setup and need compact per‑proof sizes with aggregation options.
  - You accept somewhat higher verification cost compared to Groth16 in exchange for transparency and aggregation benefits.

- Use **Ring Signatures** when:
  - You need signer-anonymous signatures where a verifier should verify membership but not the specific signer (anonymous authentication, privacy-preserving broadcasting).
  - You want no trusted setup and acceptable signature/verification costs similar to standard EC signatures.
  - Consider linkable variants when you need to prevent double-signing (e.g., in e-cash or cryptocurrency contexts).

---

## 6. Notes and references to this repo

- `schnorr.js`:
  - Small, self-contained Schnorr-style example showing commit/challenge/response and verification, plus a negative test where the response is computed with a wrong key.
  - Useful to learn the identification flow and how responses are checked.

- `snark.js`:
  - Demonstrates the minimal JavaScript workflow for Groth16 with `snarkjs`: prepare input, generate witness using the compiled circuit WASM, produce a proof using a `.zkey`, and verify using `verification_key.json`.
  - Complemented by the supporting scripts in the repo (`setup.ps1`, `generate_ptau.ps1`, `circuit.circom`) that handle circuit compilation and trusted-setup steps.

- `stark.py`:
  - A small demonstration file showing a toy STARK-style workflow (compile a simple arithmetic relation, produce and verify a STARK proof). The example depends on a STARK runtime/library; it highlights that STARK proofs are produced and verified differently from pairing‑based SNARKs and that no ptau/zkey ceremony is required.
 
- `bulletproof.py`:
  - Demonstrates generating a Pedersen commitment and a range proof using a Bulletproofs library. Useful to learn commitment construction, range proof generation, and verification without a trusted setup.

- `ringsignature.py`:
  - Demonstrates a simple ring-signature-like flow: creating multiple keypairs, producing a ring-style signature, and verifying membership without exposing which member signed. Useful to study signer anonymity patterns and trade-offs (unlinkability vs linkability).

---

## 7. Practical warnings & recommendations

- For any real deployment of SNARK-based proofs:
  - Carefully manage the trusted setup artifacts (ptau, `.zkey` files). Prefer widely audited ceremony outputs or universal setups.
  - Publish verification keys and proofs in a way that third parties can validate.

- For Schnorr-based schemes:
  - Choose secure groups (large prime/modulus or elliptic curves).
  - Use good randomness and resist side-channel leakage for secret keys.

---

## 8. Quick comparison table

| Feature | Schnorr | Groth16 SNARK | STARK | Bulletproofs |
|---|---:|---:|---:|---:|
| Primary purpose | Identification / signatures | Succinct proofs for general circuits | Transparent proofs for large computations | Range and inner-product proofs (confidential transactions) |
| Trusted setup required | No | Yes (per-circuit) | No (transparent) | No (transparent) |
| Proof size | Small (group elements) | Very small (~200-300 bytes typical) | Larger (KBs — depends on construction) | Small–medium (hundreds bytes to KBs) |
| Verification cost | Low | Very low (pairing ops) | Low–moderate (hash/IOP based) | Moderate (scales with proof complexity) |
| Prover cost | Very low | Medium–high | High (but parallelizable / scalable) | Moderate–high (depends on statement) |
| Expressiveness | Limited (DL relations) | Arbitrary arithmetic circuits | Arbitrary arithmetic/Boolean circuits | Range, arithmetic relations, inner-product; can be building block for other proofs |
| Post-quantum? | No (DL-based) | No (pairing-based) — not post-quantum | Yes (hash-based assumptions) | No (EC DLP-based) |
| When to choose | Authentication, signatures, simple ZK | On‑chain verification, general-purpose ZK, privacy-preserving computations | Transparent rollups, post-quantum needs, very large proofs/tasks | Confidential transactions, range proofs, aggregated proofs without trusted setup |

---

## 9. Further reading
- Schnorr identification and signatures — original papers and modern treatments (look for Schnorr signature papers).
- Groth16 paper: Jens Groth, "On the Size of Pairing-Based Non-interactive Arguments" (Eurocrypt 2016).
- `snarkjs` documentation and Circom docs for practical circuit construction and setup details.

---

If you want, I can:
- Add example diagrams to this file, or
- Expand the Groth16 section with a step-by-step checklist of artifacts you need (`ptau`, `circuit.wasm`, `circuit.r1cs`, `circuit_0000.zkey`, `verification_key.json`), or
- Create a short appendix that maps file names in this repo to each step in the SNARK setup/prove/verify pipeline.

