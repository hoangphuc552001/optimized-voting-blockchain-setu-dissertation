from ecdsa import SigningKey, VerifyingKey
import random

# Elliptic curve parameters for secp256k1
p = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141

# Create a key pair for each member in the ring
key_pairs = [SigningKey.generate() for _ in range(5)]
public_keys = [key_pair.verifying_key for key_pair in key_pairs]

def ring_sign(message, ring_index):
    # Choose a random value for the non-signer's key
    r = random.randint(1, n - 1)

    # Compute the non-signer's public key
    R = r * G

    # Compute the challenge
    challenge_input = str(R.x) + message
    e = int.from_bytes(hashlib.sha256(challenge_input.encode()).digest(), 'big') % n

    # Compute the signature
    s = (r + e * key_pairs[ring_index].signing_key.privkey.secret) % n

    return (R, s)

def ring_verify(message, signature, public_keys):
    R, s = signature

    # Compute the challenge
    challenge_input = str(R.x) + message
    e = int.from_bytes(hashlib.sha256(challenge_input.encode()).digest(), 'big') % n

    # Verify the signature
    for i in range(len(public_keys)):
        v = (R * s + public_keys[i] * e).pubkey.point
        if v.x % n == R.x:
            return True

    return False

# Example usage
message = "Hello, Ring Signature!"

# Choose a random member from the ring to sign
ring_index = random.randint(0, len(public_keys) - 1)

# Sign the message with the chosen ring member
signature = ring_sign(message, ring_index)

# Verify the signature
verification_result = ring_verify(message, signature, public_keys)
print("Verification Result:", verification_result)