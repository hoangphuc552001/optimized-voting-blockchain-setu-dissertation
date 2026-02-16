/**
 * Types for ZK Rollup Voting System
 */

/**
 * Vote message submitted by a voter
 */
export interface VoteMessage {
    voterAddress: string;
    candidateId: number;
    voteCommitment: string;  // Poseidon(voteOption, secret, nullifier, salt)
    nullifier: string;      // Poseidon(secret, electionId)
    signature: string;       // EIP-712 signature
    timestamp: number;
}

/**
 * Batch of votes for L1 submission
 */
export interface VoteBatch {
    batchId: number;
    electionId: string;
    oldStateRoot: string;
    newStateRoot: string;
    votes: VoteMessage[];
    candidateIds: number[];
    voteCommitments: string[];
    nullifiers: string[];
    voterSecrets: string[];
    voterIndices: number[];
    voterMerkleProofs: string[][];
    salts: string[];
    createdAt: Date;
    submittedAt?: Date;
}

/**
 * ZK Proof structure
 */
export interface ZKProof {
    a: [string, string];  // G1 point
    b: [[string, string], [string, string]];  // G2 point
    c: [string, string];  // G1 point
}

/**
 * Public inputs for the voting circuit
 */
export interface CircuitInputs {
    stateRoot: string;
    newStateRoot: string;
    voteCommitment: string;
    nullifier: string;
    candidateId: number;
    electionId: string;
    voterSecret: string;
    voterIndex: number;
    voterMerkleProof: string[];
    salt: string;
}

/**
 * Batch submission to L1
 */
export interface BatchSubmission {
    electionId: string;
    batchId: number;
    oldStateRoot: string;
    newStateRoot: string;
    voteCommitments: string[];
    nullifiers: string[];
    candidateIds: number[];
    proof: ZKProof;
    input: string[];
}

/**
 * Election configuration
 */
export interface ElectionConfig {
    electionId: string;
    name: string;
    candidates: string[];
    startTime: Date;
    endTime: Date;
    merkleTreeDepth: number;
    maxBatchSize: number;
}

/**
 * Voter registration data
 */
export interface VoterRegistration {
    voterAddress: string;
    voterIndex: number;
    secret: string;
    nullifier: string;
    merkleProof: string[];
    registeredAt: Date;
}

/**
 * Sequencer status
 */
export interface SequencerStatus {
    isRunning: boolean;
    pendingVotes: number;
    currentBatchId: number;
    lastBatchTimestamp: Date | null;
    totalBatchesSubmitted: number;
    totalVotesProcessed: number;
}

/**
 * Batch processing result
 */
export interface BatchResult {
    success: boolean;
    batchId: number;
    transactionHash?: string;
    error?: string;
    gasUsed?: bigint;
    proofGenerationTime?: number;
    submissionTime?: number;
}
