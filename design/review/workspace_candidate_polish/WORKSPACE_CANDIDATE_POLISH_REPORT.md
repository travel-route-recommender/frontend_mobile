# Workspace Candidate Sheet — Color & Surface Polish Report

## Scope

This pass is limited to Candidate Sheet color/surface polish plus the explicitly requested Workspace copy and help affordance. Candidate Sheet height, Peek/Half/Full snap points, gestures, scrolling, card dimensions, image treatment, spacing, padding, radius, action count, navigation, and candidate/schedule business logic were not changed.

## Changed Files

- `src/features/workspace/components/WorkspaceBoardSheet.tsx`
  - Replaced the large Lavender sheet surface with the shared white surface and blue-gray border.
  - Changed the drag handle to neutral blue-gray.
  - Removed the visible Peek/Half/Full state and swipe hint while preserving internal accessibility state/value/hint.
- `src/features/workspace/components/CandidateBoard.tsx`
  - Applied white search surface, blue-gray default border, and shared Primary Blue focus border.
  - Changed the selected filter from Purple to shared Primary Blue; unselected filters remain white.
- `src/features/workspace/components/CandidatePlaceCard.tsx`
  - Kept all cards white with the shared soft border and existing app-level card shadow.
  - Removed the full-card Mint treatment from scheduled cards.
  - Kept Candidate and Scheduled meaning in small Lavender and Mint badges only.
  - Changed `+ 일정에 추가` from Purple to the shared Primary Blue.
  - Changed scheduled actions to white Primary Blue outline actions.
  - Kept `빼기` as a weak soft-red surface with a red outline/text.
- `src/features/workspace/components/WorkspaceScheduleGrid.tsx`
  - Removed the persistent `DAY 전환 · 이동 · 체류시간` guide.
  - Added the small `?` action beside `일정표` and a dependency-free modal based on the existing Workspace modal pattern.
- `src/features/workspace/components/WorkspaceDateTabs.tsx`
  - Changed the visible trigger copy to `DAY 관리`.
- `src/features/duri/components/DuriAnalysisEntryCard.tsx`
  - Changed only the default compact-row description copy.

## Color Changes

| Element | Result |
| --- | --- |
| Sheet | White `colors.surface`, soft `colors.border` |
| Drag handle | Neutral `colors.borderStrong` |
| Search | White, `colors.borderStrong`; focus uses `colors.primary` |
| Selected filter | `colors.primary` + white text |
| Candidate cards | White + `colors.border` + existing `shadows.card` |
| Candidate state | Small light Lavender badge |
| DURI recommendation | Small light Lavender chip |
| Scheduled state | Small Mint badge; card remains white |
| Add action | Shared Primary Blue `colors.primary` |
| Scheduled actions | White + Primary Blue outline/text |
| Remove action | `colors.dangerSoft` + danger outline/text |

Browser-computed QA at 390px:

- Sheet background: `rgb(255, 255, 255)`
- Sheet/card border: `rgb(220, 232, 250)`
- Search default border: `rgb(184, 204, 234)`
- Search focus border: `rgb(67, 136, 255)`
- Selected filter and Add action: `rgb(67, 136, 255)`
- Unscheduled and scheduled card backgrounds: `rgb(255, 255, 255)`
- Viewport: `innerWidth 390`, `scrollWidth 390` (no horizontal overflow)

## Removed Guidance Copy

- Removed visible Candidate Sheet state copy such as `미리보기`, `절반`, `전체`, and swipe-direction hints.
- Preserved Candidate Sheet accessibility value/hint so assistive technology can still identify and adjust the snap state.
- Removed the persistent Timeline interaction guide.

## Help Implementation

The `?` action beside the `일정표` heading opens `일정 사용법` with:

- DAY를 눌러 날짜를 전환할 수 있어요.
- 일정 카드를 움직여 시간을 변경할 수 있어요.
- 카드 아래 핸들로 체류시간을 조절할 수 있어요.
- 후보 장소는 아래에서 일정에 추가할 수 있어요.

The modal uses React Native's existing `Modal` primitive and the same bottom-card visual pattern already used by Workspace DAY management. No dependency was added. Browser QA confirmed the action, modal title, all four instructions, and close action are accessible and visible.

## Copy Changes

- DURI compact row: `일정의 균형을 두리와 점검해보세요`
- DAY management trigger: `DAY 관리`
- The canonical DURI resolver CTA remains unchanged.

## Functional Regression Results

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run verify:workspace-editor` | PASS — 100 scenarios + conflict validation |
| `npm run verify:place-flow` | PASS — search, canonical relation, candidate/scheduled classification, dedupe |
| `npm run verify:workspace-schedule-api` | PASS — 66 scenarios, including duplicate scheduling and read-only mutation blocking |
| `npm run verify:duri-analysis` | PASS — analysis, suggestion, atomic, end-condition, evidence/OCR/congestion scenarios |

The verification set covers canonical place-trip relation, `isScheduled`, `scheduledCount`, independent duplicate schedule items, candidate deduplication, and a single permission source that blocks Add/Duplicate Add/Drag/Resize/Edit/Delete/DAY/trip-condition mutations in read-only trips.

## Screenshots

- `before_candidate_polish.png` — 390×844 Half state before changes
- `candidate_polish_390.png` — 390×844 Half state after changes
- `candidate_polish_full_390.png` — 390×844 Full state after changes
- `candidate_polish_360.png` — 360×844 responsive check
- `candidate_polish_430.png` — 430×844 responsive check
- `candidate_polish_help_390.png` — 390×844 help modal check

## Completion Checklist

- [x] Candidate Sheet structure and snap behavior unchanged
- [x] White sheet and card surfaces
- [x] No large Lavender Candidate surface
- [x] No large Mint scheduled-card surface
- [x] Selected filter and Add action use shared Primary Blue
- [x] Candidate/DURI use small Lavender semantic surfaces
- [x] Scheduled uses a small Mint semantic surface
- [x] Remove action uses a weak soft-red treatment
- [x] Visible sheet-state hints removed; accessibility state retained
- [x] `DAY 관리` copy simplified
- [x] Persistent Timeline guide removed
- [x] `?` help modal works with the required copy
- [x] DURI compact copy updated exactly
- [x] Candidate card density, image size, and action count unchanged
- [x] Timeline schedule blocks, DAY selector structure, and Bottom Navigation unchanged
- [x] Typecheck, lint, and scoped regression verification pass
