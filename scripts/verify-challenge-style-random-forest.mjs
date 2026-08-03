import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const artifactPath = new URL("../modeling/challenge_style/artifacts/challenge_style_random_forest.json", import.meta.url);
const appModelPath = new URL("../src/features/preferences/model/challenge-style-random-forest.json", import.meta.url);
const baselinePath = new URL("../modeling/challenge_style/artifacts/challenge_style_decision_tree.json", import.meta.url);
const [artifactText, appModelText, baselineText] = await Promise.all([
  readFile(artifactPath, "utf8"),
  readFile(appModelPath, "utf8"),
  readFile(baselinePath, "utf8"),
]);

assert.equal(appModelText, artifactText, "The app forest must match the trained artifact.");

const model = JSON.parse(artifactText);
const baseline = JSON.parse(baselineText);
assert.equal(model.schemaVersion, 1);
assert.equal(model.modelVersion, "challenge-style-rf-v1");
assert.equal(model.modelKind, "random_forest");
assert.equal(model.trees.length, 16);
assert.equal(model.training.student.maxFeatures, 3);
assert.deepEqual(model.featureOrder, ["i18", "i48", "i22", "i52", "i90", "i120"]);
assert.ok(model.training.student.accuracy > baseline.training.student.selectedCandidate.accuracy);
assert.ok(model.training.student.macroF1 > baseline.training.student.selectedCandidate.macroF1);

function leafProbabilities(tree, features) {
  let node = tree;
  while (node.type === "split") {
    node = features[node.feature] <= node.threshold ? node.left : node.right;
  }
  return node.probabilities;
}

function predictProbabilities(features) {
  const probabilities = model.classes.map(() => 0);
  for (const tree of model.trees) {
    leafProbabilities(tree, features).forEach((value, index) => {
      probabilities[index] += value / model.trees.length;
    });
  }
  return probabilities;
}

function predict(features) {
  const probabilities = predictProbabilities(features);
  const bestIndex = probabilities.reduce(
    (best, value, index) => value > probabilities[best] ? index : best,
    0,
  );
  return model.classes[bestIndex];
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
  const probabilities = predictProbabilities(features);
  assert.ok(probabilities.every((value) => value >= 0 && value <= 1));
  assert.ok(Math.abs(probabilities.reduce((total, value) => total + value, 0) - 1) < 1e-6);
}

console.log(JSON.stringify({
  modelVersion: model.modelVersion,
  treeCount: model.trees.length,
  accuracy: model.training.student.accuracy,
  macroF1: model.training.student.macroF1,
  accuracyDelta: model.training.comparison.accuracyDelta,
  macroF1Delta: model.training.comparison.macroF1Delta,
}, null, 2));
