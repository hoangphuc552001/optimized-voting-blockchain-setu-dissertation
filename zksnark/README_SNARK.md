# SNARK Setup Instructions

## Prerequisites

1. Install Node.js (LTS) and npm
2. Install snarkjs globally:
   ```bash
   npm install -g snarkjs
   ```
3. Install circom:
   - Follow: https://docs.circom.io/getting-started/installation/
   - Or build from source:
     ```bash
     git clone https://github.com/iden3/circom.git
     cd circom
     cargo build --release
     ```

## Quick Setup (Windows PowerShell)

Run the setup script:
```powershell
.\setup.ps1
```

## Manual Setup Steps

1. **Compile the circuit:**
   ```bash
   circom circuit.circom --r1cs --wasm --sym
   ```
   This creates:
   - `circuit.r1cs` - constraint system
   - `circuit_js/` - directory with `circuit.wasm` and `generate_witness.js`
   - `circuit.sym` - symbol file

2. **Get Powers of Tau file:**

   **Option A: Automatic download (tries multiple sources):**
   ```powershell
   .\setup.ps1
   ```
   The script will try multiple download sources automatically.

   **Option B: Generate using snarkjs (recommended if download fails):**
   ```powershell
   .\generate_ptau.ps1
   ```
   This generates a small Powers of Tau file suitable for testing.

   **Option C: Manual download:**
   - Visit: https://github.com/iden3/snarkjs#7-prepare-phase-2
   - Or try alternative sources:
     - https://www.trusted-setup-pse.org/semaphore/setup_2^10/
     - IPFS: `QmNf1UsmdGaMbpatQ6toXSkzDpizaGmUS9h5TqbLVHsoHs`
   
   **Note:** For production use, always use files from trusted setup ceremonies.

3. **Run Groth16 setup:**
   ```bash
   snarkjs groth16 setup circuit.r1cs powersOfTau28_hez_final_10.ptau circuit_0000.zkey
   ```

4. **Export verification key:**
   ```bash
   snarkjs zkey export verificationkey circuit_0000.zkey verification_key.json
   ```

## Running the Proof

After setup is complete, run:
```bash
node snark.js
```

This will:
- Generate a witness from `input.json`
- Create a Groth16 proof
- Verify the proof

## What the Circuit Does

The circuit proves knowledge of two private numbers `a` and `b` such that `a + b = 5`, without revealing the values of `a` and `b`.

