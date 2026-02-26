pragma circom 2.0.0;

template Multiplier() {
    // private
    signal input a;
    signal input b;

    // public
    signal input c;

    // intermediate
    signal product;
    

    // Rule 1
    // <==: assign + constraint
    // In R1CS (Rank-1 Constraint System) format, this becomes:
    //   a * b - product = 0
    product <== a * b;
    

    // Rule 2
    c === product;

}
component main {public [c]} = Multiplier();
