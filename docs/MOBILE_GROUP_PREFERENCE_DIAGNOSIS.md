# 모바일 그룹 여행 성향 진단

## 일정 분석 반영 (2026-07-14)

`buildDuriAnalysisInputFromState`가 현재 trip member의 유효 preference result로 diagnosis와 GroupPlanningProfile을 다시 파생해 immutable snapshot에 넣는다. fingerprint에는 실제 반영된 answers/tags/version, coverage, dimension profile과 common/shared tags가 포함된다.

- insufficient: 구조 분석은 계속하지만 개인 응답을 그룹 insight처럼 쓰지 않는다.
- partial: 현재 응답 인원과 결과 변동 가능성을 표시한다.
- complete: 전체 member 응답을 웹 밀도·동선·식사·선호 규칙에 반영한다.

큰 spread는 자동 삭제나 갈등 확률 근거가 아니라 웹 suggestion의 조율 이유에만 쓰인다. preference result가 바뀌면 이전 analysis/suggestion은 stale이다.

## 1. 응답 완료 판단 기준

완료 여부의 유일한 원천은 `preferenceResultsByUserId[member.userId]`다. `TripMember`에는 완료 flag를 저장하지 않는다. 결과가 있어도 다음 조건을 모두 통과해야 `completed`다.

- result의 `userId`가 member userId와 같음
- `version === PERSONAL_TEST_VERSION` (현재 1)
- 6개 개인 차원 `pace`, `budget`, `mobility`, `activity`, `mealStyle`, `planningStyle`에 모두 0/1/2 점수가 있음

명시적인 미지원 version은 migration에서 현재 version으로 바꾸지 않고 보존하여 `invalid`로 표시한다. version이 없던 구형 profile-only 데이터만 기존 legacy migration으로 v1 결과를 복구한다.

## 2. 데이터 관계

```text
TripRoom
  -> members[]
  -> TripMember.userId
  -> usersById[userId]
  -> preferenceResultsByUserId[userId]
```

이름으로 사용자를 연결하지 않는다. 부산 데모방은 `user-soomin`, `user-jiyoon`, `user-minjae`가 동일 ID로 User, TripMember, PreferenceResult에 연결된다. 수민·윤지는 v1 결과가 있고 민석은 결과가 없어 기본 partial 상태다.

## 3. completed / pending / invalid

- `completed`: User 관계가 있고 현재 version의 완전한 수치 답변이 존재
- `pending`: User 관계는 있으나 결과가 없음
- `invalid`: User 관계가 없거나, 결과는 있으나 userId/version/필수 점수가 유효하지 않음

중복 member userId는 첫 항목만 사용한다. owner도 일반 member와 같은 규칙으로 계산한다. 존재하지 않는 room은 빈 summary를 반환한다.

## 4. 응답 비율

`completionRate = completedCount / uniqueMemberCount`이며 0~1 범위다. totalCount가 0이면 0이다. UI에서만 반올림해 백분율로 표시한다. invalid는 total에는 포함되지만 completed에는 포함되지 않는다.

## 5. diagnosis coverage

- `insufficient`: 유효 완료 0~1명
- `partial`: 유효 완료 2명 이상이며 전체 완료 전
- `complete`: 최소 2명이고 모든 고유 member가 유효 완료

partial은 항상 “현재 응답한 멤버 기준”과 결과 변경 가능성을 표시한다. 0~1명일 때 개인 결과는 유지하지만 그룹 차이와 match rate를 확정하지 않는다.

## 6. 차원과 spread

`Frontend_new`의 실제 `planningDimensions`를 유지해 그룹 계획 진단에는 다음 5개 차원만 사용한다.

- `pace`
- `mobility`
- `activity`
- `mealStyle`
- `planningStyle`

개인 결과에는 `budget`도 필수지만 웹 그룹 계획 진단에는 포함되지 않는다. 각 차원은 완료 응답자의 실제 0/1/2 답변으로 `min`, `max`, `average`, `spread = max - min`을 계산한다. missing 값을 0으로 채우지 않는다.

## 7. 차원 상태

- spread 0: `common` / 잘 맞아요
- spread 1: `compatible` / 조금만 맞추면 좋아요
- spread 2: `needs-tuning` / 미리 이야기해보세요

이는 웹의 `commonPreferences`, `moderateDifferences`, `needsCoordination` 분류와 같다. UI는 숫자 점수 대신 개인 질문 config의 선택지 label을 표시한다.

## 8. 조율 지표

웹 그룹 진단에는 별도의 match rate 공식이 없었다. 모바일은 작업 명세의 fallback을 “현재 응답 기준 조율 지표”로 별도 파생한다.

- common: 100
- compatible: 60
- needs-tuning: 20
- 5개 유효 계획 차원의 산술 평균을 반올림

2명 미만 또는 유효 차원 0개면 값이 없다. 여행 성공 가능성이나 궁합 점수가 아니라 응답에서 드러난 선호 차이의 크기를 보는 참고값으로만 설명한다.

## 9. preferredTags 집계

완료 응답자의 tag만 trim하고 대소문자를 무시해 중복 제거한다. 첫 원본 label은 유지한다. 응답자 수를 분모로 `count`, `memberIds`, `ratio`, `isCommonToAllRespondents`를 계산하고 count 내림차순, 첫 등장 순으로 정렬한다.

- 공통 tag: 모든 완료 응답자에게 존재
- 공유 tag: 완료 응답자 2명 이상에게 존재
- 개인 tag: 1명에게만 존재

미응답 member는 tag 비율 분모에 넣지 않으며 UI에 “완료한 응답자 기준”을 표시한다.

## 10. GroupPlanningProfile

웹 구조인 `dataStatus`, `completedMemberCount`, `totalMemberCount`, 5개 차원의 `average/spread`를 유지한다. 모바일은 이후 계획 기능을 위해 `commonTags`, `sharedPreferredTags`를 추가했다. insufficient이면 차원 값과 tag는 임의 기본값으로 채우지 않는다.

## 11. 순수 함수와 selector

- `normalizePreferenceResult`: version과 6개 답변을 검증해 수치 vector 생성
- `diagnosePreferenceDimension`: min/max/average/spread/status 계산
- `diagnoseGroupPreferences`: 웹 5차원 진단과 coverage 파생
- `calculateGroupMatchRate`: 모바일 조율 지표 계산
- `summarizeGroupPreferredTags`: 응답자 tag 빈도 계산
- `deriveGroupPlanningProfile`: 분석 엔진용 프로필 생성
- `selectRoomMembers`: 고유 member 관계 선택
- `selectMemberPreferenceStatus`: completed/pending/invalid 파생
- `getRoomPreferenceResponseSummary`: count/rate/coverage 파생

모두 React, React Native, Router, Store hook을 import하지 않고 전달된 입력만 사용한다. 그룹 진단 domain 함수가 향후 Local/Server service 교체 경계다.

## 12. 화면 정책

여행방 상세의 “여행 성향 응답 현황”은 완료 수, 진행률, 멤버별 상태, owner/나 표시, 미반영 멤버 안내와 내 테스트 CTA를 제공한다. 완료한 현재 사용자는 결과 상세와 재테스트로 이동할 수 있다.

“우리 여행 성향”은 coverage 안내, 조율 지표, common/compatible/needs-tuning 차원 카드와 공유 tag를 표시한다. 상태는 색상뿐 아니라 아이콘·label·설명으로 전달한다. 긴 이름과 선택지는 flex 축소 및 줄바꿈을 사용하고 전체 화면은 ScrollView다.

## 13. mock / api / hybrid

- `mock`: local Store ID와 결과를 사용해 N명 진단
- `api`: Room/Quiz 계약 전에는 명시적 계약 대기 오류, mock room fallback 없음
- `hybrid`: server room userId와 local result userId 동일성이 보장되지 않아 “사용자 식별자 연결이 필요합니다”를 표시하고 진단하지 않음

현재 backend의 2인 compatibility endpoint는 호출하지 않으며 N명 local 진단과 섞지 않는다.

## 14. 비영속 원칙과 migration

저장하는 것은 개인 `UserPreferenceResult`와 개인 테스트 draft뿐이다. 다음 값은 저장하지 않는다.

- completed/pending/invalid 목록
- completionRate와 coverage
- GroupPreferenceDiagnosis와 match rate
- GroupPlanningProfile과 tag 집계

`TripMember.preferenceStatus`를 제거했고 domain schema는 3, `duri-mobile-store` persist version은 4다. migration은 기존 User, TripRoom, member userId, 개인 결과, auth session을 유지하며 legacy status field만 버린다. 데모 데이터로 사용자 저장값을 덮어쓰지 않는다.

## 15. 검증 fixture

별도 Jest/Vitest가 없어 `npm run verify:group-preferences`가 전용 TypeScript output을 임시 폴더에 만들고 15개 fixture를 실행한다. 0/1/2/3명 coverage, 동일/spread 1/spread 2, 손상 결과, 없는 User, 중복 member, 빈 tag, version 불일치와 profile/tag 파생을 검증한다. 생성물은 `.group-verification`에 두고 git에서 제외한다.

## 16. 향후 서버와 여행방 흐름

서버 계약이 확정되면 Room member ID와 Quiz result userId의 동일성, 결과 version, partial sync 시각, idempotency를 먼저 정의한다. Server compatibility 결과는 source와 version이 명확할 때만 local diagnosis를 대체하며 두 결과를 혼합하지 않는다.

여행방 목록·홈 응답 진행률, 생성 Wizard의 ID 기반 member 선택, 응답 CTA와 계획 진행 단계, GroupPlanningProfile의 Duri 일정 분석 반영까지 연결됐다. 다음 단계는 backend Room/Quiz ID 계약과 guest→member ID/result 병합 정책이다.
