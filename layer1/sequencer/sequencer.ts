/**
 * ZK Rollup Sequencer Service
 * 
 * This service is responsible for:
 * - Collecting votes from users (off-chain)
 * - Batching votes for efficient processing
 * - Generating ZK proofs
 * - Submitting batches to L1 RollupGateway
 */

import { ethers, Wallet, JsonRpcProvider } from 'ethers';
import * as snarkjs from 'snarkjs';
import { Poseidon } from 'circomlibjs';
import {
    VoteMessage,
    VoteBatch,
    ZKProof,
    CircuitInputs,
    BatchSubmission,
    SequencerStatus,
    BatchResult
} from './types';
import {
    buildVoterMerkleTree,
    getMerkleProof,
    calculateMerkleRoot,
    calculateVoteCommitment,
    calculateNullifier,
    generateSalt,
    formatProofForCircuit
} from './merkleTree';

import * as fs from 'fs';
import * as path from 'path';

interface SequencerConfig {
    l1RpcUrl: string;
    sequencerPrivateKey: string;
    gatewayContractAddress: string;
    electionId: string;
    maxBatchSize: number;
    circuitPath: string;
    provingKeyPath: string;
    verificationKeyPath: string;
    merkleTreeDepth: number;
}

interface ElectionState {
    currentStateRoot: string;
    batchCount: number;
    voters: Map<string, VoterInfo>;
}

interface VoterInfo {
    index: number;
    secret: string;
    hasVoted: boolean;
}

/**
 * ZK Rollup Sequencer Service
 */
export class ZKRollupSequencer {
    private config: SequencerConfig;
    private provider: JsonRpcProvider;
    private wallet: Wallet;
    private gatewayContract: ethers.Contract;
    
    private pendingVotes: VoteMessage[];
    private currentBatchId: number;
    private electionState: ElectionState;
    
    private isRunning: boolean;
    private circuit: any;
    private provingKey: any;
    private verificationKey: any;
    
    /**
     * Constructor
     */
    constructor(config: SequencerConfig) {
        this.config = config;
        this.provider = new JsonRpcProvider(config.l1RpcUrl);
        this.wallet = new Wallet(config.sequencerPrivateKey, this.provider);
        
        // Initialize gateway contract interface
        const gatewayABI = [
            'function submitBatch(bytes32 _electionId, uint256 _batchId, bytes32 _oldStateRoot, bytes32 _newStateRoot, bytes32[] calldata _voteCommitments, bytes32[] calldata _nullifiers, uint256[] calldata _candidateIds, uint256[8] calldata _proof, uint256[] calldata _input) external',
            'function getCurrentStateRoot(bytes32 _electionId) external view returns (bytes32)',
            'function batchCount() external view returns (uint256)'
        ];
        this.gatewayContract = new ethers.Contract(
            config.gatewayContractAddress,
            gatewayABI,
            this.wallet
        );
        
        this.pendingVotes = [];
        this.currentBatchId = 0;
        this.isRunning = false;
        
        this.electionState = {
            currentStateRoot: ethers.ZeroHash,
            batchCount: 0,
            voters: new Map()
        };
    }
    
    /**
     * Initialize the sequencer
     */
    async initialize(): Promise<void> {
        console.log('Initializing ZK Rollup Sequencer...');
        
        // Load circuit and keys
        await this.loadCircuitArtifacts();
        
        // Fetch current state from L1
        await this.syncStateFromL1();
        
        console.log('Sequencer initialized successfully');
        console.log(`Current state root: ${this.electionState.currentStateRoot}`);
        console.log(`Current batch ID: ${this.electionState.batchCount}`);
    }
    
    /**
     * Load circuit artifacts (compiled circuit, proving key, verification key)
     */
    private async loadCircuitArtifacts(): Promise<void> {
        console.log('Loading circuit artifacts...');
        
        try {
            // Load circuit definition
            const circuitPath = path.join(this.config.circuitPath, 'VoteCircuit.json');
            if (fs.existsSync(circuitPath)) {
                const circuitDef = JSON.parse(fs.readFileSync(circuitPath, 'utf-8'));
                this.circuit = await snarkjs.zKey.newZKey(circuitDef.r1cs, this.config.provingKeyPath);
            }
            
            // Load verification key
            if (fs.existsSync(this.config.verificationKeyPath)) {
                this.verificationKey = JSON.parse(
                    fs.readFileSync(this.config.verificationKeyPath, 'utf-8')
                );
            }
            
            console.log('Circuit artifacts loaded successfully');
        } catch (error) {
            console.warn('Could not load circuit artifacts:', error);
            console.warn('Proof generation will be skipped until artifacts are available');
        }
    }
    
    /**
     * Sync state from L1
     */
    private async syncStateFromL1(): Promise<void> {
        try {
            // Get current state root
            const stateRoot = await this.gatewayContract.getCurrentStateRoot(
                '0x' + BigInt(this.config.electionId).toString(16).padStart(64, '0')
            );
            this.electionState.currentStateRoot = stateRoot;
            
            // Get current batch count
            this.electionState.batchCount = await this.gatewayContract.batchCount();
            this.currentBatchId = this.electionState.batchCount;
            
            console.log(`Synced from L1: stateRoot=${stateRoot}, batchCount=${this.electionState.batchCount}`);
        } catch (error) {
            console.warn('Could not sync from L1, using default state:', error);
        }
    }
    
    /**
     * Start the sequencer
     */
    async start(): Promise<void> {
        this.isRunning = true;
        console.log('Sequencer started');
        
        // Start batch processing loop
        this.batchProcessor = setInterval(() => this.processBatch(), 5000);
    }
    
    /**
     * Stop the sequencer
     */
    async stop(): Promise<void> {
        this.isRunning = false;
        if (this.batchProcessor) {
            clearInterval(this.batchProcessor);
        }
        console.log('Sequencer stopped');
    }
    
    /**
     * Submit a vote (called by users)
     */
    async submitVote(vote: VoteMessage): Promise<{ queued: boolean; position: number }> {
        // Verify signature
        const isValid = await this.verifyVoteSignature(vote);
        if (!isValid) {
            throw new Error('Invalid vote signature');
        }
        
        // Check voter hasn't already voted in this batch
        const alreadyQueued = this.pendingVotes.some(v => v.voterAddress === vote.voterAddress);
        if (alreadyQueued) {
            throw new Error('Vote already queued for this voter');
        }
        
        // Add to pending votes
        this.pendingVotes.push(vote);
        
        console.log(`Vote queued for ${vote.voterAddress} (batch position: ${this.pendingVotes.length})`);
        
        // Check if batch should be processed immediately
        if (this.pendingVotes.length >= this.config.maxBatchSize) {
            await this.processBatch();
        }
        
        return {
            queued: true,
            position: this.pendingVotes.length
        };
    }
    
    /**
     * Process current batch of votes
     */
    async processBatch(): Promise<BatchResult | null> {
        if (this.pendingVotes.length === 0) {
            return null;
        }
        
        const batchId = this.currentBatchId++;
        const batch = this.pendingVotes.splice(0, this.config.maxBatchSize);
        
        console.log(`Processing batch ${batchId} with ${batch.length} votes...`);
        const startTime = Date.now();
        
        try {
            // Build Merkle tree for this batch
            const merkleTree = buildVoterMerkleTree(
                batch.map(v => v.voteCommitment),
                this.config.merkleTreeDepth
            );
            const newStateRoot = '0x' + merkleTree.getRoot().toString('hex');
            
            // Generate ZK proof
            const proof = await this.generateBatchProof(batch, merkleTree);
            
            // Prepare L1 submission
            const submission = await this.prepareSubmission(batchId, batch, newStateRoot, proof);
            
            // Submit to L1
            const tx = await this.submitToL1(submission);
            const gasUsed = tx.gasLimit * tx.gasPrice;
            
            const result: BatchResult = {
                success: true,
                batchId,
                transactionHash: tx.hash,
                gasUsed,
                proofGenerationTime: Date.now() - startTime,
                submissionTime: Date.now()
            };
            
            // Update local state
            this.electionState.currentStateRoot = newStateRoot;
            this.electionState.batchCount++;
            
            console.log(`Batch ${batchId} submitted successfully: ${tx.hash}`);
            console.log(`Gas used: ${gasUsed.toString()}`);
            
            return result;
        } catch (error) {
            console.error(`Batch ${batchId} failed:`, error);
            
            // Return failed votes to queue
            this.pendingVotes.unshift(...batch);
            
            return {
                success: false,
                batchId,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    
    /**
     * Generate ZK proof for a batch of votes
     */
    private async generateBatchProof(
        batch: VoteMessage[],
        merkleTree: any
    ): Promise<ZKProof> {
        if (!this.circuit) {
            throw new Error('Circuit not loaded');
        }
        
        // Generate witness and proof for each vote
        const votesPerProof = 1; // For simplicity, generate proof per vote
        const proofs: ZKProof[] = [];
        
        for (let i = 0; i < batch.length; i += votesPerProof) {
            const vote = batch[i];
            const voterInfo = this.electionState.voters.get(vote.voterAddress);
            
            if (!voterInfo) {
                throw new Error(`Voter ${vote.voterAddress} not registered`);
            }
            
            const circuitInputs: CircuitInputs = {
                stateRoot: this.electionState.currentStateRoot,
                newStateRoot: '0x' + merkleTree.getRoot().toString('hex'),
                voteCommitment: vote.voteCommitment,
                nullifier: vote.nullifier,
                candidateId: vote.candidateId,
                electionId: this.config.electionId,
                voterSecret: voterInfo.secret,
                voterIndex: voterInfo.index,
                voterMerkleProof: formatProofForCircuit(
                    getMerkleProof(merkleTree, voterInfo.index),
                    this.config.merkleTreeDepth
                ),
                salt: vote.voteCommitment.slice(0, 66) // Placeholder
            };
            
            // Generate proof
            const { proof } = await snarkjs.groth16.fullProve(
                circuitInputs,
                this.circuit,
                this.config.provingKeyPath
            );
            
            proofs.push(this.convertProofFormat(proof));
        }
        
        // For simplicity, return first proof
        // In production, you'd aggregate proofs or submit multiple
        return proofs[0];
    }
    
    /**
     * Convert snarkjs proof format to contract format
     */
    private convertProofFormat(proof: any): ZKProof {
        return {
            a: [proof.pi_a[0], proof.pi_a[1]],
            b: [
                [proof.pi_b[0][0], proof.pi_b[0][1]],
                [proof.pi_b[1][0], proof.pi_b[1][1]]
            ],
            c: [proof.pi_c[0], proof.pi_c[1]]
        };
    }
    
    /**
     * Prepare L1 submission data
     */
    private async prepareSubmission(
        batchId: number,
        batch: VoteMessage[],
        newStateRoot: string,
        proof: ZKProof
    ): Promise<BatchSubmission> {
        // Convert proof to uint256 array
        const proofArray = [
            BigInt(proof.a[0]),
            BigInt(proof.a[1]),
            BigInt(proof.b[0][0]),
            BigInt(proof.b[0][1]),
            BigInt(proof.b[1][0]),
            BigInt(proof.b[1][1]),
            BigInt(proof.c[0]),
            BigInt(proof.c[1])
        ];
        
        // Prepare public inputs
        const publicInputs = [
            BigInt(this.electionState.currentStateRoot),
            BigInt(newStateRoot),
            BigInt(batch[0].voteCommitment),
            BigInt(batch[0].nullifier),
            BigInt(batch[0].candidateId),
            BigInt(this.config.electionId)
        ];
        
        return {
            electionId: this.config.electionId,
            batchId,
            oldStateRoot: this.electionState.currentStateRoot,
            newStateRoot,
            voteCommitments: batch.map(v => v.voteCommitment),
            nullifiers: batch.map(v => v.nullifier),
            candidateIds: batch.map(v => v.candidateId),
            proof,
            input: publicInputs.map(n => n.toString())
        };
    }
    
    /**
     * Submit batch to L1
     */
    private async submitToL1(submission: BatchSubmission): Promise<ethers.TransactionResponse> {
        const proofArray = [
            BigInt(submission.proof.a[0]),
            BigInt(submission.proof.a[1]),
            BigInt(submission.proof.b[0][0]),
            BigInt(submission.proof.b[0][1]),
            BigInt(submission.proof.b[1][0]),
            BigInt(submission.proof.b[1][1]),
            BigInt(submission.proof.c[0]),
            BigInt(submission.proof.c[1])
        ];
        
        const inputArray = submission.input.map(n => BigInt(n));
        
        const tx = await this.gatewayContract.submitBatch(
            '0x' + BigInt(submission.electionId).toString(16).padStart(64, '0'),
            submission.batchId,
            submission.oldStateRoot,
            submission.newStateRoot,
            submission.voteCommitments,
            submission.nullifiers,
            submission.candidateIds,
            proofArray,
            inputArray
        );
        
        return tx;
    }
    
    /**
     * Verify voter signature on vote message
     */
    private async verifyVoteSignature(vote: VoteMessage): Promise<boolean> {
        try {
            // EIP-712 domain separator
            const domain = {
                name: 'ZK Voting System',
                version: '1.0',
                chainId: (await this.provider.getNetwork()).chainId,
                verifyingContract: this.config.gatewayContractAddress
            };
            
            // Vote types
            const types = {
                Vote: [
                    { name: 'candidateId', type: 'uint256' },
                    { name: 'voteCommitment', type: 'bytes32' },
                    { name: 'nullifier', type: 'bytes32' },
                    { name: 'timestamp', type: 'uint256' }
                ]
            };
            
            // Value
            const value = {
                candidateId: vote.candidateId,
                voteCommitment: vote.voteCommitment,
                nullifier: vote.nullifier,
                timestamp: vote.timestamp
            };
            
            // Verify signature
            const signerAddress = ethers.verifyTypedData(domain, types, value, vote.signature);
            return signerAddress.toLowerCase() === vote.voterAddress.toLowerCase();
        } catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    }
    
    /**
     * Register a voter in the L2 state
     */
    registerVoter(voterAddress: string, secret: string): void {
        const index = this.electionState.voters.size;
        const nullifier = calculateNullifier(secret, this.config.electionId);
        
        this.electionState.voters.set(voterAddress, {
            index,
            secret,
            hasVoted: false
        });
        
        console.log(`Voter registered: ${voterAddress} at index ${index}`);
    }
    
    /**
     * Get current sequencer status
     */
    getStatus(): SequencerStatus {
        return {
            isRunning: this.isRunning,
            pendingVotes: this.pendingVotes.length,
            currentBatchId: this.currentBatchId,
            lastBatchTimestamp: null,
            totalBatchesSubmitted: this.electionState.batchCount,
            totalVotesProcessed: this.electionState.voters.size
        };
    }
    
    /**
     * Get pending votes count
     */
    getPendingVotesCount(): number {
        return this.pendingVotes.length;
    }
    
    private batchProcessor: NodeJS.Timeout | null = null;
}
