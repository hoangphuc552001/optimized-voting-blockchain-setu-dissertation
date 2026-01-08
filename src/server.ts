import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { ElectionService } from './services/ElectionService';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Initialize blockchain connection
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || 'http://localhost:8545');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider);
const electionService = new ElectionService(wallet);

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Election management routes
app.post('/elections', async (req, res) => {
  try {
    const { candidates, startTime, endTime } = req.body;

    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: 'Candidates array is required' });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'Start time and end time are required' });
    }

    const contractAddress = await electionService.deployElection(candidates, startTime, endTime);

    res.json({
      success: true,
      contractAddress,
      message: 'Election deployed successfully'
    });
  } catch (error) {
    console.error('Error deploying election:', error);
    res.status(500).json({ error: 'Failed to deploy election' });
  }
});

app.get('/elections/:address/status', async (req, res) => {
  try {
    const { address } = req.params;
    const status = await electionService.getElectionStatus(address);

    res.json(status);
  } catch (error) {
    console.error('Error getting election status:', error);
    res.status(500).json({ error: 'Failed to get election status' });
  }
});

app.get('/elections/:address/results', async (req, res) => {
  try {
    const { address } = req.params;
    const results = await electionService.getElectionResults(address);

    res.json(results);
  } catch (error) {
    console.error('Error getting election results:', error);
    res.status(500).json({ error: 'Failed to get election results' });
  }
});

app.get('/elections/:address/winner', async (req, res) => {
  try {
    const { address } = req.params;
    const winner = await electionService.getWinner(address);

    res.json(winner);
  } catch (error) {
    console.error('Error getting winner:', error);
    res.status(400).json({ error: error.message || 'Failed to get winner' });
  }
});

// Voter management routes
app.post('/elections/:address/voters', async (req, res) => {
  try {
    const { address } = req.params;
    const { voters } = req.body;

    if (!voters || !Array.isArray(voters)) {
      return res.status(400).json({ error: 'Voters array is required' });
    }

    await electionService.registerVoters(address, voters);

    res.json({
      success: true,
      message: `Registered ${voters.length} voters successfully`
    });
  } catch (error) {
    console.error('Error registering voters:', error);
    res.status(500).json({ error: 'Failed to register voters' });
  }
});

app.get('/elections/:address/voters/:voterAddress', async (req, res) => {
  try {
    const { address, voterAddress } = req.params;
    const isRegistered = await electionService.isVoterRegistered(address, voterAddress);

    res.json({ isRegistered });
  } catch (error) {
    console.error('Error checking voter registration:', error);
    res.status(500).json({ error: 'Failed to check voter registration' });
  }
});

// Voting route (for backend-assisted voting)
app.post('/elections/:address/vote', async (req, res) => {
  try {
    const { address } = req.params;
    const { voterAddress, candidateId } = req.body;

    if (!voterAddress || candidateId === undefined) {
      return res.status(400).json({ error: 'Voter address and candidate ID are required' });
    }

    // Note: In production, you'd want additional authentication here
    // For now, this allows backend-assisted voting
    const txHash = await electionService.castVote(address, voterAddress, candidateId);

    res.json({
      success: true,
      transactionHash: txHash,
      message: 'Vote cast successfully'
    });
  } catch (error: any) {
    console.error('Error casting vote:', error);
    res.status(400).json({ error: error.message || 'Failed to cast vote' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Election backend server running on port ${port}`);
  console.log(`Connected to network: ${process.env.SEPOLIA_RPC_URL ? 'Sepolia' : 'Local'}`);
});
