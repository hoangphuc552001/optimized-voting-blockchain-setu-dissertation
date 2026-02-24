# Circom + Groth16 Zero-Knowledge Proof Tutorial

## Overview

This tutorial demonstrates how to create Zero-Knowledge Proofs (ZKP) using **Circom** (a circuit compiler) and **Groth16** (a zk-SNARK proof system). By the end, you'll understand every component and file generated in the ZKP workflow.

---

## Table of Contents

1. [What is Zero-Knowledge Proof?](#what-is-zero-knowledge-proof)
2. [Key Components Explained](#key-components-explained)
3. [The Workflow](#the-workflow)
4. [Circuit Explanation](#circuit-explanation)
5. [Each File Generated Explained](#each-file-generated-explained)
6. [How to Run](#how-to-run)

---

## What is Zero-Knowledge Proof?

A **Zero-Knowledge Proof** allows one party (the **prover**) to convince another party (the **verifier**) that a statement is true **without revealing any information beyond the validity of the statement itself**.

### Real-World Analogy

Imagine you want to prove to a bouncer that you're over 21 without showing your ID or revealing your exact age. You could:
- Show the bouncer a sealed envelope containing your birth certificate
- The bouncer verifies the seal is unbroken (proof of authenticity)
- The bouncer knows you're over 21, but never sees your actual age

This is the essence of ZKP: **proving knowledge without revealing the knowledge**.

### Our Example

We'll prove that we know two numbers (a and b) whose product equals a public value (c) **without revealing what a and b are**.

For example:
- Public: `c = 21`
- Private (secret): `a = 3`, `b = 7`
- We prove: "I know two numbers that multiply to 21" without revealing 3 and 7

---

## Key Components Explained

### 1. Circom Circuit

**What it is:** A program that defines the computation you want to prove.

**Think of it as:** The "rules of the game" - what needs to be true for the proof to be valid.

**In our example:**
```
Given private inputs a, b and public input c
Prove: a * b == c
```

### 2. R1CS (Rank-1 Constraint System)

**What it is:** The circuit converted into a mathematical format that can be processed by zk-SNARKs.

**Think of it as:** The "blueprint" - a list of mathematical equations that must all be satisfied.

**Format:** Each constraint is in the form: `a * b + c = 0` (where a, b, c are linear combinations of variables)

### 3. QAP (Quadratic Arithmetic Program)

**What it is:** R1CS converted into a single polynomial equation.

**Why needed:** This allows the proof to be compact and fast to verify.

### 4. Trusted Setup

**What it is:** A one-time ceremony that generates the "proving key" and "verification key".

**Think of it as:** Creating a "secret lock" and "public key" pair.

**⚠️ Important:** The "toxic waste" (trapdoor) must be destroyed after setup. If someone keeps it, they can create fake proofs!

**Two phases:**
- **Phase 1 (Powers of Tau):** Generates common reference string (CRS) for any circuit size
- **Phase 2 (Circuit-specific):** Creates the actual keys for our specific circuit

### 5. Proving Key

**What it is:** Used by the prover to generate the proof.

**What it contains:** Cryptographic parameters that allow creating proofs without knowing the "toxic waste".

### 6. Verification Key

**What it is:** Used by the verifier to check the proof.

**What it contains:** Public parameters that can verify proofs were generated correctly.

### 7. Witness

**What it is:** The actual values (inputs) to the circuit.

**In our example:** `a = 3`, `b = 7`, `c = 21`

### 8. Proof

**What it is:** The generated zero-knowledge proof.

**What it contains:** Cryptographic data that proves the circuit was satisfied without revealing inputs.

### 9. Groth16 Protocol

**What it is:** A specific zk-SNARK construction (by Groth, 2016).

**Advantages:**
- Very small proof size (just 3 group elements)
- Fast verification time
- Most widely used in blockchain

**Disadvantages:**
- Requires trusted setup per circuit
- Not universal (circuit-specific)

---

## The Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ZKP PROOF WORKFLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │   CIRCOM     │  1. Write circuit in Circom DSL
    │   CIRCUIT    │     e.g., multiplier.circom
    └──────┬───────┘
           │ compile
           ▼
    ┌──────────────┐
    │     R1CS     │  2. Compile to R1CS (Rank-1 Constraint System)
    │    (json)    │     Contains all constraints
    └──────┬───────┘
           │ snarkjs
           ▼
    ┌──────────────┐
    │     QAP     │   3. Transform to QAP (Quadratic Arithmetic Program)
    └──────┬───────┘
           │
           ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    TRUSTED SETUP                                │
    │  ┌─────────────────┐          ┌─────────────────┐               │
    │  │  Phase 1:       │          │  Phase 2:       │               │
    │  │  Powers of Tau  │─────────▶│  Circuit Setup  │               │
    │  │  (generic)      │          │  (circuit-      │               │
    │  └─────────────────┘          │   specific)     │               │
    │                                └────────┬────────┘               │
    │                                         │                         │
    │                    ┌────────────────────┴──────────────┐         │
    │                    ▼                                   ▼         │
    │           ┌──────────────┐                  ┌──────────────┐      │
    │           │  PROVING     │                  │ VERIFICATION │      │
    │           │    KEY       │                  │    KEY       │      │
    │           │  (ptau.json) │                  │  (vkey.json) │      │
    │           └──────────────┘                  └──────────────┘      │
    └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                      PROOF GENERATION                           │
    │                                                                  │
    │    ┌─────────────┐    ┌─────────────┐                          │
    │    │   WITNESS   │    │  PROVING    │                          │
    │    │ (inputs)    │    │    KEY      │                          │
    │    │ a=3, b=7   │    │             │                          │
    │    │ c=21       │    │             │                          │
    │    └──────┬──────┘    └──────┬──────┘                          │
    │           │                  │                                  │
    │           └────────┬─────────┘                                  │
    │                    ▼                                            │
    │           ┌──────────────┐                                       │
    │           │  GROTH16    │  ──▶  proof.json                      │
    │           │  PROVER     │      (the ZK proof)                   │
    │           └──────────────┘                                       │
    └──────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                      PROOF VERIFICATION                          │
    │                                                                  │
    │    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
    │    │   PROOF     │    │ VERIFICATION│    │  PUBLIC     │       │
    │    │             │    │    KEY      │    │  INPUTS     │       │
    │    │ proof.json  │    │ vkey.json   │    │  c=21       │       │
    │    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘       │
    │           │                  │                  │              │
    │           └──────────────────┼──────────────────┘              │
    │                                ▼                               │
    │                       ┌──────────────┐                         │
    │                       │  GROTH16     │                         │
    │                       │  VERIFIER    │                         │
    │                       └──────┬───────┘                         │
    │                              │                                  │
    │                    ┌─────────▼─────────┐                      │
    │                    │   ACCEPT / REJECT  │                      │
    │                    │   (true if valid)  │                      │
    │                    └───────────────────┘                      │
    └─────────────────────────────────────────────────────────────────┘
```

---

## Circuit Explanation

### Our Circuit: `multiplier.circom`

```circom
pragma circom 2.0.0;

/* This circuit proves that we know two private numbers (a and b)
 * whose product equals a public number (c).
 * 
 * Public input: c (the expected product)
 * Private inputs: a, b (the factors)
 * Output: c must equal a * b
 */

template Multiplier() {
    // Declare input signals
    // 'a' and 'b' are PRIVATE - not revealed in the proof
    signal private input a;
    signal private input b;
    
    // 'c' is PUBLIC - visible to everyone
    signal input c;
    
    // Intermediate signal to hold the product
    signal product;
    
    // Constraint: product must equal a * b
    product <== a * b;
    
    // Constraint: the public output c must equal the product
    // This is the main statement we're proving
    c === product;
}

// Main component instantiation
component main {public [c]} = Multiplier();
```

### Line-by-Line Explanation:

| Line | Code | Explanation |
|------|------|-------------|
| 1 | `pragma circom 2.0.0;` | Specifies the Circom compiler version |
| 6 | `signal private input a;` | Declares `a` as a PRIVATE input (not visible in proof) |
| 7 | `signal private input b;` | Declares `b` as a PRIVATE input (not visible in proof) |
| 8 | `signal input c;` | Declares `c` as a PUBLIC input (visible in proof) |
| 10 | `signal product;` | Intermediate calculation variable |
| 12 | `product <== a * b;` | **Constraint 1:** product must equal a × b |
| 14 | `c === product;` | **Constraint 2:** public output c must equal product |
| 17 | `component main {public [c]} = Multiplier();` | Creates main component, marks `c` as public |

### Why These Constraints?

1. **`product <== a * b;`** - This creates a constraint that `product = a × b`. In R1CS, this becomes: `a * b - product = 0`

2. **`c === product;`** - This ensures the public output matches the calculated product. This is the "main claim" we're proving.

---

## Each File Generated Explained

### Phase 1: Compilation

```
┌────────────────────────────────────────────────────────────────────┐
│                     COMPILATION STAGE                              │
│                                                                    │
│  multiplier.circom  ──▶  circom compiler  ──▶  multiplier.r1cs   │
│                              │                       │              │
│                              │              R1CS = Rank-1           │
│                              │              Constraint System      │
│                              │              (mathematical          │
│                              │               representation)       │
│                              ▼                                     │
│                     multiplier.sym                                 │
│                              │                                      │
│                              │     Symbol file (debug info)        │
│                              │                                      │
└────────────────────────────────────────────────────────────────────┘
```

#### 1. `multiplier.r1cs` (R1CS File)
- **What it is:** The compiled circuit in R1CS format
- **Size:** Binary format, typically 10KB-100KB depending on circuit
- **Contains:** All constraints in R1CS format
- **What it looks like (JSON converted):**
```json
{
  "n8": 32,
  "n8r": 32, 
  "n4": 0,
  "n2n": 2,
  "n1n": 3,
  "nlabels": 4,
  "nconstraints": 2,
  "cons": [
    // Constraint 1: a * b = product
    [1, 2, 0],  // a * b + 0 * something + (-1)*product = 0
    
    // Constraint 2: product = c  
    [3, 0, -1]  // product + 0 * something + (-1)*c = 0
  ]
}
```

#### 2. `multiplier.sym` (Symbol File)
- **What it is:** Debugging symbols mapping
- **Contains:** Variable names and their R1CS indices
- **Useful for:** Debugging and understanding the circuit

### Phase 2: Trusted Setup

```
┌────────────────────────────────────────────────────────────────────┐
│                    TRUSTED SETUP STAGE                              │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  PHASE 1: Powers of Tau (ptau)                              │ │
│  │                                                            │ │
│  │  Command: snarkjs powersoftau new bn128 15 tau.ptau -v     │ │
│  │                                                            │ │
│  │  Purpose: Generate cryptographic parameters that are       │ │
│  │           independent of the specific circuit             │ │
│  │                                                            │ │
│  │  tau.ptau ──▶ Contains 2^15 = 32768 "powers of tau"       │ │
│  │                (G1 and G2 points on the curve)            │ │
│  │                                                            │ │
│  │  What is Tau?                                               │ │
│  │  - A secret random number (the "toxic waste")             │ │
│  │  - Used to create the proving/verification keys            │ │
│  │  - MUST be destroyed after setup!                          │ │
│  │                                                            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  PHASE 2: Circuit-Specific Setup                           │ │
│  │                                                            │ │
│  │  Command: snarkjs groth16 setup multiplier.r1cs           │ │
│  │            tau.ptau multiplier_0000.zkey                  │ │
│  │                                                            │ │
│  │  Purpose: Combine circuit with Phase 1 to create         │ │
│  │           circuit-specific proving/verification keys      │ │
│  │                                                            │ │
│  │  multiplier_0000.zkey ──▶ Contains both proving key        │ │
│  │                             AND verification key           │ │
│  │                                                            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  CONTRIBUTING RANDOMNESS (Optional but recommended)        │ │
│  │                                                            │ │
│  │  Command: snarkjs zkey contribute multiplier_0000.zkey    │ │
│  │            multiplier_0001.zkey --name="Contributor 1"    │ │
│  │            -v -e="random entropy"                          │ │
│  │                                                            │ │
│  │  Purpose: Add more randomness to the setup ceremony      │ │
│  │           (more participants = more security)             │ │
│  │                                                            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  EXPORT KEYS                                                │ │
│  │                                                            │ │
│  │  snarkjs zkey export verificationkey multiplier_0001.zkey │ │
│  │            verification_key.json                           │ │
│  │                                                            │ │
│  │  Creates:                                                   │ │
│  │  - proving_key.json  (for prover)                         │ │
│  │  - verification_key.json (for verifier)                   │ │
│  │                                                            │ │
│  └─────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

#### 3. `tau.ptau` (Phase 1 - Powers of Tau)
- **What it is:** The Phase 1 trusted setup output
- **Full name:** "Powers of Tau" - contains powers of the secret τ (tau)
- **Contains:** ~32768 G1 and G2 points (depending on power)
- **Format:** Binary with some JSON metadata
- **Size:** ~5-10MB for 2^15 powers

**What these points are:**
- The points are: `g1^τ^0`, `g1^τ^1`, `g1^τ^2`, ... and `g2^τ^0`, `g2^τ^1`, ...
- They are used as building blocks to create the proving/verification keys
- **Important:** τ must remain secret!

#### 4. `multiplier_0000.zkey` (Phase 2 - Initial ZKey)
- **What it is:** The circuit-specific setup output
- **Full name:** Zero-Key (contains the proving key)
- **Contains:** Proving key components derived from tau.ptau + circuit
- **Format:** Binary format
- **Size:** ~10-50MB depending on circuit size

**What it contains:**
```json
{
  "protocol": "groth16",
  "curve": "bn128",
  "n8q": 32,
  "n8r": 32,
  "n8m": 0,
  "n8c": 2,
  "n8s": 0,
  "alpha": ["g1_point"],      // Public generator alpha (commitment)
  "beta": ["g2_point"],       // Public generator beta
  "gamma": ["g2_point"],      // Verification key component
  "delta": ["g2_point"],      // Proving key component
  "A": [[g1_points]],        // Proving key matrices
  "B": [[g2_points]],        // Proving key matrices  
  "C": [[g1_points]],        // Proving key matrices
  "IC": [[g1_points]]        // Verification key (public inputs)
}
```

#### 5. `multiplier_0001.zkey` (After Contribution)
- **What it is:** The final ZKey after adding randomness
- **Contains:** Same structure as _0000 but with additional randomness applied
- **Size:** Slightly larger than _0000

#### 6. `proving_key.json` (or embedded in .zkey)
- **What it is:** The key used by the prover to generate proofs
- **Contains:**
  - Matrix A, B, C (used to compute proof)
  - Delta point (proving key commitment)
- **Size:** Typically 10-50MB
- **Who has this:** Only provers

#### 7. `verification_key.json` (Verification Key)
```json
{
  "protocol": "groth16",
  "curve": "bn128",
  "n8q": 32,
  "n8r": 32,
  "n8m": 0,
  "n8c": 2,
  "n8s": 0,
  "alpha": ["g1_point"],      // For checking proof
  "beta": ["g2_point"],       // For checking proof
  "gamma": ["g2_point"],      // Public input verification
  "delta": ["g2_point"],      // For checking proof
  "IC": [
    ["g1_point"],            // IC[0] = initial sum (usually 0)
    ["g1_point"],            // IC[1] = coefficient for c (public input)
    ...
  ]
}
```

### Phase 3: Proof Generation

```
┌────────────────────────────────────────────────────────────────────┐
│                   PROOF GENERATION STAGE                           │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  STEP 1: Calculate Witness                                 │  │
│  │                                                            │  │
│  │  Input:                                                     │  │
│  │    - Private: a = 3, b = 7                                 │  │
│  │    - Public: c = 21                                        │  │
│  │                                                            │  │
│  │  Calculate:                                                │  │
│  │    product = 3 * 7 = 21                                    │  │
│  │                                                            │  │
│  │  Witness = {a: 3, b: 7, product: 21, c: 21}               │  │
│  │                                                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  STEP 2: Generate Proof                                     │  │
│  │                                                            │  │
│  │  snarkjs groth16 fullprove witness.json                   │  │
│  │            multiplier_0001.zkey proof.json                 │  │
│  │            -s witness.wtns                                 │  │
│  │                                                            │  │
│  │  Input:                                                     │  │
│  │    - witness.json (all signals)                           │  │
│  │    - proving_key (from .zkey)                             │  │
│  │                                                            │  │
│  │  Output:                                                    │  │
│  │    - proof.json (the ZK proof)                            │  │
│  │    - public.json (public inputs)                          │  │
│  │                                                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

#### 8. `witness.json` (Witness File)
- **What it is:** All signal values for the circuit
- **Contains:** Every variable value computed during execution
```json
{
  "a": "3",
  "b": "7", 
  "product": "21",
  "c": "21"
}
```

#### 9. `witness.wtns` (Witness Binary)
- **What it is:** Binary witness file for snarkjs
- **Contains:** Same data as witness.json but in binary format
- **Used by:** snarkjs for proof generation

#### 10. `proof.json` (The ZK Proof)
```json
{
  "protocol": "groth16",
  "curve": "bn128",
  "pi_a": [
    "12345678901234567890...",  // G1 point (x coordinate)
    "98765432109876543210..."   // G1 point (y coordinate)
  ],
  "pi_b": [
    [
      "11111111111111111111...", // G2 point (x real)
      "22222222222222222222..."  // G2 point (x imaginary)
    ],
    [
      "33333333333333333333...", // G2 point (y real)
      "44444444444444444444..."  // G2 point (y imaginary)
    ]
  ],
  "pi_c": [
    "55555555555555555555...",  // G1 point (x coordinate)
    "66666666666666666666..."   // G1 point (y coordinate)
  ],
  "protocol": "groth16",
  "curve": "bn128"
}
```

**What each component means:**

| Field | Type | Description |
|-------|------|-------------|
| `pi_a` | G1 Point | Proof component A = α + β + sum(A_i * w_i) |
| `pi_b` | G2 Point | Proof component B = β + sum(B_i * w_i) |
| `pi_c` | G1 Point | Proof component C = δ + sum(C_i * w_i) |

**Why only 3 points?**
- Groth16 is incredibly efficient - proof is just 3 points!
- `pi_a` is 2 field elements, `pi_b` is 4 (but in G2), `pi_c` is 2
- Total size: ~288 bytes (very small!)

#### 11. `public.json` (Public Inputs)
```json
["21"]
```
- **What it is:** The public inputs to the circuit (just c = 21)
- **Used by:** Verifier to check the proof

### Phase 4: Verification

```
┌────────────────────────────────────────────────────────────────────┐
│                   VERIFICATION STAGE                               │
│                                                                    │
│  snarkjs groth16 verify verification_key.json                   │
│                    public.json proof.json                         │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  VERIFICATION EQUATION (what happens mathematically)        │  │
│  │                                                            │  │
│  │  e(pi_a, pi_b) = e(alpha, beta) *                           │  │
│  │                  product(IC_i, public_i) *                  │  │
│  │                  e(pi_c, delta)                            │  │
│  │                                                            │  │
│  │  Where:                                                    │  │
│  │    - e() is pairing operation (bilinear map)               │  │
│  │    - pi_a, pi_b, pi_c are from proof.json                 │  │
│  │    - alpha, beta, delta from verification_key.json         │  │
│  │    - IC_i are verification key coefficients                │  │
│  │                                                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  RESULT                                                    │  │
│  │                                                            │  │
│  │  ✓ "OK" - Proof is valid!                                 │  │
│  │  ✗ "FAIL" - Proof is invalid!                              │  │
│  │                                                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## How to Run

### Prerequisites

1. **Install Node.js** (for npm)
2. **Install Circom:**
   ```bash
   npm install -g circom
   ```

3. **Install snarkjs:**
   ```bash
   npm install -g snarkjs
   ```

### Run the Demo

Simply execute:

```bash
cd D:\setu\Dissertation\project\circuit
bash run_demo.sh
```

Or run each step manually:

```bash
# Step 1: Compile the circuit
circom multiplier.circom --r1cs --wasm --sym -o build

# Step 2: Trusted Setup - Phase 1 (Powers of Tau)
snarkjs powersoftau new bn128 15 build/tau.ptau -v

# Step 3: Trusted Setup - Phase 2 (Circuit setup)
snarkjs groth16 setup build/multiplier.r1cs build/tau.ptau build/multiplier_0000.zkey

# Step 4: Contribute randomness (optional)
snarkjs zkey contribute build/multiplier_0000.zkey build/multiplier_0001.zkey --name="First contribution" -v -e="some random entropy"

# Step 5: Export verification key
snarkjs zkey export verificationkey build/multiplier_0001.zkey build/verification_key.json

# Step 6: Generate witness (calculate all values)
node build/multiplier_js/generate_witness.js build/multiplier_js/multiplier.wasm input.json build/witness.json

# Step 7: Generate proof
snarkjs groth16 prove build/multiplier_0001.zkey build/witness.json build/proof.json build/public.json

# Step 8: Verify proof
snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json
```

### Test with Different Inputs

Edit `input.json` to try different values:

```json
{
  "a": "5",
  "b": "4",
  "c": "20"
}
```

The proof will still be valid as long as `a * b = c`.

---

## Security Notes

### Trusted Setup Security

1. **Single-party setup:** If one party runs the entire trusted setup and keeps the secret, they can create fake proofs.

2. **Multi-party setup:** Using "powers of tau" ceremonies with many participants. Even if ALL BUT ONE participant is honest and destroys their randomness, the setup is secure.

3. **Real-world examples:**
   - Perpetual Powers of Tau (for any circuit < 2^21)
   - Aztec Connect (for Aztec's circuit)
   - Semaphore (for identity circuits)

### What Happens If Setup Is Compromised?

- Attacker can create valid-looking proofs for FALSE statements
- This breaks the entire ZKP system
- **Therefore:** Trusted setup is critical!

---

## Common Use Cases

1. **Privacy:** Prove you have enough money without revealing your balance
2. **Identity:** Prove you're over 18 without revealing your age
3. **Blockchain:** Verify transactions are valid without revealing all transaction details
4. **Machine Learning:** Prove a neural network made a prediction without revealing the model weights
5. **Computing:** Prove you correctly computed something without revealing the input

---

## Glossary

| Term | Definition |
|------|------------|
| **ZKP** | Zero-Knowledge Proof |
| **zk-SNARK** | Zero-Knowledge Succinct Non-Interactive Argument of Knowledge |
| **Circom** | Circuit compiler for writing ZK circuits |
| **R1CS** | Rank-1 Constraint System |
| **QAP** | Quadratic Arithmetic Program |
| **Witness** | All signal values in a circuit execution |
| **Proving Key** | Key used to generate proofs |
| **Verification Key** | Key used to verify proofs |
| **Trusted Setup** | Ceremony to generate cryptographic keys |
| **Bilinear Pairing** | Mathematical operation used in Groth16 |

---

## References

1. [Circom Documentation](https://docs.circom.io/)
2. [snarkjs Documentation](https://github.com/iden3/snarkjs)
3. [Groth16 Paper](https://eprint.iacr.org/2016/260)
4. [Zero-Knowledge Proofs: An Illustrated Primer](https://blog.cryptographyengineering.com/2014/11/27/zero-knowledge-proofs-illustrated-primer/)

---

## Conclusion

You now understand the complete ZKP workflow with Circom and Groth16!

**Key Takeaways:**
- Circom lets you write circuits in a simple DSL
- The circuit defines what you want to prove (not HOW to prove it)
- Trusted setup generates the cryptographic keys
- The prover uses the proving key and witness to create a proof
- The verifier uses only the proof and verification key (no private inputs needed!)
- The proof is small (~288 bytes) and verification is fast

**Next Steps:**
- Try more complex circuits (e.g., hash functions, comparisons)
- Learn about PLONK (no trusted setup per circuit)
- Explore recursive proofs (proofs of proofs)
- Build a real application!
