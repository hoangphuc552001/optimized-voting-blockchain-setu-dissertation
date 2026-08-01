// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * StarkVerifier — on-chain verifier for the FibonacciSq zk-STARK.
 *
 * Verifies a FRI-based STARK proof entirely on-chain:
 *   • replays the keccak256 Fiat-Shamir transcript,
 *   • checks every trace + FRI Merkle authentication path,
 *   • recomputes the composition polynomial at each query point,
 *   • checks the FRI folding relation down to a constant final layer.
 *
 * Unlike Groth16 (one ecPairing precompile) or Bulletproofs (ecMul precompiles),
 * a STARK verifier is pure keccak + field arithmetic — hundreds of Merkle-path
 * hashes per proof. This is exactly why STARKs are verified off-chain in
 * production (StarkWare's SHARP) and only a fact is posted to L1. The gas this
 * contract reports is the empirical cost of direct L1 STARK verification.
 *
 * Fixed parameters (must match stark/stark.js PARAMS):
 *   trace length T = 64, blowup = 8, LDE size N = 512,
 *   coset offset = 5, FRI layers = 7, queries = 16.
 */
contract StarkVerifier {

    // ── Field + protocol constants ───────────────────────────────────────────
    uint256 constant P        = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant OFFSET   = 5;
    uint256 constant G_TRACE  = 9088801421649573101014283686030284801466796108869023335878462724291607593530;
    uint256 constant G_LAST   = 17229388088320038940941618493830445303168092387362094847263546333820121606543;
    uint256 constant G_LAST2  = 17704588942648532530972307366230787358793284390049200127770755029903181125533;
    uint256 constant OMEGA_N  = 6837567842312086091520287814181175430087169027974246751610506942214842701774;
    uint256 constant INV2     = 10944121435919637611123202872628637544274182200208017171849102093287904247809;

    uint256 constant T          = 64;
    uint256 constant N          = 512;
    uint256 constant BLOWUP     = 8;
    uint256 constant NUM_LAYERS = 7;
    uint256 constant NUM_QUERIES = 16;

    // ── Proof structures (ABI v2 calldata) ───────────────────────────────────
    struct Query {
        uint256 f0;            // f(x)
        uint256 fB;            // f(g·x)
        uint256 f2B;           // f(g²·x)
        bytes32[] proof0;      // trace Merkle paths
        bytes32[] proofB;
        bytes32[] proof2B;
        uint256[] friFa;       // per-layer pair low value
        uint256[] friFb;       // per-layer pair high value
        bytes32[][] friProofA; // per-layer Merkle path (low)
        bytes32[][] friProofB; // per-layer Merkle path (high)
    }
    struct Proof {
        uint256 output;
        bytes32 traceRoot;
        uint256 friFinalValue;
        bytes32[] friRoots;    // NUM_LAYERS roots
        Query[] queries;       // NUM_QUERIES queries
    }

    // ── Field helpers ─────────────────────────────────────────────────────────
    function _sub(uint256 a, uint256 b) internal pure returns (uint256) {
        return addmod(a, P - (b % P), P);
    }

    // Modular inverse via the modexp precompile (a^{P-2} mod P)
    function _inv(uint256 a) internal view returns (uint256) {
        (bool ok, bytes memory r) = address(0x05).staticcall(
            abi.encode(uint256(32), uint256(32), uint256(32), a % P, P - 2, P)
        );
        require(ok, "modexp");
        return abi.decode(r, (uint256));
    }

    // base^exp mod P (exp small: ≤ 511)
    function _pow(uint256 base, uint256 exp) internal pure returns (uint256 r) {
        r = 1; base %= P;
        while (exp > 0) {
            if (exp & 1 == 1) r = mulmod(r, base, P);
            base = mulmod(base, base, P);
            exp >>= 1;
        }
    }

    // rootOfUnity for FRI layer i (size N/2^i)
    function _layerOmega(uint256 i) internal pure returns (uint256) {
        if (i == 0) return 6837567842312086091520287814181175430087169027974246751610506942214842701774;
        if (i == 1) return 3478517300119284901893091970156912948790432420133812234316178878452092729974;
        if (i == 2) return 10359452186428527605436343203440067497552205259388878191021578220384701716497;
        if (i == 3) return 9088801421649573101014283686030284801466796108869023335878462724291607593530;
        if (i == 4) return 4419234939496763621076330863786513495701855246241724391626358375488475697872;
        if (i == 5) return 14940766826517323942636479241147756311199852622225275649687664389641784935947;
        return 19540430494807482326159819597004422086093766032135589407132600596362845576832; // i==6
    }

    // ── keccak transcript (matches stark/field.js Transcript) ─────────────────
    function _absorb(bytes32 state, bytes32 v) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(state, v));
    }
    function _challenge(bytes32 state) internal pure returns (uint256 c, bytes32 newState) {
        newState = keccak256(abi.encodePacked(state));
        c = uint256(newState) % P;
    }

    // ── Merkle path verification (matches stark/merkle.js) ────────────────────
    function _merkle(bytes32 root, uint256 value, uint256 index, bytes32[] calldata path)
        internal pure returns (bool)
    {
        bytes32 h = keccak256(abi.encodePacked(bytes32(value % P)));
        uint256 idx = index;
        for (uint256 j = 0; j < path.length; j++) {
            if (idx & 1 == 0) h = keccak256(abi.encodePacked(h, path[j]));
            else              h = keccak256(abi.encodePacked(path[j], h));
            idx >>= 1;
        }
        return h == root;
    }

    // ── Main verify ───────────────────────────────────────────────────────────
    function verify(Proof calldata proof) external view returns (bool) {
        require(proof.friRoots.length == NUM_LAYERS, "layers");
        require(proof.queries.length == NUM_QUERIES, "queries");

        // 1. Replay transcript → α0,α1,α2, β[], positions[]
        bytes32 state = bytes32(0);
        state = _absorb(state, bytes32(proof.output % P));
        state = _absorb(state, proof.traceRoot);

        uint256 a0; uint256 a1; uint256 a2;
        (a0, state) = _challenge(state);
        (a1, state) = _challenge(state);
        (a2, state) = _challenge(state);

        uint256[NUM_LAYERS] memory betas;
        for (uint256 i = 0; i < NUM_LAYERS; i++) {
            state = _absorb(state, proof.friRoots[i]);
            (betas[i], state) = _challenge(state);
        }
        state = _absorb(state, bytes32(proof.friFinalValue % P));

        uint256[NUM_QUERIES] memory positions;
        for (uint256 i = 0; i < NUM_QUERIES; i++) {
            uint256 c;
            (c, state) = _challenge(state);
            positions[i] = c % (N / 2);
        }

        // 2. Per-query verification
        for (uint256 k = 0; k < NUM_QUERIES; k++) {
            if (!_verifyQuery(proof, k, positions[k], a0, a1, a2, betas)) return false;
        }
        return true;
    }

    function _verifyQuery(
        Proof calldata proof,
        uint256 k,
        uint256 pos,
        uint256 a0, uint256 a1, uint256 a2,
        uint256[NUM_LAYERS] memory betas
    ) internal view returns (bool) {
        Query calldata q = proof.queries[k];

        // Trace Merkle openings at pos, pos+B, pos+2B
        if (!_merkle(proof.traceRoot, q.f0,  pos,                proof.queries[k].proof0))  return false;
        if (!_merkle(proof.traceRoot, q.fB,  (pos + BLOWUP) % N, proof.queries[k].proofB))  return false;
        if (!_merkle(proof.traceRoot, q.f2B, (pos + 2*BLOWUP) % N, proof.queries[k].proof2B)) return false;

        // Recompute composition polynomial CP at x = OFFSET·ω_N^pos
        uint256 x  = mulmod(OFFSET, _pow(OMEGA_N, pos), P);
        uint256 cp = _composition(x, q.f0, q.fB, q.f2B, proof.output, a0, a1, a2);

        // FRI verification, binding layer-0 value to CP
        return _friVerify(proof, k, pos, betas, cp);
    }

    function _composition(
        uint256 x, uint256 fx, uint256 fgx, uint256 fg2x,
        uint256 output, uint256 a0, uint256 a1, uint256 a2
    ) internal view returns (uint256) {
        // Boundary quotients
        uint256 q0 = mulmod(_sub(fx, 1),      _inv(_sub(x, 1)),      P);
        uint256 q1 = mulmod(_sub(fx, output), _inv(_sub(x, G_LAST)), P);

        // Transition quotient
        uint256 t = _sub(_sub(fg2x, mulmod(fgx, fgx, P)), mulmod(fx, fx, P));
        uint256 numer = mulmod(t, mulmod(_sub(x, G_LAST2), _sub(x, G_LAST), P), P);
        uint256 denom = _sub(_pow(x, T), 1);   // x^T − 1
        uint256 q2 = mulmod(numer, _inv(denom), P);

        return addmod(addmod(mulmod(a0, q0, P), mulmod(a1, q1, P), P), mulmod(a2, q2, P), P);
    }

    function _friVerify(
        Proof calldata proof,
        uint256 k,
        uint256 pos,
        uint256[NUM_LAYERS] memory betas,
        uint256 expectedCP
    ) internal view returns (bool) {
        Query calldata q = proof.queries[k];
        uint256 size = N;
        uint256 offset = OFFSET;
        uint256 p = pos;

        for (uint256 i = 0; i < NUM_LAYERS; i++) {
            uint256 half = size >> 1;
            uint256 a = p % half;
            uint256 b = a + half;

            // Merkle membership of the folding pair
            if (!_merkle(proof.friRoots[i], q.friFa[i], a, proof.queries[k].friProofA[i])) return false;
            if (!_merkle(proof.friRoots[i], q.friFb[i], b, proof.queries[k].friProofB[i])) return false;

            // Layer-0 binding: opened low value must equal recomputed CP
            if (i == 0 && q.friFa[0] != expectedCP) return false;

            // Fold: folded = even + β·odd, even=(fa+fb)/2, odd=(fa−fb)/(2x)
            uint256 x   = mulmod(offset, _pow(_layerOmega(i), a), P);
            uint256 fa  = q.friFa[i];
            uint256 fb  = q.friFb[i];
            uint256 even = mulmod(addmod(fa, fb, P), INV2, P);
            uint256 odd  = mulmod(mulmod(_sub(fa, fb), INV2, P), _inv(x), P);
            uint256 folded = addmod(even, mulmod(betas[i], odd, P), P);

            if (i + 1 < NUM_LAYERS) {
                uint256 nextHalf = half >> 1;
                uint256 expected = (a < nextHalf) ? q.friFa[i + 1] : q.friFb[i + 1];
                if (folded != expected) return false;
            } else {
                if (folded != proof.friFinalValue % P) return false;
            }

            offset = mulmod(offset, offset, P);
            size = half;
            p = a;
        }
        return true;
    }
}
