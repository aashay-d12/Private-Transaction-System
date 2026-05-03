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
  fillSelect(elements.recipient, users);
  bindEvents();
  rebuildState().then(render);
}

function bindEvents() {
  elements.depositTab.addEventListener("click", () => setMode("deposit"));
  elements.transferTab.addEventListener("click", () => setMode("transfer"));
  elements.resetButton.addEventListener("click", () => {
    state.resetMode = !state.resetMode;
    render();
  });

  elements.ledgerList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-reset-action]");
    if (!button) return;
    state.actions = removeActionAndDependents(button.dataset.resetAction);
    await rebuildState();
    render();
  });

  elements.depositForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const amount = Number(elements.depositAmount.value);
    if (!Number.isInteger(amount) || amount < 1) return;

    state.actions.push({
      id: crypto.randomUUID(),
      type: "deposit",
      owner: elements.depositOwner.value,
      amount,
      serial: randomHex(),
      secret: randomHex()
    });

    await rebuildState();
    render();
  });

  elements.transferForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const inputNote = state.notes.find((candidate) => candidate.id === elements.inputNote.value);
    const amount = Number(elements.transferAmount.value);
    if (!inputNote || !Number.isInteger(amount) || amount < 1 || amount > inputNote.amount) return;

    state.actions.push({
      id: crypto.randomUUID(),
      type: "transfer",
      inputNoteId: inputNote.id,
      recipient: elements.recipient.value,
      amount,
      receiverSerial: randomHex(),
      receiverSecret: randomHex(),
      changeSerial: randomHex(),
      changeSecret: randomHex()
    });

    await rebuildState();
    render();
  });
}

function setMode(mode) {
  const isDeposit = mode === "deposit";
  elements.depositTab.classList.toggle("is-active", isDeposit);
  elements.transferTab.classList.toggle("is-active", !isDeposit);
  elements.depositForm.classList.toggle("is-active", isDeposit);
  elements.transferForm.classList.toggle("is-active", !isDeposit);
}

function removeActionAndDependents(actionId) {
  const removedActions = new Set([actionId]);
  const removedNotes = new Set();

  for (const action of state.actions) {
    if (action.id === actionId) {
      for (const noteId of outputNoteIds(action)) removedNotes.add(noteId);
      break;
    }
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const action of state.actions) {
      if (removedActions.has(action.id)) continue;

      if (action.type === "transfer" && removedNotes.has(action.inputNoteId)) {
        removedActions.add(action.id);
        for (const noteId of outputNoteIds(action)) removedNotes.add(noteId);
        changed = true;
      }
    }
  }

  return state.actions.filter((action) => !removedActions.has(action.id));
}

function outputNoteIds(action) {
  if (action.type === "deposit") return [`note-${action.id}`];
  if (action.type === "transfer") return [`receiver-${action.id}`, `change-${action.id}`];
  return [];
}

async function rebuildState() {
  state.notes = [];
  state.commitments = [];
  state.roots = ["0x0000000000000000000000000000000000000000000000000000000000000000"];
  state.treeLayers = [];
  state.nullifiers = [];
  state.ledger = [];

  for (const action of state.actions) {
    if (action.type === "deposit") {
      await replayDeposit(action);
    }

    if (action.type === "transfer") {
      await replayTransfer(action);
    }
  }
}

async function replayDeposit(action) {
  const note = await createNote({
    id: `note-${action.id}`,
    owner: action.owner,
    amount: action.amount,
    serial: action.serial,
    secret: action.secret,
    sourceActionId: action.id
  });

  state.notes.push(note);
  state.commitments.push(note.commitment);
  await updateMerkleState();
  state.ledger.unshift({
    id: action.id,
    type: "deposit",
    title: `${action.owner} deposit`,
    fields: {
      commitment: note.commitment,
      root: state.roots.at(-1),
      leaf: String(state.commitments.length - 1)
    }
  });
}

async function replayTransfer(action) {
  const inputNote = state.notes.find((note) => note.id === action.inputNoteId && !note.spent);
  if (!inputNote || action.amount > inputNote.amount) return;

  const oldRoot = state.roots.at(-1);
  const receiverNote = await createNote({
    id: `receiver-${action.id}`,
    owner: action.recipient,
    amount: action.amount,
    serial: action.receiverSerial,
    secret: action.receiverSecret,
    sourceActionId: action.id
  });
  const changeAmount = inputNote.amount - action.amount;
  const changeNote = changeAmount > 0
    ? await createNote({
        id: `change-${action.id}`,
        owner: inputNote.owner,
        amount: changeAmount,
        serial: action.changeSerial,
        secret: action.changeSecret,
        sourceActionId: action.id
      })
    : null;
  const nullifier = await hashParts("nullifier", inputNote.serial);
  const outputNotes = changeNote ? [receiverNote, changeNote] : [receiverNote];
  const proof = await hashParts("mock-proof", inputNote.commitment, nullifier, outputNotes.map((note) => note.commitment));

  inputNote.spent = true;
  state.notes.push(...outputNotes);
  state.nullifiers.push(nullifier);
  state.commitments.push(...outputNotes.map((note) => note.commitment));
  await updateMerkleState();
  const fields = {
    root: oldRoot,
    nullifier,
    outputA: receiverNote.commitment
  };
  if (changeNote) fields.outputB = changeNote.commitment;
  fields.proof = proof;

  state.ledger.unshift({
    id: action.id,
    type: "transfer",
    title: `${inputNote.owner} -> ${action.recipient}`,
    fields
  });
}

function render() {
  elements.poolValue.textContent = state.notes
    .filter((note) => !note.spent)
    .reduce((sum, note) => sum + note.amount, 0);
  elements.commitmentCount.textContent = state.commitments.length;
  elements.nullifierCount.textContent = state.nullifiers.length;
  elements.currentRoot.textContent = shortHash(state.roots.at(-1));
  elements.resetButton.textContent = state.resetMode ? "Done" : "Reset";
  elements.resetButton.classList.toggle("is-active", state.resetMode);

  renderInputNotes();
  renderLedger();
  renderNotes();
  renderTree();
  renderNullifiers();
}

function renderInputNotes() {
  const spendable = state.notes.filter((note) => !note.spent && note.amount > 0);
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

  if (state.ledger.length === 0) {
    elements.ledgerList.innerHTML = `<div class="empty-state">No ledger entries yet</div>`;
    return;
  }

  for (const entry of state.ledger) {
    const node = elements.ledgerTemplate.content.firstElementChild.cloneNode(true);
    node.classList.add(entry.type);
    node.classList.toggle("is-resettable", state.resetMode);
    node.querySelector(".entry-title").textContent = entry.title;
    const fields = node.querySelector(".entry-fields");

    for (const [label, value] of Object.entries(entry.fields)) {
      const term = document.createElement("dt");
      const details = document.createElement("dd");
      term.textContent = label;
      details.textContent = shortHash(value);
      fields.append(term, details);
    }

    if (state.resetMode) {
      const resetButton = document.createElement("button");
      resetButton.className = "entry-reset-button";
      resetButton.type = "button";
      resetButton.dataset.resetAction = entry.id;
      resetButton.textContent = "Reset entry";
      node.append(resetButton);
    }

    elements.ledgerList.append(node);
  }
}

function renderNotes() {
  elements.notesList.innerHTML = "";

  if (state.notes.length === 0) {
    elements.notesList.innerHTML = `<div class="empty-state">No private notes yet</div>`;
    return;
  }

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
  const layers = state.treeLayers.length > 0
    ? state.treeLayers
    : [[{ hash: state.roots.at(-1), isFilled: false }]];
  const displayLayers = layers.slice().reverse();

  displayLayers.forEach((layer, displayIndex) => {
    const originalLayerIndex = displayLayers.length - displayIndex - 1;
    const row = document.createElement("div");
    row.className = "tree-row";
    row.style.setProperty("--node-count", layer.length);

    layer.forEach((treeNode, nodeIndex) => {
      const node = document.createElement("div");
      const isRoot = originalLayerIndex === layers.length - 1;
      const isLeaf = originalLayerIndex === 0;
      const isFilledLeaf = isLeaf && treeNode.isFilled;
      const isEmptySubtree = !treeNode.isFilled && !isRoot;
      const isComputed = !isRoot && !isLeaf && treeNode.isFilled;
      const label = getTreeNodeLabel({ isRoot, isLeaf, isFilledLeaf, isEmptySubtree, nodeIndex });
      const value = isEmptySubtree ? "Empty" : shortHash(treeNode.hash).replace("0x", "");

      node.className = [
        "tree-node",
        isRoot ? "is-root" : "",
        isLeaf ? "is-leaf" : "",
        isFilledLeaf ? "is-filled" : "",
        isEmptySubtree ? "is-empty" : "",
        isComputed ? "is-computed" : ""
      ].filter(Boolean).join(" ");
      node.innerHTML = `<span>${label}</span><code>${value}</code>`;
      row.append(node);
    });

    elements.treeGrid.append(row);
  });
}

function getTreeNodeLabel({ isRoot, isLeaf, isFilledLeaf, isEmptySubtree, nodeIndex }) {
  if (isRoot) return "Current root";
  if (isFilledLeaf) return `Commitment L${nodeIndex}`;
  if (isEmptySubtree) return isLeaf ? `Empty L${nodeIndex}` : "Empty";
  return "Computed hash";
}

async function updateMerkleState() {
  state.treeLayers = await buildMerkleLayers(state.commitments);
  state.roots.push(state.treeLayers.at(-1)[0].hash);
}

async function buildMerkleLayers(commitments) {
  const leaves = commitments.slice(0, 16).map((hash) => ({
    hash,
    isFilled: true
  }));
  while (leaves.length < 16) {
    leaves.push({
      hash: await hashParts("zero", leaves.length),
      isFilled: false
    });
  }

  const layers = [leaves];
  let layer = leaves;

  while (layer.length > 1) {
    const next = [];
    for (let index = 0; index < layer.length; index += 2) {
      const left = layer[index];
      const right = layer[index + 1];
      next.push({
        hash: await hashParts(left.hash, right.hash),
        isFilled: left.isFilled || right.isFilled
      });
    }
    layers.push(next);
    layer = next;
  }

  return layers;
}

async function createNote({ id, owner, amount, serial, secret, sourceActionId }) {
  const commitment = await hashParts("note", amount, serial, secret, owner);
  return {
    id,
    owner,
    amount,
    serial,
    secret,
    commitment,
    sourceActionId,
    spent: false
  };
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
    actions: [],
    notes: [],
    commitments: [],
    roots: ["0x0000000000000000000000000000000000000000000000000000000000000000"],
    treeLayers: [],
    nullifiers: [],
    ledger: [],
    resetMode: false
  };
}
