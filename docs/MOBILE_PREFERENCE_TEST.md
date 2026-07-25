# 모바일 개인 여행 성향 테스트

개인 여행 성향 테스트 화면은 7단계의 행동형·복합 응답 방식으로 개편되었다. 백엔드 Quiz 계약은 아직 연결하지 않으며, Store에는 완료된 7단계 원본 응답만 저장한다. `TravelPreferenceSurveyResult`와 기존 여행방 그룹 진단용 `legacyProjection`은 원본 응답에서 필요할 때 계산한다.

## 0.1 7단계 전용 결과 구조

`calculateTravelPreferenceSurveyResult`는 다음 정보를 하나의 결과로 만든다.

- 원본 7단계 `answers`
- 8개 활동 카테고리와 일정 밀도의 0·50·100 선호 점수
- 일정 span·활동·휴식·자유시간·밀도 특징값
- 명소·로컬 배치 개수와 시간
- 이동 수단별 0/100 선호도
- 숙소 3축 0~100 점수
- 도전 성향, 체력, 예산 배분, 명소·로컬 점수
- `surveyVersion`, `algorithmVersion`, `completedAt`
- 기존 그룹 진단용 projection은 `calculateLegacyPreferenceProjection`에서 별도 계산

member/guest의 완료 원본은 `completedSurvey`에 영속화하고 anonymous 완료 원본은 같은 필드에 비영속 상태로 둔다. 상세 결과는 `useTravelPreferenceSurveyResult`가 완료 원본 또는 고정 mock fixture에서 계산한다. 백엔드 DTO와 endpoint는 계약이 확정되기 전까지 정의하지 않는다.

## 0. 현재 화면 구성

화면 기준 파일은 `src/features/preferences/config/travel-preference-test-config.ts`다.

| 순서 | 단계 | 응답 방식 |
|---:|---|---|
| 1 | 여행 활동과 일정 밀도 | 여행 동반자가 묻는 식당·카페·쇼핑·명소 관광·로컬 탐방·액티비티·자연·휴식·일정 밀도 9개 메시지에 선호·중간·불호 의미의 구문형 답장으로 응답. 기존 일정표·드래그 블록은 `ItineraryScheduleBuilderAsset`으로 보존 |
| 2 | 이동 방식 | 자차·렌터카, 버스·지하철·열차·택시, 도보 복수 선택 |
| 3 | 숙소 스타일 | 잠만 자는 곳↔여행의 일부, 위치↔시설, 편안함↔가격의 8단계 척도 |
| 4 | 도전 성향 | 검증된 곳↔새로운 곳의 4단계 척도 |
| 5 | 체력 수준 | 낮음·보통·좋음 3단계 자기평가 |
| 6 | 예산 소비 방향 | 숙소·맛집·체험·쇼핑·이동에 100코인을 5개 단위로 배분 |
| 7 | 여행지 탐색 | 명소 필수도와 로컬 관심도를 각각 4단계로 측정 |

입력, 검토, 결과 상세 화면은 모두 새 응답을 사용한다. 목적지별 상위 태그와 태그 계층은 백엔드 계약 전이므로 현재는 대표 상위 태그를 사용한다.

일정 밀도 메신저 질문의 태그별 측정 항목과 권장 문항 유형은 `docs/ITINERARY_DENSITY_MESSAGE_QUESTION_PLAN.md`를 따른다.

## 1. 질문 config 구조

`src/duri/preferences/personalTestConfig.ts`는 현재 그룹 진단 및 로컬 결과 계산과의 호환을 위한 6차원 설정이다. 실제 입력 화면의 질문 config로 사용하지 않는다.

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

새 화면, 진행률, 검토 목록, 전체 검증은 항상 `preferenceSteps.length`를 사용한다. 마지막 index나 단계 수를 상수로 중복 하드코딩하지 않는다.

## 2. 답변 타입

- 숙소 척도 값: `AccommodationScaleValue = 1 | ... | 8`
- 도전·탐색 척도 값: `FourPointScaleValue = 1 | 2 | 3 | 4`
- 메신저 답변 값: `ItineraryPreferenceLevel = "like" | "neutral" | "dislike"`
- 복합 응답: `PersonalPreferenceDraftAnswers`의 9개 메신저 답변, 세부 이동수단, 숙소 3축, 도전 성향, 체력, 코인 배분, 명소·로컬 필드
- 호환 결과 값: `PreferenceScore = 0 | 1 | 2`
- 그룹 진단용 완료 답변: `PersonalPreferenceAnswers = Record<PreferenceDimension, PreferenceScore>`

제출 전 `validateTravelPreferenceSurvey`가 7단계 완료 여부와 100코인 합계를 검증한다. 이후 `calculateTravelPreferenceSurveyResult`가 전용 결과를 만들고, `deriveLegacyPreferenceAnswers`는 기존 그룹 진단에 필요한 6차원 호환 projection을 만드는 데에만 사용한다.

## 3. 결과 계산 구조

`calculateTravelPreferenceSurveyResult`와 `calculatePersonalPreferenceResult`는 React, React Native, Zustand, Router, storage를 import하지 않는 순수 기준 함수다.

- `profileType`: `pace + activity`
  - 0~1: `여유로운 여행자`
  - 2: `균형형 여행자`
  - 3~4: `알찬 여행자`
- `traits`: pace, mobility, activity, mealStyle, planningStyle의 선택 값에 대응하는 문구
- `preferredTags`: activity 기본 태그에 mealStyle, budget, mobility 조건 태그를 순서대로 합치고 중복 제거
- `version`: `PERSONAL_TEST_VERSION`, 현재 1
- `completedAt`: 최종 제출 시 한 번 생성한 ISO 8601 문자열

결과 계산과 Store 저장은 분리되어 있다. API/hybrid 계약 대기 오류가 발생하면 계산 결과를 사용자 결과로 저장하지 않는다. `mock` 결과 서비스는 검증된 원본 응답을 순수 계산 함수에 전달하며 백엔드 request builder를 사용하지 않는다.

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

`usePersonalPreferenceDraftStore`는 작성 중 draft와 마지막 완료 원본 응답만 관리하는 feature Store다.

```ts
interface PersonalPreferenceDraft {
  configVersion: number;
  owner: { kind: "anonymous" } | { kind: "user"; userId: string };
  currentQuestionIndex: number;
  answers: PersonalPreferenceDraftAnswers;
  startedAt: string;
  updatedAt: string;
}
```

`startTest`, `updateAnswers`, `goNext`, `goPrevious`, `goToQuestion`, `resetDraft`, `setCompletedSurvey` action을 제공한다. 중간 답변이 있으면 이어하기/처음부터 다시 하기를 선택할 수 있고 나가기 Modal에서 기기 저장 정책을 안내한다. Store에는 완료 원본만 보존하고 결과 상세와 친구 궁합 점수는 원본에서 파생한다.

## 7. 완료 결과 상태

- member/guest 전용 원본: feature Store의 `completedSurvey`
- member/guest 기존 호환 결과: 도메인 Store의 `preferenceResultsByUserId[userId]`
- anonymous 원본: feature Store의 비영속 `completedSurvey`
- 상세 결과와 anonymous 호환 preview: `useTravelPreferenceSurveyResult`에서 계산

member/guest 저장 성공 시 `preferenceResultsByUserId`, `preferenceTestCompleted`, `onboardingIntroSeen`을 갱신하고 draft를 제거한 뒤 result route로 replace한다. 여행방 member에는 완료 flag를 저장하지 않으며 응답 상태는 결과의 version과 답변 유효성에서 파생한다. 저장 실패 시 기존 완료 결과와 draft를 모두 유지한다.

## 8. anonymous / guest / member 정책

| 세션 | 테스트 | 결과 화면 | 영구 저장 | 여행방 응답 반영 |
|---|---:|---:|---:|---:|
| anonymous | 허용 | 허용 | 안 함 | 안 함 |
| guest | 허용 | 허용 | guest User에 저장 | 초대 여행 membership에 반영 |
| member | 허용 | 허용 | 현재 User에 저장 | 참여 여행에 반영 |

anonymous 결과에는 로그인·회원가입 유도와 비영속 안내를 표시한다. 가짜 사용자 ID를 `preferenceResultsByUserId`에 만들지 않는다. guest → member 결과 병합은 구현하지 않는다.

## 9. mock / api / hybrid

- `mock`: 웹 기준 순수 로컬 계산을 실행하고 세션 정책에 맞게 저장 또는 체험 표시
- `api`: Quiz DTO·endpoint를 추측하지 않으며 계산 요청 시 계약 대기 오류. 네트워크 호출과 mock fallback 없음
- `hybrid`: 현재 Quiz 계약이 없으므로 제출 보류. 공개 로컬 기능과 draft는 유지

`preferenceResultService`가 mode 분기를 담당하므로 화면은 환경 변수를 직접 분기하지 않는다. 현재 공개 타입은 화면에서 로컬 계산에 필요한 입력과 결과뿐이며 백엔드 전송 DTO가 아니다.

## 10. AsyncStorage persist

- key: `duri-personal-preference-draft`
- persist version: 6
- 저장: active draft와 member/guest의 마지막 완료 원본 응답
- 저장하지 않음: 파생 상세 결과, anonymous 완료 응답, 오류, hydration UI 상태

완료 결과는 기존 `duri-mobile-store`에 저장된다. Auth의 `duri-auth-session`에는 완료 여부 boolean만 저장하고 결과를 중복 저장하지 않는다.

## 11. 테스트 다시 하기

결과 화면과 마이페이지에서 재테스트를 선택하면 확인 Modal을 표시한다. 기존 결과는 즉시 삭제하지 않고 새 draft만 초기화하며 새 제출 성공 후 교체한다. anonymous의 메모리 체험 결과도 새 제출 전까지 유지한다.

## 12. config version 변경

draft의 `configVersion`이 현재 version과 다르면 hydration normalization에서 draft만 폐기한다. 사용자에게 문항 변경 안내를 표시하며 완료된 `UserPreferenceResult`는 삭제하지 않는다. 완료 결과의 legacy normalization은 기존 도메인 migration을 그대로 사용한다.

## 13. 백엔드 Quiz 계약 대기

- questions/status/submit endpoint와 서버 response DTO
- submit 요청·응답 DTO와 인증 정책
- 클라이언트 계산 결과 검증 및 `algorithmVersion` 정책
- 질문 cache와 version 정책
- submit idempotency와 오류 코드
- server/local 결과 source-of-truth
- offline retry와 충돌 정책
- guest → member 결과 병합

계약 확정 전에는 실제 endpoint를 호출하지 않는다.

## 14. 그룹 응답 현황 연결

`selectMemberPreferenceStatus`와 `selectRoomPreferenceResponseSummary`가 실제 결과의 userId, version, 6개 답변을 검증해 completed/pending/invalid와 completion rate를 계산한다. Auth Session의 `preferenceTestCompleted`도 hydration 뒤 같은 실제 결과 존재 여부와 맞춘다.

여행방 상세에는 멤버별 상태, partial/complete 진단, 5개 계획 차원 spread, tag와 GroupPlanningProfile 기반이 연결되어 있다. 자세한 정책은 `MOBILE_GROUP_PREFERENCE_DIAGNOSIS.md`를 따른다. guest 병합 ID 재매핑과 server 동기화는 계약 대기다.
