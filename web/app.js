const users = ["Alice", "Bob", "Charlie", "Diana"];
const state = createInitialState();

const elements = {
  poolValue: document.querySelector("#poolValue"),
  commitmentCount: document.querySelector("#commitmentCount"),
  nullifierCount: document.querySelector("#nullifierCount"),
  currentRoot: document.querySelector("#currentRoot"),
  depositTab: document.querySelector("#depositTab"),
  transferTab: document.querySelector("#transferTab"),
  depositForm: document.querySelector("#depositForm"),
  transferForm: document.querySelector("#transferForm"),
  depositOwner: document.querySelector("#depositOwner"),
  depositAmount: document.querySelector("#depositAmount"),
  inputNote: document.querySelector("#inputNote"),
  recipient: document.querySelector("#recipient"),
  transferAmount: document.querySelector("#transferAmount"),
  ledgerList: document.querySelector("#ledgerList"),
  notesList: document.querySelector("#notesList"),
  treeGrid: document.querySelector("#treeGrid"),
  nullifierList: document.querySelector("#nullifierList"),
  resetButton: document.querySelector("#resetButton"),
  ledgerTemplate: document.querySelector("#ledgerTemplate")
};

init();

function init() {
  fillSelect(elements.depositOwner, users);
  fillSelect(elements.recipient, users.filter((user) => user !== "Alice"));
  bindEvents();
  seedDemo().then(render);
}

function bindEvents() {
  elements.depositTab.addEventListener("click", () => setMode("deposit"));
  elements.transferTab.addEventListener("click", () => setMode("transfer"));
  elements.resetButton.addEventListener("click", async () => {
    Object.assign(state, createInitialState());
    await seedDemo();
    render();
  });

  elements.depositForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const amount = Number(elements.depositAmount.value);
    if (!Number.isInteger(amount) || amount < 1) return;

    await deposit({
      owner: elements.depositOwner.value,
      amount
    });
    render();
  });

  elements.transferForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const note = state.notes.find((candidate) => candidate.id === elements.inputNote.value);
    const amount = Number(elements.transferAmount.value);
    if (!note || !Number.isInteger(amount) || amount < 1 || amount >= note.amount) return;

    await transfer({
      inputNote: note,
      recipient: elements.recipient.value,
      amount
    });
    render();
  });
}

async function seedDemo() {
  await deposit({ owner: "Alice", amount: 10 });
  const aliceNote = state.notes.find((note) => note.owner === "Alice" && !note.spent);
  await transfer({ inputNote: aliceNote, recipient: "Bob", amount: 4 });
}

function setMode(mode) {
  const isDeposit = mode === "deposit";
  elements.depositTab.classList.toggle("is-active", isDeposit);
  elements.transferTab.classList.toggle("is-active", !isDeposit);
  elements.depositForm.classList.toggle("is-active", isDeposit);
  elements.transferForm.classList.toggle("is-active", !isDeposit);
}

async function deposit({ owner, amount }) {
  const note = await createNote({ owner, amount });
  state.notes.push(note);
  state.commitments.push(note.commitment);
  state.roots.push(await merkleRoot(state.commitments));
  state.ledger.unshift({
    type: "deposit",
    title: `${owner} deposit`,
    fields: {
      commitment: note.commitment,
      root: state.roots.at(-1),
      leaf: String(state.commitments.length - 1)
    }
  });
}

async function transfer({ inputNote, recipient, amount }) {
  const receiverNote = await createNote({ owner: recipient, amount });
  const changeNote = await createNote({
    owner: inputNote.owner,
    amount: inputNote.amount - amount
  });
  const nullifier = await hashParts("nullifier", inputNote.serial);
  const proof = await hashParts("mock-proof", inputNote.commitment, nullifier, receiverNote.commitment, changeNote.commitment);

  inputNote.spent = true;
  state.notes.push(receiverNote, changeNote);
  state.nullifiers.push(nullifier);
  state.commitments.push(receiverNote.commitment, changeNote.commitment);
  state.roots.push(await merkleRoot(state.commitments));
  state.ledger.unshift({
    type: "transfer",
    title: `${inputNote.owner} -> ${recipient}`,
    fields: {
      root: state.roots.at(-2),
      nullifier,
      outputA: receiverNote.commitment,
      outputB: changeNote.commitment,
      proof
    }
  });
}

function render() {
  elements.poolValue.textContent = state.notes
    .filter((note) => !note.spent)
    .reduce((sum, note) => sum + note.amount, 0);
  elements.commitmentCount.textContent = state.commitments.length;
  elements.nullifierCount.textContent = state.nullifiers.length;
  elements.currentRoot.textContent = shortHash(state.roots.at(-1));

  renderInputNotes();
  renderLedger();
  renderNotes();
  renderTree();
  renderNullifiers();
}

function renderInputNotes() {
  const spendable = state.notes.filter((note) => !note.spent && note.amount > 1);
  elements.inputNote.innerHTML = "";

  for (const note of spendable) {
    const option = document.createElement("option");
    option.value = note.id;
    option.textContent = `${note.owner} | ${note.amount} coins | ${shortHash(note.commitment)}`;
    elements.inputNote.append(option);
  }

  if (spendable.length === 0) {
    const option = document.createElement("option");
    option.textContent = "No spendable notes";
    elements.inputNote.append(option);
  }
}

function renderLedger() {
  elements.ledgerList.innerHTML = "";

  for (const entry of state.ledger) {
    const node = elements.ledgerTemplate.content.firstElementChild.cloneNode(true);
    node.classList.add(entry.type);
    node.querySelector(".entry-title").textContent = entry.title;
    const fields = node.querySelector(".entry-fields");

    for (const [label, value] of Object.entries(entry.fields)) {
      const term = document.createElement("dt");
      const details = document.createElement("dd");
      term.textContent = label;
      details.textContent = shortHash(value);
      fields.append(term, details);
    }

    elements.ledgerList.append(node);
  }
}

function renderNotes() {
  elements.notesList.innerHTML = "";

  for (const note of state.notes.slice().reverse()) {
    const card = document.createElement("div");
    card.className = `note-card ${note.spent ? "is-spent" : ""}`;
    card.innerHTML = `
      <div>
        <strong>${note.owner}</strong>
        <div class="note-meta">
          <span>${note.amount} coins</span>
          <code>${shortHash(note.commitment)}</code>
        </div>
      </div>
      <span class="pill">${note.spent ? "Spent" : "Live"}</span>
    `;
    elements.notesList.append(card);
  }
}

function renderTree() {
  elements.treeGrid.innerHTML = "";

  for (let index = 0; index < 16; index += 1) {
    const leaf = document.createElement("div");
    const commitment = state.commitments[index];
    leaf.className = `tree-leaf ${commitment ? "is-filled" : ""}`;
    leaf.textContent = commitment ? shortHash(commitment).replace("0x", "") : "empty";
    elements.treeGrid.append(leaf);
  }
}

function renderNullifiers() {
  elements.nullifierList.innerHTML = "";

  if (state.nullifiers.length === 0) {
    elements.nullifierList.innerHTML = `<div class="empty-state">No spent notes</div>`;
    return;
  }

  for (const nullifier of state.nullifiers.slice().reverse()) {
    const chip = document.createElement("code");
    chip.className = "nullifier-chip";
    chip.textContent = shortHash(nullifier);
    elements.nullifierList.append(chip);
  }
}

async function createNote({ owner, amount }) {
  const serial = randomHex();
  const secret = randomHex();
  const commitment = await hashParts("note", amount, serial, secret, owner);
  return {
    id: crypto.randomUUID(),
    owner,
    amount,
    serial,
    secret,
    commitment,
    spent: false
  };
}

async function merkleRoot(commitments) {
  const leaves = commitments.slice(0, 16);
  while (leaves.length < 16) {
    leaves.push(await hashParts("zero", leaves.length));
  }

  let layer = leaves;
  while (layer.length > 1) {
    const next = [];
    for (let index = 0; index < layer.length; index += 2) {
      next.push(await hashParts(layer[index], layer[index + 1]));
    }
    layer = next;
  }

  return layer[0];
}

async function hashParts(...parts) {
  const encoded = new TextEncoder().encode(parts.map((part) => String(part)).join("|"));
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return `0x${Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function randomHex() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function fillSelect(select, values) {
  select.innerHTML = "";
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function shortHash(value) {
  if (!value) return "";
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function createInitialState() {
  return {
    notes: [],
    commitments: [],
    roots: ["0x0000000000000000000000000000000000000000000000000000000000000000"],
    nullifiers: [],
    ledger: []
  };
}
