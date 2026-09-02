# 모바일 아키텍처

## Duri analysis feature 경계

`src/features/duri`는 UI/application 계층이고 `src/duri`의 웹 이식 순수 엔진을 재사용한다.

- selectors: 한 trip의 normalized 분석 입력
- logic: snapshot/canonical fingerprint/context report/suggestion envelope/preview/diff
- services: local과 unavailable server engine
- validation: 전체 next itinerary와 receipt 준비
- store: 비영속 session/suggestion/receipt와 중복 실행 상태
- screens/components: report, 세로 preview, 최종 확인

Domain Store의 `applyDuriSuggestionAtomically`만 최종 mutation을 수행하며 성공 시 `itineraryByTripId[tripId]`를 Zustand set 한 번으로 교체한다. stale은 full input fingerprint 비교로 파생한다. Duri session/suggestion/receipt는 비영속이라 Duri 기능 자체는 domain schema를 늘리지 않는다.

## Router와 화면

Expo SDK 57의 Expo Router를 사용한다. `app/`은 route 선언과 parameter 경계만 담당하며 실제 화면은 `src/features/*/screens`에 둔다. 5개 하단 탭은 실험적 Native Tabs가 아닌 안정형 JavaScript `Tabs`다. 상세 화면은 root `Stack`에 포함된다.

## Feature 구조

- `src/components/common`: Screen, Header, 버튼, 입력, 카드, 칩, 아바타, 이미지 fallback
- `src/components/feedback`: Loading, Empty, Error 상태
- `src/features`: 화면과 feature별 네이티브 UI
- `src/features/trip-creation`: 5단계 생성 화면, versioned draft Store, validation과 platform date picker
- `src/features/places`: Place ViewModel, 검색/유사 장소/권한 순수 함수, 저장·후보 action controller와 데이터 모드 경계
- `src/features/explore`: 목록·지역 보드 화면과 목록/지도 공유용 비영속 검색 Store
- `src/features/workspace`: 후보 보드, 날짜 탭, 일정 편집 Modal, 날짜·시간·충돌·권한 selector/순수 함수와 Schedule 데이터 모드 경계
- `src/domain`: 플랫폼 비의존 도메인 타입
- `src/duri`: 플랫폼 비의존 성향·분석·제안 엔진
- `src/data/mock`: normalized demo data
- `src/store`: Zustand state, persist, migration, selectors
- `src/services`: API·token·data source 경계
- `src/query`: QueryClient와 query key factory

## Store와 persist

웹의 normalized 구조를 유지한다. 상태에는 사용자, 지역, 장소, 여행방, 후보, 일정, 성향 결과, legacy 분석 cache 자리와 사용자별 저장 ID가 있다. `zustand/middleware`의 `createJSONStorage`와 AsyncStorage를 사용하며 storage key는 `duri-mobile-store`다. persist와 domain schema는 공통 `CURRENT_SCHEMA_VERSION = 5`를 사용한다. schema 5는 여행방의 선택 숙소·마지막 날 종료 조건을 정규화하고 legacy `walking` 이동 방식을 `public`으로 이관한다. migration은 알려지지 않은 저장값을 검증하고 normalized relation을 복구한다.

`skipHydration`으로 자동 초기화를 끄고 root layout에서 명시적으로 rehydrate한다. hydrate가 끝나기 전에는 빈 상태나 route redirect를 렌더하지 않는다. 복구 실패 시 재시도 가능한 ErrorState를 표시한다.

개인 성향 테스트의 진행 draft는 도메인 완료 결과와 분리한다. `duri-personal-preference-draft`는 현재 문항, 부분 답변, 소유 범위, config version과 시각만 저장한다. 여행방 생성 초안도 `duri-create-trip-draft` version 1의 별도 Store로 분리하며 Region/User ID와 date-only 입력만 보관한다. root layout은 domain/auth/두 draft Store의 hydration을 모두 기다린다. anonymous 체험 결과는 메모리에만 두며 AsyncStorage에 persist하지 않는다.

여행 목록 카드, 5단계 준비율, 후보·일정 수, 응답률과 D-day는 selector/순수 함수에서 파생한다. `TripRoom`이나 persist state에 중복 저장하지 않는다. `createTrip`은 owner·trip·관계 초기화·activeTrip을 단일 update로 반영한다.

Place 원본은 placesById, 개인 저장은 savedPlaceIdsByUserId, 여행 후보는 candidatesByTripId, 일정 배치는 itineraryByTripId로 분리한다. PlaceCard는 ViewModel만 받고 Store를 import하지 않는다. 탐색 keyword/region/category/sort/viewMode는 비민감·비영속 feature Store에서 목록과 지역 보드가 공유한다. Place에 좌표가 추가되기 전에는 native map dependency나 임의 marker를 사용하지 않는다.

워크스페이스 selectedDate, 후보 검색·필터, Modal, 종료 시간, 충돌, 날짜별 count와 scheduleState는 비영속 파생/UI 상태다. `ItineraryItem`의 실제 `startTime + durationMinutes`를 시간 범위로 사용하고 후보 배치 여부는 itinerary placeId lookup에서 파생한다. 일정 추가·수정·이동·삭제와 후보 제거는 trip/member/completed 정책을 Store action에서도 검증한다.

## 상태 무결성 경계

`src/core/state-integrity`의 순수 validator가 auth/domain current user, normalized trip/member/candidate/itinerary/saved/preference 관계와 Duri fingerprint/receipt를 검사한다. validator는 Store를 수정하지 않는다. deterministic repair는 `normalizePersistedState`에만 있으며 빈·중복 ID 제거, 관계 배열 초기화, 일정 정렬처럼 의미를 추정하지 않는 처리만 한다. owner, 누락 날짜, 누락 성향 결과는 만들지 않는다.

개발 진단은 `npm run validate:state`, 손상 fixture 회귀는 `npm run verify:state-integrity`로 실행한다. 세부 계약은 `MOBILE_STATE_INTEGRITY.md`, 전체 route와 E2E 상태는 `MOBILE_E2E_FEATURE_INVENTORY.md`와 `MOBILE_E2E_REGRESSION_REPORT.md`에 있다.

access token, refresh token, 비밀번호와 secret은 AsyncStorage persist 대상이 아니다.

## SecureStore

`TokenStorage` interface와 `nativeTokenStorage` adapter만 제공한다. 구현은 `expo-secure-store`를 사용하지만 실제 login, refresh, mock token은 없다. UI는 adapter를 직접 호출하지 않는다.

## Query와 서비스

QueryClient는 module singleton이다. query retry는 최대 1회, mutation retry는 비활성화했고 refocus 재요청을 끈다. endpoint는 추측하지 않았다. `ApiClient` interface, mock `TravelService`, query key factory를 두었고 API/hybrid mode는 계약이 없을 때 명시적으로 오류를 낸다. API 실패를 mock으로 몰래 전환하지 않는다.

## 데이터 소스

- `mock`: 현재 기본값. Store와 mock service가 로컬 데모 데이터를 사용
- `api`: OpenAPI 계약 수신 후 구현. 현재 명시적 미지원 오류
- `hybrid`: 캐시·로컬 엔진 경계를 정한 뒤 구현. 현재 명시적 미지원 오류

Rooms 계약이 없는 현재는 api/hybrid에서 목록·상세·생성을 mock으로 fallback하지 않는다. mock의 동행자 추가는 기존 demo User만 대상으로 하며 실제 초대를 가장하지 않는다.

Places/Saves/Candidates도 같은 원칙을 적용한다. 화면은 `placeRepository` 정책을 통해 availability를 받고, api/hybrid 계약 전에는 mock Place나 로컬 relation mutation으로 성공을 가장하지 않는다.

Workspace Candidates/Schedule은 `workspaceScheduleService` 정책을 사용한다. mock만 로컬 편집을 허용하고 api/hybrid는 ID와 mutation 계약이 확정될 때까지 mock 후보·일정으로 fallback하지 않는다.

환경 변수는 `.env.example`에 공개 가능한 값만 둔다. `EXPO_PUBLIC_*`에는 secret을 넣지 않는다.

## Duri local engine

개인 성향 결과, 그룹 진단, GroupPlanningProfile, 일정 분석, suggestion fingerprint, preview와 적용 함수는 React와 Store를 import하지 않는 순수 함수다. 같은 normalized 입력에 대해 웹과 같은 분석 결과를 내도록 기준 구현을 유지한다.

개인 성향 질문 config, 도메인 타입과 결과 계산 파일은 `Frontend_new` 기준과 동일하다. 화면은 `preferenceSubmissionService`를 통해 제출한다. mock과 익명 체험은 local 계산을 사용하고, api/hybrid의 인증 세션은 설문·알고리즘 버전과 현재 8단계 원본 답변을 Quiz 세션 API에 전송한다. 서버 제출 실패를 local 성공으로 처리하지 않는다.

그룹 응답 상태와 진단은 `TripMember.userId -> usersById -> preferenceResultsByUserId` 관계에서 파생한다. `TripMember`에 완료 flag를 저장하지 않는다. selector가 version과 6개 필수 답변을 검증하고, Duri group domain이 웹 기준 5개 계획 차원의 spread와 GroupPlanningProfile을 계산한다. completion rate, coverage, match rate, tag 집계와 그룹 프로필은 persist하지 않는다.

## 딥링크

scheme은 `tripmatch`다. `tripmatch://invite/:code`는 `app/invite/[code].tsx`로 받을 준비만 했다. 빈 code는 복구 가능한 오류 설명을 표시한다. 실제 조회·수락·인증 전환은 백엔드 계약 후 연결한다.

## 출시 전 TODO

iOS bundle identifier, Android package, EAS projectId, Apple Team ID와 production URL은 결정하지 않았다. `app.json`에 임의의 값을 넣지 않는다.
