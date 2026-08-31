# Frontend Functional Audit

## 1. Executive Summary

현재 frontend는 canonical data contracts와 feature verification이 강하다. Trip/Place/Create/Preference runtime flow는 대부분 연결되고 local verification과 all-platform export가 통과했다. 그러나 protected-route reload hang과 non-owner invite management exposure라는 P0 두 건 때문에 backend integration readiness는 **NO**다. 이 두 contract를 고친 뒤에는 **PARTIAL→YES**로 빠르게 전환 가능한 상태다.

Audit boundary:

- current mock/demo runtime, 390×844 primary; 360/430 responsive representative.
- route/source inventory 31 navigable endpoints.
- persistent final trip creation과 preference result overwrite는 수행하지 않았다.
- API credential이 필요한 live contract test는 환경 변수 부재로 실행하지 않았다.

## 2. Route Inventory

전체 route/guard/main component 표는 `ROUTE_FLOW_MATRIX.md`의 Route Inventory에 있다.

- Public/Auth: 10 routes (`/`, not-found, login/signup/terms/invite/guest gates, invite redirect).
- Onboarding: 3.
- Main tabs: 5.
- Friends/Place: 2.
- Preference/Compatibility: 5.
- Trip/Create/Workspace/DURI: 6.
- 총 navigable endpoints: **31**.
- `npm run build`의 Expo static export는 route group alias와 sitemap을 포함해 47개 route를 출력했다.

Root guard는 unauthenticated public route만 허용하고 authenticated member/guest에 tabs/onboarding/tests/trip/place를 허용한다. `/trips/new`는 member-only Stack.Protected다. Tab layout은 profile/onboarding completion을 추가 guard한다.

## 3. Main Navigation

Runtime 5-tab:

- Home → `전체 보기`, trip card, DURI CTA, 추천 장소가 각각 Trip List/Trip Home/Workspace or analysis/Place Detail로 연결됐다.
- Explore → region selection, filter, place detail, save/candidate action이 연결됐다.
- Trips → create, lifecycle tabs, trip card가 연결됐다.
- Saved → true empty CTA 또는 saved card/detail/candidate action이 연결됐다.
- My Page → trip/saved activity, preference result/test, friends/invite/auth services가 연결됐다.

Detail/creation/test routes에서는 bottom tabs를 숨긴다. back stack과 header back이 정상 작동했다. Direct protected reload는 P0-1에서 별도 기록한다.

## 4. Trip Flow

실행 경로:

`Home → Trip List → Trip Home → Workspace → Schedule Edit → DURI Analysis → Suggestion Preview → Back`

결과:

- Trip card와 `일정 계속 만들기` 목적지가 정확했다.
- Workspace back은 Trip Home, DURI back은 Workspace, Suggestion back은 Analysis로 돌아갔다.
- Trip status/lifecycle는 stored domain status를 source로 사용한다.
- Completed trip read-only policy는 capability resolver와 100-case workspace verification으로 확인했다.
- P0: completed 여부만으로 invite quick action을 숨기며 owner 여부를 보지 않는다.

## 5. Place Flow

실행 경로:

`Explore(부산) → Place Detail → Back → Saved → Workspace candidate`

결과:

- Explore→Detail→Back context가 유지됐다.
- Save와 candidate는 독립 relation이다.
- candidate/scheduled badge가 Explore/Detail/Saved/Workspace에서 같은 selector 결과를 사용한다.
- scheduled place는 제거 불가를 의미하지 않으며 다른 시간 duplicate add가 가능하다.
- fresh member Saved true empty는 안내 + CTA를 제공했다.
- Place image/rating/opening hours의 실제 API null shape는 **BACKEND-REVERIFY**.

## 6. Create Trip

실행 경로:

`Trip List → Create → Destination → Date → Travel Info → Companions → Review → Exit → Re-entry`

결과:

- 단계 이동 시 scroll top, selected values, disabled next state가 정상이다.
- Date 2026-09-01~02, transport `대중교통·도보`, no end condition, 윤지 companion으로 review까지 갔다.
- exit에서 `저장하고 나가기`, re-entry에서 `5단계부터 이어서`가 확인됐다.
- audit-created draft는 별도 세션에서 새로 시작해 기존 내용과 구분했다. final create는 수행하지 않았다.
- eligible companion은 friend relation 기반이며 owner/unrelated user 제외가 verification에 포함된다.
- 0 friend/fresh user도 생성 흐름을 진행할 수 있다.
- P1: calendar day 38px/month control 40px.
- **BACKEND-REVERIFY** duplicate submit/atomic room create, server owner/member mapping.

## 7. Workspace

- Schedule grid, DAY switching, candidate peek/half, schedule edit, add/duplicate path를 runtime으로 확인했다.
- same place scheduled multiple contract는 selector/service verification으로 통과했다.
- read-only capability contract:

| Action | Completed/read-only |
|---|---|
| View / scroll / DAY switching | Allowed |
| Add / duplicate add | Blocked |
| Drag / resize | Blocked |
| Edit save / delete | Blocked |

- drag/resize는 slider semantics와 edit modal alternative가 있다.
- `workspace-editor` 100 scenarios, `workspace-schedule-api` 66 scenarios 통과.
- P0 권한 문제는 Workspace가 아니라 Invite manager에 집중된다.

## 8. DURI Analysis / Suggestion

- Workspace DURI CTA state resolver는 일정 0 → `일정 먼저 만들기`, no analysis → `DURI 분석하기`, valid → `분석 결과 보기`, stale → `다시 분석하기`를 반환한다.
- analysis는 3 scheduled, 2 good, 8 coordination, 3 reference 상태를 표시했다.
- suggestion preview는 apply 전후 1 change를 동일 engine 결과로 보여줬다.
- cancel/back에서 일정 mutation이 없었다.
- verification은 stale apply/read-only apply/fingerprint mismatch를 block한다.
- P1: 제안이 빈 날짜에 `00:00~01:00`을 자동 선택하고 `광안리을` 문구를 생성한다. 기능 엔진은 안전해도 product-quality guard가 부족하다.
- **BACKEND-REVERIFY** server DURI capability, fingerprint, atomic apply, read-only rejection.

## 9. Preference

실행 경로:

`My Page → Personal Result → Retest confirm → Question → Exit`, fresh user `My Page → Preference Intro`.

- 기존 결과는 retest를 시작해도 유지된다는 confirmation copy가 정확했다.
- question progress는 chapter + inner question (`챕터 1/5`, `질문 1/15`)을 함께 표시한다.
- question transition은 atomic current index와 scroll top contract를 사용한다.
- My Page와 Result의 profile label/tag가 동일 presentation resolver를 사용한다.
- detailed result는 canonical result와 user/completedAt exact pair로 결합된다.
- persistent completion은 기존 결과를 덮어쓰지 않기 위해 실행하지 않았다.
- Quick Test route는 별도 onboarding 6-question flow로 존재하며 regression verification에 포함된다.
- **BACKEND-REVERIFY** canonical/detailed pair persistence와 Guest migration.

## 10. Saved

- fresh member true empty와 existing saved list 두 상태를 runtime/source로 확인했다.
- heart relation은 personal saved state이고 candidate/scheduled relation과 분리돼 있다.
- search/filter empty는 character보다 기능 안내를 우선한다.
- optional image failure는 RemoteImage/placeholder 경로가 있으나 live API URL 오류는 **BACKEND-REVERIFY**.

## 11. My Page

- activity cards는 Trip List/Saved로 연결된다.
- preference summary는 canonical presentation과 일치한다.
- member service menu와 account/destructive section이 분리되어 있다.
- Guest upgrade UI의 source guard를 확인했으나 최종 Auth visual audit은 요청대로 deferred다.
- guest account migration과 private local data handoff는 **BACKEND-REVERIFY**.

## 12. Permission / Role

| Capability | Member owner | Member participant | Guest participant | Completed/read-only | Result |
|---|---:|---:|---:|---:|---|
| Create Trip | Yes | Yes | No (root guard) | N/A | consistent |
| Open Trip/Workspace | Yes | Yes | Yes | Yes | consistent |
| Schedule mutate | Yes | Yes by current policy | Yes by current policy | No | policy consistent, backend reverify |
| Suggestion apply | Yes | Yes by current policy | gated by guest policy/service | No | tests pass, backend reverify |
| Invite share/manage | Yes | **Yes exposed** | **Yes exposed** | hidden only when completed | **P0** |
| My Page Guest upgrade | N/A | N/A | Yes | N/A | source/runtime gate exists |

P0 finding: `TripQuickActions` receives only `completed`, not `isOwner/canManageInvite`. Both mock and API Trip Detail open the same modal. Modal props contain only `visible/trip/onClose`. Mock rotate/disable and API fetch/regenerate have no frontend role check. Server authorization is mandatory but does not replace correct frontend capability exposure.

## 13. Draft / Resume

| Flow | Reload | Exit | Re-entry | Cancel semantics |
|---|---|---|---|---|
| Create Trip | persisted draft expected | save or delete choice | resume from last valid step | explicit |
| Preference | answers auto-save | existing result retained | resume draft/current question | retest can reset draft only |
| Suggestion | generated snapshot/fingerprint | no schedule mutation | list/preview remains | cancel/back no mutation |

Create and Preference differ intentionally: Create exposes save/delete exit, Preference auto-saves answers and protects completed result. This is not an inconsistency. Global full reload hang prevents validating successful reload resume end-to-end and is P0-1.

## 14. Empty / Loading / Error

- True empty: fresh Home/Saved/Trip state has explanation + CTA.
- Filter/search empty: Explore/Saved source uses functional guidance and minimal character.
- Loading: root, query screens, invite/document sections block duplicate actions with loading/disabled states.
- Error: common ErrorState provides retry; Workspace/Place have scoped hydration error surfaces.
- P0: root hydration never transitioned from loading after protected Guest reload, so error/retry was unreachable.
- Forced API/network error was not manufactured; live error copy is **BACKEND-REVERIFY**.
- User-facing runtime copy did not expose `undefined`, repository/store names, or raw exception.

## 15. Canonical Relations

### Place relation

`selectPlaceTripRelation` determines scheduled count first, then candidate. Explore/Detail/Saved actions and Workspace selector reuse this relation. Candidate, scheduled once, scheduled multiple are coherent.

### Preference

`resolvePreferencePresentation` is shared by My Page/Result presentation. Trip Home summary uses normalized same-user result.

### Result pair

`resolvePreferenceResultPair` requires exact user and completion timestamp coherence, preventing stale details from attaching to a newer canonical result.

### DURI freshness

Analysis snapshot fingerprint and Workspace DURI CTA use consistent stale/fresh state.

## 16. Data Integrity

- `validate:state`: PASS, 0 errors/warnings.
- `verify:state-integrity`: PASS.
- place candidates only reference trip members; persisted state normalization deduplicates ids and validates entity references.
- workspace mutation services validate dates, conflicts, read-only, stale fingerprint.
- no sensitive `console.log/warn/error` calls exist in `src`/`app`.
- Auth credentials use service storage policy; persisted UI session store does not persist access token. API credential behavior remains backend/security reverify scope.
- Reference sample values occur in named mock/config/geographic lookup/placeholder contexts. No runtime full reference screenshot/crop was found.
- P1 asset boundary: two runtime imports from `design/image/**`.

## 17. Runtime Warnings

No browser console error, unhandled promise, duplicate key, navigation warning, or source `console.*` output was observed. Metro/web emitted:

1. `shadow* style props are deprecated. Use boxShadow.`
2. `Animated: useNativeDriver is not supported ... Falling back to JS-based animation.`

Both are P2 SDK57/web compatibility cleanup, not current flow blockers.

## 18. Build / Verification

| Check | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS | TypeScript no emit |
| `npm run lint` | PASS | Expo lint |
| `npm run build` | PASS | Expo export Android/iOS/Web, 47 static routes |
| auth/session | PASS | mobile auth verification |
| state validate/integrity | PASS | 0 error/warning |
| trip-flow | PASS | lifecycle/navigation selectors |
| place-flow | PASS | save/candidate/scheduled relation |
| workspace-editor | PASS | 100 scenarios |
| workspace-schedule-api | PASS | 66 scenarios |
| group-preferences | PASS | 20 scenarios |
| preference-compatibility | PASS | 48 scenarios |
| DURI analysis/suggestion | PASS | analysis, generation, apply guards |
| trip-documents | PASS | 53 scenarios |
| trip-todos | PASS | 64 scenarios |
| busan fixture | PASS | mock/API fixture validation |
| challenge model/random forest/clusterers | PASS | available model scripts |
| api-trip-contract | NOT RUN | `DURI_API_VERIFY_EMAIL/PASSWORD` missing; **BACKEND-REVERIFY** |

Functional Verification overall: **PARTIAL** because all runnable local scripts passed, but live API contract credentials were unavailable and runtime P0s remain.

## 19. Known Backend-bound Risks

- **BACKEND-REVERIFY** owner-only invite view/rotate/disable and invalidated link behavior.
- **BACKEND-REVERIFY** Member/Guest protected deep-link bootstrap and credential refresh.
- **BACKEND-REVERIFY** room creation atomicity and eligible-member mapping.
- **BACKEND-REVERIFY** Workspace mutation authorization/read-only/duplicate scheduling.
- **BACKEND-REVERIFY** DURI fingerprint, capability, time-window policy, atomic apply.
- **BACKEND-REVERIFY** Place optional fields, remote image failure, pagination/filter mapping.
- **BACKEND-REVERIFY** Preference result pair and Guest→Member local/private migration.
- **BACKEND-REVERIFY** documents/TODO server ownership, upload URLs and personal data errors.

## 20. Priority

### P0

1. Protected reload bootstrap hang. Add deterministic settle/error/timeout and member/guest reload E2E.
2. Non-owner/Guest invite management exposure. Add canonical capability guard in UI/service and server authorization.

### P1

1. DURI 00:00 auto-scheduling and Korean particle handling.
2. Pointer focus-visible and 44px target contract.
3. Modal accessibility semantics and safe-area contract.
4. Runtime `design/image` dependency.
5. Token/header/sticky-footer consolidation at role-contract level.

### P2

- SDK57 web shadow/animation warnings, icon registry, typography/radius cleanup, Auth visual audit after backend.
