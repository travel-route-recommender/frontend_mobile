# DURI Trip Home Final Redesign

Date: 2026-08-26<br>
Scope: Trip Home only<br>
Representative route: `/trips/trip-busan-2026`<br>
Primary viewport: `390 × 844`

## Before

- Trip identity used a large destination image and repeated lifecycle status.
- Workspace, Explore, and Invite were three equally weighted actions before the preparation state.
- Preparation showed `1/5단계 완료` and `50%` at the same time because active steps contributed half credit.
- Personal responses and all group dimensions were eagerly expanded.
- Documents, TODO, Candidates, Itinerary, and DURI were separate full-size cards.
- The rendered ScrollView was `4,628px` high, approximately 5.48 viewports, and DURI was physically last.
- Baseline: `design/review/trip_home_redesign/before_trip_home.png`.

## Modified Files

Production:

- `src/features/trips/components/home/TripHomeSections.tsx`
- `src/features/trips/components/preferences/PreferenceResponseSummaryCard.tsx`
- `src/features/trips/components/preferences/GroupPreferenceDiagnosisCard.tsx`
- `src/features/trips/screens/TripDetailScreen.tsx`
- `src/features/trips/screens/ApiTripDetailContent.tsx`
- `src/features/trip-documents/components/TripDocumentSection.tsx`
- `src/features/trip-documents/index.ts`
- `src/features/trip-todos/components/TripTodoSection.tsx`
- `assets/images/duri/trip-home/continue-schedule.png`
- `assets/images/duri/trip-home/duri-analysis.png`

Review artifacts:

- `design/review/trip_home_redesign/before_trip_home.png`
- `design/review/trip_home_redesign/iteration_1.png`
- `design/review/trip_home_redesign/iteration_1_mid.png`
- `design/review/trip_home_redesign/iteration_1_bottom.png`
- `design/review/trip_home_redesign/iteration_2.png`
- `design/review/trip_home_redesign/trip_home_final_360.png`
- `design/review/trip_home_redesign/trip_home_final_390x844.png`
- `design/review/trip_home_redesign/trip_home_final_430.png`
- `design/review/trip_home_redesign/TRIP_HOME_FINAL_REPORT.md`
- `design/review/trip_home_redesign/TRIP_HOME_DESIGN_EXTENSION.md`

The pre-existing user changes in `DuriLogo.tsx`, `HomeScreen.tsx`, and existing `design/` materials were not reverted or rewritten.

## IA Changes

The final order is:

```text
Trip Identity
→ 지금 할 일
→ 빠른 메뉴
→ 여행 성향
→ 여행 계획
→ DURI 추천
→ 여행 기록
```

- Trip Identity is a compact factual card: title, region/date, duration/member count, stored lifecycle, role, timing, and member avatars.
- `지금 할 일` owns the only dominant planning CTA and an honest completed/in-progress/pending breakdown. The progress bar represents completed steps only.
- Quick Menu contains secondary actions only: place search, invite, and document add. It does not repeat the planning destination.
- Preference response and group diagnosis are short summaries. Member detail, retest, and every group dimension remain available through disclosure controls.
- Candidate and itinerary data form one causal Planning section with actual counts and derived unplaced-candidate count. Candidate and itinerary previews remain expandable.
- DURI follows Planning and reads the real local analysis session/status/fingerprint where that contract exists.
- Documents and TODO are compact supporting rows. Each expands independently and retains its existing management UI and modal set.

The representative final ScrollView is `2,163px`, approximately 2.56 viewports at 390 × 844. This is a 53% reduction from the 4,628px baseline without removing management functions.

## Preserved Features

- Stored trip lifecycle, role, membership, date, region, candidate, itinerary, preference, document, TODO, invite, and DURI state remain the source of truth.
- Back navigation remains `router.back()` on the nested Stack route.
- Explore remains `/trips/[tripId]/explore?origin=room`.
- Planning remains `/trips/[tripId]/workspace`; only user-facing Workspace wording was removed from Trip Home.
- Invite permissions and lifecycle behavior were not changed; the existing modal is still used.
- Personal preference start/result/retest actions are retained.
- All group diagnosis dimensions, member answers, coverage, match rate, and tags remain available after expansion.
- Candidate preview, placement status, itinerary preview, and Explore/Planning navigation are retained.
- Document loading, empty, populated, unavailable, add, open/share, review, delete, permissions, persistence warning, and modals are retained.
- TODO loading, filters, empty/list states, create/edit, checklist, snooze, archive, delete, links, and modals are retained.
- Completed status continues to feed the existing read-only props and hides editable quick actions as before.
- API Trip Home keeps its existing data-contract boundaries: no locally invented document data or detailed group axes.

## Assets

- `design/image/trip_home_continue_schedule.png` was copied byte-for-byte to `assets/images/duri/trip-home/continue-schedule.png`.
- `design/image/trip_home_duri_analysis.png` was copied byte-for-byte to `assets/images/duri/trip-home/duri-analysis.png`.
- SHA-256 checks matched between each design source and production copy.
- Both images use `resizeMode="contain"`, transparent backgrounds, and decorative accessibility treatment.
- No reference screenshot was cropped or used as an application asset.
- Existing member profile images or initials remain authoritative; `duri_male.png` and `duri_female.png` were not assigned by inferred gender.

## Next Action

Next-action copy and destination come from the same state branch:

| State | Copy | Destination |
| --- | --- | --- |
| Completed | `일정 보기` | Existing Workspace route, read-only behavior preserved |
| Current member preference incomplete/invalid | `내 성향 답하기` | `/tests/personal` |
| No candidates | `장소 모으기` | Trip Explore |
| Candidates but no itinerary | `일정 만들기` | Existing Workspace route |
| Populated editable itinerary | `일정 계속 만들기` | Existing Workspace route |

The representative fixture resolves to `일정 계속 만들기`. Browser verification confirmed navigation to `/trips/trip-busan-2026/workspace`.

## DURI CTA

| State | CTA | Destination / behavior |
| --- | --- | --- |
| No itinerary | `일정 만들기` | Existing Workspace route |
| Itinerary + no session | `DURI 분석하기` | `/trips/[tripId]/analysis` |
| Loading | `분석 중` | Disabled |
| Current session | `분석 결과 보기` | `/trips/[tripId]/analysis` |
| Session fingerprint stale | `다시 분석하기` | `/trips/[tripId]/analysis` |
| Engine/data contract unavailable | `분석 준비 중` | Disabled with existing contract message |

The representative mock fixture has an itinerary and no in-memory session, so it resolves to `DURI 분석하기`. Browser verification confirmed `/trips/trip-busan-2026/analysis`. The API branch remains explicitly unavailable because the existing API Workspace does not claim a unified analysis source.

## Design Foundation Reuse

- White page base with 20px horizontal padding.
- Section headings use 19/25, weight 800.
- Main text uses `#17265F`; supporting text uses `#60719B` and `#8290AE`.
- Primary action blue is `#4388FF`; primary soft is `#DDEBFF`.
- Drafting attention uses peach `#FFF0E2`; completion uses mint `#EAF7EE`.
- Next Action uses the Home Hero surface `#F2F8FF` and `#CFE4FF` border.
- DURI uses `#F3F1FF` and `#D9D5FF`.
- Cards use 18–22px radii, existing `shadows.card`, and `#DCE7F7` borders.
- Primary and outline CTAs keep 43–44px minimum targets.
- Character illustration is limited to Next Action and DURI.

## Target Deviations

- `design/reference/trip_home_target.png` was not present in the repository, `trip_home.zip`, or the supplied attachment directory. Direct pixel comparison was therefore impossible. The implementation followed the requested IA, the written visual requirements, the existing Trip Home audit, and `HOME_DESIGN_FOUNDATION.md`.
- The detail route has no Bottom Tab by existing navigation design, so no new bottom navigation was invented.
- The stored lifecycle remains `drafting` while the date helper reports `D+38`. Business logic was intentionally not changed; both existing facts remain visible.
- The API branch still omits documents and detailed local group axes because those server contracts do not exist in the current source.

## Visual Iterations

### Iteration 1

- Replaced the large image Hero with compact Trip Identity.
- Added state-derived Next Action and official schedule illustration.
- Compressed Quick Menu and Preference summaries.
- Combined Candidates and Itinerary.
- Moved DURI before Travel Records and applied the official DURI illustration.
- Reduced representative scroll height to 2,163px.

Evidence: `iteration_1.png`, `iteration_1_mid.png`, `iteration_1_bottom.png`.

### Iteration 2

- Separated document and TODO disclosure state so each supporting row opens independently.
- Connected Quick Menu document add directly to the existing add modal through a typed component handle, avoiding React effect-driven state updates.
- Revalidated CTA destinations and final responsive captures.

Evidence: `iteration_2.png` and final captures.

## Responsive

- 360px: PASS. Two-line title limit, Next Action copy, illustration, 3-column Quick Menu, avatars, and preference status remain readable without horizontal overflow.
- 390px: PASS. Primary evidence viewport; first screen shows identity, next action, quick actions, and the start of preference status.
- 430px: PASS. Wider layout uses the available width without over-scaling illustrations or creating excessive text line length.
- Final screenshot dimensions were verified as 360 × 844, 390 × 844, and 430 × 844.
- Full scroll was inspected section by section. The final records card clears the bottom safe area; the detail route has no tab bar overlay.

## Tests

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run verify:trip-flow` | PASS |
| `npm run verify:preference-compatibility` | PASS, 36 assertions |
| `npm run verify:group-preferences` | PASS, 20 scenarios plus tag/profile assertions |
| `npm run verify:duri-analysis` | PASS, analysis/suggestion/atomic/end-condition/evidence/OCR/congestion suites |
| `npm run verify:trip-documents` | PASS, 53 scenarios |
| `npm run verify:trip-todos` | PASS, 64 scenarios |

Browser interaction checks also passed for Workspace navigation, Explore/Planning terminology, Analysis navigation, Invite modal, Document add modal, independent Document/TODO disclosure, and full-scroll visibility.

## Remaining Issues

- The requested Trip Home target PNG is missing, so reference similarity can only be evaluated against the written specification and Home foundation.
- The repository has only the populated drafting demo trip; no separate completed/read-only fixture was available for a rendered screenshot. Existing completed branches and disabled props were preserved and covered by source verification.
- DURI analysis sessions are currently in-memory, so an existing result is not retained after a full app reload. This is existing product behavior, not changed by the redesign.
- Stored lifecycle and date-derived timing can still disagree (`drafting` + `D+38`) because lifecycle policy is outside this visual redesign.
