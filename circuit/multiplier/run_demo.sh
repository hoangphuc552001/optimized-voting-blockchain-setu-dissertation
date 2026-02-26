#!/bin/bash
# =============================================================================
# Circom + Groth16 ZKP Demo - Full Workflow Script
# =============================================================================
#
# This script runs the complete Zero-Knowledge Proof workflow:
#   1. Compile the Circom circuit
#   2. Trusted Setup - Phase 1 (Powers of Tau)
#   3. Trusted Setup - Phase 2 (Circuit-specific)
#   4. Generate witness
#   5. Generate proof
#   6. Verify proof
#
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Create build directory
mkdir -p build

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}     Circom + Groth16 Zero-Knowledge Proof Demo            ${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# =============================================================================
# STEP 1: Compile the Circuit
# =============================================================================
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}STEP 1: Compiling the Circom Circuit                        ${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Command: circom multiplier.circom --r1cs --wasm --sym -o build${NC}"
echo ""

circom multiplier.circom --r1cs --wasm --sym -o build

echo ""
echo -e "${GREEN}✓ Circuit compiled successfully!${NC}"
echo ""

# List generated files
echo -e "${BLUE}Generated files:${NC}"
ls -la build/*.r1cs build/*.sym 2>/dev/null || true
echo ""

# =============================================================================
# STEP 2: Trusted Setup - Phase 1 (Powers of Tau)
# =============================================================================
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}STEP 2: Trusted Setup - Phase 1 (Powers of Tau)                ${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Command: snarkjs powersoftau new bn128 15 build/tau.ptau -v    ${NC}"
echo ""
echo -e "${RED}⚠️  This generates the 'toxic waste' (secret tau) that must    ${NC}"
echo -e "${RED}    be destroyed after setup! If compromised, fake proofs      ${NC}"
echo -e "${RED}    could be generated.${NC}"
echo ""

snarkjs powersoftau new bn128 15 build/tau.ptau -v

echo ""
echo -e "${GREEN}✓ Phase 1 complete!${NC}"
echo ""

# Explain the file
echo -e "${BLUE}Generated file: build/tau.ptau${NC}"
echo -e "${BLUE}  - Contains 2^15 = 32768 cryptographic points${NC}"
echo -e "${BLUE}  - Used as building blocks for proving/verification keys${NC}"
echo ""

# =============================================================================
# STEP 3: Trusted Setup - Phase 2 (Circuit-Specific)
# =============================================================================
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}STEP 3: Trusted Setup - Phase 2 (Circuit-Specific)            ${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Command: snarkjs groth16 setup build/multiplier.r1cs \\        ${NC}"
echo -e "${BLUE}                  build/tau.ptau build/multiplier_0000.zkey    ${NC}"
echo ""

snarkjs groth16 setup build/multiplier.r1cs build/tau.ptau build/multiplier_0000.zkey

echo ""
echo -e "${GREEN}✓ Phase 2 (initial) complete!${NC}"
echo ""

# Explain the file
echo -e "${BLUE}Generated file: build/multiplier_0000.zkey${NC}"
echo -e "${BLUE}  - Contains both proving key AND verification key${NC}"
echo -e "${BLUE}  - Specific to our multiplier circuit${NC}"
echo ""

# =============================================================================
# STEP 4: Contribute Randomness (Optional but Recommended)
# =============================================================================
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}STEP 4: Contribute Randomness (Security Enhancement)         ${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Command: snarkjs zkey contribute build/multiplier_0000.zkey \\ ${NC}"
echo -e "${BLUE}                  build/multiplier_0001.zkey \\                  ${NC}"
echo -e "${BLUE}                  --name=\"Contributor 1\" -v -e=\"entropy\"     ${NC}"
echo ""
echo -e "${RED}⚠️  In production, multiple parties should contribute!${NC}"
echo -e "${RED}    More participants = better security${NC}"
echo ""

snarkjs zkey contribute build/multiplier_0000.zkey build/multiplier_0001.zkey --name="Contributor 1" -v -e="random_entropy_string_12345"

echo ""
echo -e "${GREEN}✓ Randomness contribution complete!${NC}"
echo ""

# =============================================================================
# STEP 5: Export Verification Key
# =============================================================================
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}STEP 5: Export Verification Key                              ${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Command: snarkjs zkey export verificationkey \\               ${NC}"
echo -e "${BLUE}                  build/multiplier_0001.zkey \\                 ${NC}"
echo -e "${BLUE}                  build/verification_key.json                   ${NC}"
echo ""

snarkjs zkey export verificationkey build/multiplier_0001.zkey build/verification_key.json

echo ""
echo -e "${GREEN}✓ Verification key exported!${NC}"
echo ""

# Show verification key structure
echo -e "${BLUE}Verification Key Structure:${NC}"
echo -e "${BLUE}  - alpha: G1 point (commitment)${NC}"
echo -e "${BLUE}  - beta:  G2 point (commitment)${NC}"
echo -e "${BLUE}  - gamma: G2 point (for public inputs)${NC}"
echo -e "${BLUE}  - delta: G2 point (for proof)${NC}"
echo -e "${BLUE}  - IC:    Array of G1 points (public input coefficients)${NC}"
echo ""

# =============================================================================
# STEP 6: Generate Witness (Calculate all signal values)
# =============================================================================
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}STEP 6: Generate Witness                                      ${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Command: node build/multiplier_js/generate_witness.js \\      ${NC}"
echo -e "${BLUE}                  build/multiplier_js/multiplier.wasm \\         ${NC}"
echo -e "${BLUE}                  input.json build/witness.json                  ${NC}"
echo ""

echo -e "${BLUE}Input values from input.json:${NC}"
echo -e "${BLUE}  - Private a = 3${NC}"
echo -e "${BLUE}  - Private b = 7${NC}"
echo -e "${BLUE}  - Public  c = 21${NC}"
echo ""

node build/multiplier_js/generate_witness.js build/multiplier_js/multiplier.wasm input.json build/witness.json

echo ""
echo -e "${GREEN}✓ Witness generated!${NC}"
echo ""

# =============================================================================
# STEP 7: Generate Proof
# =============================================================================
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}STEP 7: Generate Proof                                       ${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Command: snarkjs groth16 prove build/multiplier_0001.zkey \\   ${NC}"
echo -e "${BLUE}                  build/witness.json build/proof.json \\        ${NC}"
echo -e "${BLUE}                  build/public.json                             ${NC}"
echo ""

snarkjs groth16 prove build/multiplier_0001.zkey build/witness.json build/proof.json build/public.json

echo ""
echo -e "${GREEN}✓ Proof generated!${NC}"
echo ""

# Show proof structure
echo -e "${BLUE}Proof Structure:${NC}"
echo -e "${BLUE}  - pi_a: G1 point (2 field elements)${NC}"
echo -e "${BLUE}  - pi_b: G2 point (4 field elements)${NC}"
echo -e "${BLUE}  - pi_c: G1 point (2 field elements)${NC}"
echo -e "${BLUE}  Total size: ~288 bytes (very small!)${NC}"
echo ""

echo -e "${BLUE}Public inputs (from public.json):${NC}"
cat build/public.json
echo ""
echo ""

# =============================================================================
# STEP 8: Verify Proof
# =============================================================================
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}STEP 8: Verify Proof                                         ${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Command: snarkjs groth16 verify build/verification_key.json \\  ${NC}"
echo -e "${BLUE}                  build/public.json build/proof.json           ${NC}"
echo ""

snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json

echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                    WORKFLOW COMPLETE!                          ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}All files generated in ./build/:${NC}"
ls -la build/
echo ""

echo -e "${BLUE}What just happened:${NC}"
echo "  1. ✓ Compiled multiplier.circom → multiplier.r1cs (constraints)"
echo "  2. ✓ Generated Powers of Tau → tau.ptau (cryptographic params)"
echo "  3. ✓ Circuit setup → multiplier_0000.zkey (keys)"
echo "  4. ✓ Added randomness → multiplier_0001.zkey (secure keys)"
echo "  5. ✓ Exported verification_key.json (public verifier params)"
echo "  6. ✓ Calculated witness from inputs (a=3, b=7, c=21)"
echo "  7. ✓ Generated proof (showing knowledge of factors)"
echo "  8. ✓ Verified proof (confirms c = a * b without revealing a,b)"
echo ""

echo -e "${RED}⚠️  IMPORTANT - Clean up toxic waste:${NC}"
echo -e "${RED}   In production, delete tau.ptau and the phase 1/2 randomness!${NC}"
echo ""

echo -e "${BLUE}Try changing input.json and run again!${NC}"
echo -e "${BLUE}   Edit: a, b, c values (must satisfy a * b = c)${NC}"
echo ""
