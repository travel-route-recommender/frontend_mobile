/// <reference types="node" />

import { deepStrictEqual, equal, ok } from "node:assert/strict";
import {
  ApiError,
  ApiNetworkError,
  NativeApiClient,
  type ApiClient,
  type ApiRequest,
} from "../src/services/apiClient";
import { calculateTravelPreferenceSurveyResult } from "../src/features/preferences/logic/calculate-travel-preference-result";
import {
  createPreferenceResultService,
  type PreferenceCalculationInput,
} from "../src/features/preferences/services/preferenceSubmissionService";
import type { StaminaLevel, TravelPreferenceSurveyResult } from "../src/features/preferences/types";

class FakeClient implements ApiClient {
  readonly requests: ApiRequest[] = [];

  constructor(private readonly responses: unknown[]) {}

  async request<Response>(request: ApiRequest): Promise<Response> {
    this.requests.push(request);
    ok(this.responses.length, "예상하지 않은 추가 요청");
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return response as Response;
  }
}

function input(stamina: StaminaLevel = "medium"): PreferenceCalculationInput {
  return {
    userId: "preference-submission-test",
    completedAt: "2026-09-20T00:00:00.000Z",
    answers: {
      challengeStyleAnswers: { i18: 5, i48: 1, i22: 4, i52: 2, i90: 5, i120: 1 },
      itineraryMessageAnswers: {
        restaurant: "like", cafe: "neutral", shopping: "dislike", attraction: "like",
        local: "like", experience: "neutral", nature: "dislike", rest: "neutral", density: "like",
      },
      accommodation: { stayMeaning: 6, locationFacility: 4, comfortPrice: 3 },
      stamina,
      budgetRanking: ["food", "stay", "activity", "shopping", "mobility"],
      landmarkImportance: 3,
      localInterest: 4,
    },
  };
}

function expectedBody(result: TravelPreferenceSurveyResult) {
  return {
    responses: {
      surveyVersion: result.surveyVersion,
      algorithmVersion: result.algorithmVersion,
      challengeStyle: {
        challengeStyleAnswers: result.answers.challengeStyleAnswers,
        itineraryMessageAnswers: result.answers.itineraryMessageAnswers,
        type: result.challengeStylePreference.type,
        scores: result.challengeStylePreference.scores,
        scheduleStyle: {
          type: result.scheduleStylePreference.type,
          score: result.scheduleStylePreference.score,
          components: result.scheduleStylePreference.components,
        },
        itineraryPreference: result.itineraryMessagePreference,
      },
      accommodation: { answers: result.answers.accommodation, scores: result.accommodationPreference },
      stamina: { answer: result.answers.stamina, ...result.staminaPreference },
      budget: { ranking: result.spendingPriority.ranking },
      discovery: {
        answers: { landmarkImportance: result.answers.landmarkImportance, localInterest: result.answers.localInterest },
        scores: result.discoveryPreference,
      },
    },
  };
}

function valueAt(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (
    current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined
  ), value);
}

// Keep the required wire fields explicit: the previous mapper dropped six of them.
const requiredScores = [
  "challengeStyle.scores.opennessToVariety", "challengeStyle.scores.excitementSeeking",
  "challengeStyle.scores.cautiousness", "challengeStyle.scores.exploration",
  "challengeStyle.scheduleStyle.score", "challengeStyle.scheduleStyle.components.density",
  "challengeStyle.scheduleStyle.components.activeRestPreference", "challengeStyle.scheduleStyle.components.stamina",
  "challengeStyle.itineraryPreference.densityScore",
  ...["restaurant", "cafe", "shopping", "attraction", "local", "experience", "nature", "rest"].map(
    (category) => `challengeStyle.itineraryPreference.categoryScores.${category}`,
  ),
  "accommodation.scores.stayImportance", "accommodation.scores.facilityOverLocation",
  "accommodation.scores.comfortOverPrice", "stamina.score",
  "discovery.scores.landmarkImportance", "discovery.scores.localInterest",
];

function assertCompleteBody(body: unknown, result: TravelPreferenceSurveyResult) {
  // Round-trip through JSON to detect undefined fields that disappear on the wire.
  const wire = JSON.parse(JSON.stringify(body)) as unknown;
  for (const path of requiredScores) {
    const score = valueAt(wire, `responses.${path}`);
    ok(typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100, `${path}: 0~100 점수 필수`);
  }
  ok(["LOW", "NORMAL", "HIGH"].includes(String(valueAt(wire, "responses.stamina.level"))), "체력 등급 필수");
  deepStrictEqual(wire, expectedBody(result), "모든 원본 응답·계산 결과를 API 계약대로 전송해야 한다");
}

let passed = 0;
async function test(name: string, run: () => Promise<void>) {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function main() {
  for (const mode of ["api", "hybrid"] as const) {
    await test(`${mode}: authenticated session completion with all required fields`, async () => {
      const submitted = input();
      const original = structuredClone(submitted);
      const serverCompletedAt = "2026-09-20T00:00:05.000Z";
      const client = new FakeClient([{ id: "quiz-1" }, { completedAt: serverCompletedAt }]);
      const outcome = await createPreferenceResultService(mode, client).calculate(submitted);
      equal(outcome.status, "success");
      equal(outcome.source, "backend");
      equal(outcome.result.completedAt, serverCompletedAt);
      deepStrictEqual(client.requests[0], { path: "/quiz/sessions", method: "POST", auth: true });
      equal(client.requests.length, 2);
      equal(client.requests[1].path, "/quiz/sessions/quiz-1/complete");
      equal(client.requests[1].method, "POST");
      equal(client.requests[1].auth, true);
      assertCompleteBody(client.requests[1].body, outcome.result);
      deepStrictEqual(submitted, original, "저장이 원본 답변을 변경하면 안 된다");
    });
  }

  for (const [answer, level, score] of [["low", "LOW", 0], ["medium", "NORMAL", 50], ["high", "HIGH", 100]] as const) {
    await test(`stamina ${answer}: preserve level and score ${score}`, async () => {
      const client = new FakeClient([{ id: "quiz-stamina" }, {}]);
      const outcome = await createPreferenceResultService("api", client).calculate(input(answer));
      ok(outcome.status === "success");
      assertCompleteBody(client.requests[1].body, outcome.result);
      deepStrictEqual(valueAt(client.requests[1].body, "responses.stamina"), { answer, level, score });
      equal(valueAt(client.requests[1].body, "responses.challengeStyle.scheduleStyle.components.stamina"), score);
    });
  }

  const invalidAnswers: PreferenceCalculationInput["answers"][] = [
    {},
    { ...input().answers, budgetRanking: ["food", "food", "food", "food", "food"] },
  ];
  for (const answers of invalidAnswers) {
    await test("invalid answers: no API request", async () => {
      const client = new FakeClient([]);
      const outcome = await createPreferenceResultService("api", client).calculate({ ...input(), answers });
      ok(outcome.status === "error" && outcome.code === "invalid-answers");
      equal(client.requests.length, 0);
    });
  }

  await test("session creation failure: do not attempt completion", async () => {
    const client = new FakeClient([new ApiError("Unauthorized", { status: 401 })]);
    const outcome = await createPreferenceResultService("api", client).calculate(input());
    ok(outcome.status === "error" && outcome.code === "submission-failed");
    equal(client.requests.length, 1);
  });

  await test("missing session ID: never report success", async () => {
    const client = new FakeClient([{}]);
    const outcome = await createPreferenceResultService("api", client).calculate(input());
    ok(outcome.status === "error" && outcome.code === "submission-failed");
    equal(client.requests.length, 1);
  });

  for (const error of [new ApiError("Invalid responses", { status: 400 }), new ApiError("Unavailable", { status: 503 }), new ApiNetworkError()]) {
    await test(`${error instanceof ApiError ? `HTTP ${error.status}` : "network"} failure followed by retry`, async () => {
      const submitted = input();
      const original = structuredClone(submitted);
      const client = new FakeClient([{ id: "failed-session" }, error, { id: "retry-session" }, {}]);
      const service = createPreferenceResultService("api", client);
      const failed = await service.calculate(submitted);
      ok(failed.status === "error");
      equal(failed.code, error instanceof ApiNetworkError ? "network" : "submission-failed");
      ok(failed.message.includes("답변은 기기에 그대로 보관했어요."));
      deepStrictEqual(submitted, original, "실패해도 답변을 유지해야 한다");
      const retried = await service.calculate(submitted);
      ok(retried.status === "success" && retried.source === "backend");
      equal(client.requests[3].path, "/quiz/sessions/retry-session/complete");
      deepStrictEqual(client.requests[3].body, client.requests[1].body);
      assertCompleteBody(client.requests[3].body, retried.result);
    });
  }

  await test("missing server timestamp: preserve calculation timestamp", async () => {
    const submitted = input();
    const client = new FakeClient([{ id: "quiz-time" }, {}]);
    const outcome = await createPreferenceResultService("api", client).calculate(submitted);
    ok(outcome.status === "success");
    equal(outcome.result.completedAt, submitted.completedAt);
  });

  await test("anonymous/mock calculation: no API request", async () => {
    const client = new FakeClient([]);
    const outcome = await createPreferenceResultService("mock", client).calculate(input());
    ok(outcome.status === "success" && outcome.source === "local-mock");
    equal(client.requests.length, 0);
  });

  await test("pending completion: do not report success until server responds", async () => {
    let resolveCompletion!: (response: unknown) => void;
    const completion = new Promise((resolve) => { resolveCompletion = resolve; });
    const client = new FakeClient([{ id: "quiz-pending" }, completion]);
    let settled = false;
    const outcomePromise = createPreferenceResultService("api", client).calculate(input()).then((outcome) => {
      settled = true;
      return outcome;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    equal(client.requests.length, 2);
    equal(settled, false);
    resolveCompletion({ completedAt: "2026-09-20T00:00:05.000Z" });
    equal((await outcomePromise).status, "success");
  });

  await test("NativeApiClient: serialize the complete HTTP request body", async () => {
    const originalFetch = globalThis.fetch;
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify(requests.length === 1 ? { id: "quiz-http" } : {}), {
        status: 201, headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const submitted = input("low");
      const client = new NativeApiClient("https://api.example.test/api/v1");
      const outcome = await createPreferenceResultService("api", client).calculate(submitted);
      ok(outcome.status === "success");
      equal(requests[1].url, "https://api.example.test/api/v1/quiz/sessions/quiz-http/complete");
      equal(requests[1].init?.method, "POST");
      equal(new Headers(requests[1].init?.headers).get("Content-Type"), "application/json");
      const expected = calculateTravelPreferenceSurveyResult(submitted.userId, submitted.answers, submitted.completedAt);
      assertCompleteBody(JSON.parse(String(requests[1].init?.body)), expected);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  console.log(`Preference submission verification passed: ${passed} scenarios`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
