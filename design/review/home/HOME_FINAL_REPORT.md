# DURI Home Final Redesign Report

## Baseline

- Captured the pre-change member Home at `390 × 844` in `design/review/home/before_home.png`.
- The baseline correctly showed the demo member, one Busan trip, and the actual `6 / 3 / 2` candidate, itinerary, and preference-response counts.
- The baseline did not include the official Home illustrations, a trip carousel, or a place recommendation section, and used a page-wide pale-blue background.

## Assets

- Hero: `assets/images/duri/home/hero-travel.png`
- DURI planning card: `assets/images/duri/home/planning.png`
- Registered avatar candidates: `assets/images/duri/avatars/duri-male.png`, `assets/images/duri/avatars/duri-female.png`
- All four production copies match the SHA-256 hash of their corresponding `design/image` source. The design originals were not moved, edited, or deleted.

## Modified Files

- `src/features/home/screens/HomeScreen.tsx`
- `src/features/auth/components/DuriLogo.tsx`
- `assets/images/duri/home/hero-travel.png`
- `assets/images/duri/home/planning.png`
- `assets/images/duri/avatars/duri-male.png`
- `assets/images/duri/avatars/duri-female.png`
- `design/review/home/before_home.png`
- `design/review/home/iteration_1.png`
- `design/review/home/iteration_2.png`
- `design/review/home/iteration_3.png`
- `design/review/home/home_final_360.png`
- `design/review/home/home_final_390x844.png`
- `design/review/home/home_final_430.png`
- `design/review/home/home_final_bottom.png`
- `design/review/home/HOME_FINAL_REPORT.md`
- `design/review/home/HOME_DESIGN_FOUNDATION.md`

`DuriLogo` received an opt-in Latin wordmark variant for Home. Its existing default rendering is unchanged, so auth screens keep their prior appearance.

## Preserved Logic

- Current user and profile image/initial fallback come from the existing auth and domain stores.
- Home trips are derived from `tripOrder`, `tripsById`, and current-user membership; no trip or ID is hard-coded.
- Candidate, itinerary, member, and preference-response counts use existing normalized state and selectors.
- Trip card and CTA use the existing `/trips/[tripId]` route.
- New trip uses `/trips/new` through the existing member gate.
- The DURI CTA uses the existing active-trip `/trips/[tripId]/analysis` route.
- Place detail uses `/places/[placeId]`.
- Save hearts use `usePlaceActions().toggleSaved`, including the existing guest/member gate and saved-place mutation.
- Existing five-tab navigation was not changed.

## Design Implementation

### Header

- Added the DURI Latin wordmark variant and retained the current Avatar `profileImageUrl → initial` fallback.
- Profile press opens the existing My Page tab.
- No notification control was added.

### Hero

- Uses the official `home_hero_travel` production asset with `contain` behavior.
- Keeps the greeting and destination prompt at two lines at 360, 390, and 430px.
- Uses a white page and a bounded pastel-blue Hero surface instead of a page-wide blue background.

### Trip Carousel

- Shows all actual current-user trips in a horizontal, snapping carousel.
- Card width is responsive (`viewport - 96`, minimum 252px), exposing the following card as a deliberate continuation.
- A narrow final create card keeps both the plus and `새 여행` cue visible.
- Trip images use the existing region image fallback and actual store data.

### DURI Card

- Uses a lavender surface and the official planning illustration.
- Text, CTA, characters, map, and props are separated without clipping or overlap.
- The CTA routes to the existing DURI analysis for the active trip, or through the existing new-trip gate if no trip exists.

### Recommended Places

- The section is named `추천 장소` because the current place model has no popularity semantics.
- Active-trip-region places are shown first, followed by other actual places; no ranking values or fake places were created.
- Compact rows preserve detail navigation and saved-heart state.

### Bottom Padding

- Home content uses 112px bottom padding.
- The last place row was verified by real scrolling and remains fully visible and tappable above the existing tab bar; evidence is in `home_final_bottom.png`.

## Visual Iterations

- Iteration 1: introduced the white base, official Hero, actual-data trip carousel, DURI planning card, and compact place rows. Confirmed the create-card plus cue and `6 / 3 / 2` values.
- Iteration 2: reduced the DURI illustration footprint and separated it from the description and CTA.
- Iteration 3: restored a clean two-line DURI heading, shortened the supporting copy, and balanced the illustration and CTA.
- Final responsive pass: fixed the 360px Hero ellipsis with compact-only typography and illustration sizing while leaving the 390px layout unchanged.

## Target Deviations

- Bell omitted because no notification behavior exists in the current frontend.
- `추천 장소` replaces `인기 장소 제안` because the current data has no popularity ordering.
- The demo has one actual Busan trip, so the carousel shows that trip plus the create card instead of copying target sample trips.
- The trip photograph comes from the existing Busan region image URL rather than a target-screenshot image.
- The target screenshot was not cropped or used as a runtime asset.
- Full-page stitching was not used; the real ScrollView was inspected at the top and bottom instead.

## Profile Assets

- DURI male/female PNGs were registered as production asset candidates.
- Home does not assign either image because the User schema has no explicit avatar preset or gender field.
- No gender was inferred from the user name.

## State Preservation

- Member + active trip: verified in the rendered app with the demo member and actual `6 / 3 / 2` values.
- Member + no trip: empty-state implementation is present and uses the existing member gate, but was not live-rendered in this pass.
- Guest/anonymous: existing session filtering, Avatar fallback, saved-place gate, and create-trip gate remain in use, but were not live-rendered in this pass.
- Loading/error: Home reads the existing synchronous normalized store as before; no new network loading or error state was introduced.

## Responsive

- 360px: pass after compact Hero correction; no title truncation, illustration clipping, or carousel cue loss.
- 390px: pass; primary visual source of truth and final capture.
- 430px: pass; Hero, trip card, next-card cue, and horizontal bounds remain intact.

## Functional QA

- Saved heart: toggled an unsaved place on and back off; both accessible selected states rendered correctly.
- Trip CTA: existing trip-detail navigation was exercised during the route pass.
- DURI CTA: verified navigation to `/trips/trip-busan-2026/analysis`.
- Place row: verified navigation to `/places/gamcheon`.

## Tests

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run verify:auth-session`: PASS
- `npm run verify:trip-flow`: PASS
- `npm run verify:place-flow`: PASS
- `npm run verify:duri-analysis`: PASS
- `npm run validate:state`: PASS (`0 error(s), 0 warning(s)`)

## Remaining Issues

- No known Home visual defects remain at 360, 390, or 430px.
- No-trip and guest states were preserved in code but were not live-captured in this pass.
