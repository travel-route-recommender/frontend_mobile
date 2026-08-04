import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const comparisonPath = new URL(
  "../modeling/challenge_style/artifacts/teacher_clusterer_comparison.json",
  import.meta.url,
);
const baselinePath = new URL(
  "../modeling/challenge_style/artifacts/challenge_style_decision_tree.json",
  import.meta.url,
);
const [comparisonText, baselineText] = await Promise.all([
  readFile(comparisonPath, "utf8"),
  readFile(baselinePath, "utf8"),
]);

const comparison = JSON.parse(comparisonText);
const baseline = JSON.parse(baselineText);
const methods = comparison.methods;

assert.equal(comparison.schemaVersion, 1);
assert.equal(comparison.experimentVersion, "challenge-style-teacher-clusterers-v1");
assert.equal(comparison.validRows, 583770);
assert.deepEqual(Object.keys(methods), ["kmeans", "hierarchical", "dbscan", "gmm"]);
assert.equal(
  methods.kmeans.studentDecisionTree.selectedCandidate.accuracy,
  baseline.training.student.selectedCandidate.accuracy,
  "The controlled K-means run must reproduce the production baseline accuracy.",
);
assert.equal(
  methods.kmeans.studentDecisionTree.selectedCandidate.macroF1,
  baseline.training.student.selectedCandidate.macroF1,
  "The controlled K-means run must reproduce the production baseline Macro F1.",
);
assert.ok(
  methods.kmeans.clusterQuality.silhouetteSampled
    > methods.hierarchical.clusterQuality.silhouetteSampled,
);
assert.ok(
  methods.kmeans.clusterQuality.silhouetteSampled
    > methods.dbscan.clusterQuality.silhouetteSampled,
);
assert.ok(
  methods.kmeans.clusterQuality.silhouetteSampled
    > methods.gmm.clusterQuality.silhouetteSampled,
);
assert.equal(methods.dbscan.details.naturalThreeClusterSolution, false);
assert.equal(methods.dbscan.details.wardMergeToThree, true);
assert.ok(methods.dbscan.details.selected.noiseRatio > 0.9);
assert.equal(methods.gmm.details.converged, true);

for (const method of Object.values(methods)) {
  const ratios = Object.values(method.distribution).map((entry) => entry.ratio);
  assert.ok(Math.abs(ratios.reduce((total, value) => total + value, 0) - 1) < 1e-5);
  const student = method.studentDecisionTree.selectedCandidate;
  assert.ok(student.accuracy >= 0 && student.accuracy <= 1);
  assert.ok(student.macroF1 >= 0 && student.macroF1 <= 1);
}

console.log(JSON.stringify(Object.fromEntries(
  Object.entries(methods).map(([name, method]) => [name, {
    silhouette: method.clusterQuality.silhouetteSampled,
    accuracy: method.studentDecisionTree.selectedCandidate.accuracy,
    macroF1: method.studentDecisionTree.selectedCandidate.macroF1,
  }]),
), null, 2));
