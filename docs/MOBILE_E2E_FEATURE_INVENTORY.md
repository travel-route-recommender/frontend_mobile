# 모바일 E2E 기능 Inventory

기준일은 2026-07-15이다. 실제 Expo 프로젝트의 `app/`과 `src/features/`를 기준으로 작성했다. `expo export --platform all`은 route group 이름이 포함된 항목과 공개 URL 항목을 합쳐 38개 static route를 생성했다. 아래 표는 사용자가 이동할 수 있는 화면 route를 한 번씩 정리한다. `_sitemap`은 Expo Router가 생성하므로 앱 기능 route에서 제외한다.

## Route별 계약

| Route | Screen component | 입력 데이터 | Store field | Selector / 파생 | Action | 권한 | mock / api·hybrid | Loading | Empty | Error | 다음 route |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` (`app/index.tsx`) | `SessionBootstrapScreen` | hydration 완료 세션 | auth session, `usersById` | session/user 존재, profile/intro 분기 | `logout` | 모두 | 모드 공통 bootstrap | hydration 대기 | 비로그인→login | 세션-user 불일치 | login, profile, intro, home |
| `/(auth)/login` (`/login`) | `LoginScreen` | email/password 또는 Kakao mock | auth session, domain current user | 입력 validation | login, anonymous 시작, user upsert | 비로그인 중심; 직접 접근 가능 | mock 성공, api/hybrid 계약 오류 | 제출 잠금 | 해당 없음 | 자격/계약 오류 banner | home, profile, signup, invite, terms |
| `/(auth)/signup-choice` | `SignupChoiceScreen` | 가입 방식 | auth session | 없음 | Kakao mock login | 모두 | mock만 성공 | 제출 잠금 | 해당 없음 | provider/계약 오류 | signup-email, login, profile/home |
| `/(auth)/signup-email` | `SignupEmailScreen` | email/password/약관 | auth session, `usersById` | 필드 validation | signup, user upsert | 모두 | mock 생성, api/hybrid 계약 오류 | 제출 잠금 | 해당 없음 | 입력/계약 오류 | profile, terms |
| `/(auth)/invite` | `InviteJoinScreen` | `code?: string|string[]` | auth session, users/trips | invite validation | guest session, user upsert, trip member 추가 | 모두 | mock code만 성공, api/hybrid 계약 오류 | 제출 잠금 | 해당 없음 | 잘못된 code/계약 오류 | profile, login |
| `/invite/[code]` | `InviteCodeRoute` | deep-link code 배열/undefined | 없음 | 첫 param 선택 | 없음 | 모두 | 모드 공통 redirect | 즉시 redirect | 빈 code도 invite validation으로 전달 | 없음 | auth invite `replace` |
| `/(auth)/terms` | `TermsScreen` | `type` service/privacy | 없음 | type 기본값 service | 없음 | 모두 | 임시 정적 문서 | 없음 | 해당 없음 | 없음 | back |
| `/(onboarding)/profile` | `ProfileSetupScreen` | 세션 user, nickname/avatar | auth, `usersById` | 세션-domain user | profile update, completed 설정, logout | member/guest | mock domain update, API 미연결 | 없음 | user 누락 시 오류 | 세션 사용자 누락 | intro 또는 home |
| `/(onboarding)/intro` | `OnboardingIntroScreen` | current user | auth, `usersById` | 사용자 이름 | intro seen 설정 | member/guest | 모드 공통 UI | 없음 | 해당 없음 | user fallback copy | test 또는 home |
| `/(tabs)/home` | `HomeScreen` | 오늘, 현재 사용자 여행 | domain/auth | 현재 trip, 준비율, 후보·일정·응답 수 | active trip, navigation | anonymous/member/guest; tabs guard | mock 표시, api/hybrid는 정책별 unavailable | root hydration에서 처리 | 여행 없음 CTA | hydration/data 오류 | explore, trips/new, trip home, test |
| `/(tabs)/explore` | `ExploreScreen` | keyword/region/category/sort | places, regions, candidates, saved, explore UI Store | 검색·필터·PlaceCard VM | save, candidate request, filter | 조회 모두; save member; candidate member/guest | mock만 데이터, api/hybrid 명시 unavailable | repository 확인 | 검색 결과 없음 | repository/hydration 오류 | place detail, map, workspace, trips/new |
| `/explore/map` | `ExploreMapScreen` | 공유 explore filters | explore UI Store, regions/places | 좌표 없는 지역 보드 | filter/navigation | 모두 | mock 지역 보드, api/hybrid unavailable | repository 확인 | 지역 결과 없음 | 데이터 계약 오류 | place detail, explore |
| `/places/[placeId]` | `PlaceDetailScreen` | `placeId?: string|string[]` | places, saved, trips, candidates | 상세/유사 장소/eligible trips | save, candidate 추가 | 조회 모두; save member; candidate member/guest | mock만 데이터, api/hybrid unavailable | repository 확인 | 유사 장소 없음 | 잘못된/누락 place | workspace, explore, trips/new |
| `/(tabs)/saved` | `SavedScreen` | 현재 사용자 | saved IDs, places, trips | 저장 PlaceCard VM | save 해제, candidate request | member 저장 목록; guest/anonymous gate/안내 | mock만 데이터, api/hybrid unavailable | root hydration | 저장 장소 없음 | 누락 place는 제외/안내 | place detail, workspace, trips/new |
| `/(tabs)/trips` | `TripListScreen` | filter, today | trips/order/users/regions | 현재 사용자 진행·완료 정렬, card VM | active trip | member/guest 자신의 방; anonymous gate | mock만 목록, api/hybrid unavailable | root hydration | 참여 여행 없음 | hydration/관계 오류 | trip home, trips/new, invite |
| `/trips/new` | `CreateTripWizardScreen` | 5단계 draft | create draft, users/regions/domain | 단계 validation, member 정규화 | draft update/reset, `createTrip` | member만 | mock 생성, api/hybrid 명시 차단 | draft 준비 | 해당 없음 | 단계/제출/계약 오류 | 생성 trip home `replace` |
| `/trips/[tripId]` | `TripHomeScreen` | `tripId`, `created` 배열/undefined | trip/domain/preferences | home VM, 준비율, 응답·그룹 진단 | active trip | 해당 방 member/guest | mock만 데이터 | root hydration | 응답 pending 가능 | 잘못된 trip/member/owner | workspace, explore, test/result |
| `/trips/[tripId]/workspace` | `WorkspaceScreen` | tripId, 적용 결과 params | trip/candidates/itinerary/places/auth | Workspace VM, scheduled, 충돌, 권한 | 후보 제거, 일정 add/update/move/reorder/delete | member/guest 방 멤버; completed 읽기 전용 | mock 편집, api/hybrid 명시 차단 | root hydration | 후보/날짜 일정 없음 | param/권한/날짜/계약 오류 | place, explore, analysis |
| `/trips/[tripId]/analysis` | `DuriAnalysisScreen` | `tripId?: string|string[]` | domain + 비영속 Duri session | input snapshot, coverage, fingerprint, issue | 분석/제안 생성 | 방 멤버; completed 분석 조회 가능 | local 실행, server 명시 unavailable | 분석/제안별 loading | 일정 없음 분석 차단 | input/engine 오류 | workspace, suggestion preview |
| `/trips/[tripId]/suggestions/[suggestionId]` | `DuriSuggestionPreviewScreen` | tripId/suggestionId 배열/undefined | domain + session/suggestion/receipt | current fingerprint, stale, before/after/diff | atomic apply, receipt 기록 | 방 멤버; completed 적용 차단 | local preview/apply, server에서는 생성 자체 unavailable | apply 잠금 | suggestion/session 없음 | stale/invalid/권한 오류 | analysis 또는 workspace `replace` |
| `/tests/personal` | `PersonalTestScreen` | edit/resume/restart params | auth + preference draft | owner 일치, 현재 문항 | start/select/next/back/reset | anonymous 체험, member/guest 저장 흐름 | mock 제출 가능; api/hybrid 제출 계약 차단 | draft 준비 | 문항 config 없음 | 세션/문항 오류 | review, home |
| `/tests/personal/review` | `PersonalReviewScreen` | 현재 owner draft | auth/domain/draft | 답변 validation | 결과 제출, domain 저장, 완료 flags, reset | active session owner | mock 로컬 계산, api/hybrid 명시 오류·draft 유지 | 제출 잠금 | 검토 draft 없음 | 세션/제출/저장 오류 | test 또는 result `replace` |
| `/tests/personal/result` | `PersonalResultScreen` | `retest` | auth, domain result, anonymous memory result | session별 result 선택 | restart draft | session 소유 결과만 | mock 결과; api/hybrid 새 제출 차단 | root hydration | 완료 결과 없음 | session-domain mismatch 복구 링크 | mypage/home/test |
| `/(tabs)/mypage` | `MyPageScreen` | 현재 session/user | auth/domain/results/saved | 여행·저장·trait 수 | logout, member gate | 모두; session별 UI | 모드 공통 로컬 세션 UI | root hydration | 결과 없음 CTA | user 누락은 fallback copy | test/result/intro/invite/login |
| 알 수 없는 URL | `NotFoundScreen` | unmatched route | 없음 | 없음 | 없음 | 모두 | 모드 공통 | 없음 | 해당 없음 | not-found 안내 | home |

## Layout과 hydration 경계

- `app/_layout.tsx`는 domain, auth, personal draft, trip draft 네 Store가 모두 hydrate될 때까지 Stack을 만들지 않는다. 따라서 hydration 중 auth↔tabs redirect가 실행되지 않는다.
- `app/(tabs)/_layout.tsx`는 session, session user, profile, intro를 재확인한다. anonymous는 공개 탭을 사용할 수 있지만 domain member를 만들지 않는다.
- route param은 동적 route 화면에서 `string | string[] | undefined`를 첫 값으로 정규화한다. 잘못된 ID는 Error/EmptyState로 끝나며 demo entity로 대체하지 않는다.
- Android hardware back을 별도로 가로채는 개인 성향 테스트는 draft 보존/검토 복귀 정책을 사용한다. 다른 화면과 modal은 Router 또는 React Native modal의 `onRequestClose`를 사용한다.

## 상태 소유권 요약

- 영속 domain source: `useDuriStore`.
- 영속 session source: `useAuthSessionStore`; token은 `SecureStore`.
- 영속 UI draft: personal preference draft, create trip draft.
- 비영속 UI/파생: explore filter, Duri session/suggestion/receipt, 화면 modal/feedback, 모든 ViewModel과 count/rate/stale 값.

