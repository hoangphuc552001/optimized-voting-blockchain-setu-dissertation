import { ethers } from "hardhat";
import * as path from "path";
import { PerformanceBenchmark, BenchmarkConfig } from "../analysis/visualization/benchmark-l2";

async function main() {
    console.log("=== Setting up Benchmark Environment ===\n");

    // 1. Deploy Election Contract
    console.log("Deploying Election contract...");
    const Election = await ethers.getContractFactory("Election");
    const candidateNames = ["Alice", "Bob", "Charlie"];
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + 3600 * 24; // 1 day
    const election = await Election.deploy(candidateNames, startTime, endTime);
    await election.waitForDeployment();
    const electionAddress = await election.getAddress();
    console.log("Election deployed to:", electionAddress);

    // 2. Deploy ZK Verifier
    console.log("\nDeploying Verifier contract...");
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log("Verifier deployed to:", verifierAddress);

    // 3. Deploy RollupGateway
    console.log("\nDeploying RollupGateway contract...");
    const RollupGateway = await ethers.getContractFactory("RollupGateway");
    // Verification key hash (placeholder for now, using ZeroHash)
    const vKeyHash = ethers.ZeroHash;
    const gateway = await RollupGateway.deploy(
        verifierAddress,
        vKeyHash,
        100 // Max batch size matches benchmark config
    );
    await gateway.waitForDeployment();
    const gatewayAddress = await gateway.getAddress();
    console.log("RollupGateway deployed to:", gatewayAddress);

    // 4. Run Benchmark
    console.log("\n=== Starting Benchmark ===\n");

    // Set Env vars for the benchmark instance
    process.env.ELECTION_ADDRESS = electionAddress;
    process.env.ROLLUP_GATEWAY_ADDRESS = gatewayAddress;

    const config: BenchmarkConfig = {
        voterCount: 10, // Small scale for testing
        batchSize: 2,
        network: 'local',
        iterations: 1,
        provider: ethers.provider // Pass Hardhat provider
    };

    console.log("Initializing benchmark with config:", config);
    const benchmark = new PerformanceBenchmark(config);

    try {
        console.log("Running L1 Benchmark...");
        await benchmark.benchmarkL1();

        console.log("Running L2 Benchmark...");
        await benchmark.benchmarkL2();

        console.log("\nGenerating Report...");
        console.log(benchmark.generateReport());

        console.log("Saving results...");
        benchmark.saveResults();

        console.log("\nBenchmark completed successfully!");
    } catch (error) {
        console.error("Benchmark execution failed:", error);
        throw error;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
