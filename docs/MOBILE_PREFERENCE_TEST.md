# 모바일 개인 여행 성향 테스트

개인 여행 성향 테스트의 데이터와 계산 기준은 `Frontend_new`의 현재 구현이다. `travel-client-reference`에서는 카드 배치와 결과 표현만 참고했으며 문항·계산 로직은 사용하지 않았다.

## 1. 질문 config 구조

기준 파일은 `src/duri/preferences/personalTestConfig.ts`다.

```ts
interface PreferenceQuestion {
  id: string;
  dimension: PreferenceDimension;
  question: string;
  choices: PreferenceChoice[];
}
```

웹에서 확인한 실제 구조는 6문항, 문항별 3개 선택지, config version 1이다.

| 순서 | ID | 차원 |
|---:|---|---|
| 1 | `personal-pace` | `pace` |
| 2 | `personal-budget` | `budget` |
| 3 | `personal-mobility` | `mobility` |
| 4 | `personal-activity` | `activity` |
| 5 | `personal-meal` | `mealStyle` |
| 6 | `personal-planning` | `planningStyle` |

화면, 진행률, 검토 목록, 전체 검증은 항상 `personalTestQuestions.length`와 config의 선택지 배열을 사용한다. 마지막 index나 문항 수를 상수로 중복 하드코딩하지 않는다.

## 2. 답변 타입

- 선택 값: `PreferenceScore = 0 | 1 | 2`
- 완료 답변: `PersonalPreferenceAnswers = Record<PreferenceDimension, PreferenceScore>`
- 진행 중 답변: `Partial<Record<PreferenceDimension, PreferenceScore>>`

제출 전 `validatePreferenceAnswers`가 config 존재, version, 모든 답변, 알 수 없는 차원, 선택지에 없는 값을 검증한다.

## 3. 결과 계산 구조

`calculatePersonalPreferenceResult`는 React, React Native, Zustand, Router, storage를 import하지 않는 순수 기준 함수다.

- `profileType`: `pace + activity`
  - 0~1: `여유로운 여행자`
  - 2: `균형형 여행자`
  - 3~4: `알찬 여행자`
- `traits`: pace, mobility, activity, mealStyle, planningStyle의 선택 값에 대응하는 문구
- `preferredTags`: activity 기본 태그에 mealStyle, budget, mobility 조건 태그를 순서대로 합치고 중복 제거
- `version`: `PERSONAL_TEST_VERSION`, 현재 1
- `completedAt`: 최종 제출 시 한 번 생성한 ISO 8601 문자열

결과 계산과 Store 저장은 분리되어 있다. API/hybrid 계약 대기 오류가 발생하면 계산 결과를 사용자 결과로 저장하지 않는다.

## 4. Frontend_new에서 재사용한 로직

다음 세 파일은 웹 기준과 모바일 파일의 SHA-256이 동일한 상태로 유지된다.

- 도메인 `UserPreferenceResult`
- `personalTestConfig.ts`
- `calculatePersonalPreferenceResult.ts`

따라서 동일한 answers와 completedAt을 전달하면 `profileType`, `traits`, `preferredTags`, `version`, `completedAt`이 동일하다. 모바일 Store는 같은 계산 함수로 결과를 생성하고 `preferenceResultsByUserId[userId]`에 저장한다.

## 5. travel-client-reference에서 반영한 디자인

- 질문 하나에 집중하는 큰 흰색 카드
- 부드러운 radius와 파란 선택 테두리·배경
- 선택 상태 체크 아이콘
- 상단 현재/전체 진행률
- 결과 유형, 태그, 안내 카드의 정보 계층

reference의 `surveyQuestions.js`, `computeResult.js`, 5문항 고정 구조, Context, localStorage, 180ms 자동 이동은 사용하지 않았다.

## 6. draft 상태

`usePersonalPreferenceDraftStore`는 완료 결과와 분리된 feature Store다.

```ts
interface PersonalPreferenceDraft {
  configVersion: number;
  owner: { kind: "anonymous" } | { kind: "user"; userId: string };
  currentQuestionIndex: number;
  answers: Partial<PersonalPreferenceAnswers>;
  startedAt: string;
  updatedAt: string;
}
```

`startTest`, `selectAnswer`, `goNext`, `goPrevious`, `goToQuestion`, `resetDraft` action을 제공한다. 중간 답변이 있으면 이어하기/처음부터 다시 하기를 선택할 수 있고 나가기 Modal에서 기기 저장 정책을 안내한다.

## 7. 완료 결과 상태

- member/guest: 기존 도메인 Store의 `preferenceResultsByUserId[userId]`
- anonymous: feature Store의 비영속 `anonymousResult`

member/guest 저장 성공 시 여행방 member 응답 상태, `preferenceTestCompleted`, `onboardingIntroSeen`을 갱신하고 draft를 제거한 뒤 result route로 replace한다. 저장 실패 시 기존 완료 결과와 draft를 모두 유지한다.

## 8. anonymous / guest / member 정책

| 세션 | 테스트 | 결과 화면 | 영구 저장 | 여행방 응답 반영 |
|---|---:|---:|---:|---:|
| anonymous | 허용 | 허용 | 안 함 | 안 함 |
| guest | 허용 | 허용 | guest User에 저장 | 초대 여행 membership에 반영 |
| member | 허용 | 허용 | 현재 User에 저장 | 참여 여행에 반영 |

anonymous 결과에는 로그인·회원가입 유도와 비영속 안내를 표시한다. 가짜 사용자 ID를 `preferenceResultsByUserId`에 만들지 않는다. guest → member 결과 병합은 구현하지 않는다.

## 9. mock / api / hybrid

- `mock`: 웹 기준 순수 로컬 계산을 실행하고 세션 정책에 맞게 저장 또는 체험 표시
- `api`: Quiz DTO·endpoint를 추측하지 않으며 제출 시 계약 대기 오류. 네트워크 호출과 mock fallback 없음
- `hybrid`: 현재 Quiz 계약이 없으므로 제출 보류. 공개 로컬 기능과 draft는 유지

`preferenceSubmissionService`가 mode 분기를 담당하므로 화면은 환경 변수를 직접 분기하지 않는다.

## 10. AsyncStorage persist

- key: `duri-personal-preference-draft`
- persist version: 1
- 저장: active draft만
- 저장하지 않음: anonymousResult, 오류, hydration UI 상태

완료 결과는 기존 `duri-mobile-store`에 저장된다. Auth의 `duri-auth-session`에는 완료 여부 boolean만 저장하고 결과를 중복 저장하지 않는다.

## 11. 테스트 다시 하기

결과 화면과 마이페이지에서 재테스트를 선택하면 확인 Modal을 표시한다. 기존 결과는 즉시 삭제하지 않고 새 draft만 초기화하며 새 제출 성공 후 교체한다. anonymous의 메모리 체험 결과도 새 제출 전까지 유지한다.

## 12. config version 변경

draft의 `configVersion`이 현재 version과 다르면 hydration normalization에서 draft만 폐기한다. 사용자에게 문항 변경 안내를 표시하며 완료된 `UserPreferenceResult`는 삭제하지 않는다. 완료 결과의 legacy normalization은 기존 도메인 migration을 그대로 사용한다.

## 13. 백엔드 Quiz 계약 대기

- questions/status/submit request·response DTO
- 질문 cache와 version 정책
- submit idempotency와 오류 코드
- server/local 결과 source-of-truth
- offline retry와 충돌 정책
- guest → member 결과 병합

계약 확정 전에는 실제 endpoint를 호출하지 않는다.

## 14. 다음 단계 그룹 응답 현황

현재 `selectTripPreferenceResponseStatus`, `selectCompletedPreferenceMemberIds`, `selectPendingPreferenceMembers`, `selectTripPreferenceProgress`가 결과 존재 여부로 완료/미완료와 count를 계산한다.

다음 단계에서는 completion rate, 여행방 완료/대기 목록, 그룹 진단 실행 조건, guest 병합 ID 재매핑, server 동기화 상태를 이 selector 위에 연결한다.
