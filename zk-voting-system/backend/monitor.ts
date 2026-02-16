import { ethers } from 'ethers';
import { ElectionService } from './services/ElectionService';
import dotenv from 'dotenv';

dotenv.config();

class ElectionMonitor {
  private provider: ethers.JsonRpcProvider;
  private electionService: ElectionService;
  private monitoredElections: Set<string> = new Set();

  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || 'http://localhost:8545');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', this.provider);
    this.electionService = new ElectionService(wallet);
  }

  async monitorElection(electionAddress: string): Promise<void> {
    if (this.monitoredElections.has(electionAddress)) {
      console.log(`Already monitoring election at ${electionAddress}`);
      return;
    }

    console.log(`Starting to monitor election at ${electionAddress}`);
    this.monitoredElections.add(electionAddress);

    const election = await this.electionService.getElectionContract(electionAddress);

    // Listen for VoteCast events
    election.on('VoteCast', (voter, candidateId, event) => {
      console.log(`📊 New vote cast:`);
      console.log(`   Voter: ${voter}`);
      console.log(`   Candidate ID: ${candidateId}`);
      console.log(`   Transaction: ${event.log.transactionHash}`);
      console.log(`   Block: ${event.log.blockNumber}`);
      console.log('---');
    });

    // Listen for VoterRegistered events
    election.on('VoterRegistered', (voter, event) => {
      console.log(`👤 New voter registered:`);
      console.log(`   Voter: ${voter}`);
      console.log(`   Transaction: ${event.log.transactionHash}`);
      console.log(`   Block: ${event.log.blockNumber}`);
      console.log('---');
    });

    // Periodic status updates
    this.startPeriodicStatusUpdates(electionAddress);
  }

  private startPeriodicStatusUpdates(electionAddress: string): void {
    const updateInterval = setInterval(async () => {
      try {
        const status = await this.electionService.getElectionStatus(electionAddress);
        const results = await this.electionService.getElectionResults(electionAddress);

        console.log(`\n📈 Election Status Update (${electionAddress}):`);
        console.log(`   Active: ${status.isActive}`);
        console.log(`   Total Candidates: ${status.totalCandidates}`);
        console.log(`   Total Votes: ${results.totalVotes}`);

        if (status.timeUntilStart && status.timeUntilStart > 0) {
          const hours = Math.floor(status.timeUntilStart / 3600);
          const minutes = Math.floor((status.timeUntilStart % 3600) / 60);
          console.log(`   Time until start: ${hours}h ${minutes}m`);
        } else if (status.timeUntilEnd && status.timeUntilEnd > 0) {
          const hours = Math.floor(status.timeUntilEnd / 3600);
          const minutes = Math.floor((status.timeUntilEnd % 3600) / 60);
          console.log(`   Time until end: ${hours}h ${minutes}m`);
        }

        console.log('   Current Results:');
        results.candidates.forEach(candidate => {
          console.log(`     ${candidate.name}: ${candidate.voteCount} votes`);
        });

        // Check if election has ended and show winner
        if (!status.isActive && status.timeUntilEnd && status.timeUntilEnd <= 0) {
          try {
            const winner = await this.electionService.getWinner(electionAddress);
            console.log(`   🏆 Winner: ${winner.name} with ${winner.voteCount} votes`);
          } catch (error) {
            // Election might still be considered active in contract
          }
        }

        console.log('---\n');
      } catch (error) {
        console.error('Error updating election status:', error);
      }
    }, 30000); // Update every 30 seconds

    // Store interval for cleanup if needed
    (this as any)[`interval_${electionAddress}`] = updateInterval;
  }

  async getHistoricalEvents(electionAddress: string): Promise<void> {
    console.log(`\n📚 Historical Events for ${electionAddress}:`);

    try {
      const voteEvents = await this.electionService.getVoteEvents(electionAddress);
      const registrationEvents = await this.electionService.getVoterRegistrationEvents(electionAddress);

      console.log(`Found ${voteEvents.length} vote events and ${registrationEvents.length} registration events`);

      console.log('\nVote Events:');
      voteEvents.forEach((event, index) => {
        console.log(`${index + 1}. Voter: ${event.voter}, Candidate: ${event.candidateId}, Block: ${event.blockNumber}`);
      });

      console.log('\nRegistration Events:');
      registrationEvents.forEach((event, index) => {
        console.log(`${index + 1}. Voter: ${event.voter}, Block: ${event.blockNumber}`);
      });

    } catch (error) {
      console.error('Error fetching historical events:', error);
    }
  }

  stopMonitoring(electionAddress: string): void {
    if (this.monitoredElections.has(electionAddress)) {
      // Clear periodic updates
      const intervalKey = `interval_${electionAddress}`;
      if ((this as any)[intervalKey]) {
        clearInterval((this as any)[intervalKey]);
        delete (this as any)[intervalKey];
      }

      // Remove from monitored set
      this.monitoredElections.delete(electionAddress);
      console.log(`Stopped monitoring election at ${electionAddress}`);
    }
  }

  getMonitoredElections(): string[] {
    return Array.from(this.monitoredElections);
  }
}

// CLI interface
async function main() {
  const monitor = new ElectionMonitor();
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'start':
      if (!args[1]) {
        console.log('Usage: npm run monitor start <election-address>');
        process.exit(1);
      }
      await monitor.monitorElection(args[1]);
      console.log('Press Ctrl+C to stop monitoring');
      // Keep process alive
      process.on('SIGINT', () => {
        console.log('\nStopping all monitoring...');
        monitor.getMonitoredElections().forEach(address => {
          monitor.stopMonitoring(address);
        });
        process.exit(0);
      });
      break;

    case 'history':
      if (!args[1]) {
        console.log('Usage: npm run monitor history <election-address>');
        process.exit(1);
      }
      await monitor.getHistoricalEvents(args[1]);
      break;

    case 'status':
      console.log('Currently monitoring:', monitor.getMonitoredElections());
      break;

    default:
      console.log('Election Monitor Commands:');
      console.log('  npm run monitor start <election-address>   - Start monitoring an election');
      console.log('  npm run monitor history <election-address> - Show historical events');
      console.log('  npm run monitor status                      - Show monitored elections');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { ElectionMonitor };
