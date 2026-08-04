import modelJson from "../model/challenge-style-random-forest.json";
import type {
  ChallengeStyleAnswers,
  ChallengeStylePreference,
  ChallengeStyleQuestionId,
  ChallengeStyleType,
  FivePointScaleValue,
} from "../types";

type ModelLeaf = {
  type: "leaf";
  probabilities: number[];
};

type ModelSplit = {
  type: "split";
  feature: ChallengeStyleQuestionId;
  threshold: number;
  left: ModelNode;
  right: ModelNode;
};

type ModelNode = ModelLeaf | ModelSplit;

type ChallengeStyleRandomForestArtifact = {
  modelVersion: string;
  questionnaireVersion: string;
  classes: ChallengeStyleType[];
  classLabels: Record<ChallengeStyleType, string>;
  featureOrder: ChallengeStyleQuestionId[];
  featureTransforms: Record<ChallengeStyleQuestionId, "direct" | "reverse">;
  trees: ModelNode[];
};

const model = modelJson as unknown as ChallengeStyleRandomForestArtifact;

function requireResponse(
  answers: ChallengeStyleAnswers,
  questionId: ChallengeStyleQuestionId,
): FivePointScaleValue {
  const response = answers[questionId];
  if (!response) throw new Error(`도전·안정 성향 문항 ${questionId}의 응답이 필요합니다.`);
  return response;
}

function toModelValue(
  questionId: ChallengeStyleQuestionId,
  response: FivePointScaleValue,
): FivePointScaleValue {
  return model.featureTransforms[questionId] === "reverse"
    ? (6 - response) as FivePointScaleValue
    : response;
}

function treeProbabilities(
  tree: ModelNode,
  features: Record<ChallengeStyleQuestionId, FivePointScaleValue>,
) {
  let node = tree;
  while (node.type === "split") {
    node = features[node.feature] <= node.threshold ? node.left : node.right;
  }
  return node.probabilities;
}

function predictProbabilities(
  features: Record<ChallengeStyleQuestionId, FivePointScaleValue>,
) {
  const totals = model.classes.map(() => 0);
  for (const tree of model.trees) {
    const probabilities = treeProbabilities(tree, features);
    probabilities.forEach((probability, index) => {
      totals[index] += probability;
    });
  }
  return totals.map((total) => total / model.trees.length);
}

const toHundredPointScore = (value: number) => Math.round(((value - 1) / 4) * 100);

/** Experimental alternative; production still uses classifyChallengeStyle. */
export function classifyChallengeStyleWithRandomForest(
  answers: ChallengeStyleAnswers | undefined,
): ChallengeStylePreference {
  if (!answers) throw new Error("도전·안정 성향 응답이 필요합니다.");

  const features = Object.fromEntries(
    model.featureOrder.map((questionId) => [
      questionId,
      toModelValue(questionId, requireResponse(answers, questionId)),
    ]),
  ) as Record<ChallengeStyleQuestionId, FivePointScaleValue>;
  const probabilityValues = predictProbabilities(features);
  const probabilities = Object.fromEntries(
    model.classes.map((className, index) => [className, probabilityValues[index] ?? 0]),
  ) as Record<ChallengeStyleType, number>;
  const bestClassIndex = probabilityValues.reduce(
    (bestIndex, probability, index) => probability > probabilityValues[bestIndex] ? index : bestIndex,
    0,
  );
  const type = model.classes[bestClassIndex];
  const opennessToVariety = (features.i18 + features.i48) / 2;
  const excitementSeeking = (features.i22 + features.i52) / 2;
  const cautiousness = (features.i90 + features.i120) / 2;

  return {
    questionnaireVersion: model.questionnaireVersion,
    modelVersion: model.modelVersion,
    type,
    label: model.classLabels[type],
    probabilities,
    confidence: probabilities[type],
    scores: {
      opennessToVariety: toHundredPointScore(opennessToVariety),
      excitementSeeking: toHundredPointScore(excitementSeeking),
      cautiousness: toHundredPointScore(cautiousness),
      exploration: toHundredPointScore((opennessToVariety + excitementSeeking) / 2),
    },
  };
}
