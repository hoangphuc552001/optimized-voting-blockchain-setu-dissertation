/**
 * ZK Proof Generation Script
 * 
 * This script demonstrates the full ZK proof generation pipeline:
 * 1. Compile the circuit (if needed)
 * 2. Generate proving/verification keys
 * 3. Generate a witness from inputs
 * 4. Generate a proof
 * 5. Export the verifier contract
 */

import * as snarkjs from 'snarkjs';
import * as fs from 'fs';
import * as path from 'path';

const CIRCUIT_PATH = path.join(__dirname, '..', 'circuits', 'VoteCircuit.circom');
const OUTPUT_PATH = path.join(__dirname, '..', 'keys');
const PROVING_KEY_PATH = path.join(OUTPUT_PATH, 'proving_key.json');
const VERIFICATION_KEY_PATH = path.join(OUTPUT_PATH, 'verification_key.json');

/**
 * Compile the Circom circuit
 */
async function compileCircuit(): Promise<void> {
    console.log('Compiling circuit...');
    
    try {
        // Check if circom is installed
        const { execSync } = require('child_process');
        execSync('which circom', { stdio: 'inherit' });
        
        // Compile the circuit
        execSync(`circom ${CIRCUIT_PATH} --wasm --output ${OUTPUT_PATH}`, {
            stdio: 'inherit'
        });
        
        console.log('Circuit compiled successfully');
    } catch (error) {
        console.error('Circom not found. Please install circom first:');
        console.error('  cargo install circom');
        throw error;
    }
}

/**
 * Generate proving and verification keys
 */
async function generateKeys(): Promise<void> {
    console.log('Generating keys...');
    
    // Read the compiled circuit
    const r1csPath = path.join(OUTPUT_PATH, 'VoteCircuit.r1cs');
    if (!fs.existsSync(r1csPath)) {
        console.log('Circuit not compiled yet. Compiling...');
        await compileCircuit();
    }
    
    // Generate proving key
    console.log('Generating proving key...');
    await snarkjs.zKey.newZKey(
        r1csPath,
        path.join(OUTPUT_PATH, 'pot12_final.ptau'),
        PROVING_KEY_PATH
    );
    
    // Export verification key
    console.log('Exporting verification key...');
    const vKey = await snarkjs.zKey.exportVerificationKey(PROVING_KEY_PATH);
    fs.writeFileSync(VERIFICATION_KEY_PATH, JSON.stringify(vKey, null, 2));
    
    console.log('Keys generated successfully');
}

/**
 * Generate a witness from inputs
 */
function generateWitness(inputs: any): any {
    console.log('Generating witness...');
    
    // The wasm file should be in the output directory
    const wasmPath = path.join(OUTPUT_PATH, 'VoteCircuit_js', 'VoteCircuit.wasm');
    
    if (!fs.existsSync(wasmPath)) {
        throw new Error(`WASM not found at ${wasmPath}. Please compile the circuit first.`);
    }
    
    // Create witness using the wasm module
    // This is a simplified version - in production, you'd use the actual WASM
    const witness = {
        ...inputs
    };
    
    return witness;
}

/**
 * Generate a proof
 */
async function generateProof(witness: any): Promise<any> {
    console.log('Generating proof...');
    
    if (!fs.existsSync(PROVING_KEY_PATH)) {
        throw new Error('Proving key not found. Please generate keys first.');
    }
    
    const { proof } = await snarkjs.groth16.prove(
        PROVING_KEY_PATH,
        witness
    );
    
    console.log('Proof generated successfully');
    return proof;
}

/**
 * Verify a proof
 */
async function verifyProof(proof: any, publicInputs: any[]): Promise<boolean> {
    console.log('Verifying proof...');
    
    if (!fs.existsSync(VERIFICATION_KEY_PATH)) {
        throw new Error('Verification key not found. Please generate keys first.');
    }
    
    const vKey = JSON.parse(fs.readFileSync(VERIFICATION_KEY_PATH, 'utf-8'));
    const isValid = await snarkjs.groth16.verify(vKey, publicInputs, proof);
    
    console.log(`Proof verification: ${isValid ? 'VALID' : 'INVALID'}`);
    return isValid;
}

/**
 * Export Solidity verifier
 */
async function exportVerifier(): Promise<void> {
    console.log('Exporting Solidity verifier...');
    
    if (!fs.existsSync(VERIFICATION_KEY_PATH)) {
        throw new Error('Verification key not found. Please generate keys first.');
    }
    
    const vKey = JSON.parse(fs.readFileSync(VERIFICATION_KEY_PATH, 'utf-8'));
    const contract = snarkjs.groth16.exportSolidityVerifier(vKey);
    
    const verifierPath = path.join(__dirname, '..', 'contracts', 'Verifier.sol');
    fs.writeFileSync(verifierPath, contract);
    
    console.log(`Verifier exported to ${verifierPath}`);
}

/**
 * Demo: Generate a sample proof
 */
async function demo(): Promise<void> {
    console.log('=== ZK Vote Proof Demo ===\n');
    
    // Create sample inputs
    const inputs = {
        stateRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
        newStateRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        voteCommitment: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        nullifier: '0x11112222333344445555666677778888999900001111222233334444555566667777',
        candidateId: 2,
        electionId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        voterSecret: '0x22223333444455556666777788889999aaaabbbbccccddddeeeeffffaaaabbbb',
        voterIndex: 42,
        voterMerkleProof: new Array(20).fill('0x0000000000000000000000000000000000000000000000000000000000000000'),
        salt: '0x3333444455556666777788889999aaaabbbbccccddddeeeeffffaaaabbbbccccdddd'
    };
    
    try {
        // Generate witness
        const witness = generateWitness(inputs);
        
        // Generate proof
        const proof = await generateProof(witness);
        
        // Prepare public inputs for verification
        const publicInputs = [
            inputs.stateRoot,
            inputs.newStateRoot,
            inputs.voteCommitment,
            inputs.nullifier,
            inputs.candidateId.toString(),
            inputs.electionId
        ];
        
        // Verify proof
        const isValid = await verifyProof(proof, publicInputs);
        
        console.log('\n=== Demo Complete ===');
        console.log(`Proof generated: ${JSON.stringify(proof, null, 2).substring(0, 100)}...`);
        console.log(`Verification: ${isValid ? 'PASSED' : 'FAILED'}`);
        
    } catch (error) {
        console.error('Demo failed:', error);
        console.log('\nNote: Full proof generation requires compiled circuit.');
        console.log('Run with --compile first to compile the circuit.');
    }
}

// Main execution
const args = process.argv.slice(2);

async function main(): Promise<void> {
    if (args.includes('--compile')) {
        await compileCircuit();
    } else if (args.includes('--keys')) {
        await generateKeys();
    } else if (args.includes('--verifier')) {
        await exportVerifier();
    } else if (args.includes('--demo')) {
        await demo();
    } else {
        console.log('ZK Vote Proof Generator');
        console.log('\nUsage:');
        console.log('  --compile   Compile the Circom circuit');
        console.log('  --keys      Generate proving/verification keys');
        console.log('  --verifier  Export Solidity verifier contract');
        console.log('  --demo      Run demo proof generation');
        console.log('\nRecommended:');
        console.log('  npm run zk:compile   # Compile circuit');
        console.log('  npm run zk:keys       # Generate keys');
        console.log('  npm run zk:verifier  # Export verifier');
    }
}

main().catch(console.error);
