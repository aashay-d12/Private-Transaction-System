import { hashParts } from "./crypto.js";

export class MerkleTree {
  constructor(depth = 4) {
    if (!Number.isInteger(depth) || depth < 1) {
      throw new Error("Merkle tree depth must be a positive integer");
    }

    this.depth = depth;
    this.capacity = 2 ** depth;
    this.leaves = [];
    this.zeros = buildZeroHashes(depth);
  }

  insert(leaf) {
    if (this.leaves.length >= this.capacity) {
      throw new Error("Merkle tree is full");
    }

    this.leaves.push(leaf);
    return this.leaves.length - 1;
  }

  hasLeaf(leaf) {
    return this.leaves.includes(leaf);
  }

  indexOf(leaf) {
    return this.leaves.indexOf(leaf);
  }

  root() {
    return this.#buildLayers().at(-1)[0];
  }

  path(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.leaves.length) {
      throw new Error("Invalid leaf index");
    }

    const layers = this.#buildLayers();
    const siblings = [];
    const indices = [];
    let cursor = index;

    for (let level = 0; level < this.depth; level += 1) {
      const siblingIndex = cursor ^ 1;
      siblings.push(layers[level][siblingIndex] ?? this.zeros[level]);
      indices.push(cursor % 2);
      cursor = Math.floor(cursor / 2);
    }

    return { siblings, indices };
  }

  verifyPath({ leaf, path, root }) {
    let current = leaf;

    for (let level = 0; level < this.depth; level += 1) {
      const sibling = path.siblings[level];
      const index = path.indices[level];
      current = index === 0 ? hashParts(current, sibling) : hashParts(sibling, current);
    }

    return current === root;
  }

  #buildLayers() {
    const layers = [this.leaves.slice()];

    while (layers[0].length < this.capacity) {
      layers[0].push(this.zeros[0]);
    }

    for (let level = 0; level < this.depth; level += 1) {
      const currentLayer = layers[level];
      const nextLayer = [];

      for (let index = 0; index < currentLayer.length; index += 2) {
        nextLayer.push(hashParts(currentLayer[index], currentLayer[index + 1]));
      }

      layers.push(nextLayer);
    }

    return layers;
  }
}

function buildZeroHashes(depth) {
  const zeros = [hashParts("zero", 0)];

  for (let level = 1; level < depth; level += 1) {
    zeros.push(hashParts(zeros[level - 1], zeros[level - 1]));
  }

  return zeros;
}
