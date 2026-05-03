import { createHash, randomBytes } from "node:crypto";

export function randomHex(bytes = 32) {
  return `0x${randomBytes(bytes).toString("hex")}`;
}

export function hashParts(...parts) {
  const hash = createHash("sha256");

  for (const part of parts) {
    const value = normalizePart(part);
    hash.update(`${value.length}:`);
    hash.update(value);
    hash.update("|");
  }

  return `0x${hash.digest("hex")}`;
}

export function createNote({ amount, ownerPublicKey, serial = randomHex(), secret = randomHex() }) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Note amount must be a positive integer");
  }

  const commitment = hashParts("note", amount, serial, secret, ownerPublicKey);
  const nullifier = hashParts("nullifier", serial);

  return {
    amount,
    ownerPublicKey,
    serial,
    secret,
    commitment,
    nullifier
  };
}

function normalizePart(part) {
  if (typeof part === "bigint") {
    return part.toString();
  }

  if (typeof part === "number") {
    return Number.isFinite(part) ? String(part) : "";
  }

  if (typeof part === "string") {
    return part;
  }

  return JSON.stringify(part);
}
