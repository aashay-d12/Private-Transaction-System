pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

template NoteCommitment() {
    signal input amount;
    signal input serial;
    signal input secret;
    signal input ownerPublicKey;
    signal output commitment;

    component hasher = Poseidon(4);
    hasher.inputs[0] <== amount;
    hasher.inputs[1] <== serial;
    hasher.inputs[2] <== secret;
    hasher.inputs[3] <== ownerPublicKey;

    commitment <== hasher.out;
}

template NullifierHash() {
    signal input serial;
    signal output nullifier;

    component hasher = Poseidon(1);
    hasher.inputs[0] <== serial;

    nullifier <== hasher.out;
}

template MerkleMembership(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    signal hashes[levels + 1];
    signal left[levels];
    signal right[levels];
    hashes[0] <== leaf;

    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        left[i] <== hashes[i] + pathIndices[i] * (pathElements[i] - hashes[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (hashes[i] - pathElements[i]);

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];

        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[levels];
}

template ShieldedTransfer(levels) {
    signal input root;
    signal input nullifierHash;
    signal input outputCommitment0;
    signal input outputCommitment1;

    signal input inputAmount;
    signal input inputSerial;
    signal input inputSecret;
    signal input inputOwnerPublicKey;

    signal input outputAmount0;
    signal input outputSerial0;
    signal input outputSecret0;
    signal input outputOwnerPublicKey0;

    signal input outputAmount1;
    signal input outputSerial1;
    signal input outputSecret1;
    signal input outputOwnerPublicKey1;

    signal input pathElements[levels];
    signal input pathIndices[levels];

    component inputNote = NoteCommitment();
    inputNote.amount <== inputAmount;
    inputNote.serial <== inputSerial;
    inputNote.secret <== inputSecret;
    inputNote.ownerPublicKey <== inputOwnerPublicKey;

    component membership = MerkleMembership(levels);
    membership.leaf <== inputNote.commitment;
    for (var i = 0; i < levels; i++) {
        membership.pathElements[i] <== pathElements[i];
        membership.pathIndices[i] <== pathIndices[i];
    }
    membership.root === root;

    component nullifier = NullifierHash();
    nullifier.serial <== inputSerial;
    nullifier.nullifier === nullifierHash;

    component out0 = NoteCommitment();
    out0.amount <== outputAmount0;
    out0.serial <== outputSerial0;
    out0.secret <== outputSecret0;
    out0.ownerPublicKey <== outputOwnerPublicKey0;
    out0.commitment === outputCommitment0;

    component out1 = NoteCommitment();
    out1.amount <== outputAmount1;
    out1.serial <== outputSerial1;
    out1.secret <== outputSecret1;
    out1.ownerPublicKey <== outputOwnerPublicKey1;
    out1.commitment === outputCommitment1;

    inputAmount === outputAmount0 + outputAmount1;
}

component main { public [root, nullifierHash, outputCommitment0, outputCommitment1] } = ShieldedTransfer(20);
