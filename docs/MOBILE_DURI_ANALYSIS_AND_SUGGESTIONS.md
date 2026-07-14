# 모바일 두리 분석·제안·원자 적용

## 1. 전체 흐름

`workspace → 명시적 분석 → report → 명시적 제안 생성 → 제안 상세 → before/after/diff → 최종 확인 → 전체 validation → 한 번의 Zustand set → workspace` 순서다. 분석, 제안 생성, 미리보기는 `itineraryByTripId`를 수정하지 않는다.

## 2. local/server engine

- `local`: `Frontend_new`에서 이식되어 있던 `src/duri/duri-analysis`와 `src/duri/duri-suggestions` 순수 함수를 사용한다. 네트워크 요청은 없다.
- `server`: 확인된 Duri API와 Schedule batch 계약이 없으므로 unavailable이다. local fallback은 없다.
- DATA_SOURCE와 DURI_ENGINE은 독립적이다. 현재 api/hybrid의 Candidates·Schedule 계약도 대기 중이라 workspace data policy가 별도로 차단한다.

UI는 환경 변수를 직접 읽지 않고 service availability만 사용한다.

## 3. 분석 input

`buildDuriAnalysisInputFromState`가 한 trip에 필요한 TripRoom, member User, 관련 Place, TripCandidate, ItineraryItem, member preference result, GroupPreferenceDiagnosis, GroupPlanningProfile만 구성한다. 분석 순수 함수는 Zustand를 import하지 않는다.

## 4. 불변 snapshot

`createDuriAnalysisSnapshot`은 trip member/member/itinerary/candidate/관련 place/지원되는 preference result를 복제하고 안정적으로 정렬한 뒤 diagnosis/profile을 다시 파생한다. selectedDate, 검색어, Modal, loading, error, scroll과 timestamp는 제외한다. note는 현재 웹 분석 규칙이 쓰지 않아 fingerprint에서는 제외하지만 preview에는 보존한다.

## 5. fingerprint 대상

`canonicalizeDuriInput` 후 안정적인 FNV 계열 hash를 만든다.

- algorithm version
- trip id/region/dates/status/transport/budget/intensity/member role
- itinerary id/tripId/placeId/date/startTime/duration/order/type/preferredByUserIds
- candidate tripId/placeId/addedByUserIds/recommendedByDuri
- place id/region/name/category/tags/address/실제 좌표
- 실제 반영되는 preference answers/tags/profile/version
- group coverage/member/dimension/tag와 GroupPlanningProfile

analyzedAt, createdAt, UI 상태와 랜덤 값은 제외한다. 보안 hash 목적은 아니다.

## 6. algorithm version

- `DURI_ANALYSIS_VERSION = web-rules-v1+mobile-context-v1`
- `DURI_SUGGESTION_VERSION = web-rules-v1+mobile-atomic-v1`

웹에는 별도 상수가 없어 웹 규칙 계보와 모바일 보완 계약을 나타내는 compatibility version을 추가했다. 사용자 UI에는 노출하지 않는다.

## 7. 분석 가능 여부

- 0개: no-itinerary, 분석 차단
- 1개: limited, 비교·균형 근거 부족 안내
- 2개 이상: available
- 손상된 날짜/tripId/Place/HH:mm/기간/중복 item ID: invalid-itinerary
- completed trip: 분석은 가능하지만 적용은 차단
- 미계약 server: engine-unavailable

## 8. issue category와 severity

웹 실제 category는 route, density, meal, preference다. status는 good, attention, warning, insufficient-data이고 severity는 info, low, medium, high다. 모바일 report는 계산 근거가 명확한 time-conflict, day-balance, candidate-usage context를 더하되 웹 엔진 타입은 변경하지 않는다. 정렬은 high→medium→low→info, 날짜, category, stable id 순이다.

## 9. 일정 밀도

웹 실제 기준을 그대로 쓴다: dense place 5/very dense 7, occupied 420/540분, 휴식 없이 연속 3개 초과, 의미 있는 휴식 45분, 긴 연속 구간 210분. pace/activity/planningStyle coverage와 tone에 따라 웹 규칙이 threshold를 조정한다. 항목 수만으로 확정하지 않는다.

## 10. 식사

웹 `isMealPlace`가 Place category/tags/name을 쓴다. 시간대는 아침 07:30~10:00, 점심 11:30~14:00, 저녁 17:30~20:00이며 그 구간을 가로지르는 일정 범위가 있을 때만 검사한다. “식사 장소가 일정에서 확인되지 않아요” 수준으로 표현한다. 실제 meal candidate가 있으면 후보를, 없으면 장소 없는 meal block만 제안할 수 있다.

## 11. 시간 충돌

워크스페이스 `findTimeConflictsForDate`를 재사용한다. `leftStart < rightEnd && rightStart < leftEnd`라 맞닿는 경계는 충돌이 아니다. 손상 시간은 context 분석에서 제외하고 pair를 dedupe해 날짜/item/실제 시간 범위를 근거로 남긴다.

## 12. 날짜 균형

각 여행 날짜의 일정 수, 유효 총분, 충돌 pair, 120분 이상 긴 공백 총분을 계산한다. 새 warning 기준은 상수 `dayBalanceItemDifference = 3`이다. 최대/최소 날짜의 일정 수 차이가 3개 이상일 때만 issue와 빈 슬롯 이동안을 만든다. 첫날·마지막 날의 이동 조건은 가정하지 않는다.

## 13. 동선 coverage

- 모든 관련 Place에 유효 좌표 2개 이상: available, Haversine 직선거리만 표시
- 일부 좌표: partial, 완료로 표현하지 않음
- 좌표 없음: unavailable, 실제 거리·시간·최적 경로 표시 금지

웹은 좌표가 없을 때 안정적인 주소 구/군 권역 전환/A→B→A를 참고로 볼 수 있다. UI는 이것이 Directions 결과가 아님을 명시한다.

## 14. 그룹 성향 coverage

- 0~1명: insufficient, 개인 결과를 그룹처럼 쓰지 않음
- 2명 이상 일부 응답: partial, 현재 응답자 기준과 변동 가능성 표시
- 전원 응답: complete

웹 계획 차원은 pace, mobility, activity, mealStyle, planningStyle다. 큰 spread는 자동 삭제가 아니라 조율 이유에만 쓴다.

## 15. 후보 활용

candidate placeId와 itinerary placeId로 배치/미배치를 파생한다. `addedByUserIds`가 실제 2명 이상인 미배치 후보만 공동 후보로 집계한다. 미배치라는 이유로 필수 배치라고 표현하지 않는다.

## 16. suggestion 타입

웹 실제 7개 타입을 유지한다: reorder-route, move-item, insert-rest, insert-meal, add-preference-place, remove-overload-item, replace-place. 웹 생성기는 meal→density→route→preference issue와 stable ID/priority 순서를 쓴다. 모바일 context는 같은 operation/validation으로 시간 충돌의 빈 슬롯 이동과 일정 수 차이 3개 이상의 날짜 분산만 보완한다.

## 17. change operation

웹 실제 operation은 add, remove, move, resize, replace다. 별도 reorder operation은 없고 route reorder는 두 move change다. update 계열 before를 보존하고 change에 없는 user note는 유지한다.

## 18. preview 구조

제안 생성 당시 beforeItinerary, suggestion changes, 웹 `previewSuggestion/applySuggestionChanges`로 after를 만든다. Store import/mutation은 없다. 실패하면 invalid preview다.

## 19. before/after diff

stable item ID로 같은 항목을 연결해 added, removed, moved, time-changed, reordered, unchanged를 구분한다. 날짜 변경은 moved, 시간/체류시간 변경은 time-changed, 날짜·시간이 같고 날짜 내 order만 달라지면 reordered다.

## 20. expected impact

실제 before/after의 시간 충돌 pair 수, 날짜별 일정 수, 미배치 공동 후보 수만 표시한다. 만족도, 성공률, 갈등 해소 보장, 이동시간/거리 개선은 표시하지 않는다.

## 21. stale 판정

analysis session과 suggestion envelope의 full input fingerprint를 workspace/report/preview/적용 직전에 현재 값과 비교한다. 일정·후보·반영 preference·trip 날짜/상태가 달라지면 stale이다. selectedDate, 검색어, Modal은 무관하다.

## 22. apply validation과 원자 update

trip/suggestion/tripId/version/fingerprint, member/completed, supported change, target item, duplicate target, Place/candidate, trip date, HH:mm/duration, item/trip ID, 중복 Place, 최종 충돌을 모두 검사한다. pure apply로 전체 next itinerary를 만든 뒤 성공할 때만 `applyDuriSuggestionAtomically`이 Zustand set 한 번으로 `itineraryByTripId[tripId]` 전체를 교체한다. candidate와 다른 trip은 바뀌지 않는다.

## 23. apply receipt

성공 결과는 suggestionId, tripId, appliedByUserId, appliedAt, beforeFingerprint, afterFingerprint, changedItemIds, affectedDates를 가진다. 현재 실행의 비영속 feature memory에 기록한다. audit log/전체 undo는 만들지 않았다.

## 24. persist 정책과 migration

웹 분석은 파생 결과이고 모바일 기존 analysesByTripId도 normalize 시 비운다. session/suggestion/receipt는 비영속이며 isStale/currentFingerprint/expected impact도 파생한다. 새 영속 필드가 없어 persist version 4와 migration을 변경하지 않았다.

## 25. api/server 대기

분석 request/response, suggestion DTO/version, 권한, idempotency, stale/version conflict, atomic Schedule batch와 authoritative receipt, Query invalidation 계약이 필요하다. endpoint를 추측하지 않았다.

## 26. 실제 Schedule batch 연동 조건

server apply는 한 요청에서 전체 changes를 검증·적용하고 실패 시 rollback하는 계약, current version/fingerprint 또는 ETag, idempotency key, receipt가 있어야 한다. 그전에는 server suggestion을 여러 일정 API로 나누어 호출하지 않는다.

## 검증

`npm run verify:duri-analysis`는 분석 18, 제안 13, 원자 적용 10 fixture를 실행한다. lint, typecheck, expo-doctor, export도 완료 조건이다.
