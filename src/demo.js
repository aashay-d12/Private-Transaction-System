import { ShieldedPool } from "./shieldedPool.js";

const pool = new ShieldedPool({ depth: 4 });

const alice = "alice-public-key";
const bob = "bob-public-key";

const { note: aliceDeposit, publicEntry } = pool.deposit({
  amount: 10,
  ownerPublicKey: alice
});

console.log("Deposit published to ledger:");
console.log(publicEntry);

const transfer = pool.createTransfer({
  inputNote: aliceDeposit,
  recipientPublicKey: bob,
  amount: 4
});

console.log("\nPrivate transfer public transaction:");
console.log(transfer.transaction);

const receipt = pool.broadcastTransfer(transfer.transaction);

console.log("\nTransfer accepted:");
console.log(receipt);

console.log("\nPrivate wallet outputs:");
console.log({
  bobReceives: transfer.privateOutputs.receiverNote.amount,
  aliceChange: transfer.privateOutputs.changeNote.amount
});
