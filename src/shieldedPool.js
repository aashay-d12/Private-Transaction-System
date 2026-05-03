import { createNote } from "./crypto.js";
import { MerkleTree } from "./merkleTree.js";
import { MockSnark } from "./mockSnark.js";

export class ShieldedPool {
  constructor({ depth = 4, proofSystem = new MockSnark() } = {}) {
    this.tree = new MerkleTree(depth);
    this.proofSystem = proofSystem;
    this.knownRoots = new Set([this.tree.root()]);
    this.spentNullifiers = new Set();
  }

  deposit({ amount, ownerPublicKey }) {
    const note = createNote({ amount, ownerPublicKey });
    const leafIndex = this.tree.insert(note.commitment);
    this.knownRoots.add(this.tree.root());

    return {
      note,
      publicEntry: {
        type: "deposit",
        commitment: note.commitment,
        leafIndex,
        root: this.tree.root()
      }
    };
  }

  createTransfer({ inputNote, recipientPublicKey, amount }) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("Transfer amount must be a positive integer");
    }

    if (amount >= inputNote.amount) {
      throw new Error("Transfer amount must leave positive change in this two-output prototype");
    }

    const inputIndex = this.tree.indexOf(inputNote.commitment);
    if (inputIndex < 0) {
      throw new Error("Input note does not exist in the shielded pool");
    }

    if (this.spentNullifiers.has(inputNote.nullifier)) {
      throw new Error("Input note has already been spent");
    }

    const receiverNote = this.proofSystem.createOutputNote({
      amount,
      ownerPublicKey: recipientPublicKey
    });

    const changeNote = this.proofSystem.createOutputNote({
      amount: inputNote.amount - amount,
      ownerPublicKey: inputNote.ownerPublicKey
    });

    const root = this.tree.root();
    const inputPath = this.tree.path(inputIndex);
    const { proof, publicInputs } = this.proofSystem.proveTransfer({
      tree: this.tree,
      inputNote,
      inputPath,
      root,
      outputNotes: [receiverNote, changeNote]
    });

    return {
      transaction: { proof, publicInputs },
      privateOutputs: {
        receiverNote,
        changeNote
      }
    };
  }

  broadcastTransfer(transaction) {
    const { proof, publicInputs } = transaction;

    if (!this.knownRoots.has(publicInputs.root)) {
      throw new Error("Unknown Merkle root");
    }

    if (this.spentNullifiers.has(publicInputs.nullifier)) {
      throw new Error("Nullifier has already been used");
    }

    if (!this.proofSystem.verifyTransfer({ proof, publicInputs })) {
      throw new Error("Invalid zk proof");
    }

    this.spentNullifiers.add(publicInputs.nullifier);

    for (const commitment of publicInputs.outputCommitments) {
      this.tree.insert(commitment);
    }

    this.knownRoots.add(this.tree.root());

    return {
      accepted: true,
      newRoot: this.tree.root(),
      insertedCommitments: publicInputs.outputCommitments
    };
  }
}
