# Install libSTARK first: pip install libstark

from starkware.starknet.compiler.compile import compile_full_sir
from starkware.starknet.definitions import HashBuiltin, PointerBuiltin
from starkware.starknet.starknet import HashMemory, starknet_sha256
from starkware.starknet.testing.starknet import Starknet

def main():
    # Define a simple arithmetic circuit for demonstration.
    contract_code = """
    @builtin
    def add(a: felt, b: felt) -> (out: felt):
        return a + b

    @builtin
    def verify_proof(
        proof: felt[3],
        public_inputs: felt[1],
    ):
        assert(starknet_sha256(public_inputs) == proof[0])
    """

    # Compile the contract.
    compiled_contract = compile_full_sir(contract_code)

    # Set up the Starknet environment.
    starknet = Starknet()

    # Deploy the contract.
    contract_address = starknet.deploy_keyless(
        compiled_contract, entry_point_selector="add"
    )

    # Generate zk-STARK proof.
    proof = starknet.generate_zk_stark_proof(
        compiled_contract=compiled_contract,
        contract_address=contract_address,
        private_input=[2, 3],  # Private inputs to the arithmetic circuit.
        public_input=[5],     # Public inputs to the arithmetic circuit.
    )

    # Verify the zk-STARK proof.
    starknet.verify_zk_stark_proof(
        compiled_contract=compiled_contract,
        contract_address=contract_address,
        proof=proof,
        public_input=[5],
    )

if __name__ == "__main__":
    main()