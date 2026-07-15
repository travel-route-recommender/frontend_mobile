# 모바일 E2E 회귀 보고서

검증일: 2026-07-15  
대상: `Frontend_mobile` 실제 Expo SDK 57 프로젝트  
범위: source-level E2E trace, 순수 함수/fixture 자동 검증, lint/typecheck/Doctor/export. Android/iOS 실기기 탭 자동화는 이번 환경에서 실행하지 않았다.

## 1. 전체 route와 feature

Expo export 결과는 group-qualified 항목을 포함해 static route 38개였다. 사용자 화면 route는 다음과 같다.

- bootstrap/not-found: `/`, 알 수 없는 URL.
- auth: `/login`, `/signup-choice`, `/signup-email`, `/invite`, `/terms`, `/invite/[code]`.
- onboarding: `/profile`, `/intro`.
- tabs: `/home`, `/explore`, `/trips`, `/saved`, `/mypage`.
- 장소: `/explore/map`, `/places/[placeId]`.
- 여행: `/trips/new`, `/trips/[tripId]`, `/trips/[tripId]/workspace`.
- 성향: `/tests/personal`, `/tests/personal/review`, `/tests/personal/result`.
- Duri: `/trips/[tripId]/analysis`, `/trips/[tripId]/suggestions/[suggestionId]`.

화면별 Store/action/상태 계약은 [MOBILE_E2E_FEATURE_INVENTORY.md](./MOBILE_E2E_FEATURE_INVENTORY.md)에 있다.

## 2. 세션별 권한

| 기능 | anonymous | guest | member |
|---|---|---|---|
| 홈/탐색/장소 상세 | 허용 | 허용 | 허용 |
| 개인 저장 | Member Gate | 차단 | 허용 |
| 새 여행 생성 | Member Gate | 차단 | 허용 |
| 후보 추가 | Member Gate | 참여 여행방만 | 참여 여행방 |
| 여행방/워크스페이스 조회 | 차단 | 참여 여행방 | 참여 여행방 |
| 일정 편집 | 차단 | 참여 중이며 미완료인 방 | 참여 중이며 미완료인 방 |
| 성향 테스트 | 메모리 체험 결과 | 해당 guest user 결과 저장 | 해당 member 결과 저장 |
| Duri 분석/제안 조회 | 차단 | 참여 여행방 | 참여 여행방 |
| Duri 적용 | 차단 | 참여 중이며 미완료인 방 | 참여 중이며 미완료인 방 |

직접 URL 접근도 화면에서 trip membership과 entity 존재를 다시 확인한다. 완료 여행방은 조회는 가능하지만 후보/일정/Duri 적용이 차단된다.

## 3. E2E scenario matrix

| 흐름 | 자동/정적 검증 | 결과 | 실기기 확인 |
|---|---|---|---|
| 첫 설치 및 네 Store hydration | root layout과 `skipHydration` 순서 trace, demo validator | 통과 | cold launch 권장 |
| 오래된/부분 손상 persist | `verify:state-integrity` migration fixture | 통과 | 실제 AsyncStorage 업그레이드 권장 |
| anonymous 둘러보기→상세→save/candidate gate | route/action/capability trace | 통과 | modal/back 확인 필요 |
| mock login/signup/invite→profile→intro | auth service와 route replace trace | 통과 | keyboard/CTA 확인 필요 |
| guest 초대방 접근·다른 방 차단 | membership selector/action 검사 | 통과 | deep-link 확인 필요 |
| 개인 성향 draft→review→result→재테스트 | draft owner, submission, 기존 결과 교체 trace + 기존 preference 검증 | 통과 | 앱 kill/resume 권장 |
| partial→complete 그룹 진단 | 기존 `verify:group-preferences` | 통과 | 화면 copy 확인 필요 |
| 여행 목록 정렬·필터·준비율 | 기존 `verify:trip-flow` | 통과 | 긴 제목 확인 필요 |
| 5단계 여행 생성→owner/activeTrip | draft validation, domain action trace | 통과 | date picker 확인 필요 |
| 장소 검색/필터/상세/save/candidate 독립 | 기존 `verify:place-flow` + integrity fixture | 통과 | 작은 화면 chip 확인 필요 |
| 후보→일정 add/update/move/reorder/delete | 기존 `verify:workspace-editor` | 통과 | modal/hardware back 확인 필요 |
| Duri 분석→제안→preview→atomic apply | 기존 `verify:duri-analysis` 41개 시나리오 | 통과 | 화면 전환 확인 필요 |
| 일정 변경→analysis/suggestion stale | 새 integrity fixture + fingerprint 검사 | 통과 | stale banner 확인 필요 |
| 적용 실패 rollback/중복 적용 차단 | 기존 atomic verification | 통과 | 연속 탭 잠금 확인 필요 |
| 로그아웃→token/session/current user clear | SecureStore/auth/domain action trace | 통과 | 실제 token 저장 후 확인 필요 |
| mock/api/hybrid, local/server 분리 | service policy와 environment trace | 통과 | env별 smoke 권장 |

## 4. 상태 불변식

코드 위치는 `src/core/state-integrity/`다. 사용자, 여행방, 후보, 일정, 저장, 성향, Duri를 개별 검사하고 `validateAppState`가 보고서를 만든다. 상세 목록과 severity 정책은 [MOBILE_STATE_INTEGRITY.md](./MOBILE_STATE_INTEGRITY.md)에 있다.

핵심 판정은 다음과 같다.

- auth/domain current user 불일치, trip/order/member/owner 구조 손상, 중복 관계, 일정 trip/date/time 손상, 성향 완료 flag 불일치, Duri snapshot fingerprint 손상은 error다.
- 아직 동기화되지 않았을 수 있는 user/place/region 참조, stale 분석/제안, 다른 owner의 격리 draft는 warning이다.
- stale은 정상적으로 발생 가능한 상태이므로 구조 오류로 보지 않지만 적용은 차단한다.

## 5. 발견하고 수정한 문제

| 발견 | 위험 | 수정 |
|---|---|---|
| persist middleware version 4와 domain schemaVersion 3 불일치 | 진단/문서/향후 migration 분기 혼동 | `CURRENT_SCHEMA_VERSION = 4`를 middleware와 seed의 단일 source로 사용 |
| persisted TripMember의 빈 userId가 정규화 후 남음 | member/owner selector와 진단에 잘못된 participant 유입 | 빈 ID를 deterministic하게 제거 |
| itinerary preferred user가 존재하는 user이기만 하면 다른 여행방 사용자도 유지 | 그룹 선호 반영 근거 오염 | 현재 trip member에 포함된 user만 유지 |
| `setActiveTrip`이 존재하는 trip만 검사 | 비멤버 trip이 active context가 될 수 있음 | 현재 user membership까지 action에서 확인 |
| 전체 Store 관계를 한 번에 검사하는 도구 부재 | 손상 fixture/회귀 탐지 어려움 | 순수 validator, `validate:state`, fixture verification 추가 |
| route/state/mode 회귀 기준이 여러 문서에 분산 | API 전환 전 누락 가능 | inventory, regression, integrity 문서로 고정 |

owner 누락, 누락된 user/place/date/result는 의미를 추정할 수 없어 자동 생성하지 않았다.

## 6. Hydration·persist 결론

- root가 domain/auth/두 draft Store를 모두 기다리므로 hydration 전 Stack/redirect가 없다.
- persisted relation이 있으면 정규화해 merge하며 seed 배열을 append하지 않아 demo trip 중복 생성 경로가 없다.
- JSON parse/rehydration 오류는 root ErrorState와 retry로 연결된다. 전체 사용자 데이터를 reset하지 않는다.
- auth/domain 완료 순서가 달라도 root barrier 이후 session reconciliation을 실행한다.
- logout은 token/session/current/active를 비우고, mock domain dataset은 제품 정책상 비민감 prototype data로 유지한다. selector가 current user를 요구하므로 이전 user의 개인 화면 상태는 노출되지 않는다.

## 7. 데이터/엔진 모드 회귀

| 설정 | 동작 |
|---|---|
| `EXPO_PUBLIC_DATA_SOURCE=mock` | local mock auth/domain/place/workspace/preference 사용 |
| `api` | 미확정 계약 기능은 명시적 unavailable/error. mock fallback 없음 |
| `hybrid` | server/local ID 호환 계약 전에는 place/workspace/preference/auth를 명시 차단. 조용한 혼합 없음 |
| `EXPO_PUBLIC_DURI_ENGINE=local` | 순수 local 분석/제안/atomic apply 사용 |
| `server` | 서버 계약 미확정 메시지로 unavailable. local engine fallback 없음 |

## 8. Route·UI 회귀 결론

- 모든 동적 param 화면은 배열/undefined를 처리하며 누락 entity를 demo ID로 바꾸지 않는다.
- 생성/제출/적용 성공은 중복 history를 피하도록 `replace`를 사용한다.
- 개인 테스트 hardware back은 draft/검토 흐름을 보존한다. Modal에는 닫기 또는 `onRequestClose`가 있다.
- app config는 portrait 고정이다. landscape는 지원 대상이 아니다.
- SafeAreaProvider/Screen, ScrollView/FlatList, KeyboardAvoidingView 기반 구조는 확인했다. 작은 기기, 큰 글자, 긴 한국어 문자열, 실제 keyboard/modal overflow는 실기기 수동 확인이 남는다.

## 9. 실행 결과

수정 전 기준선:

- Node `v22.17.0`.
- lint 통과.
- TypeScript 통과.
- Expo Doctor 20/20 통과.
- iOS/Android/Web export 및 38 static routes 통과.
- node_modules, `.expo`, `dist`, `.env`, `.env.local` tracked 파일 없음.

추가 자동화:

- `npm run validate:state`: 0 errors, 0 warnings.
- `npm run verify:state-integrity`: 통과.
- 기존 group preference 15, place 23, workspace 29, Duri analysis/suggestion/atomic 41 시나리오 및 trip flow 검증 통과.
- 최종 lint와 TypeScript 통과.
- 최종 Expo Doctor 20/20 통과. 첫 최종 시도는 Expo API `ECONNRESET`으로 schema 원격 검사만 중단됐으나 즉시 재시도해 20개 전체가 통과했다.
- 최종 iOS/Android/Web export와 38 static routes 통과.
- 모바일 실행 코드의 `window`, `document`, `localStorage`, `sessionStorage`, `HTMLElement`, `className`, `react-router-dom` 검색 결과 0건.
- `git diff --check` 통과.

## 10. 남은 문제와 blocker

- 실제 backend OpenAPI, auth/token refresh, Rooms/Places/Saves/Candidates/Schedule/Quiz 계약이 없으므로 API E2E는 의도적으로 unavailable이다.
- server Duri analyze/suggest/apply batch 계약과 idempotency/version 정책이 없다.
- Place 좌표/Directions 데이터가 없어 실제 map과 이동 시간은 검증하지 않는다.
- EAS development build, 실제 Android/iOS 기기, accessibility 큰 글자, keyboard, deep-link, process kill 기반 검증은 별도 기기 단계가 필요하다.
- Maestro/Detox/Jest/RNTL은 기존 stack에 없고 이번 회귀만을 위해 대형 의존성을 추가하지 않았다.

## 11. 실제 API 연동 전 필요한 backend 자료

- OpenAPI 문서와 환경별 base URL, 오류 envelope, pagination/filter/sort 규칙.
- access/refresh token 발급·갱신·폐기·만료·logout 계약과 소셜 로그인 redirect scheme.
- User/TripRoom/TripMember/Region/Place/Candidate/Itinerary/Preference ID 및 version/updatedAt 계약.
- Rooms 생성/초대/role/완료 상태 권한표와 guest→member 전환 정책.
- Schedule batch mutation의 optimistic concurrency, idempotency key, rollback 및 conflict 응답.
- Quiz question/result version, partial draft 서버 저장 여부, 기존 결과 교체 정책.
- Duri analyze/suggestion fingerprint 입력 canonicalization, algorithm version, apply receipt, 중복 적용 차단 계약.
- 좌표/지도 provider, Directions/이동시간/영업시간 source와 개인정보·로그 보존 정책.
