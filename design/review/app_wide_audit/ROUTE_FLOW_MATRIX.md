# Route and Flow Matrix

## Route Inventory

Guard legend: Public, Authenticated = Member or Guest, Member = signed-in non-guest. `Tab prerequisite` additionally requires completed profile and intro seen.

| # | Route | Screen / Main Component | Guard | Required data | Main entry |
|---:|---|---|---|---|---|
| 1 | `/` | root entry redirect | Public | hydrated session | app launch |
| 2 | `/+not-found` | `NotFoundScreen` | Public | none | unmatched route |
| 3 | `/login` | Login (`AuthScreens`) | Public | auth environment | root guard/logout |
| 4 | `/signup-choice` | signup method | Public | none | Login 회원가입 |
| 5 | `/signup-email` | email signup | Public | terms/auth service | signup choice |
| 6 | `/terms` | terms/privacy | Public | static policy | auth/service links |
| 7 | `/invite` | invite code entry | Public | invite service | Login/My Page |
| 8 | `/guest-upgrade` | `GuestUpgradeScreen` | Public route, Guest context | guest session | member-only gate |
| 9 | `/guest-room-limit` | `GuestRoomLimitScreen` | Public route, Guest context | guest rooms | guest room gate |
| 10 | `/invite/[code]` | invite redirect | Public | code/trip/revision params | deep link |
| 11 | `/intro` | onboarding intro | Authenticated | user/profile state | post-signup/tab guard |
| 12 | `/profile` | onboarding profile | Authenticated | current user | tab guard |
| 13 | `/quick-test` | onboarding quick preference | Authenticated | current user | onboarding intro |
| 14 | `/home` | `HomeScreen` | Authenticated + Tab prerequisite | trips/places/preference | default tab |
| 15 | `/explore` | `ExploreScreen` | Authenticated + Tab prerequisite | regions/places/relations | Explore tab |
| 16 | `/trips` | `TripListScreen` | Authenticated + Tab prerequisite | trips/lifecycle | Trips tab/Home 전체 보기 |
| 17 | `/saved` | `SavedScreen` | Authenticated + Tab prerequisite | saved places/relations | Saved tab |
| 18 | `/mypage` | `MyPageScreen` | Authenticated + Tab prerequisite | user/preference/activity | My tab/profile |
| 19 | `/friends` | friends management | Authenticated | friend relation | My Page |
| 20 | `/places/[placeId]` | `PlaceDetailScreen` | Authenticated | place + canonical relation | Explore/Home/Saved |
| 21 | `/tests/personal` | `PersonalTestScreen` | Authenticated | draft/current result | My Page/result retest |
| 22 | `/tests/personal/review` | `PersonalReviewScreen` | Authenticated | completed draft | test completion |
| 23 | `/tests/personal/result` | `PersonalResultScreen` | Authenticated | canonical result pair | My Page/review |
| 24 | `/tests/compatibility` | compatibility test | Authenticated | eligible friends/results | My Page/Trip Home |
| 25 | `/tests/compatibility/result` | compatibility result | Authenticated | compatibility result | compatibility completion |
| 26 | `/trips/new` | `CreateTripWizardScreen` | **Member** | regions/friends/draft | Trip List/Home |
| 27 | `/trips/[tripId]` | `TripHomeScreen` | Authenticated | trip/members/preferences | trip card/create |
| 28 | `/trips/[tripId]/explore` | trip-scoped Explore | Authenticated | trip + region | Trip Home/Workspace |
| 29 | `/trips/[tripId]/workspace` | `WorkspaceScreen`/API variant | Authenticated | trip/days/candidates/schedule | Trip Home |
| 30 | `/trips/[tripId]/analysis` | `DuriAnalysisScreen` | Authenticated | trip + analysis inputs | Workspace/Trip Home |
| 31 | `/trips/[tripId]/suggestions/[suggestionId]` | `DuriSuggestionPreviewScreen` | Authenticated | snapshot/suggestion/fingerprint | Analysis |

Root layout protects trip/place/test routes for authenticated sessions and `trips/new` for member sessions. Trip ownership and mutation capabilities are feature-level policy, not route-level guards.

## Core CTA Flow Matrix

| Origin | Action | Destination | Guard | Back / fallback | Status |
|---|---|---|---|---|---|
| `/` | hydrated anonymous | `/login` | Public | n/a | PASS |
| `/` | hydrated member/guest | onboarding or `/home` | session/profile | root | PASS |
| any protected route | unauthenticated deep link | `/login?returnTo=…` | root guard | returnTo after login | PASS source/runtime |
| protected Trip | full reload as Guest | same route expected | Authenticated | loading→route/error | **P0: indefinite loading** |
| `/login` | email login | returnTo or `/home` | valid auth | logout returns login | PASS |
| `/login` | 초대 코드로 참여 | `/invite` | Public | Login | PASS |
| `/invite/[code]` | parse deep link | `/invite` with params | Public | Login/fallback | PASS source |
| `/home` | profile avatar | `/mypage` | Tab prerequisite | Home tab | PASS |
| `/home` | 내 여행 전체 보기 | `/trips` | Tab prerequisite | Home tab | PASS |
| `/home` | trip card/바로가기 | `/trips/[tripId]` | Authenticated | Trip List/Home fallback | PASS |
| `/home` | 새 여행 만들기 | `/trips/new` | Member; Guest upgrade | prior tab | PASS |
| `/home` | 추천 place card | `/places/[placeId]` | Authenticated | Home | PASS |
| `/home` | 맞춤 일정/DURI CTA | active Trip Workspace/Analysis | trip state | Home/Trip | PASS |
| `/explore` | 지역 선택/검색 | same route filtered | Authenticated | state retained | PASS |
| `/explore` | place detail | `/places/[placeId]` | Authenticated | Explore state | PASS |
| `/explore` | 저장 heart | same route mutation | authenticated user | unchanged route | PASS |
| `/explore` | 후보에 담기 | current/select trip modal | trip capability | modal close | PASS |
| `/places/[placeId]` | back | origin or Explore fallback | Authenticated | origin | PASS |
| `/places/[placeId]` | save | same route | authenticated user | no nav | PASS |
| `/places/[placeId]` | 후보에 담기 | current/select trip modal | trip capability | modal close | PASS |
| `/saved` | true-empty 장소 둘러보기 | `/explore` | Authenticated | Saved tab | PASS |
| `/saved` | place detail | `/places/[placeId]` | Authenticated | Saved | PASS |
| `/saved` | candidate | current/select trip modal | trip capability | modal close | PASS |
| `/trips` | lifecycle tab | same route filtered | Authenticated | state retained | PASS |
| `/trips` | trip card | `/trips/[tripId]` | member/guest participant | Trip List | PASS |
| `/trips` | 새 여행 | `/trips/new` | Member | Trip List | PASS |
| `/trips/[tripId]` | 일정 계속 만들기 | `/workspace` | participant/capability | Trip Home | PASS |
| `/trips/[tripId]` | 장소 더 찾기 | trip-scoped `/explore` | participant | Trip Home | PASS |
| `/trips/[tripId]` | 동행자 초대 | Invite manager modal | should be owner | close | **P0: non-owner exposed** |
| `/trips/[tripId]` | 문서 추가 | document modal | mutation capability | close | PASS/source |
| `/trips/[tripId]` | 분석 결과 보기 | `/analysis` | analysis exists | Trip Home/Workspace | PASS |
| `/workspace` | DAY tab | same route | view | same route | PASS |
| `/workspace` | candidate sheet | same route overlay | view | minimize/close | PASS |
| `/workspace` | scheduled item | Schedule Edit modal | mutation/read-only | close | PASS |
| `/workspace` | duplicate add | Schedule Add modal | mutation capability | close | PASS verification |
| `/workspace` | DURI CTA | `/analysis` or blocked copy | freshness/capability | Workspace | PASS |
| `/analysis` | DURI 점검/재점검 | same route result | mutable or view | existing result | PASS |
| `/analysis` | 제안 만들기 | same route list | analysis/fingerprint | collapse | PASS |
| `/analysis` | preview | `/suggestions/[id]` | suggestion exists | Analysis | PASS |
| `/suggestions/[id]` | 적용하지 않기/back | `/analysis` | none | no mutation | PASS |
| `/suggestions/[id]` | 일정에 적용 | confirm then Workspace/Analysis | fresh + mutable | atomic | PASS verification; BACKEND-REVERIFY |
| `/trips/new` | next/previous | same wizard route | Member + step validity | prior step | PASS |
| `/trips/new` | close | save/delete confirm | Member | Trip List/origin | PASS |
| `/trips/new` | re-entry | resume modal | Member + draft | last valid step | PASS |
| `/mypage` | 성향 자세히 보기 | `/tests/personal/result` | result exists | My Page | PASS |
| `/mypage` | 여행 성향 알아보기 | `/tests/personal` intro | no result | My Page/Home | PASS |
| `/tests/personal/result` | 테스트 다시 하기 | confirmation→`/tests/personal?restart=1` | Authenticated | result remains | PASS |
| `/tests/personal` | next question | same route | answer required | previous question | PASS |
| `/tests/personal` | 나가기 | origin/Home | Authenticated | draft auto-save | PASS |
| `/mypage` | 친구와 궁합 보기 | `/tests/compatibility` | eligible friend/result | My Page | PASS source |
| `/mypage` | 로그아웃 | `/login` | Authenticated | login | PASS |

## Back and Direct-entry Notes

- Place Detail, Workspace, Analysis, Suggestion, Create, Preference back worked in an in-app stack.
- Source uses explicit replace/back fallbacks for Trip/Workspace flows where needed.
- Full document reload/deep entry currently cannot be considered safe because P0-1 blocks before route fallback executes.
- No CTA with a missing destination was found in the audited primary flows.
- Empty pickers provide create/browse/close alternatives; no forced dead-end was observed.
