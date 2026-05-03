import { hashParts, createNote } from "./crypto.js";

export class MockSnark {
  constructor() {
    this.acceptedProofs = new Map();
  }

  createOutputNote({ amount, ownerPublicKey }) {
    return createNote({ amount, ownerPublicKey });
  }

  proveTransfer({ tree, inputNote, inputPath, root, outputNotes }) {
    if (!tree.verifyPath({ leaf: inputNote.commitment, path: inputPath, root })) {
      throw new Error("Input note is not a member of the supplied Merkle root");
    }

    const outputTotal = outputNotes.reduce((sum, note) => sum + note.amount, 0);
    if (inputNote.amount !== outputTotal) {
      throw new Error("Input amount must equal output amount total");
    }

    const publicInputs = {
      root,
      nullifier: inputNote.nullifier,
      outputCommitments: outputNotes.map((note) => note.commitment)
    };

    const proof = hashParts(
      "mock-proof",
      publicInputs,
      inputNote.serial,
      inputNote.secret,
      outputNotes.map((note) => [note.amount, note.serial, note.secret, note.ownerPublicKey])
    );

    this.acceptedProofs.set(proof, hashParts("public-inputs", publicInputs));

    return { proof, publicInputs };
  }

  verifyTransfer({ proof, publicInputs }) {
    return this.acceptedProofs.get(proof) === hashParts("public-inputs", publicInputs);
  }
}
