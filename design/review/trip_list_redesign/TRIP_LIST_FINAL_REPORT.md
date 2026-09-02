# DURI Trip List Final Redesign

Date: 2026-08-28<br>
Scope: Trip List only<br>
Representative route: `/trips`<br>
Primary viewport: `390 × 844`

## Before

- The page used the old pale-blue screen base, `내 여행` plus a subtitle, a 350 × 52px full-width create CTA, filters, and one 350 × 457.4px card.
- The representative card devoted substantial height to a 2.25:1 cover, three equal metric tiles, member avatars, and a weighted `여행 준비 50%` bar.
- Only one card fit in the first viewport. The selected room showed `일정 초안 작성 중` and `D+40` simultaneously because lifecycle and dates are independent.
- True empty and filter empty shared the generic glyph-based `EmptyState` treatment.
- Baseline evidence: `design/review/trip_list_redesign/before_trip_list.png`.

## Primary State

The final order is:

```text
여행 + compact 새 여행
→ 진행 중 / 완료 / 전체 with real counts
→ selected-filter result count
→ compact Trip cards
→ unchanged Bottom Navigation
```

- Trip List opts locally into the Home white base and 20px horizontal padding.
- The populated create action is a 44px compact header control rather than a full-width CTA.
- The representative final card is approximately 350 × 314px at 390px width, down from 350 × 457.4px.
- The first card ends around y=480 at the primary viewport, leaving roughly 306px before the tab bar for comparison with a following card when more data exists.

## True Empty

- Total count equals ongoing plus completed count; when it is zero, all filters are hidden.
- The header remains `여행 + 새 여행` and a soft-blue summary shows `여행이 0개` with first-trip context.
- The body uses the official transparent `create_trip` illustration with `resizeMode="contain"`, a concise empty title/description, and one contextual full-width `새 여행 만들기` CTA.
- Header and contextual CTAs call the same existing `createTrip` function and Member Gate.
- No fake Trip or user data was added to production or fixtures.
- Rendered verification used the normal, user-approved local mock email signup on the separate `127.0.0.2` loopback origin. The resulting `첫여행` member had zero accessible rooms without changing Store source or fixtures.
- Browser evidence confirmed no Trip filter tabs, an unclipped official illustration, the 52px contextual CTA, and the unchanged Bottom Navigation.
- Final evidence: `trip_list_empty_final_360.png`, `trip_list_empty_final_390.png`, and `trip_list_empty_final_430.png`.

## Filter

- Existing values remain `ongoing`, `completed`, and `all`.
- Mock filtering still uses the existing selector partitions and sorting. API filtering still partitions on `viewModel.status` and preserves server order.
- Counts come from the actual current collections.
- Selected filters use Primary Blue and white text; unselected filters use white with the foundation soft border.
- At 360px, all three 44px filters remain on one row with no horizontal overflow.
- Actual filter-empty evidence uses the available completed result: total 1, completed 0. Filters and `완료 여행 0개` remain visible, the large illustration is omitted, and `진행 중 보기` switches only the current filter.

## Trip Card

Ongoing:

- stored lifecycle badge, small owner role, muted timing
- title, destination, dates, and member count
- low 3.2:1 existing cover/fallback
- one next-action row
- one `후보 N · 일정 N · 응답 N/N` line
- whole-card press to the existing Trip Home route

Completed:

- neutral lifecycle treatment
- same factual identity and optional cover
- `여행 기록 다시 보기` as the only summary action
- no candidate, response, or preparation metrics
- same existing Trip Home route; no History route was created

No completed fixture exists, so the completed visual branch is source-verified rather than represented with invented data. The real completed-filter screenshot correctly records filter empty.

## Next Action

Trip List uses the fields already available in `TripRoomCardViewModel`:

| State | Copy |
| --- | --- |
| `status === completed` | `여행 기록 다시 보기` |
| `candidateCount === 0` | `함께 가고 싶은 장소를 모아보세요` |
| candidates and `itineraryCount === 0` | `첫 일정을 만들어보세요` |
| `itineraryCount > 0` | `일정을 계속 만들어보세요` |

The representative fixture resolves to `일정을 계속 만들어보세요`. The row is not a nested press target, so it cannot conflict with whole-card navigation.

## Progress

- `calculateTripPreparationProgress` and `viewModel.preparation` were not changed or deleted.
- Trip List no longer renders the weighted percentage or progress bar.
- This avoids presenting the representative weighted 50% beside Trip Home's completed-step-only 20% visual contract.
- Ongoing cards prioritize the next action and compact actual metrics; completed cards omit preparation language.

## Lifecycle / Date

- Stored lifecycle remains the sole filter/status source of truth.
- Dates still come from the existing date helper and are not used to mutate lifecycle.
- The representative room therefore remains in `진행 중 1` with `일정 초안 작성 중` and `D+40`.
- `D+40` is retained as small muted metadata, not a primary badge.
- **Lifecycle / Date product policy unresolved.** This visual redesign intentionally does not decide when a past non-completed room should become completed.

## Image Source

- Mock Trip List continues to use `Region.imageUrl` from the existing card selector.
- API mode still has no list cover URL, so `RemoteImage` uses its existing pastel DURI fallback.
- No external URL was added and no place image was inferred.
- The lower 3.2:1 ratio keeps both real covers and fallbacks secondary to identity.

True-empty asset:

- Source: `design/image/create_trip.png`
- Production copy: `assets/images/duri/trip-list/create-trip.png`
- SHA-256 for both: `28DDE61DAEE7E03DABF38F228243836FEA9EF6BD432335880257CE0A4886A6DF`
- The reference screenshot was not cropped or used as an app asset.

## Data Integrity

- No title, destination, date, member, candidate, itinerary, preference, or filter count from the visual reference was hard-coded.
- Store selectors, API mapper, lifecycle partitions, current-user membership, sorting, role, active-trip update, and room ViewModels remain authoritative.
- Loading, query error/retry, hydration error, missing-user, and unsupported data-source branches were preserved.

## Guest / Member

- Members still navigate to `/trips/new` through the existing create action.
- Guests and the currently unreachable anonymous branch still pass through `useMemberGate` and the same upgrade/login/later modal routes.
- Invited rooms continue to use the existing membership visibility and full-card Trip Home route.
- The universal page heading is now `여행`, following the final reference requirement; permission and collection behavior are unchanged.

## Known Routing Issues

- The existing invite-first guest flow can replace directly into Trip Home with no handled back destination. The audited web flow also returned to Login after a direct Trip List reload.
- This is an existing auth/session routing issue and was not modified in the Trip List visual scope.
- The create-screen header back action did not change the route in one browser check; browser history returned successfully. No Create Trip source was modified, per scope.

## Shared Components

- `TripRoomCard` is Trip List-specific. `HomeTripCard` was not imported, shared, or restyled.
- Shared data selectors and `RemoteImage` remain reused.
- Global `Screen`, global `Chip`, global theme tokens, Bottom Navigation, Home, and Trip Home presentation were not changed.

## Visual Iterations

### Primary iteration 1

- Moved to the white base and compact title/create row.
- Replaced the old segmented surface with counted pill filters.
- Added the selected-result heading.
- Reordered the card to lifecycle/identity first, reduced the cover, added one next action, collapsed metrics, and removed percentage presentation.
- Browser evidence showed the representative card at about 314px high with no horizontal overflow.

Evidence: `iteration_primary_1.png`.

### Filter empty

- Preserved filters and selected count.
- Used a restrained non-character indicator and a functional filter-switch action.

Evidence: `trip_list_filter_empty.png`.

### Empty iteration

- Iteration 1 confirmed the correct true-empty branch, hidden filters, official image, copy, CTA, and tab bar through the normal zero-room account.
- Visual inspection showed the 248px image container read too much like a sticker compared with the reference.
- Iteration 2 increased only the image container to 292px. The complete characters, signs, suitcase, and map remain visible with `contain`, while the CTA and tab bar still fit in the 844px viewport.

Evidence: `iteration_empty_1.png` and `empty_iteration_2.png`.

## Responsive

Primary:

- 360px: PASS. Viewport and document scroll width both 360px; card is 320 × 304.8px; filters, action, metadata, metric line, and tab bar remain visible.
- 390px: PASS. Viewport and document scroll width both 390px; card is 350 × 314.2px; primary evidence viewport.
- 430px: PASS. Viewport and document scroll width both 430px; card is 390 × 326.7px; the cover grows only through the fixed ratio.

True empty:

- 360px: PASS. Viewport and document scroll width both 360px; Trip filter count is zero; image container is 320 × 292px; contextual CTA is 320 × 52px.
- 390px: PASS. Primary empty evidence; filters are hidden, the full illustration is visible, and CTA/tab spacing is clear.
- 430px: PASS. Viewport and document scroll width both 430px; Trip filter count is zero; image container is 390 × 292px; contextual CTA is 390 × 52px.

## Tests

| Check | Result |
| --- | --- |
| Expo SDK 57.0.0 official documentation reviewed before code | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run verify:trip-flow` | PASS |
| `npm run verify:auth-session` | PASS |
| Browser whole-card navigation to `/trips/trip-busan-2026` | PASS |
| Browser member create action to `/trips/new` | PASS |
| Browser Home route/Trip section regression check | PASS |
| Browser Trip Home identity/next-action/quick-menu/planning check | PASS |
| Browser runtime after final bundle | PASS; no fatal runtime errors. Existing web shadow and onboarding `useNativeDriver` development warnings remain |

## Modified Files

Production:

- `src/features/trips/screens/TripListScreen.tsx`
- `src/features/trips/components/TripCard.tsx`
- `assets/images/duri/trip-list/create-trip.png`

Review artifacts:

- `design/review/trip_list_redesign/before_trip_list.png`
- `design/review/trip_list_redesign/iteration_primary_1.png`
- `design/review/trip_list_redesign/iteration_empty_1.png`
- `design/review/trip_list_redesign/empty_iteration_2.png`
- `design/review/trip_list_redesign/trip_list_filter_empty.png`
- `design/review/trip_list_redesign/trip_list_primary_final_360.png`
- `design/review/trip_list_redesign/trip_list_primary_final_390.png`
- `design/review/trip_list_redesign/trip_list_primary_final_430.png`
- `design/review/trip_list_redesign/trip_list_empty_final_360.png`
- `design/review/trip_list_redesign/trip_list_empty_final_390.png`
- `design/review/trip_list_redesign/trip_list_empty_final_430.png`
- `design/review/trip_list_redesign/TRIP_LIST_FINAL_REPORT.md`
- `design/review/trip_list_redesign/TRIP_LIST_DESIGN_EXTENSION.md`

All pre-existing user changes in Home, Trip Home, Explore, Place Detail, Saved, auth branding, documents, TODOs, and existing `design/` materials were preserved.

## Remaining Issues

- No completed room fixture exists, so a populated completed-card screenshot was not fabricated.
- Lifecycle/date product policy remains unresolved (`drafting` plus `D+40`).
- API list responses still do not provide a cover URL and therefore use the existing fallback.
- Invite-first guest back/session behavior remains an existing routing follow-up outside this redesign.
- React Native Web continues to emit the existing `shadow* style props are deprecated` development warning from shared native shadow tokens.
- The normal signup onboarding flow emits the existing web `useNativeDriver` fallback warning; no onboarding source was changed in this Trip List scope.
