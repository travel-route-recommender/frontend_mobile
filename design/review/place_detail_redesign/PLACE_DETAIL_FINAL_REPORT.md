# DURI Place Detail Final Redesign Report

## Result

Place Detail redesign: PASS

`design/reference/place_detail_target.png`의 Hero 중심 위계와 `design/image/Place_card.png`의 save/travel semantic을 실제 DURI 데이터와 interaction에 맞게 구현했다. Production 변경은 Place Detail screen 하나에 격리했고 Saved, Explore, Workspace source와 shared picker business logic은 수정하지 않았다.

## Before

Baseline: `before_place_detail.png`

기존 화면은 다음 구조였다.

```text
Fixed translucent title bar + duplicated name
→ Hero image + duplicated name/meta
→ all-tag horizontal scroller
→ Location card
→ Place info card + late description
→ large hard-coded review card / 0 count
→ three full legacy PlaceCards
→ fixed bottom Save + Candidate dual action
```

첫 viewport는 image/name duplication, blue background, stacked cards와 fixed dual action 때문에 정보 위계가 분산되었다. real rating은 view model에 존재하지만 Detail에서 보이지 않았고, candidate와 scheduled가 같은 CTA로 축약되었다. route `tripId`도 화면의 candidate state source로 직접 사용되지 않았다.

## Final IA

```text
Hero
→ Identity
→ Short Description
→ Trip Context? (explicit trip-scoped only)
→ Travel Action / State
→ Basic Information
→ Review Summary
→ Similar Places
```

- white page base
- actual image Hero with back + heart only
- category, short location, name, real rating, 2 tags + actual `+N`
- description promoted before address
- explicit trip context uses actual title/region/candidate/scheduled counts
- Blue add, Lavender candidate, Mint scheduled are separate states
- address and actual `infoItems` share one compact information group
- review is a compact empty summary without invented count or CTA
- similar places use a lightweight horizontal Detail-local rail

## Hero and Save

- actual `Place.imageUrl`, cover
- height: 264–300px responsive
- no screenshot crop and no fake gallery
- no duplicated place name on the image or sticky title
- back and save heart: 46×46px
- unsaved outline / saved Primary Blue filled heart
- removed the large bottom save button
- saved state continues to call existing `toggleSaved`

## Identity and Description

- short address: first two actual address tokens
- full address appears once in Basic Information
- finite real rating only
- tag cap: 2 + actual hidden count
- no fake rating, review, tags, address, contact, hours, homepage, description
- description is before trip/basic information
- existing long-summary expand/collapse behavior remains, using a 3-line collapsed layout

## Travel Context and State

Explicit trip-scoped entry renders:

- actual trip title
- resolved region name
- candidate count from `candidatesByTripId`
- unique scheduled count from `itineraryByTripId`

The explicit route trip becomes the active mutation target when it is an eligible member trip. This keeps the displayed `tripId` and existing `usePlaceActions` target synchronized without changing route/query semantics.

| State | Final surface | Existing behavior |
| --- | --- | --- |
| no target / not candidate | Blue `후보에 담기 →` | active eligible trip mutation or existing Candidate Trip Picker |
| current candidate | Lavender `✦ 현재 여행 후보` + `해제` | existing candidate removal and permission feedback |
| scheduled | Mint `▣ 일정 포함됨` | read-only; existing Workspace route exposed as `일정 보기` only in explicit context |
| completed trip | neutral locked add state | no new mutation capability |

The fixed bottom action bar was removed. One travel action/state now sits inside the content flow after description/context. Save remains independent in the Hero.

## Basic Information

- one white bordered group instead of stacked information cards
- address and actual `Place.infoItems` only
- generic/empty values hidden
- icon/label/value rows
- label-aware location/time/web/contact tones
- no fabricated chevrons, directions, link opening, or homepage action

The audited mock place has no `infoItems`, so its final Basic Information correctly contains only the real address row.

## Reviews

The current domain/query/store has no review model. The final screen therefore shows only the compact actual empty state:

`아직 등록된 리뷰가 없어요.`

The old hard-coded `0개` count and large empty card hierarchy were removed. No review CTA or fixture was added.

## Similar Places

- source remains current local `findSimilarPlaces`
- maximum 3
- horizontal compact 154–178px cards
- actual image, name, short location, personal save heart
- no candidate CTA or full legacy PlaceCard
- body and heart are sibling controls
- related navigation preserves `tripId` and `origin`

The legacy shared `PlaceCard` was not modified, so Saved appearance and behavior remain outside this redesign.

## Loading and Failure States

- remote initial loading now uses Hero/Identity/action-shaped skeleton geometry
- repository unavailable, hydration error, remote error, missing place, retry and back behavior remain
- Hero image failure has a neutral no-image fallback
- changing `placeId` resets the Detail ScrollView to the top, preventing another place from inheriting the previous Detail offset

## Data Integrity

- no mock fixture or API response edits
- no fake place or state
- no screenshot/reference image used in production UI
- all visible place fields come from `Place` / `PlaceCardViewModel`
- saved/candidate/scheduled remain store/selectors/mutation results
- trip counts are derived from actual candidate/itinerary collections
- reviews remain accurately empty because there is no current review source

## Preserved Features

- Home / Explore / Saved / Workspace / related entry to Place Detail
- `placeId`, `tripId`, `origin` route semantics
- route-aware back from trip-scoped Detail
- remote detail query and classification enrichment
- upsert of remote detail Place
- personal save mutation and member gate
- candidate add/remove/scheduled rules and feedback
- Candidate Trip Picker and create-trip route
- Workspace feedback action
- long-description expand/collapse
- practical `infoItems`
- similarity selection and related Detail navigation
- repository/hydration/loading/error/missing/image-fallback states

## Browser State Validation

All state screenshots were produced through visible UI flows at 390×844 in mock/web mode. No fixture/source state was edited for screenshots.

| Artifact | Actual state / flow | Result |
| --- | --- | --- |
| `place_detail_default.png` | personal Explore → 전포카페거리, unsaved + no active target | Blue add, outline heart: PASS |
| `place_detail_saved.png` | personal Explore → 감천문화마을, saved + no active target | filled blue heart, Blue add: PASS |
| `place_detail_candidate.png` | Trip Home → trip Explore → 해운대 | Lavender candidate + working release: PASS |
| `place_detail_scheduled.png` | Trip Home → trip Explore → 감천문화마을 | Mint scheduled + Workspace route: PASS |

Interaction checks:

- personal `후보에 담기` opens existing Candidate Trip Picker: PASS
- saved heart off/on and original state restoration: PASS
- 해운대 candidate release changes candidate count 6 → 5: PASS
- add again restores count 5 → 6 and Lavender state: PASS
- scheduled `일정 보기` routes to `/trips/trip-busan-2026/workspace`: PASS
- related card keeps `tripId=trip-busan-2026&origin=room`: PASS
- new place Detail starts at scroll offset 0: PASS

## Visual Iterations

### Iteration 1

- Hero-only back/heart, white rounded content panel, Identity/description/action/basic/review/related IA
- verified first viewport and lower related rail
- found that repeated Detail-to-Detail navigation could inherit an earlier internal scroll offset

Artifacts: `iteration_1.png`, `iteration_1_bottom.png`, `iteration_1_full.png`

### Iteration 2

- added place-ID scroll reset without changing data/mutation behavior
- repeated Explore → Detail and related Detail navigation now opens at the Hero
- no further visual revision was required

Artifact: `iteration_2.png`

## Responsive QA

| Viewport | Result |
| ---: | --- |
| 360×844 | PASS. Hero, 2-line-safe name, Blue action and sections fit. Long address wraps without clipping. |
| 390×844 | PASS. Primary reference viewport; Hero/Identity/description/action/basic hierarchy is stable. |
| 430×844 | PASS. Hero clamps at 300px and content uses the extra width without stretched typography or overflow. |

Final screenshots:

- `place_detail_final_360.png`
- `place_detail_final_390.png`
- `place_detail_final_430.png`

## Automated Verification

- `npm run typecheck` — PASS
- `npm run lint` — PASS, 0 errors / 0 warnings
- `npm run verify:place-flow` — PASS
  - search
  - region
  - classification
  - sorting
  - scheduled state
  - region alias assertions
- `git diff --check -- src/features/places/screens/PlaceDetailScreen.tsx` — PASS; only the existing Windows LF→CRLF notice

There is no `verify:explore-flow` script in the current `package.json`. Explore regression was checked through the visible personal and trip-scoped UI flows above.

## Remaining Existing Constraints

- `Place` stores one `imageUrl`; a real gallery cannot be shown without a future domain/API change.
- reviews have no current domain/query source and remain an accurate compact empty state.
- Workspace callers still open Place Detail with `placeId` only; this redesign preserves that existing route contract rather than inventing new params.
- API mode candidate mutation continues to depend on the existing API trip context and server IDs.
- similar places remain based on currently loaded places and local similarity scoring.

## Modified Production File

- `src/features/places/screens/PlaceDetailScreen.tsx`

## Review Artifacts

- `design/review/place_detail_redesign/before_place_detail.png`
- `design/review/place_detail_redesign/iteration_1.png`
- `design/review/place_detail_redesign/iteration_1_bottom.png`
- `design/review/place_detail_redesign/iteration_1_full.png`
- `design/review/place_detail_redesign/iteration_2.png`
- `design/review/place_detail_redesign/place_detail_default.png`
- `design/review/place_detail_redesign/place_detail_saved.png`
- `design/review/place_detail_redesign/place_detail_candidate.png`
- `design/review/place_detail_redesign/place_detail_scheduled.png`
- `design/review/place_detail_redesign/place_detail_final_360.png`
- `design/review/place_detail_redesign/place_detail_final_390.png`
- `design/review/place_detail_redesign/place_detail_final_430.png`
- `design/review/place_detail_redesign/PLACE_DETAIL_DESIGN_EXTENSION.md`
- `design/review/place_detail_redesign/PLACE_DETAIL_FINAL_REPORT.md`
