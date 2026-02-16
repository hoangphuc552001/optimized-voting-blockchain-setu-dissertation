/**
 * Deploy ZK Rollup contracts to L1
 * 
 * This script deploys:
 * 1. Verifier contract (for Groth16 proof verification)
 * 2. RollupGateway contract (main rollup contract)
 */

import { ethers, run } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

async function main(): Promise<void> {
    console.log('=== ZK Rollup Deployment ===\n');
    
    const [deployer] = await ethers.getSigners();
    console.log(`Deploying with account: ${deployer.address}`);
    console.log(`Balance: ${(await ethers.provider.getBalance(deployer.address)).toString()}\n`);
    
    // Deploy Verifier first
    console.log('Deploying Verifier contract...');
    const Verifier = await ethers.getContractFactory('Verifier');
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log(`Verifier deployed to: ${verifierAddress}`);
    
    // Deploy RollupGateway
    console.log('\nDeploying RollupGateway contract...');
    const RollupGateway = await ethers.getContractFactory('RollupGateway');
    const gateway = await RollupGateway.deploy(
        verifierAddress,                    // Verifier address
        ethers.ZeroHash,                     // Verification key hash (placeholder)
        100                                  // Max batch size
    );
    await gateway.waitForDeployment();
    const gatewayAddress = await gateway.getAddress();
    console.log(`RollupGateway deployed to: ${gatewayAddress}`);
    
    // Save deployment info
    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: (await ethers.provider.getNetwork()).chainId,
        timestamp: new Date().toISOString(),
        contracts: {
            verifier: {
                address: verifierAddress,
                constructorArgs: []
            },
            rollupGateway: {
                address: gatewayAddress,
                constructorArgs: [
                    verifierAddress,
                    ethers.ZeroHash,
                    100
                ]
            }
        },
        deployer: deployer.address
    };
    
    const deployPath = path.join(__dirname, '..', 'deployments');
    if (!fs.existsSync(deployPath)) {
        fs.mkdirSync(deployPath, { recursive: true });
    }
    
    const deployFile = path.join(deployPath, `zk-rollup-${Date.now()}.json`);
    fs.writeFileSync(deployFile, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\nDeployment info saved to: ${deployFile}`);
    
    // Verify contracts (if not local network)
    const network = await ethers.provider.getNetwork();
    if (network.chainId !== 31337) { // Not Hardhat
        console.log('\nVerifying contracts on Etherscan...');
        
        try {
            await run('verify:verify', {
                address: verifierAddress,
                constructorArguments: []
            });
        } catch (error) {
            console.warn(`Verifier verification failed: ${error}`);
        }
        
        try {
            await run('verify:verify', {
                address: gatewayAddress,
                constructorArguments: [
                    verifierAddress,
                    ethers.ZeroHash,
                    100
                ]
            });
        } catch (error) {
            console.warn(`RollupGateway verification failed: ${error}`);
        }
    }
    
    console.log('\n=== Deployment Complete ===');
    console.log(`Verifier: ${verifierAddress}`);
    console.log(`RollupGateway: ${gatewayAddress}`);
}

// Execute
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
