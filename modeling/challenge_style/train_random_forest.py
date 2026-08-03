"""Train an experimental Random Forest for the Duri challenge-style survey.

The existing decision-tree model remains the production baseline. This script
reuses the same IPIP facets, K-means teacher labels, six short-form features,
and deterministic train/test split so the two model structures can be compared
fairly. It depends only on numpy and pandas.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from train_model import (
    CLASS_LABELS,
    CLASS_NAMES,
    FACET_COLUMNS,
    FEATURE_TRANSFORMS,
    QUESTIONNAIRE_VERSION,
    SEED,
    SHORT_FEATURES,
    assign_clusters,
    classification_metrics,
    decode_patterns,
    fit_kmeans,
    gini,
    leaf_node,
    predict_probabilities,
    rounded_center,
    semantic_cluster_mapping,
    stratified_split,
    tree_stats,
)


MODEL_VERSION = "challenge-style-rf-v1"
FOREST_SEED = SEED + 10_000


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset",
        default=r"C:\Users\jung\Downloads\IPIP_NEO_120.csv",
        help="Path to IPIP_NEO_120.csv",
    )
    parser.add_argument("--tree-count", type=int, default=16)
    parser.add_argument("--max-depth", type=int, default=10)
    parser.add_argument("--max-features", type=int, default=3)
    parser.add_argument("--min-samples-leaf", type=int, default=250)
    parser.add_argument("--min-impurity-decrease", type=float, default=1e-6)
    parser.add_argument(
        "--baseline-artifact",
        type=Path,
        default=repo_root / "modeling" / "challenge_style" / "artifacts" / "challenge_style_decision_tree.json",
    )
    parser.add_argument(
        "--artifact-output",
        type=Path,
        default=repo_root / "modeling" / "challenge_style" / "artifacts" / "challenge_style_random_forest.json",
    )
    parser.add_argument(
        "--app-output",
        type=Path,
        default=repo_root / "src" / "features" / "preferences" / "model" / "challenge-style-random-forest.json",
    )
    args = parser.parse_args()
    if args.tree_count <= 0:
        parser.error("--tree-count must be positive")
    if args.max_depth <= 0:
        parser.error("--max-depth must be positive")
    if not 1 <= args.max_features <= len(SHORT_FEATURES):
        parser.error(f"--max-features must be between 1 and {len(SHORT_FEATURES)}")
    if args.min_samples_leaf <= 0:
        parser.error("--min-samples-leaf must be positive")
    return args


def build_random_tree(
    patterns: np.ndarray,
    label_counts: np.ndarray,
    *,
    depth: int,
    max_depth: int,
    max_features: int,
    min_samples_leaf: int,
    min_impurity_decrease: float,
    rng: np.random.Generator,
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
    candidate_features = rng.choice(
        patterns.shape[1],
        size=max_features,
        replace=False,
    )

    for feature_index in candidate_features:
        values = patterns[:, feature_index]
        for threshold in range(1, 5):
            left_mask = values <= threshold
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
                best_feature = int(feature_index)
                best_threshold = threshold
                best_left_mask = left_mask

    if best_left_mask is None or best_gain < min_impurity_decrease:
        return leaf_node(class_counts)

    return {
        "type": "split",
        "feature": SHORT_FEATURES[best_feature],
        "threshold": best_threshold,
        "left": build_random_tree(
            patterns[best_left_mask],
            label_counts[best_left_mask],
            depth=depth + 1,
            max_depth=max_depth,
            max_features=max_features,
            min_samples_leaf=min_samples_leaf,
            min_impurity_decrease=min_impurity_decrease,
            rng=rng,
        ),
        "right": build_random_tree(
            patterns[~best_left_mask],
            label_counts[~best_left_mask],
            depth=depth + 1,
            max_depth=max_depth,
            max_features=max_features,
            min_samples_leaf=min_samples_leaf,
            min_impurity_decrease=min_impurity_decrease,
            rng=rng,
        ),
    }


def grouped_label_counts(features: np.ndarray, labels: np.ndarray) -> np.ndarray:
    pattern_count = 5 ** len(SHORT_FEATURES)
    powers = (5 ** np.arange(features.shape[1], dtype=np.int64))[None, :]
    codes = np.sum((features.astype(np.int64) - 1) * powers, axis=1)
    counts = np.zeros((pattern_count, len(CLASS_NAMES)), dtype=np.int64)
    np.add.at(counts, (codes, labels), 1)
    return counts


def bootstrap_counts(counts: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    flat_counts = counts.reshape(-1)
    sample_count = int(flat_counts.sum())
    sampled = rng.multinomial(sample_count, flat_counts / sample_count)
    return sampled.reshape(counts.shape)


def train_forest(
    train_features: np.ndarray,
    train_labels: np.ndarray,
    *,
    tree_count: int,
    max_depth: int,
    max_features: int,
    min_samples_leaf: int,
    min_impurity_decrease: float,
) -> list[dict[str, Any]]:
    counts = grouped_label_counts(train_features, train_labels)
    patterns = decode_patterns(np.arange(len(counts), dtype=np.int64), len(SHORT_FEATURES))
    forest: list[dict[str, Any]] = []
    seed_sequence = np.random.SeedSequence(FOREST_SEED)

    for child_seed in seed_sequence.spawn(tree_count):
        rng = np.random.default_rng(child_seed)
        forest.append(
            build_random_tree(
                patterns,
                bootstrap_counts(counts, rng),
                depth=0,
                max_depth=max_depth,
                max_features=max_features,
                min_samples_leaf=min_samples_leaf,
                min_impurity_decrease=min_impurity_decrease,
                rng=rng,
            )
        )
    return forest


def predict_forest_probabilities(
    forest: list[dict[str, Any]],
    features: np.ndarray,
) -> np.ndarray:
    probabilities = np.zeros((len(features), len(CLASS_NAMES)), dtype=np.float64)
    for tree in forest:
        probabilities += predict_probabilities(tree, features)
    return probabilities / len(forest)


def forest_stats(forest: list[dict[str, Any]]) -> dict[str, Any]:
    stats = [tree_stats(tree) for tree in forest]
    return {
        "treeCount": len(forest),
        "nodeCount": sum(item[0] for item in stats),
        "leafCount": sum(item[1] for item in stats),
        "maximumActualDepth": max(item[2] for item in stats),
        "averageNodeCount": round(float(np.mean([item[0] for item in stats])), 3),
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
    forest = train_forest(
        short_features[train_mask],
        teacher_labels[train_mask],
        tree_count=args.tree_count,
        max_depth=args.max_depth,
        max_features=args.max_features,
        min_samples_leaf=args.min_samples_leaf,
        min_impurity_decrease=args.min_impurity_decrease,
    )
    test_probabilities = predict_forest_probabilities(forest, short_features[test_mask])
    predicted = np.argmax(test_probabilities, axis=1)
    metrics = classification_metrics(teacher_labels[test_mask], predicted)
    model_stats = forest_stats(forest)

    baseline = json.loads(args.baseline_artifact.read_text(encoding="utf-8"))
    baseline_metrics = baseline["training"]["student"]["selectedCandidate"]
    comparison = {
        "baselineModelVersion": baseline["modelVersion"],
        "baselineAccuracy": baseline_metrics["accuracy"],
        "baselineMacroF1": baseline_metrics["macroF1"],
        "accuracyDelta": round(metrics["accuracy"] - baseline_metrics["accuracy"], 6),
        "macroF1Delta": round(metrics["macroF1"] - baseline_metrics["macroF1"], 6),
    }
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
        "modelKind": "random_forest",
        "classes": CLASS_NAMES,
        "classLabels": CLASS_LABELS,
        "featureOrder": SHORT_FEATURES,
        "featureTransforms": FEATURE_TRANSFORMS,
        "aggregation": "mean_leaf_probabilities",
        "training": {
            "sourceFile": Path(args.dataset).name,
            "sourceRows": int(len(frame)),
            "validRows": int(len(valid)),
            "trainRows": int(train_mask.sum()),
            "testRows": int(test_mask.sum()),
            "seed": SEED,
            "forestSeed": FOREST_SEED,
            "teacher": {
                "kind": "kmeans",
                "features": ["O4", "E5", "C6"],
                "facetMeans": rounded_center(facet_mean),
                "facetStandardDeviations": rounded_center(facet_std),
                "centers": semantic_centers,
                "distribution": distributions,
            },
            "student": {
                "kind": "random_forest",
                "bootstrap": True,
                "maxFeatures": args.max_features,
                "requestedMaxDepth": args.max_depth,
                "minSamplesLeaf": args.min_samples_leaf,
                "minImpurityDecrease": args.min_impurity_decrease,
                **model_stats,
                **metrics,
            },
            "comparison": comparison,
        },
        "trees": forest,
    }

    for output_path in [args.artifact_output, args.app_output]:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(artifact, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )

    print(
        json.dumps(
            {
                "modelVersion": MODEL_VERSION,
                "student": artifact["training"]["student"],
                "comparison": comparison,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
