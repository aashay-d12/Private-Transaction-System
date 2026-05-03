import { readFileSync } from "node:fs";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { ShieldedPool } from "./shieldedPool.js";

const pool = new ShieldedPool({ depth: 4 });
const isInteractive = Boolean(input.isTTY);
const rl = isInteractive ? createInterface({ input, output }) : null;
const scriptedAnswers = isInteractive ? [] : readFileSync(0, "utf8").split(/\r?\n/);

const users = new Set(["Alice", "Bob", "Charlie"]);
const walletNotes = [];
const ledger = [];

let noteCounter = 1;
let scriptedAnswerIndex = 0;

try {
  await runCli();
} finally {
  rl?.close();
}

async function runCli() {
  printHeader();

  while (true) {
    printMenu();
    const choice = await ask("Choose an option: ");

    try {
      if (choice === "1") await depositFlow();
      else if (choice === "2") await transferFlow();
      else if (choice === "3") showWalletNotes();
      else if (choice === "4") showLedger();
      else if (choice === "5") showPoolState();
      else if (choice === "6") await addUserFlow();
      else if (choice === "0" || choice.toLowerCase() === "q") break;
      else console.log("Please choose a valid menu option.");
    } catch (error) {
      console.log(`\nCould not complete action: ${error.message}`);
    }
  }

  console.log("\nGoodbye.");
}

function printHeader() {
  console.log("\nPrivate Transaction System CLI");
  console.log("Deposits publish commitments. Transfers publish roots, nullifiers, output commitments, and mock proofs.\n");
}

function printMenu() {
  console.log("\nMenu");
  console.log("1. Deposit into shielded pool");
  console.log("2. Create private transfer");
  console.log("3. Show private wallet notes");
  console.log("4. Show public ledger");
  console.log("5. Show pool state");
  console.log("6. Add user");
  console.log("0. Exit");
}

async function depositFlow() {
  const owner = await askUser("Deposit owner");
  const amount = await askInteger("Amount to deposit", { min: 1 });

  const { note, publicEntry } = pool.deposit({
    amount,
    ownerPublicKey: owner
  });

  const walletNote = storeNote({
    owner,
    note,
    source: "deposit"
  });

  ledger.unshift({
    type: "deposit",
    owner,
    noteId: walletNote.id,
    commitment: publicEntry.commitment,
    leafIndex: publicEntry.leafIndex,
    root: publicEntry.root
  });

  console.log("\nDeposit accepted.");
  console.log(`Private note: ${walletNote.id} (${owner}, amount ${amount})`);
  console.log(`Public commitment: ${shortHash(publicEntry.commitment)}`);
  console.log(`Current root: ${shortHash(publicEntry.root)}`);
}

async function transferFlow() {
  const spendableNotes = walletNotes.filter((note) => !note.spent);
  if (spendableNotes.length === 0) {
    console.log("\nNo spendable notes yet. Deposit first.");
    return;
  }

  showWalletNotes({ onlySpendable: true });
  const inputId = await ask("Input note id to spend: ");
  const inputNote = spendableNotes.find((note) => note.id.toLowerCase() === inputId.trim().toLowerCase());
  if (!inputNote) throw new Error("Unknown or already spent input note");
  const recipient = await askUser("Recipient");
  const amount = await askInteger("Amount to transfer", {
    min: 1,
    max: inputNote.amount,
    maxMessage: `Enter a value up to ${inputNote.amount}.`
  });

  const transfer = pool.createTransfer({
    inputNote: inputNote.note,
    recipientPublicKey: recipient,
    amount
  });
  const receipt = pool.broadcastTransfer(transfer.transaction);

  inputNote.spent = true;
  const receiverWalletNote = storeNote({
    owner: recipient,
    note: transfer.privateOutputs.receiverNote,
    source: `received from ${inputNote.owner}`
  });
  const changeWalletNote = transfer.privateOutputs.changeNote
    ? storeNote({
        owner: inputNote.owner,
        note: transfer.privateOutputs.changeNote,
        source: `change from ${inputNote.id}`
      })
    : null;

  ledger.unshift({
    type: "transfer",
    fromNoteId: inputNote.id,
    receiverNoteId: receiverWalletNote.id,
    changeNoteId: changeWalletNote?.id,
    root: transfer.transaction.publicInputs.root,
    nullifier: transfer.transaction.publicInputs.nullifier,
    outputCommitments: transfer.transaction.publicInputs.outputCommitments,
    newRoot: receipt.newRoot
  });

  console.log("\nTransfer accepted.");
  console.log(`Spent nullifier: ${shortHash(transfer.transaction.publicInputs.nullifier)}`);
  console.log(`Receiver note: ${receiverWalletNote.id} (${recipient}, amount ${amount})`);
  if (changeWalletNote) {
    console.log(`Change note: ${changeWalletNote.id} (${inputNote.owner}, amount ${changeWalletNote.amount})`);
  } else {
    console.log(`${inputNote.owner}'s input note was fully spent.`);
  }
  console.log(`New root: ${shortHash(receipt.newRoot)}`);
}

async function addUserFlow() {
  const name = await ask("New user name: ");
  const user = normalizeUser(name);
  if (!user) {
    console.log("User name cannot be empty.");
    return;
  }

  users.add(user);
  console.log(`Added ${user}.`);
}

function showWalletNotes({ onlySpendable = false } = {}) {
  const notes = walletNotes.filter((note) => !onlySpendable || !note.spent);
  console.log(onlySpendable ? "\nSpendable private notes" : "\nPrivate wallet notes");

  if (notes.length === 0) {
    console.log("No notes to show.");
    return;
  }

  for (const note of notes) {
    const status = note.spent ? "spent" : "spendable";
    console.log(
      `${note.id} | ${note.owner} | amount ${note.amount} | ${status} | commitment ${shortHash(note.commitment)}`
    );
  }
}

function showLedger() {
  console.log("\nPublic ledger");

  if (ledger.length === 0) {
    console.log("No public entries yet.");
    return;
  }

  for (const [index, entry] of ledger.entries()) {
    if (entry.type === "deposit") {
      console.log(
        `${index + 1}. deposit | note ${entry.noteId} | commitment ${shortHash(entry.commitment)} | root ${shortHash(entry.root)}`
      );
      continue;
    }

    console.log(
      `${index + 1}. transfer | spent ${entry.fromNoteId} | nullifier ${shortHash(entry.nullifier)} | new root ${shortHash(entry.newRoot)}`
    );
    console.log(`   outputs ${entry.outputCommitments.map(shortHash).join(", ")}`);
  }
}

function showPoolState() {
  const spendableValue = walletNotes
    .filter((note) => !note.spent)
    .reduce((total, note) => total + note.amount, 0);

  console.log("\nPool state");
  console.log(`Current Merkle root: ${shortHash(pool.tree.root())}`);
  console.log(`Commitments in tree: ${pool.tree.leaves.length}`);
  console.log(`Spent nullifiers: ${pool.spentNullifiers.size}`);
  console.log(`Spendable private value in local wallet: ${spendableValue}`);
}

async function askUser(label) {
  const knownUsers = [...users].join(", ");
  const answer = await ask(`${label} (${knownUsers}, or new name): `);
  const user = normalizeUser(answer);
  if (!user) throw new Error("User name cannot be empty");
  users.add(user);
  return user;
}

async function askInteger(label, { min, max = Number.MAX_SAFE_INTEGER, maxMessage } = {}) {
  while (true) {
    const answer = await ask(`${label}: `);
    const value = Number(answer);

    if (Number.isInteger(value) && value >= min && value <= max) {
      return value;
    }

    if (max !== Number.MAX_SAFE_INTEGER && value > max) {
      console.log(maxMessage ?? `Enter a value up to ${max}.`);
    } else {
      console.log(`Enter a whole number of at least ${min}.`);
    }
  }
}

async function ask(question) {
  if (!isInteractive) {
    if (scriptedAnswerIndex >= scriptedAnswers.length) {
      throw new Error("Scripted input ended before the CLI finished");
    }

    const answer = scriptedAnswers[scriptedAnswerIndex++];
    console.log(`${question}${answer}`);
    return answer.trim();
  }

  return (await rl.question(question)).trim();
}

function storeNote({ owner, note, source }) {
  const walletNote = {
    id: `N${noteCounter++}`,
    owner,
    amount: note.amount,
    commitment: note.commitment,
    nullifier: note.nullifier,
    spent: false,
    source,
    note
  };

  walletNotes.push(walletNote);
  return walletNote;
}

function normalizeUser(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\s+/)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function shortHash(value) {
  if (!value) return "";
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}
