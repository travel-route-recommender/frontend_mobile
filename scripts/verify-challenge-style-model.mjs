import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const artifactPath = new URL("../modeling/challenge_style/artifacts/challenge_style_decision_tree.json", import.meta.url);
const appModelPath = new URL("../src/features/preferences/model/challenge-style-decision-tree.json", import.meta.url);
const [artifactText, appModelText] = await Promise.all([
  readFile(artifactPath, "utf8"),
  readFile(appModelPath, "utf8"),
]);

assert.equal(appModelText, artifactText, "The app model must match the trained artifact.");

const model = JSON.parse(artifactText);
assert.equal(model.schemaVersion, 1);
assert.equal(model.modelVersion, "challenge-style-dt-v1");
assert.deepEqual(model.featureOrder, ["i18", "i48", "i22", "i52", "i90", "i120"]);
assert.ok(model.training.sourceRows === 619150);
assert.ok(model.training.validRows > 580000);
assert.ok(model.training.student.selectedCandidate.accuracy >= 0.8);
assert.ok(model.training.student.selectedCandidate.macroF1 >= 0.79);

function predict(features) {
  let node = model.tree;
  while (node.type === "split") {
    node = features[node.feature] <= node.threshold ? node.left : node.right;
  }
  const bestIndex = node.probabilities.reduce(
    (best, value, index) => value > node.probabilities[best] ? index : best,
    0,
  );
  return model.classes[bestIndex];
}

function leafProbabilities(features) {
  let node = model.tree;
  while (node.type === "split") {
    node = features[node.feature] <= node.threshold ? node.left : node.right;
  }
  return node.probabilities;
}

const archetypes = {
  challenge_executor: { i18: 5, i48: 5, i22: 5, i52: 5, i90: 1, i120: 1 },
  cautious_explorer: { i18: 5, i48: 5, i22: 3, i52: 3, i90: 5, i120: 5 },
  stable_planner: { i18: 1, i48: 1, i22: 1, i52: 1, i90: 5, i120: 5 },
};

for (const [expected, features] of Object.entries(archetypes)) {
  assert.equal(predict(features), expected, `${expected} archetype should be classified consistently.`);
}

for (let encoded = 0; encoded < 5 ** model.featureOrder.length; encoded += 1) {
  let remainder = encoded;
  const features = Object.fromEntries(model.featureOrder.map((feature) => {
    const value = remainder % 5 + 1;
    remainder = Math.floor(remainder / 5);
    return [feature, value];
  }));
  const probabilities = leafProbabilities(features);
  assert.equal(probabilities.length, model.classes.length);
  assert.ok(probabilities.every((value) => value >= 0 && value <= 1));
  assert.ok(Math.abs(probabilities.reduce((total, value) => total + value, 0) - 1) < 1e-6);
}

console.log(JSON.stringify({
  modelVersion: model.modelVersion,
  accuracy: model.training.student.selectedCandidate.accuracy,
  macroF1: model.training.student.selectedCandidate.macroF1,
  nodeCount: model.training.student.selectedCandidate.nodeCount,
  leafCount: model.training.student.selectedCandidate.leafCount,
}, null, 2));
