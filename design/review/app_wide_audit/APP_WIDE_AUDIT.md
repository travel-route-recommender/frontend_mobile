# DURI App-wide Audit

감사일: 2026-08-31 (KST)<br>
대상: `frontend_mobile` 현재 작업 트리의 실행 결과와 source<br>
방식: READ-ONLY. Production source 수정 없음. 390×844 실제 실행을 주 기준으로 하고 360/430 대표 화면, route/source, verification/build를 함께 확인했다.

## Current Readiness

| 판단 | 결과 | 근거 |
|---|---|---|
| DESIGN READY | **PARTIAL** | 화면 언어는 상당히 응집됐지만 token·header/modal·focus/touch target·runtime asset 경계가 아직 정리 전이다. |
| FRONTEND FUNCTIONALLY READY FOR BACKEND INTEGRATION | **NO** | canonical relation/preference/workspace 계약과 로컬 검증은 강하지만, 보호 Route 새로고침 정지와 non-owner 초대 링크 관리 노출이라는 P0가 있다. API 계약 검증도 credential 부재로 미실행이다. |
| READY FOR FINAL POLISH | **NO** | polish에 앞서 P0 권한/부트스트랩을 해결하고 회귀 검증을 추가해야 한다. |

## What Is Consistent

- 주요 화면은 white surface, deep navy 정보 계층, primary blue 행동, lavender DURI/candidate, mint scheduled/positive, peach drafting/attention이라는 공통 언어를 대체로 유지한다.
- 5-tab 구조와 detail 화면의 tab 비노출 정책, 20px 전후 page gutter, 카드형 정보 계층, sticky primary action은 시각적으로 한 제품군으로 보인다.
- Explore, Place Detail, Saved, Workspace가 `selectPlaceTripRelation` 계열의 canonical candidate/scheduled 해석을 공유한다. scheduled 1회 이상과 duplicate scheduling 가능성도 분리되어 있다.
- Personal Result와 My Page는 동일 preference presentation을 사용하고, canonical/detailed result pair는 user/completedAt pair로 결합된다.
- Workspace DURI 진입 상태는 일정 0/분석 없음/valid/stale 네 상태를 한 resolver로 구분한다.
- Suggestion preview/apply는 fingerprint와 read-only 보호를 포함한 동일 계약을 사용한다. 취소/뒤로가기에서는 runtime mutation이 없었다.
- Create Trip은 eligible friend relation, 0-friend 허용, 단계 전환 scroll-top, draft save/resume가 검증 스크립트와 runtime에서 일치했다.
- Typecheck, lint, all-platform Expo export, API credential 의존 검증을 제외한 실행 가능한 로컬 verification이 통과했다.

## What Is Still Fragmented

- `src/theme/tokens.ts`와 실제 다수 redesign 화면이 서로 다른 text/border 계열을 사용한다. 예를 들어 foundation의 `#17265F`, `#60719B`, `#DCE7F7`가 널리 쓰이지만 global token은 `#243C8F`, `#6479A8`, `#DCE8FA`다.
- 직접 지정된 radius는 5~22 사이 14개 값, fontSize는 9~54 사이 30개 값에 걸쳐 있다. 개별 차이를 문제로 세기보다 role token이 실제 구현의 source of truth가 아닌 것이 공통 원인이다.
- global `AppHeader`, feature-local header, wizard header, detail overlay header가 함께 존재한다. 의미 차이는 유지할 수 있으나 back target, safe-area, title role, right action의 공통 contract가 필요하다.
- 17개 파일의 modal 구현 중 `accessibilityViewIsModal` 적용이 고르지 않다. Invite modal은 runtime accessibility tree에서 dialog로 노출되지 않았다.
- `SavedPlaceCard`와 `DuriPlanningIllustration`이 runtime asset을 `design/image/**`에서 직접 import한다. 전체 reference screenshot 재사용은 아니지만 production asset registry 경계가 design 작업 폴더에 결합돼 있다.

## Frontend Functional Health

Runtime에서 Trip, Place, Create, Preference 네 사용자 여정을 실제로 따라갔다. 주요 CTA와 back stack은 정상 연결됐고, Create draft는 exit 후 5단계 resume가 됐다. Suggestion preview 취소 시 일정은 바뀌지 않았다. 360/390/430 대표 화면에서 document-level horizontal overflow는 관찰되지 않았다.

다만 보호 Route를 Guest session에서 full reload했을 때 `안전한 로그인 상태와 여행 정보를 확인하고 있어요`에서 13초 이상 계속 정지했다. Metro는 bundle을 완료했고 exception은 없었다. 또한 Guest participant가 Trip Home의 `동행자 초대`를 열어 링크 공유뿐 아니라 `새 링크 발급`, `링크 사용 중지`까지 볼 수 있었다. source에서도 TripQuickActions/Invite modal에 owner capability가 전달되지 않고 API fetch/regenerate가 동일 경로로 열린다.

## Design System Maturity

현재 상태는 “화면별 redesign이 같은 언어로 수렴한 단계”다. foundation semantic과 20px gutter, 카드/버튼/탭의 macro hierarchy는 안정적이다. 다음 성숙 단계는 새로운 시각 스타일을 만드는 일이 아니라, 실제 사용 중인 값을 token으로 승격하고 header/modal/sticky-footer/focus contract를 좁게 정리하는 것이다. Place Card와 Trip Card처럼 도메인이 다른 컴포넌트를 억지로 통합할 필요는 없다.

## Top P0

### P0-1. 보호 Route full reload가 전역 session bootstrap에서 무기한 정지

- Evidence: `screenshots/state_reload_stuck.png`; `/trips/trip-busan-2026` Guest session에서 reload 후 13초 이상 동일 progress 화면. `app/_layout.tsx:53-64`, `useAuthSessionBootstrap.ts:18-60`.
- Impact: reload/deep-link 후 앱 전체가 사용 불가하며 error/retry로 전환되지 않는다.
- Recommended Fix Direction: hydration별 settle telemetry와 timeout/error surface를 추가하고 rehydrate/계정 전환을 idempotent하게 만든다. Member/Guest 각각 protected deep-link reload E2E를 추가한다.

### P0-2. Guest/non-owner가 초대 링크 파기성 관리에 접근

- Evidence: `screenshots/state_guest_invite_permissions.png`; runtime Guest에게 `새 링크 발급`, `링크 사용 중지` 노출. `TripHomeSections.tsx:106-111`, `TripDetailScreen.tsx:167,212`, `ApiTripDetailContent.tsx:78,109`, `TripInviteManagerModal.tsx:34-35,67-70,155,191`.
- Impact: mock에서는 실제 local invite state를 교체/중지할 수 있고, API mode에서도 non-owner가 regenerate call path에 진입한다. destructive/authorization risk다.
- Recommended Fix Direction: owner-only invite-manage capability를 canonical resolver로 만들고 quick action과 modal 모두 guard한다. 공유-only와 manage 권한을 분리하고 서버도 owner authorization을 강제한다. **BACKEND-REVERIFY**.

## Top P1

1. DURI proposal이 `2026-07-19 00:00~01:00` 자동 배치와 `광안리을` 문구를 생성한다. preview/apply 안정성은 있지만 제안 품질 guard와 한국어 조사 처리가 release 전 필요하다.
2. Web pointer click 뒤 검은 default outline이 tab/sticky CTA에 남는다. keyboard focus는 제거하지 말고 `:focus-visible` blue contract와 pointer focus suppression을 분리해야 한다.
3. Calendar day 38px, month button 40px, common back visual box 38px 등 44px 미만 target이 있다. hitSlop 포함 여부를 명시하고 mobile target contract를 통일해야 한다.
4. header/modal/sticky-footer와 typography/radius/color가 feature-local 구현으로 분산돼 role token이 우회된다.
5. production runtime이 `design/image/**`를 직접 import한다. 승인된 공식 asset을 `assets/images/duri/**` registry로 이동·참조해야 한다.

## P2 Polish

- Expo web console의 deprecated `shadow*` warning과 `Animated useNativeDriver` fallback warning을 정리한다.
- filter/search empty, true empty, error, loading copy의 구조는 유지하되 공통 state presentation contract를 문서화한다.
- Auth/Login/Signup/Invite 최종 시각 평가는 요청 범위대로 backend 연결 뒤 별도 진행한다.
- domain card는 분리 유지하되 Card shell, section header, destructive confirm의 primitive contract만 공유 후보로 본다.

## Backend Integration Risks

- **BACKEND-REVERIFY** Invite owner authorization, link rotation/invalidation, Guest migration.
- **BACKEND-REVERIFY** API trip contract script는 `DURI_API_VERIFY_EMAIL`, `DURI_API_VERIFY_PASSWORD` 부재로 실행하지 못했다.
- **BACKEND-REVERIFY** Place optional image/rating/opening-hours와 trip cover/avatar의 null/partial payload.
- **BACKEND-REVERIFY** Create Trip atomicity, duplicate submission blocking, server-generated room ownership.
- **BACKEND-REVERIFY** Preference canonical/detailed result의 동일 completion pair와 Guest→Member migration.
- **BACKEND-REVERIFY** DURI capability, fingerprint/stale rejection, read-only enforcement은 서버에서도 동일해야 한다.

## Recommended Next Phase

1. P0 두 건을 먼저 고치고 Member/Guest reload 및 owner/non-owner invite 회귀 테스트를 추가한다.
2. DURI 시간·조사 guard, focus-visible, 44px target, modal semantics를 P1 공통 polish로 처리한다.
3. 실제 사용값 기반 token/header/modal/sticky-footer contract를 좁게 통합하고 `design/image` runtime dependency를 제거한다.
4. 그 다음 backend integration을 진행하며 이 문서의 `BACKEND-REVERIFY` 항목을 계약 테스트로 승격한다.
5. backend 안정화 뒤 Auth/Onboarding/Invite target audit를 별도로 수행한다.

## Audit Artifacts

- `UI_CONSISTENCY_AUDIT.md`
- `FRONTEND_FUNCTIONAL_AUDIT.md`
- `ROUTE_FLOW_MATRIX.md`
- `COMPONENT_SYSTEM_AUDIT.md`
- `DESIGN_TOKEN_AUDIT.md`
- `RESPONSIVE_ACCESSIBILITY_AUDIT.md`
- `REGRESSION_RISK_REGISTER.md`
- `SCREENSHOT_MANIFEST.md`
- `app_main_contact_sheet.png`, `trip_flow_contact_sheet.png`, `place_flow_contact_sheet.png`, `input_flow_contact_sheet.png`, `state_contact_sheet.png`
