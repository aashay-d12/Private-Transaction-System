import assert from "node:assert/strict";
import test from "node:test";

import { ShieldedPool } from "../src/shieldedPool.js";

test("deposit publishes a commitment instead of private note data", () => {
  const pool = new ShieldedPool();
  const { note, publicEntry } = pool.deposit({ amount: 10, ownerPublicKey: "alice" });

  assert.equal(publicEntry.type, "deposit");
  assert.equal(publicEntry.commitment, note.commitment);
  assert.equal(publicEntry.amount, undefined);
  assert.equal(publicEntry.ownerPublicKey, undefined);
  assert.equal(pool.tree.hasLeaf(note.commitment), true);
});

test("shielded transfer publishes nullifier, root, proof, and output commitments", () => {
  const pool = new ShieldedPool();
  const { note } = pool.deposit({ amount: 10, ownerPublicKey: "alice" });

  const { transaction, privateOutputs } = pool.createTransfer({
    inputNote: note,
    recipientPublicKey: "bob",
    amount: 4
  });

  assert.deepEqual(Object.keys(transaction.publicInputs), [
    "root",
    "nullifier",
    "outputCommitments"
  ]);
  assert.equal(transaction.publicInputs.amount, undefined);
  assert.equal(transaction.publicInputs.sender, undefined);
  assert.equal(transaction.publicInputs.receiver, undefined);

  const receipt = pool.broadcastTransfer(transaction);
  assert.equal(receipt.accepted, true);
  assert.equal(privateOutputs.receiverNote.amount, 4);
  assert.equal(privateOutputs.changeNote.amount, 6);
});

test("shielded transfer can fully spend a note without creating change", () => {
  const pool = new ShieldedPool();
  const { note } = pool.deposit({ amount: 2, ownerPublicKey: "alice" });

  const { transaction, privateOutputs } = pool.createTransfer({
    inputNote: note,
    recipientPublicKey: "bob",
    amount: 2
  });

  const receipt = pool.broadcastTransfer(transaction);
  assert.equal(receipt.accepted, true);
  assert.equal(privateOutputs.receiverNote.amount, 2);
  assert.equal(privateOutputs.changeNote, null);
  assert.deepEqual(transaction.publicInputs.outputCommitments, [privateOutputs.receiverNote.commitment]);
});

test("a spent nullifier cannot be used twice", () => {
  const pool = new ShieldedPool();
  const { note } = pool.deposit({ amount: 10, ownerPublicKey: "alice" });
  const { transaction } = pool.createTransfer({
    inputNote: note,
    recipientPublicKey: "bob",
    amount: 4
  });

  pool.broadcastTransfer(transaction);

  assert.throws(() => pool.broadcastTransfer(transaction), /Nullifier has already been used/);
});

test("tampered public inputs invalidate the proof", () => {
  const pool = new ShieldedPool();
  const { note } = pool.deposit({ amount: 10, ownerPublicKey: "alice" });
  const { transaction } = pool.createTransfer({
    inputNote: note,
    recipientPublicKey: "bob",
    amount: 4
  });

  transaction.publicInputs.outputCommitments[0] = "0xtampered";

  assert.throws(() => pool.broadcastTransfer(transaction), /Invalid zk proof/);
});
