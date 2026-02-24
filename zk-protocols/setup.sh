#!/bin/bash

echo "Step 1: Compiling circuit..."
circom circuit.circom --r1cs --wasm --sym

if [ ! -f "powersOfTau28_hez_final_10.ptau" ]; then
    echo "Step 2: Downloading Powers of Tau file..."
    
    if wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_10.ptau 2>/dev/null; then
        echo "Download successful!"
    elif wget https://www.trusted-setup-pse.org/semaphore/setup_2^10/powersOfTau28_hez_final_10.ptau 2>/dev/null; then
        echo "Download successful from alternative source!"
    elif curl -L -o powersOfTau28_hez_final_10.ptau https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_10.ptau 2>/dev/null; then
        echo "Download successful using curl!"
    else
        echo "Automatic download failed. Please download manually or use snarkjs to generate."
        echo "See README_SNARK.md for manual download instructions."
        exit 1
    fi
else
    echo "Step 2: Powers of Tau file already exists, skipping download..."
fi

PREPARED_PTAU="powersOfTau28_hez_final_10_prepared.ptau"
if [ ! -f "$PREPARED_PTAU" ]; then
    echo "Step 3: Preparing Powers of Tau for circuit..."
    snarkjs powersoftau prepare phase2 powersOfTau28_hez_final_10.ptau "$PREPARED_PTAU" -v
    
    if [ $? -ne 0 ]; then
        echo "Failed to prepare Powers of Tau file"
        echo "The ptau file may be corrupted. Try regenerating it."
        exit 1
    fi
else
    echo "Step 3: Prepared Powers of Tau file already exists, skipping preparation..."
fi

echo "Step 4: Running Groth16 setup..."
snarkjs groth16 setup circuit.r1cs "$PREPARED_PTAU" circuit_0000.zkey

echo "Step 5: Exporting verification key..."
snarkjs zkey export verificationkey circuit_0000.zkey verification_key.json

echo "Setup complete! You can now run: node snark.js"

