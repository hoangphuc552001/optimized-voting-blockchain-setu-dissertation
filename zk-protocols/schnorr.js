// Schnorr protocol parameters
const p = 23; // Prime number
const g = 5;  // Generator

// Simple random int in [min, max]
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Private and public key
const x = randInt(1, p - 1);       // Private key
const y = BigInt(g) ** BigInt(x) % BigInt(p); // Public key (using BigInt pow)

// Modular exponentiation helper (since JS doesn't have powmod for BigInt)
function modPow(base, exp, mod) {
    let result = 1n;
    let b = BigInt(base) % BigInt(mod);
    let e = BigInt(exp);
    const m = BigInt(mod);

    while (e > 0n) {
        if (e & 1n) {
            result = (result * b) % m;
        }
        b = (b * b) % m;
        e >>= 1n;
    }
    return result;
}

// Schnorr protocol: Prover
function schnorrProver() {
    const r = randInt(1, p - 1);             // Step 1: random r
    const commitment = modPow(g, r, p);      // Step 2: t = g^r mod p
    return { commitment, r };
}

// Schnorr protocol: Verifier
function schnorrVerifier(commitment, publicKey) {
    const e = randInt(1, p - 1);             // Step 4: random challenge
    return e;                                // Step 5: send e
}

// Schnorr protocol: Prover response
function schnorrProverResponse(r, privateKey, e) {
    // Step 6: s = r + e * x mod (p - 1)
    const s = (r + e * privateKey) % (p - 1);
    return s;
}

// Schnorr protocol: Verifier verification
function schnorrVerifierVerification(commitment, publicKey, e, response) {
    // Step 8: check g^s ?= commitment * publicKey^e  (mod p)
    const check1 = modPow(g, response, p);              // g^s mod p
    const check2 =
        (commitment * modPow(publicKey, e, p)) % BigInt(p); // t * y^e mod p

    return check1 === check2;
}

// Schnorr protocol execution
const { commitment, r } = schnorrProver();
const e = schnorrVerifier(commitment, y);
const s = schnorrProverResponse(r, x, e);
const verificationResult = schnorrVerifierVerification(commitment, y, e, s);

console.log("Private key x:", x);
console.log("Public key y:", y.toString());
console.log("Commitment t:", commitment.toString());
console.log("Challenge e:", e);
console.log("Response s:", s);
console.log("Schnorr Protocol Verification Result:", verificationResult);


let wrongPrivateKey = randInt(1, p - 1);
while (wrongPrivateKey === x) {
    wrongPrivateKey = randInt(1, p - 1);
}

const { commitment: commitment2, r: r2 } = schnorrProver();
const e2 = schnorrVerifier(commitment2, y);
const s2 = schnorrProverResponse(r2, wrongPrivateKey, e2);
const verificationResult2 = schnorrVerifierVerification(commitment2, y, e2, s2);

console.log("\n--- Rejected Proof Case ---");
console.log("Correct private key x:", x);
console.log("Wrong private key used:", wrongPrivateKey);
console.log("Commitment t:", commitment2.toString());
console.log("Challenge e:", e2);
console.log("Response s (with wrong key):", s2);
console.log("Schnorr Protocol Verification Result:", verificationResult2);