# Workspace Design Extension

This document extends the current DURI mobile design system for the `여행 일정` Workspace. It does not replace global tokens or redefine other screens.

## 1. Visual Roles

| Role | Treatment | Meaning |
| --- | --- | --- |
| Primary Blue | `colors.primary` | selected DAY, primary schedule action |
| Lavender | `#F4F1FF`, `#7569BE`, `#D8D5F4` | Candidate identity, Candidate Sheet, DURI guidance |
| Mint | `#ECF8F2`, `#DFF4E9`, `#2E9B66` | Scheduled candidate and itinerary block |
| White Base | `colors.surface` | Workspace canvas, Timeline, modal |
| Warning | existing warning tokens | last-day return condition and conflicts |

Lavender means “planning material or guidance.” Mint means “already placed in the schedule.” Blue remains reserved for current selection and primary execution.

## 2. Information Architecture

The Workspace default hierarchy is fixed:

```text
Header
DAY selector
Timeline
DURI compact action
Candidate Sheet
```

Trip facts, server version details, document linkage, and destructive DAY management are secondary layers. They must not precede the Timeline in the default editable state.

## 3. Candidate Sheet Geometry

| State | Height | Visible content |
| --- | ---: | --- |
| Peek | `116px` | handle, Candidate title, unscheduled count, expand hint |
| Half | `round(safeViewport × 0.54)` | search, filters, first candidate cards |
| Full | `safeViewport - 104px` | full Candidate browsing surface |

Rules:

- Default to Peek on every new Workspace mount.
- Drag is continuous only while the pointer is down.
- Release resolves to the nearest semantic state.
- Assistive increment/decrement moves exactly one semantic state.
- Body controls are not mounted in Peek.
- Candidate Sheet owns vertical resize only from its handle; list scroll starts below the handle.

## 4. Timeline

- Timeline remains a nested vertical scroll surface with a `520px` viewport.
- Time range remains `00:00–24:00`.
- Grid and gesture snap remain 15 minutes.
- Existing one-minute editor/storage values are displayed without rounding.
- DAY canvas horizontal swipe remains outside move/resize handle ownership.
- Timeline block body opens add/edit or read-only detail; it is the non-gesture alternative.

### Schedule block

- Base surface: Mint.
- Conflict: existing Danger surface.
- Right handle: move, visually separated by a translucent White strip and `⋮⋮`.
- Bottom handle: resize, `━` affordance.
- Micro/compact/full density behavior remains driven by the existing layout resolver.

## 5. DAY Selector

- Show `DAY N`, calendar date, weekday, and itinerary count.
- Use Primary Blue only for the selected DAY.
- Use a Lavender dashed card for `날짜 추가`.
- Keep long-press reorder and accessibility reorder actions.
- Keep date-range/delete operations behind `DAY 관리`.

## 6. Candidate Card

Unscheduled:

- White surface.
- Lavender `일정 전` status.
- Primary action `+ 일정에 추가`.

Scheduled:

- Mint surface.
- `일정 포함 · N회`.
- Show up to two actual placements as `DAY N · HH:mm–HH:mm`.
- Primary view action `해당 일정 보기`.
- Editable secondary action `+ 다른 시간` creates a new itinerary item.

Candidate removal remains independent from schedule removal. Removing or viewing one placement must not imply deleting the Candidate relation.

## 7. DURI Compact Action

- Position directly above Candidate Peek with an 8px gap.
- Candidate Sheet z-order is higher, so Half/Full covers the dock.
- Minimum height: 70px.
- Use exact resolver label and destination.
- Disabled states use opacity and `accessibilityState.disabled`.
- A valid result remains viewable even if the analysis engine is temporarily unavailable.

## 8. Schedule Editor

```text
Fixed handle/header
Place identity
Scrollable fields
Sticky safe-area footer
```

- Edit: `삭제` + `변경 저장`.
- Add: `취소` + `일정에 추가`.
- Read-only: no mutation footer.
- The form is the only scrolling region; header and footer never move with it.
- Footer includes bottom safe-area padding.
- Render place image/address/category only when backed by actual Place data.

## 9. Empty DAY

- Never replace the Timeline with a standalone empty card.
- Keep time labels and grid visible.
- Center the guidance near the automatically visible morning range.
- CTA uses the existing Candidate selection flow.
- Keep DURI dock and Candidate Peek visible below it.

## 10. Responsive and Accessibility

- Supported QA widths: 360, 390, 430.
- No page-level horizontal overflow.
- Interactive target minimum follows existing 44px token.
- Sheet state is announced as `미리보기`, `절반`, or `전체`, never as a pixel count.
- Move/resize actions keep adjustable accessibility actions in 15-minute steps.
- Peek contains no hidden focusable Candidate controls.
- Read-only block taps open detail, not an editable form.

## 11. Preserved Navigation

Workspace remains the existing nested trip route. The surrounding navigation and actual Bottom Tab implementation are unchanged. Do not add reference-only share buttons, overflow menus, tabs, or fabricated routes.

## 12. Precision Boundary

The visual extension does not decide the product policy for 15-minute grid versus one-minute editor/storage precision. Until that decision is explicit:

- do not auto-round;
- do not migrate existing items;
- do not change Store/API validation;
- do not represent an off-grid value as if it had been snapped.
