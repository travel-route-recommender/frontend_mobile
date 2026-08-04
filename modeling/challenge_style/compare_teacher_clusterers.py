"""Compare alternative teacher clusterers for the challenge-style model.

The production model is not modified. Every method receives the same
standardized O4/E5/C6 facet scores. The same six-item decision-tree student and
the same deterministic 80/20 split are then used to measure teacher-label
reproducibility. Cluster quality is reported separately because no behavioral
ground-truth labels exist in IPIP_NEO_120.csv.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from train_model import (
    CLASS_NAMES,
    FACET_COLUMNS,
    SEED,
    SHORT_FEATURES,
    assign_clusters,
    fit_kmeans,
    make_student_tree,
    rounded_center,
    semantic_cluster_mapping,
    stratified_split,
)


METHODS = ("kmeans", "hierarchical", "dbscan", "gmm")
MICROCLUSTER_COUNT = 128
SILHOUETTE_SAMPLE_SIZE = 5_000


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset",
        default=r"C:\Users\jung\Downloads\IPIP_NEO_120.csv",
        help="Path to IPIP_NEO_120.csv",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=repo_root / "modeling" / "challenge_style" / "artifacts" / "teacher_clusterer_comparison.json",
    )
    return parser.parse_args()


def squared_distances(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    left_norm = np.sum(left * left, axis=1)[:, None]
    right_norm = np.sum(right * right, axis=1)[None, :]
    return np.maximum(left_norm + right_norm - 2.0 * left @ right.T, 0.0)


def weighted_kmeans_plus_plus(
    points: np.ndarray,
    weights: np.ndarray,
    cluster_count: int,
    rng: np.random.Generator,
) -> np.ndarray:
    centers = [points[rng.choice(len(points), p=weights / weights.sum())]]
    closest_squared = squared_distances(points, np.asarray(centers))[:, 0]
    for _ in range(1, cluster_count):
        probabilities = weights * closest_squared
        total = float(probabilities.sum())
        if total <= 0:
            next_index = int(rng.choice(len(points), p=weights / weights.sum()))
        else:
            next_index = int(rng.choice(len(points), p=probabilities / total))
        centers.append(points[next_index])
        candidate_squared = squared_distances(points, points[next_index : next_index + 1])[:, 0]
        closest_squared = np.minimum(closest_squared, candidate_squared)
    return np.asarray(centers)


def fit_weighted_kmeans(
    points: np.ndarray,
    weights: np.ndarray,
    cluster_count: int,
    *,
    seed: int,
    max_iterations: int = 100,
) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    centers = weighted_kmeans_plus_plus(points, weights, cluster_count, rng)
    labels = np.zeros(len(points), dtype=np.int32)
    for _ in range(max_iterations):
        labels = np.argmin(squared_distances(points, centers), axis=1)
        next_centers = centers.copy()
        for cluster in range(cluster_count):
            mask = labels == cluster
            if np.any(mask):
                next_centers[cluster] = np.average(points[mask], axis=0, weights=weights[mask])
        if np.max(np.abs(next_centers - centers)) < 1e-8:
            centers = next_centers
            break
        centers = next_centers
    labels = np.argmin(squared_distances(points, centers), axis=1)
    return centers, labels


def ward_microcluster_labels(
    points: np.ndarray,
    weights: np.ndarray,
) -> tuple[np.ndarray, dict[str, Any]]:
    micro_centers, point_to_micro = fit_weighted_kmeans(
        points,
        weights,
        min(MICROCLUSTER_COUNT, len(points)),
        seed=SEED + 200,
    )
    micro_count = len(micro_centers)
    micro_weights = np.bincount(point_to_micro, weights=weights, minlength=micro_count)
    active = [
        {
            "center": micro_centers[index],
            "weight": float(micro_weights[index]),
            "members": [index],
        }
        for index in range(micro_count)
        if micro_weights[index] > 0
    ]

    while len(active) > 3:
        centers = np.asarray([cluster["center"] for cluster in active])
        cluster_weights = np.asarray([cluster["weight"] for cluster in active])
        distances = squared_distances(centers, centers)
        ward_cost = distances * (
            cluster_weights[:, None] * cluster_weights[None, :]
            / (cluster_weights[:, None] + cluster_weights[None, :])
        )
        ward_cost[np.tril_indices(len(active))] = np.inf
        left, right = np.unravel_index(np.argmin(ward_cost), ward_cost.shape)
        left_cluster = active[left]
        right_cluster = active[right]
        merged_weight = left_cluster["weight"] + right_cluster["weight"]
        merged = {
            "center": (
                left_cluster["center"] * left_cluster["weight"]
                + right_cluster["center"] * right_cluster["weight"]
            ) / merged_weight,
            "weight": merged_weight,
            "members": left_cluster["members"] + right_cluster["members"],
        }
        active.pop(right)
        active.pop(left)
        active.append(merged)

    micro_to_cluster = np.zeros(micro_count, dtype=np.int8)
    for cluster_index, cluster in enumerate(active):
        micro_to_cluster[cluster["members"]] = cluster_index
    return micro_to_cluster[point_to_micro], {
        "kind": "ward_on_weighted_microclusters",
        "microclusterCount": micro_count,
    }


def connected_components_for_core(
    neighbor_mask: np.ndarray,
    core_mask: np.ndarray,
) -> tuple[np.ndarray, int]:
    labels = np.full(len(core_mask), -1, dtype=np.int32)
    cluster_count = 0
    for start in np.flatnonzero(core_mask):
        if labels[start] >= 0:
            continue
        labels[start] = cluster_count
        stack = [int(start)]
        while stack:
            current = stack.pop()
            neighbors = np.flatnonzero(neighbor_mask[current] & core_mask & (labels < 0))
            labels[neighbors] = cluster_count
            stack.extend(int(index) for index in neighbors)
        cluster_count += 1
    return labels, cluster_count


def weighted_dbscan(
    distance_squared: np.ndarray,
    weights: np.ndarray,
    *,
    epsilon: float,
    min_samples: int,
) -> tuple[np.ndarray, int]:
    neighbor_mask = distance_squared <= epsilon * epsilon + 1e-12
    neighbor_weight = neighbor_mask @ weights
    core_mask = neighbor_weight >= min_samples
    labels, cluster_count = connected_components_for_core(neighbor_mask, core_mask)
    core_indices = np.flatnonzero(core_mask)
    if not len(core_indices):
        return labels, 0
    for index in np.flatnonzero(~core_mask):
        adjacent_core = core_indices[neighbor_mask[index, core_indices]]
        if len(adjacent_core):
            closest = adjacent_core[np.argmin(distance_squared[index, adjacent_core])]
            labels[index] = labels[closest]
    return labels, cluster_count


def weighted_cluster_centers(
    points: np.ndarray,
    weights: np.ndarray,
    labels: np.ndarray,
    cluster_count: int,
) -> np.ndarray:
    return np.asarray(
        [
            np.average(points[labels == cluster], axis=0, weights=weights[labels == cluster])
            for cluster in range(cluster_count)
        ]
    )


def davies_bouldin_weighted(
    points: np.ndarray,
    weights: np.ndarray,
    labels: np.ndarray,
    cluster_count: int,
) -> float:
    centers = weighted_cluster_centers(points, weights, labels, cluster_count)
    scatters = np.asarray(
        [
            np.average(
                np.linalg.norm(points[labels == cluster] - centers[cluster], axis=1),
                weights=weights[labels == cluster],
            )
            for cluster in range(cluster_count)
        ]
    )
    center_distances = np.sqrt(squared_distances(centers, centers))
    ratios = (scatters[:, None] + scatters[None, :]) / np.maximum(center_distances, 1e-12)
    np.fill_diagonal(ratios, -np.inf)
    return float(np.mean(np.max(ratios, axis=1)))


def ward_merge_clusters_to_three(
    points: np.ndarray,
    weights: np.ndarray,
    labels: np.ndarray,
    cluster_count: int,
) -> np.ndarray:
    active = []
    for cluster in range(cluster_count):
        mask = labels == cluster
        cluster_weight = float(weights[mask].sum())
        active.append(
            {
                "center": np.average(points[mask], axis=0, weights=weights[mask]),
                "weight": cluster_weight,
                "members": [cluster],
            }
        )
    while len(active) > 3:
        centers = np.asarray([cluster["center"] for cluster in active])
        cluster_weights = np.asarray([cluster["weight"] for cluster in active])
        ward_cost = squared_distances(centers, centers) * (
            cluster_weights[:, None] * cluster_weights[None, :]
            / (cluster_weights[:, None] + cluster_weights[None, :])
        )
        ward_cost[np.tril_indices(len(active))] = np.inf
        left, right = np.unravel_index(np.argmin(ward_cost), ward_cost.shape)
        left_cluster = active[left]
        right_cluster = active[right]
        merged_weight = left_cluster["weight"] + right_cluster["weight"]
        merged = {
            "center": (
                left_cluster["center"] * left_cluster["weight"]
                + right_cluster["center"] * right_cluster["weight"]
            ) / merged_weight,
            "weight": merged_weight,
            "members": left_cluster["members"] + right_cluster["members"],
        }
        active.pop(right)
        active.pop(left)
        active.append(merged)

    cluster_mapping = np.zeros(cluster_count, dtype=np.int8)
    for merged_index, cluster in enumerate(active):
        cluster_mapping[cluster["members"]] = merged_index
    merged_labels = np.full(len(labels), -1, dtype=np.int8)
    non_noise = labels >= 0
    merged_labels[non_noise] = cluster_mapping[labels[non_noise]]
    return merged_labels


def select_dbscan(
    points: np.ndarray,
    weights: np.ndarray,
) -> tuple[np.ndarray, dict[str, Any]]:
    distances = squared_distances(points, points).astype(np.float32)
    candidates: list[tuple[tuple[float, float, float], np.ndarray, dict[str, Any]]] = []
    fallback_candidates: list[tuple[tuple[int, float, float], np.ndarray, dict[str, Any]]] = []
    summaries: list[dict[str, Any]] = []
    for epsilon in [0.24, 0.26, 0.28, 0.30, 0.32, 0.34, 0.38, 0.42, 0.50, 0.60]:
        for min_samples in [250, 500, 1_000, 2_000, 4_000, 8_000]:
            labels, cluster_count = weighted_dbscan(
                distances,
                weights,
                epsilon=epsilon,
                min_samples=min_samples,
            )
            noise_ratio = float(weights[labels < 0].sum() / weights.sum())
            cluster_ratios = [
                float(weights[labels == cluster].sum() / weights.sum())
                for cluster in range(cluster_count)
            ]
            summary: dict[str, Any] = {
                "epsilon": epsilon,
                "minSamples": min_samples,
                "clusterCount": cluster_count,
                "noiseRatio": round(noise_ratio, 6),
                "clusterRatios": [round(value, 6) for value in cluster_ratios],
            }
            if cluster_count == 3 and min(cluster_ratios, default=0.0) >= 0.05:
                non_noise = labels >= 0
                db_index = davies_bouldin_weighted(
                    points[non_noise],
                    weights[non_noise],
                    labels[non_noise],
                    3,
                )
                summary["daviesBouldinWithoutNoise"] = round(db_index, 6)
                candidates.append(((noise_ratio, db_index, -min(cluster_ratios)), labels, summary))
            if 3 <= cluster_count <= 8:
                fallback_candidates.append(
                    ((abs(cluster_count - 3), noise_ratio, -min(cluster_ratios)), labels, summary)
                )
            summaries.append(summary)

    used_ward_merge = False
    if candidates:
        _, selected_labels, selected_summary = min(candidates, key=lambda item: item[0])
    elif fallback_candidates:
        _, selected_labels, selected_summary = min(fallback_candidates, key=lambda item: item[0])
        selected_labels = ward_merge_clusters_to_three(
            points,
            weights,
            selected_labels,
            selected_summary["clusterCount"],
        )
        used_ward_merge = True
    else:
        cluster_counts = sorted(set(summary["clusterCount"] for summary in summaries))
        raise RuntimeError(
            "DBSCAN grid did not produce a cluster configuration that can be reduced to three groups; "
            f"observed cluster counts: {cluster_counts}"
        )
    core_labels = selected_labels.copy()
    clustered = core_labels >= 0
    centers = weighted_cluster_centers(points[clustered], weights[clustered], core_labels[clustered], 3)
    noise = np.flatnonzero(~clustered)
    if len(noise):
        core_labels[noise] = np.argmin(squared_distances(points[noise], centers), axis=1)
    return core_labels, {
        "kind": "weighted_dbscan_with_postprocessing",
        "selected": selected_summary,
        "searchedCandidateCount": len(summaries),
        "naturalThreeClusterSolution": not used_ward_merge,
        "wardMergeToThree": used_ward_merge,
        "noiseFallback": "nearest_cluster_center",
    }


def log_gaussian_density(
    points: np.ndarray,
    means: np.ndarray,
    covariances: np.ndarray,
) -> np.ndarray:
    dimension = points.shape[1]
    output = np.empty((len(points), len(means)), dtype=np.float64)
    for component, (mean, covariance) in enumerate(zip(means, covariances)):
        sign, log_determinant = np.linalg.slogdet(covariance)
        if sign <= 0:
            raise RuntimeError("GMM covariance must be positive definite")
        difference = points - mean
        mahalanobis = np.einsum("ij,jk,ik->i", difference, np.linalg.inv(covariance), difference)
        output[:, component] = -0.5 * (
            dimension * math.log(2.0 * math.pi) + log_determinant + mahalanobis
        )
    return output


def logsumexp(values: np.ndarray, axis: int) -> np.ndarray:
    maximum = np.max(values, axis=axis, keepdims=True)
    return np.squeeze(maximum, axis=axis) + np.log(
        np.sum(np.exp(values - maximum), axis=axis)
    )


def fit_weighted_gmm(
    points: np.ndarray,
    sample_weights: np.ndarray,
    component_count: int = 3,
) -> tuple[np.ndarray, dict[str, Any]]:
    global_covariance = np.cov(points, rowvar=False, aweights=sample_weights) + np.eye(points.shape[1]) * 1e-4
    best: tuple[float, np.ndarray, np.ndarray, np.ndarray, int, bool] | None = None
    for initialization in range(5):
        means, _ = fit_weighted_kmeans(
            points,
            sample_weights,
            component_count,
            seed=SEED + 300 + initialization,
        )
        mixture_weights = np.full(component_count, 1.0 / component_count)
        covariances = np.repeat(global_covariance[None, :, :], component_count, axis=0)
        previous_likelihood = -np.inf
        iteration = 0
        converged = False
        for iteration in range(1, 501):
            weighted_log_probabilities = log_gaussian_density(points, means, covariances) + np.log(
                np.maximum(mixture_weights, 1e-12)
            )
            normalizer = logsumexp(weighted_log_probabilities, axis=1)
            responsibilities = np.exp(weighted_log_probabilities - normalizer[:, None])
            weighted_responsibilities = responsibilities * sample_weights[:, None]
            effective_counts = weighted_responsibilities.sum(axis=0)
            mixture_weights = effective_counts / sample_weights.sum()
            means = weighted_responsibilities.T @ points / effective_counts[:, None]
            for component in range(component_count):
                difference = points - means[component]
                covariances[component] = (
                    (difference * weighted_responsibilities[:, component : component + 1]).T @ difference
                    / effective_counts[component]
                    + np.eye(points.shape[1]) * 1e-6
                )
            likelihood = float(np.sum(sample_weights * normalizer))
            if np.isfinite(previous_likelihood) and abs(likelihood - previous_likelihood) <= (
                1e-7 * max(1.0, abs(previous_likelihood))
            ):
                converged = True
                break
            previous_likelihood = likelihood
        if best is None or likelihood > best[0]:
            best = (
                likelihood,
                mixture_weights.copy(),
                means.copy(),
                covariances.copy(),
                iteration,
                converged,
            )

    if best is None:
        raise RuntimeError("GMM failed to converge")
    likelihood, mixture_weights, means, covariances, iterations, converged = best
    log_probabilities = log_gaussian_density(points, means, covariances) + np.log(
        np.maximum(mixture_weights, 1e-12)
    )
    labels = np.argmax(log_probabilities, axis=1).astype(np.int8)
    dimension = points.shape[1]
    parameter_count = (
        component_count - 1
        + component_count * dimension
        + component_count * dimension * (dimension + 1) // 2
    )
    sample_count = int(sample_weights.sum())
    return labels, {
        "kind": "full_covariance_weighted_gmm",
        "initializations": 5,
        "iterations": iterations,
        "converged": converged,
        "logLikelihood": round(likelihood, 3),
        "bic": round(-2.0 * likelihood + parameter_count * math.log(sample_count), 3),
        "aic": round(-2.0 * likelihood + 2.0 * parameter_count, 3),
        "mixtureWeights": [round(float(value), 6) for value in mixture_weights],
    }


def semantic_labels(
    raw_labels: np.ndarray,
    standardized_points: np.ndarray,
    weights: np.ndarray,
    facet_mean: np.ndarray,
    facet_std: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    standardized_centers = weighted_cluster_centers(
        standardized_points,
        weights,
        raw_labels,
        3,
    )
    raw_centers = standardized_centers * facet_std + facet_mean
    permutation = semantic_cluster_mapping(raw_centers)
    cluster_to_class = {
        cluster_index: class_index
        for class_index, cluster_index in enumerate(permutation)
    }
    labels = np.asarray([cluster_to_class[int(label)] for label in raw_labels], dtype=np.int8)
    semantic_centers = np.asarray(
        [raw_centers[permutation[class_index]] for class_index in range(3)]
    )
    return labels, semantic_centers


def cluster_quality(
    data: np.ndarray,
    labels: np.ndarray,
) -> dict[str, float]:
    cluster_count = 3
    centers = np.asarray([data[labels == cluster].mean(axis=0) for cluster in range(cluster_count)])
    overall = data.mean(axis=0)
    within = sum(
        float(np.sum((data[labels == cluster] - centers[cluster]) ** 2))
        for cluster in range(cluster_count)
    )
    between = sum(
        int(np.sum(labels == cluster)) * float(np.sum((centers[cluster] - overall) ** 2))
        for cluster in range(cluster_count)
    )
    calinski_harabasz = (between / (cluster_count - 1)) / (
        within / (len(data) - cluster_count)
    )
    scatters = np.asarray(
        [
            np.mean(np.linalg.norm(data[labels == cluster] - centers[cluster], axis=1))
            for cluster in range(cluster_count)
        ]
    )
    center_distances = np.sqrt(squared_distances(centers, centers))
    ratios = (scatters[:, None] + scatters[None, :]) / np.maximum(center_distances, 1e-12)
    np.fill_diagonal(ratios, -np.inf)
    davies_bouldin = float(np.mean(np.max(ratios, axis=1)))

    rng = np.random.default_rng(SEED + 500)
    sample_size = min(SILHOUETTE_SAMPLE_SIZE, len(data))
    sample_indices = rng.choice(len(data), size=sample_size, replace=False)
    sample = data[sample_indices]
    sample_labels = labels[sample_indices]
    silhouette_values = np.zeros(sample_size, dtype=np.float64)
    for start in range(0, sample_size, 256):
        stop = min(start + 256, sample_size)
        distances = np.sqrt(squared_distances(sample[start:stop], sample))
        for row_offset, label in enumerate(sample_labels[start:stop]):
            same = sample_labels == label
            same_count = int(np.sum(same)) - 1
            a = (
                (float(np.sum(distances[row_offset, same]))) / same_count
                if same_count > 0
                else 0.0
            )
            b = min(
                float(np.mean(distances[row_offset, sample_labels == other]))
                for other in range(cluster_count)
                if other != label and np.any(sample_labels == other)
            )
            silhouette_values[start + row_offset] = (b - a) / max(a, b, 1e-12)
    return {
        "silhouetteSampled": round(float(np.mean(silhouette_values)), 6),
        "daviesBouldin": round(davies_bouldin, 6),
        "calinskiHarabasz": round(calinski_harabasz, 3),
    }


def adjusted_rand_index(left: np.ndarray, right: np.ndarray) -> float:
    table = np.zeros((3, 3), dtype=np.int64)
    np.add.at(table, (left, right), 1)
    combinations = lambda values: np.sum(values * (values - 1) // 2)
    sum_cells = float(combinations(table))
    sum_left = float(combinations(table.sum(axis=1)))
    sum_right = float(combinations(table.sum(axis=0)))
    total_pairs = len(left) * (len(left) - 1) / 2
    expected = sum_left * sum_right / total_pairs
    maximum = 0.5 * (sum_left + sum_right)
    return (sum_cells - expected) / max(maximum - expected, 1e-12)


def normalized_mutual_information(left: np.ndarray, right: np.ndarray) -> float:
    table = np.zeros((3, 3), dtype=np.float64)
    np.add.at(table, (left, right), 1)
    joint = table / table.sum()
    left_probability = joint.sum(axis=1)
    right_probability = joint.sum(axis=0)
    mutual_information = 0.0
    for row in range(3):
        for column in range(3):
            if joint[row, column] > 0:
                mutual_information += joint[row, column] * math.log(
                    joint[row, column] / (left_probability[row] * right_probability[column])
                )
    left_entropy = -float(np.sum(left_probability * np.log(np.maximum(left_probability, 1e-12))))
    right_entropy = -float(np.sum(right_probability * np.log(np.maximum(right_probability, 1e-12))))
    return mutual_information / max(math.sqrt(left_entropy * right_entropy), 1e-12)


def distribution(labels: np.ndarray) -> dict[str, dict[str, float | int]]:
    return {
        class_name: {
            "count": int(np.sum(labels == class_index)),
            "ratio": round(float(np.mean(labels == class_index)), 6),
        }
        for class_index, class_name in enumerate(CLASS_NAMES)
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
    standardized = (facet_scores - facet_mean) / facet_std
    unique_points, inverse, unique_weights = np.unique(
        standardized,
        axis=0,
        return_inverse=True,
        return_counts=True,
    )

    raw_unique_labels: dict[str, np.ndarray] = {}
    method_details: dict[str, dict[str, Any]] = {}

    kmeans_centers = fit_kmeans(standardized)
    raw_unique_labels["kmeans"], _ = assign_clusters(unique_points, kmeans_centers)
    method_details["kmeans"] = {"kind": "kmeans", "clusterCount": 3}

    raw_unique_labels["hierarchical"], method_details["hierarchical"] = ward_microcluster_labels(
        unique_points,
        unique_weights,
    )
    raw_unique_labels["dbscan"], method_details["dbscan"] = select_dbscan(
        unique_points,
        unique_weights,
    )
    raw_unique_labels["gmm"], method_details["gmm"] = fit_weighted_gmm(
        unique_points,
        unique_weights,
    )

    short_features = valid[SHORT_FEATURES].to_numpy(dtype=np.int8)
    semantic_by_method: dict[str, np.ndarray] = {}
    results: dict[str, Any] = {}
    for method in METHODS:
        semantic_unique, centers = semantic_labels(
            raw_unique_labels[method],
            unique_points,
            unique_weights,
            facet_mean,
            facet_std,
        )
        labels = semantic_unique[inverse]
        semantic_by_method[method] = labels
        train_mask, test_mask = stratified_split(labels)
        _, student_metrics, candidates = make_student_tree(
            short_features[train_mask],
            labels[train_mask],
            short_features[test_mask],
            labels[test_mask],
        )
        results[method] = {
            "details": method_details[method],
            "centers": {
                class_name: rounded_center(centers[class_index])
                for class_index, class_name in enumerate(CLASS_NAMES)
            },
            "distribution": distribution(labels),
            "clusterQuality": cluster_quality(standardized, labels),
            "studentDecisionTree": {
                "selectedCandidate": student_metrics,
                "candidateMetrics": candidates,
            },
        }

    kmeans_labels = semantic_by_method["kmeans"]
    for method in METHODS:
        results[method]["agreementWithKmeans"] = {
            "adjustedRandIndex": round(
                adjusted_rand_index(kmeans_labels, semantic_by_method[method]),
                6,
            ),
            "normalizedMutualInformation": round(
                normalized_mutual_information(kmeans_labels, semantic_by_method[method]),
                6,
            ),
        }

    report = {
        "schemaVersion": 1,
        "experimentVersion": "challenge-style-teacher-clusterers-v1",
        "sourceFile": Path(args.dataset).name,
        "sourceRows": int(len(frame)),
        "validRows": int(len(valid)),
        "uniqueFacetPoints": int(len(unique_points)),
        "seed": SEED,
        "facetMeans": rounded_center(facet_mean),
        "facetStandardDeviations": rounded_center(facet_std),
        "comparisonScope": (
            "Teacher cluster quality and fidelity of the same six-item decision-tree student; "
            "not accuracy against real travel behavior."
        ),
        "methods": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    summary = {
        method: {
            "distribution": results[method]["distribution"],
            "clusterQuality": results[method]["clusterQuality"],
            "student": results[method]["studentDecisionTree"]["selectedCandidate"],
            "agreementWithKmeans": results[method]["agreementWithKmeans"],
            "details": results[method]["details"],
        }
        for method in METHODS
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
