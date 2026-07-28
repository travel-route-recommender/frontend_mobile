# 모바일 상태 무결성

## 1. Normalized 관계와 source of truth

`usersById`, `regionsById`, `placesById`, `tripsById`가 entity source다. `tripOrder`는 정렬 관계, `candidatesByTripId`는 여행방-장소 후보 관계, `itineraryByTripId`는 여행방-일정 관계, `preferenceResultsByUserId`는 사용자-완료 결과 관계, `savedPlaceIdsByUserId`는 사용자-개인 저장 관계다.

ID는 이름에서 추정하지 않는다. 저장과 후보는 같은 Place를 참조해도 서로 독립이며, 후보와 일정도 별도 source다. 후보의 scheduled 여부는 itinerary의 `placeId`로 파생한다. `currentSessionUserId`의 source는 auth Store이고 `currentUserId`는 domain Store에서 동일 사용자를 가리킨다. root reconciliation이 hydration 후 두 값을 맞춘다.

## 2. 상태 분류

| 분류 | 현재 필드 | 서버 전환 방향 |
|---|---|---|
| A. 클라이언트 UI/session 상태 | sessionKind, onboarding flags, personal draft, create-trip draft, explore filter, modal/feedback | 기기별 유지. token은 SecureStore만 사용 |
| B. mock 전용 domain 상태 | users/regions/places/trips/candidates/itinerary/preferences/saved normalized maps | API 연결 전 local prototype source |
| C. 향후 Query 서버 상태 | B의 entity/relation 전체, server Duri analysis/suggestion/apply receipt | TanStack Query cache + 명시적 mutation으로 이동 |
| D. 저장 금지 파생 상태 | candidateCount, itineraryCount, completionRate, completed/pending member IDs, GroupPreferenceDiagnosis, GroupPlanningProfile, scheduled state, preparation progress, stale/current fingerprint, PlaceCard/Workspace VM | selector/순수 함수에서 매번 계산 |

`analysesByTripId`는 legacy schema 호환 필드이며 migration에서 항상 비운다. 실제 Duri session/suggestion/receipt는 현재 비영속 feature Store에만 있다.

## 3. Persist 필드와 hydration

| Storage | Key / version | Persist 내용 | 제외 내용 |
|---|---|---|---|
| domain | `duri-mobile-store` / 4 | schema, current/active IDs, normalized entity/relation maps | actions, errors, accessMode, 파생 분석 |
| auth | `duri-auth-session` / 1 | session kind/user, profile/intro/preference flags | token, hydration/error UI |
| preference draft | `duri-personal-preference-draft` / 1 | owner, 부분 답변, 문항 index, version/time | anonymous result, error/UI |
| trip draft | `duri-create-trip-draft` / 1 | owner, 단계 입력, selected IDs, version/time | error/UI |
| token | SecureStore keys | access/refresh token | AsyncStorage와 로그에 저장하지 않음 |

모든 Zustand persist는 `skipHydration`을 사용한다. root layout이 네 hydration을 동시에 시작하고 모두 끝난 뒤에만 route를 렌더한다. 저장값이 없을 때만 store 생성 시 demo seed가 쓰이며, merge는 persisted maps를 정규화해 seed 위에 합친다. 따라서 재실행마다 demo trip을 추가하는 append 동작은 없다.

## 4. 코드로 검증하는 불변식

- 사용자: authenticated session의 session/domain user 존재와 일치, anonymous의 user ID 부재.
- 여행방: tripOrder 존재/중복, key-ID, owner 정확히 한 명, member 중복/빈 ID, 가능한 user/region 참조, active trip membership.
- 후보: trip key, candidate tripId, 한 여행방의 place 중복, 가능한 place/member 참조.
- 일정: trip key, 전역 item ID 중복, trip 혼합, 여행 기간, 시간 범위, place, 날짜/시간 정렬, 멤버 선호 참조, 겹침 경고.
- 저장: 사용자별 place ID 중복과 가능한 entity 참조. 후보 관계와 결합하지 않는다.
- 성향: result key-userId, 지원 version/답변, session 완료 flag와 실제 결과 일치, draft owner 격리.
- Duri: session snapshot fingerprint, current input stale, suggestion base/session/current fingerprint, itinerary fingerprint, suggestion ID, receipt의 trip/member 관계.

`src/core/state-integrity/validateAppState.ts`가 세부 validator 결과를 합친다. validator는 입력을 수정하지 않으며 `valid`는 error가 없을 때 true다. stale 분석, 누락 가능 참조, 다른 사용자 draft 격리는 앱을 손상시키지 않는 warning이다.

## 5. Migration과 자동 복구

Domain schema 5는 persist middleware version과 같은 `CURRENT_SCHEMA_VERSION`을 source로 사용한다. 정규화는 다음만 자동 처리한다.

- 중복/존재하지 않는 tripOrder 제거 후 빠진 실제 trip ID append.
- 누락 relation array를 빈 배열로 생성.
- 빈/중복 trip member 제거. owner는 새로 만들거나 바꾸지 않음.
- 같은 trip/place 후보를 합치고 contributor를 해당 trip member로 제한.
- item ID 중복, 다른 trip 혼합, 유효하지 않은 날짜·시간·place 항목 제거 후 날짜/시간 정렬.
- itinerary 선호 사용자를 해당 여행방 member로 제한.
- 저장 ID 중복/없는 place 제거.
- legacy `walking` 이동 방식은 `public`으로 합치고, 숙소·종료 조건은 허용된 길이·15분 단위 시각·분 범위를 통과한 값만 복원.
- 날짜 미정 여행방과 초안의 종료 조건은 추측하지 않고 제거.
- 지원 가능한 결과만 user key에 맞춰 정규화하고 legacy 결과만 명시적으로 변환.
- legacy analysis cache 제거. Duri feature Store는 비영속이라 앱 재실행 시 오래된 session/suggestion이 복구되지 않음.
- config version이 다른 UI draft는 폐기하고 사용자에게 notice 제공.

복구 과정은 이름으로 user/place를 연결하거나 owner·여행 날짜·성향 결과를 만들지 않는다. 다른 trip으로 candidate/item을 이동하지도 않는다. 이런 손상은 validator error/warning과 기존 ErrorState에서 확인한다.

## 6. 개발용 진단

```powershell
npm.cmd run validate:state
npm.cmd run verify:state-integrity
```

첫 명령은 현재 코드의 demo seed를 대표 member session으로 검증하고 error/warning 수, entity 종류와 issue code만 출력한다. 사용자 값, entity ID, token은 출력하지 않는다. error가 있으면 exit code 1이다. 두 번째 명령은 손상 fixture 감지, deterministic migration, session isolation, Duri stale을 검증한다.

실기기 AsyncStorage를 직접 덤프하지 않는다. 기기 상태를 진단해야 하면 `validateAppState`에 필요한 snapshot만 전달하고 보고서의 code/count만 외부로 기록한다.

## 7. 로그아웃과 사용자 전환 정책

로그아웃은 SecureStore token과 auth session을 초기화하고 domain `currentUserId`/`activeTripId`를 비운다. mock entity와 비민감 관계는 prototype dataset으로 유지한다. 화면 selector는 current user membership을 요구하므로 이전 사용자의 저장·여행·결과가 새 세션 화면에 노출되지 않는다. Draft는 owner ID로 격리되어 다른 사용자가 이어 쓸 수 없다. 운영 API 전환 시 domain server state는 Query cache clear 정책으로 교체해야 한다.
