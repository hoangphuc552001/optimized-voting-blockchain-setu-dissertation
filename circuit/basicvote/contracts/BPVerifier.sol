// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * BPVerifier — on-chain Bulletproofs range-proof verifier for BN254.
 *
 * Verifies v ∈ [0, 2^4 − 1] using a 4-bit range proof (n=4, logN=2).
 * Uses ecAdd (0x06) and ecMul (0x07) precompiles only — no pairing.
 *
 * Proof uint256[23] layout:
 *   [0-1]   V  (Pedersen commitment x,y)
 *   [2-3]   A
 *   [4-5]   S
 *   [6-7]   T1
 *   [8-9]   T2
 *   [10]    tHat
 *   [11]    taux
 *   [12]    mu
 *   [13-14] L0 (IPA round 0)
 *   [15-16] L1 (IPA round 1)
 *   [17-18] R0
 *   [19-20] R1
 *   [21]    a_final
 *   [22]    b_final
 */
contract BPVerifier {

    uint256 constant Fr = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant Fp = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // ── Curve point struct ────────────────────────────────────────────────────
    struct Pt { uint256 x; uint256 y; }

    // ── Fixed generators (pre-computed from curve.js) ─────────────────────────
    function _G()    internal pure returns (Pt memory) { return Pt(1, 2); }
    function _H()    internal pure returns (Pt memory) {
        return Pt(
            7602622103091773031770593388976144139837648121842292661846405771731647145124,
            12571370945728248811586720553835895923013431289099967098475718122668077765162
        );
    }
    function _QB()   internal pure returns (Pt memory) {
        return Pt(
            1605235499101127515271347109364560958410746548823132215329944545664239065423,
            17654467059365167848735425591809563535921512731490744936008978182466848583994
        );
    }
    function _Gvec(uint256 i) internal pure returns (Pt memory) {
        if (i == 0) return Pt(5632570136534031755076012295884615932903637220174579167246286552399271881278,
                              7779859663763793256826355970478624268027277914152541370509545995915828113055);
        if (i == 1) return Pt(5553462190628394900036918005882440376376685929993187402368592273309325233861,
                              10836344674832967405671197417516161718920790588781292330288577836615283081869);
        if (i == 2) return Pt(9123127078265675010970477115645922672792842959628151926824204689425645554828,
                              3195830643149458233010776675677578641364113748567152067427590822391374834667);
        return         Pt(12700154239438382195624220066191485552284866710911069101040802741974114771744,
                          7624740745879928557082038280689404398125560453194470605913701020868390307391);
    }
    function _Hvec(uint256 i) internal pure returns (Pt memory) {
        if (i == 0) return Pt(16965038502858391181172435924674911856477492283178614726029771504110163549730,
                              8770484075235386690813900959671985715201748293216142841969417903060982375971);
        if (i == 1) return Pt(12682342943918163415630237301884559372757387447440647580734805093621389159024,
                              8831803421841694326763294579350343185278896953255348624467680435089677283135);
        if (i == 2) return Pt(7733796833692718850002153749684016733500793992707043706015496022623756557671,
                              6425696450066249849347998219388470333806048740634200283624118963159478205287);
        return         Pt(2040259890884235795039372582184058561580909361032923777841377294031068862464,
                          5451094062362220583497889023441144442910403721140433426671474610218001377199);
    }

    // ── EC precompile helpers ─────────────────────────────────────────────────

    function _add(Pt memory a, Pt memory b) internal view returns (Pt memory r) {
        if (a.x == 0 && a.y == 0) return b;
        if (b.x == 0 && b.y == 0) return a;
        (bool ok, bytes memory res) = address(6).staticcall(abi.encode(a.x, a.y, b.x, b.y));
        require(ok, "ecAdd");
        (r.x, r.y) = abi.decode(res, (uint256, uint256));
    }

    function _mul(Pt memory p, uint256 s) internal view returns (Pt memory r) {
        s = s % Fr;
        if (s == 0 || (p.x == 0 && p.y == 0)) return Pt(0, 0);
        (bool ok, bytes memory res) = address(7).staticcall(abi.encode(p.x, p.y, s));
        require(ok, "ecMul");
        (r.x, r.y) = abi.decode(res, (uint256, uint256));
    }

    function _neg(Pt memory p) internal pure returns (Pt memory) {
        if (p.x == 0 && p.y == 0) return p;
        return Pt(p.x, Fp - (p.y % Fp));
    }

    function _sub(Pt memory a, Pt memory b) internal view returns (Pt memory) {
        return _add(a, _neg(b));
    }

    function _frInv(uint256 a) internal view returns (uint256) {
        (bool ok, bytes memory res) = address(5).staticcall(
            abi.encode(uint256(32), uint256(32), uint256(32), a % Fr, Fr - 2, Fr)
        );
        require(ok, "modexp");
        return abi.decode(res, (uint256));
    }

    // ── Fiat-Shamir transcript ────────────────────────────────────────────────

    function _hashPts(Pt memory a, Pt memory b, Pt memory c) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(a.x,a.y,b.x,b.y,c.x,c.y))) % Fr;
    }
    function _hash1(uint256 v)   internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(v))) % Fr;
    }
    function _hash2(uint256 a, uint256 b) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(a,b))) % Fr;
    }
    function _hash3(uint256 a, uint256 b, Pt memory T1, Pt memory T2)
        internal pure returns (uint256)
    {
        return uint256(keccak256(abi.encode(a,b,T1.x,T1.y,T2.x,T2.y))) % Fr;
    }
    function _hashPair(Pt memory L, Pt memory R) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(L.x,L.y,R.x,R.y))) % Fr;
    }

    // ── δ(y,z) for n=4 ───────────────────────────────────────────────────────

    function _delta(uint256 y, uint256 z) internal pure returns (uint256) {
        uint256 y2 = mulmod(y,  y, Fr);
        uint256 y3 = mulmod(y2, y, Fr);
        uint256 sumYn  = addmod(addmod(addmod(1, y, Fr), y2, Fr), y3, Fr);
        uint256 sumTwo = 15; // 1+2+4+8
        uint256 z2 = mulmod(z, z, Fr);
        uint256 z3 = mulmod(z2, z, Fr);
        return addmod(
            mulmod(addmod(z, Fr - z2, Fr), sumYn,  Fr),
            Fr - mulmod(z3, sumTwo, Fr),
            Fr
        );
    }

    // ── Main verify ───────────────────────────────────────────────────────────

    function verify(uint256[23] calldata p) external view returns (bool) {
        Pt memory V  = Pt(p[0],  p[1]);
        Pt memory A  = Pt(p[2],  p[3]);
        Pt memory S  = Pt(p[4],  p[5]);
        Pt memory T1 = Pt(p[6],  p[7]);
        Pt memory T2 = Pt(p[8],  p[9]);
        uint256 tHat = p[10];
        uint256 taux = p[11];
        uint256 mu   = p[12];
        Pt memory L0 = Pt(p[13], p[14]);
        Pt memory L1 = Pt(p[15], p[16]);
        Pt memory R0 = Pt(p[17], p[18]);
        Pt memory R1 = Pt(p[19], p[20]);
        uint256 a_f  = p[21];
        uint256 b_f  = p[22];

        // Fiat-Shamir challenges
        uint256 y  = _hashPts(V, A, S);
        uint256 z  = _hash1(y);
        uint256 x  = _hash3(y, z, T1, T2);
        uint256 z2 = mulmod(z, z, Fr);
        uint256 x2 = mulmod(x, x, Fr);

        // ── Check 1: t̂·G + τₓ·H == z²·V + δ·G + x·T1 + x²·T2 ─────────────
        {
            Pt memory lhs = _add(_mul(_G(), tHat), _mul(_H(), taux));
            Pt memory rhs = _add(
                _add(_mul(V, z2), _mul(_G(), _delta(y, z))),
                _add(_mul(T1, x), _mul(T2, x2))
            );
            if (lhs.x != rhs.x || lhs.y != rhs.y) return false;
        }

        // ── Check 2: IPA ──────────────────────────────────────────────────────

        // y_inv powers: [1, y^{-1}, y^{-2}, y^{-3}]
        uint256 yi   = _frInv(y);
        uint256 yi2  = mulmod(yi, yi, Fr);
        uint256 yi3  = mulmod(yi2, yi, Fr);
        uint256[4] memory yiArr;
        yiArr[0] = 1; yiArr[1] = yi; yiArr[2] = yi2; yiArr[3] = yi3;

        // Q = QB * fsHash(x, tHat)
        Pt memory Q = _mul(_QB(), _hash2(x, tHat));

        // IPA round challenges
        uint256 c0  = _hashPair(L0, R0);
        uint256 c1  = _hashPair(L1, R1);
        uint256 c0i = _frInv(c0);
        uint256 c1i = _frInv(c1);

        // Build P_init = P_IPA + tHat·Q
        Pt memory P = _add(_buildPIPA(A, S, x, z, z2, mu, yiArr), _mul(Q, tHat));

        // Fold: P' = c^2·L + P + c^{-2}·R  (round 0 then round 1)
        P = _add(_mul(L0, mulmod(c0,c0,Fr)), _add(P, _mul(R0, mulmod(c0i,c0i,Fr))));
        P = _add(_mul(L1, mulmod(c1,c1,Fr)), _add(P, _mul(R1, mulmod(c1i,c1i,Fr))));

        // Folding scalars s[i]
        uint256[4] memory s;
        s[0] = mulmod(c0i, c1i, Fr);
        s[1] = mulmod(c0i, c1,  Fr);
        s[2] = mulmod(c0,  c1i, Fr);
        s[3] = mulmod(c0,  c1,  Fr);

        // G_final = Σ s[i]·G_vec[i]
        Pt memory Gf = Pt(0, 0);
        for (uint256 i = 0; i < 4; i++) Gf = _add(Gf, _mul(_Gvec(i), s[i]));

        // H_final: coeff[i] = s_inv[i] * yn_inv[i]
        Pt memory Hf = Pt(0, 0);
        for (uint256 i = 0; i < 4; i++) {
            uint256 coeff = mulmod(_frInv(s[i]), yiArr[i], Fr);
            Hf = _add(Hf, _mul(_Hvec(i), coeff));
        }

        // Expected = a_f·Gf + b_f·Hf + (a_f·b_f)·Q
        Pt memory exp = _add(
            _add(_mul(Gf, a_f), _mul(Hf, b_f)),
            _mul(Q, mulmod(a_f, b_f, Fr))
        );
        return (P.x == exp.x && P.y == exp.y);
    }

    // ── P_IPA builder (split to avoid stack depth) ────────────────────────────

    function _buildPIPA(
        Pt memory A, Pt memory S,
        uint256 x, uint256 z, uint256 z2, uint256 mu,
        uint256[4] memory yiArr
    ) internal view returns (Pt memory r) {
        // A + x·S
        r = _add(A, _mul(S, x));

        // − z·ΣG_vec
        Pt memory sumG = Pt(0, 0);
        for (uint256 i = 0; i < 4; i++) sumG = _add(sumG, _Gvec(i));
        r = _sub(r, _mul(sumG, z));

        // + Σ (z + z²·2^i·y^{-i}) · H_vec[i]
        uint256 twoi = 1;
        for (uint256 i = 0; i < 4; i++) {
            uint256 coeff = addmod(z, mulmod(z2, mulmod(twoi, yiArr[i], Fr), Fr), Fr);
            r = _add(r, _mul(_Hvec(i), coeff));
            twoi = mulmod(twoi, 2, Fr);
        }

        // − μ·H
        r = _sub(r, _mul(_H(), mu));
    }
}
