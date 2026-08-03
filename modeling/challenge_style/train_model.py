"""Train the Duri challenge-style short-form classifier.

The source IPIP_NEO_120.csv stores every item in its keyed direction. Values
of 0 are missing responses. The mobile questionnaire collects raw agreement,
so reverse-keyed items are transformed in the TypeScript inference adapter.

This module intentionally depends only on numpy and pandas. It creates a
portable JSON decision tree that can be used by both the app and a future API.
"""

from __future__ import annotations

import argparse
import itertools
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


SEED = 20260731
MODEL_VERSION = "challenge-style-dt-v1"
QUESTIONNAIRE_VERSION = "challenge-style-short-v1"

CLASS_NAMES = [
    "challenge_executor",
    "cautious_explorer",
    "stable_planner",
]
CLASS_LABELS = {
    "challenge_executor": "도전 실행형",
    "cautious_explorer": "신중 탐색형",
    "stable_planner": "안정 계획형",
}

FACET_COLUMNS = {
    "O4": ["i18", "i48", "i78", "i108"],
    "E5": ["i22", "i52", "i82", "i112"],
    "C6": ["i30", "i60", "i90", "i120"],
}
SHORT_FEATURES = ["i18", "i48", "i22", "i52", "i90", "i120"]
FEATURE_TRANSFORMS = {
    "i18": "direct",
    "i48": "reverse",
    "i22": "direct",
    "i52": "direct",
    "i90": "reverse",
    "i120": "reverse",
}

# Prototypes only assign semantic names to the three discovered clusters.
# They do not determine cluster membership.
SEMANTIC_PROTOTYPES = np.asarray(
    [
        [3.25, 3.95, 2.30],  # challenge executor
        [3.70, 3.15, 3.95],  # cautious explorer
        [2.40, 2.55, 3.75],  # stable planner
    ],
    dtype=np.float64,
)


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset",
        default=r"C:\Users\jung\Downloads\IPIP_NEO_120.csv",
        help="Path to IPIP_NEO_120.csv",
    )
    parser.add_argument(
        "--artifact-output",
        type=Path,
        default=repo_root / "modeling" / "challenge_style" / "artifacts" / "challenge_style_decision_tree.json",
    )
    parser.add_argument(
        "--app-output",
        type=Path,
        default=repo_root / "src" / "features" / "preferences" / "model" / "challenge-style-decision-tree.json",
    )
    return parser.parse_args()


def kmeans_plus_plus(data: np.ndarray, cluster_count: int, rng: np.random.Generator) -> np.ndarray:
    centers = [data[rng.integers(0, len(data))]]
    closest_squared = np.sum((data - centers[0]) ** 2, axis=1)
    for _ in range(1, cluster_count):
        total = float(closest_squared.sum())
        if total <= 0:
            centers.append(data[rng.integers(0, len(data))])
        else:
            centers.append(data[rng.choice(len(data), p=closest_squared / total)])
        candidate_squared = np.sum((data - centers[-1]) ** 2, axis=1)
        closest_squared = np.minimum(closest_squared, candidate_squared)
    return np.asarray(centers)


def assign_clusters(data: np.ndarray, centers: np.ndarray) -> tuple[np.ndarray, float]:
    squared_distances = np.sum((data[:, None, :] - centers[None, :, :]) ** 2, axis=2)
    labels = np.argmin(squared_distances, axis=1)
    inertia = float(np.take_along_axis(squared_distances, labels[:, None], axis=1).sum())
    return labels, inertia


def fit_kmeans(data: np.ndarray, cluster_count: int = 3) -> np.ndarray:
    rng = np.random.default_rng(SEED)
    sample_size = min(150_000, len(data))
    sample = data[rng.choice(len(data), size=sample_size, replace=False)]
    best_centers: np.ndarray | None = None
    best_inertia = float("inf")

    for _ in range(10):
        centers = kmeans_plus_plus(sample, cluster_count, rng)
        for _ in range(100):
            labels, _ = assign_clusters(sample, centers)
            next_centers = np.asarray(
                [
                    sample[labels == cluster].mean(axis=0)
                    if np.any(labels == cluster)
                    else centers[cluster]
                    for cluster in range(cluster_count)
                ]
            )
            if np.max(np.abs(next_centers - centers)) < 1e-7:
                centers = next_centers
                break
            centers = next_centers
        _, inertia = assign_clusters(sample, centers)
        if inertia < best_inertia:
            best_centers = centers.copy()
            best_inertia = inertia

    if best_centers is None:
        raise RuntimeError("K-means failed to produce centers.")
    return best_centers


def semantic_cluster_mapping(raw_centers: np.ndarray) -> tuple[int, int, int]:
    best_permutation: tuple[int, int, int] | None = None
    best_cost = float("inf")
    for permutation in itertools.permutations(range(3)):
        cost = sum(
            float(np.sum((raw_centers[cluster_index] - SEMANTIC_PROTOTYPES[class_index]) ** 2))
            for class_index, cluster_index in enumerate(permutation)
        )
        if cost < best_cost:
            best_cost = cost
            best_permutation = permutation
    if best_permutation is None:
        raise RuntimeError("Could not assign semantic cluster names.")
    return best_permutation


def stratified_split(labels: np.ndarray, test_fraction: float = 0.2) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(SEED + 1)
    is_test = np.zeros(len(labels), dtype=bool)
    for class_index in range(len(CLASS_NAMES)):
        indices = np.flatnonzero(labels == class_index)
        rng.shuffle(indices)
        test_count = max(1, int(round(len(indices) * test_fraction)))
        is_test[indices[:test_count]] = True
    return ~is_test, is_test


def encode_patterns(features: np.ndarray) -> np.ndarray:
    powers = (5 ** np.arange(features.shape[1], dtype=np.int64))[None, :]
    return np.sum((features.astype(np.int64) - 1) * powers, axis=1)


def decode_patterns(codes: np.ndarray, feature_count: int) -> np.ndarray:
    columns = [((codes // (5 ** index)) % 5) + 1 for index in range(feature_count)]
    return np.column_stack(columns).astype(np.int8)


def gini(class_counts: np.ndarray) -> float:
    total = float(class_counts.sum())
    if total <= 0:
        return 0.0
    probabilities = class_counts / total
    return 1.0 - float(np.sum(probabilities**2))


def leaf_node(class_counts: np.ndarray) -> dict[str, Any]:
    smoothed = class_counts.astype(np.float64) + 1.0
    probabilities = smoothed / smoothed.sum()
    return {
        "type": "leaf",
        "samples": int(class_counts.sum()),
        "probabilities": [round(float(value), 8) for value in probabilities],
    }


def build_tree(
    patterns: np.ndarray,
    label_counts: np.ndarray,
    *,
    depth: int,
    max_depth: int,
    min_samples_leaf: int,
    min_impurity_decrease: float,
) -> dict[str, Any]:
    class_counts = label_counts.sum(axis=0)
    sample_count = int(class_counts.sum())
    nonzero_classes = int(np.count_nonzero(class_counts))
    if depth >= max_depth or nonzero_classes <= 1 or sample_count < min_samples_leaf * 2:
        return leaf_node(class_counts)

    parent_impurity = gini(class_counts)
    best_gain = 0.0
    best_feature = -1
    best_threshold = -1
    best_left_mask: np.ndarray | None = None

    for feature_index in range(patterns.shape[1]):
        values = patterns[:, feature_index]
        for threshold in range(1, 5):
            left_mask = values <= threshold
            if not np.any(left_mask) or np.all(left_mask):
                continue
            left_counts = label_counts[left_mask].sum(axis=0)
            right_counts = class_counts - left_counts
            left_samples = int(left_counts.sum())
            right_samples = sample_count - left_samples
            if left_samples < min_samples_leaf or right_samples < min_samples_leaf:
                continue
            weighted_impurity = (
                left_samples * gini(left_counts) + right_samples * gini(right_counts)
            ) / sample_count
            gain = parent_impurity - weighted_impurity
            if gain > best_gain + 1e-12:
                best_gain = gain
                best_feature = feature_index
                best_threshold = threshold
                best_left_mask = left_mask

    if best_left_mask is None or best_gain < min_impurity_decrease:
        return leaf_node(class_counts)

    return {
        "type": "split",
        "feature": SHORT_FEATURES[best_feature],
        "threshold": best_threshold,
        "left": build_tree(
            patterns[best_left_mask],
            label_counts[best_left_mask],
            depth=depth + 1,
            max_depth=max_depth,
            min_samples_leaf=min_samples_leaf,
            min_impurity_decrease=min_impurity_decrease,
        ),
        "right": build_tree(
            patterns[~best_left_mask],
            label_counts[~best_left_mask],
            depth=depth + 1,
            max_depth=max_depth,
            min_samples_leaf=min_samples_leaf,
            min_impurity_decrease=min_impurity_decrease,
        ),
    }


def predict_probabilities(tree: dict[str, Any], features: np.ndarray) -> np.ndarray:
    probabilities = np.zeros((len(features), len(CLASS_NAMES)), dtype=np.float64)
    feature_indices = {feature: index for index, feature in enumerate(SHORT_FEATURES)}
    stack: list[tuple[dict[str, Any], np.ndarray]] = [(tree, np.arange(len(features)))]
    while stack:
        node, indices = stack.pop()
        if not len(indices):
            continue
        if node["type"] == "leaf":
            probabilities[indices] = np.asarray(node["probabilities"], dtype=np.float64)
            continue
        feature_index = feature_indices[node["feature"]]
        left_mask = features[indices, feature_index] <= node["threshold"]
        stack.append((node["left"], indices[left_mask]))
        stack.append((node["right"], indices[~left_mask]))
    return probabilities


def tree_stats(tree: dict[str, Any], depth: int = 0) -> tuple[int, int, int]:
    if tree["type"] == "leaf":
        return 1, 1, depth
    left_nodes, left_leaves, left_depth = tree_stats(tree["left"], depth + 1)
    right_nodes, right_leaves, right_depth = tree_stats(tree["right"], depth + 1)
    return 1 + left_nodes + right_nodes, left_leaves + right_leaves, max(left_depth, right_depth)


def classification_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, Any]:
    class_count = len(CLASS_NAMES)
    confusion = np.zeros((class_count, class_count), dtype=np.int64)
    np.add.at(confusion, (actual, predicted), 1)
    f1_scores: list[float] = []
    per_class: dict[str, Any] = {}
    for class_index, class_name in enumerate(CLASS_NAMES):
        true_positive = int(confusion[class_index, class_index])
        false_positive = int(confusion[:, class_index].sum() - true_positive)
        false_negative = int(confusion[class_index, :].sum() - true_positive)
        precision = true_positive / max(true_positive + false_positive, 1)
        recall = true_positive / max(true_positive + false_negative, 1)
        f1 = 2 * precision * recall / max(precision + recall, 1e-12)
        f1_scores.append(f1)
        per_class[class_name] = {
            "precision": round(precision, 6),
            "recall": round(recall, 6),
            "f1": round(f1, 6),
            "support": int(confusion[class_index, :].sum()),
        }
    return {
        "accuracy": round(float(np.mean(actual == predicted)), 6),
        "macroF1": round(float(np.mean(f1_scores)), 6),
        "confusionMatrix": confusion.tolist(),
        "perClass": per_class,
    }


def make_student_tree(
    train_features: np.ndarray,
    train_labels: np.ndarray,
    test_features: np.ndarray,
    test_labels: np.ndarray,
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    pattern_count = 5 ** len(SHORT_FEATURES)
    codes = encode_patterns(train_features)
    grouped_counts = np.zeros((pattern_count, len(CLASS_NAMES)), dtype=np.int64)
    np.add.at(grouped_counts, (codes, train_labels), 1)
    active_codes = np.flatnonzero(grouped_counts.sum(axis=1))
    patterns = decode_patterns(active_codes, len(SHORT_FEATURES))
    counts = grouped_counts[active_codes]

    candidates: list[tuple[dict[str, Any], dict[str, Any], dict[str, Any]]] = []
    candidate_summaries: list[dict[str, Any]] = []
    for max_depth in [4, 6, 8, 10, 12]:
        tree = build_tree(
            patterns,
            counts,
            depth=0,
            max_depth=max_depth,
            min_samples_leaf=250,
            min_impurity_decrease=1e-6,
        )
        test_probabilities = predict_probabilities(tree, test_features)
        predicted = np.argmax(test_probabilities, axis=1)
        metrics = classification_metrics(test_labels, predicted)
        node_count, leaf_count, actual_depth = tree_stats(tree)
        summary = {
            "requestedMaxDepth": max_depth,
            "actualDepth": actual_depth,
            "nodeCount": node_count,
            "leafCount": leaf_count,
            **metrics,
        }
        candidate_summaries.append(summary)
        candidates.append((tree, metrics, summary))

    best_accuracy = max(candidate[1]["accuracy"] for candidate in candidates)
    eligible = [
        candidate
        for candidate in candidates
        if candidate[1]["accuracy"] >= best_accuracy - 0.002
    ]
    best_tree, best_metrics, best_summary = min(
        eligible,
        key=lambda candidate: (candidate[2]["nodeCount"], -candidate[1]["macroF1"]),
    )
    return best_tree, {**best_summary, **best_metrics}, candidate_summaries


def rounded_center(center: np.ndarray) -> dict[str, float]:
    return {
        facet: round(float(center[index]), 6)
        for index, facet in enumerate(["O4", "E5", "C6"])
    }


def main() -> None:
    args = parse_args()
    all_columns = [column for columns in FACET_COLUMNS.values() for column in columns]
    frame = pd.read_csv(
        args.dataset,
        usecols=all_columns,
        dtype={column: np.int8 for column in all_columns},
    )
    valid_mask = ((frame[all_columns] >= 1) & (frame[all_columns] <= 5)).all(axis=1)
    valid = frame.loc[valid_mask].reset_index(drop=True)

    facet_scores = np.column_stack(
        [valid[columns].mean(axis=1).to_numpy() for columns in FACET_COLUMNS.values()]
    )
    facet_mean = facet_scores.mean(axis=0)
    facet_std = facet_scores.std(axis=0)
    standardized_facets = (facet_scores - facet_mean) / facet_std

    standardized_centers = fit_kmeans(standardized_facets)
    raw_centers = standardized_centers * facet_std + facet_mean
    cluster_labels, _ = assign_clusters(standardized_facets, standardized_centers)
    semantic_permutation = semantic_cluster_mapping(raw_centers)
    cluster_to_class = {
        cluster_index: class_index
        for class_index, cluster_index in enumerate(semantic_permutation)
    }
    teacher_labels = np.asarray(
        [cluster_to_class[int(cluster)] for cluster in cluster_labels],
        dtype=np.int8,
    )

    short_features = valid[SHORT_FEATURES].to_numpy(dtype=np.int8)
    train_mask, test_mask = stratified_split(teacher_labels)
    tree, metrics, candidates = make_student_tree(
        short_features[train_mask],
        teacher_labels[train_mask],
        short_features[test_mask],
        teacher_labels[test_mask],
    )

    semantic_centers = {
        class_name: rounded_center(raw_centers[semantic_permutation[class_index]])
        for class_index, class_name in enumerate(CLASS_NAMES)
    }
    distributions = {
        class_name: {
            "count": int(np.sum(teacher_labels == class_index)),
            "ratio": round(float(np.mean(teacher_labels == class_index)), 6),
        }
        for class_index, class_name in enumerate(CLASS_NAMES)
    }
    artifact = {
        "schemaVersion": 1,
        "modelVersion": MODEL_VERSION,
        "questionnaireVersion": QUESTIONNAIRE_VERSION,
        "classes": CLASS_NAMES,
        "classLabels": CLASS_LABELS,
        "featureOrder": SHORT_FEATURES,
        "featureTransforms": FEATURE_TRANSFORMS,
        "training": {
            "sourceFile": Path(args.dataset).name,
            "sourceRows": int(len(frame)),
            "validRows": int(len(valid)),
            "trainRows": int(train_mask.sum()),
            "testRows": int(test_mask.sum()),
            "seed": SEED,
            "teacher": {
                "kind": "kmeans",
                "features": ["O4", "E5", "C6"],
                "facetMeans": rounded_center(facet_mean),
                "facetStandardDeviations": rounded_center(facet_std),
                "centers": semantic_centers,
                "distribution": distributions,
            },
            "student": {
                "kind": "decision_tree",
                "selectedCandidate": metrics,
                "candidateMetrics": candidates,
            },
        },
        "tree": tree,
    }

    for output_path in [args.artifact_output, args.app_output]:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(artifact, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(json.dumps(artifact["training"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
