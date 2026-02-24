pragma circom 2.0.0;

template SumEquals5() {
    signal input a;
    signal input b;
    signal output out;

    out <== a + b;
    out === 5;
}

component main = SumEquals5();

