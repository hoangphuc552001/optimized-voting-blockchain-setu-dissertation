from pybulletproofs import Bulletproof, PedersenCommitment
from hashlib import sha256
import os

def generate_commitment(value, blinding_factor):
    # Use Pedersen commitments as the building blocks for Bulletproofs.
    generator = PedersenCommitment.commit(1, 0, blinding_factor)

    commitment = PedersenCommitment.commit(value, 0, blinding_factor)
    return commitment, generator

def prove_range(commitment, blinding_factor, value):
    # Generate a range proof.
    proof = Bulletproof.prove(commitments=[commitment], values=[value], blinding_factors=[blinding_factor])

    # Verify the proof.
    assert Bulletproof.verify(proof)

    return proof

def main():
    # Parameters
    value = 42
    blinding_factor = int.from_bytes(os.urandom(32), 'big')

    # Generate a commitment
    commitment, generator = generate_commitment(value, blinding_factor)

    # Prove the range
    proof = prove_range(commitment, blinding_factor, value)

    print("Range Proof Verification Result:", Bulletproof.verify(proof))
    print("Commitment:", commitment)

if __name__ == "__main__":
    main()