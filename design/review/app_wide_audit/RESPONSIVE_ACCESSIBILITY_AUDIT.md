# Responsive & Accessibility Audit

Primary viewport: 390×844 portrait. Representative QA: 360×844 and 430×844. Tested screens include Home, Trip Explore, Workspace, Candidate Sheet, DURI Analysis, Suggestion Preview, Create Date, Preference Question. Primary 20-screen set was captured at 390×844.

## 360

- Home hero/title/character remain within the card. Trip summary metrics retain a single-row hierarchy.
- Explore cards and Candidate Sheet become dense but primary actions remain visible; filter chips remain reachable.
- Workspace timeline uses internal vertical scroll; no document-level horizontal scroll was detected.
- Candidate Sheet at half state keeps handle, title, search and first candidate accessible.
- Suggestion Preview stacks content and preserves both `적용하지 않기` and `일정에 적용` in the sticky footer.
- Create Date calendar fits seven columns, but 38px date targets are especially small at this width.
- Preference question wraps the long Korean prompt by phrase and keeps options accessible below.

Finding: no clipped CTA or inaccessible content, but small badge/type/target values are most noticeable at 360.

## 390

- This is the most balanced target for card density, page gutter and character scale.
- 20 primary screenshots cover Main tabs, Trip/Place/Create/Preference flows.
- Trip Home and DURI retain clear one-primary-action hierarchy.
- Workspace overlay layers (DURI entry + candidate sheet) remain legible; schedule editor modal has internal scroll and fixed footer.
- Saved true empty uses character + one functional CTA and does not overfill the page.
- P0 state captures are at 390: Guest invite management exposure and reload bootstrap hang.

## 430

- Content max width prevents uncontrolled card stretching.
- Home/Preference character layouts gain breathing room without increasing type beyond role hierarchy.
- Workspace grid shows more horizontal content, but does not create document overflow.
- Candidate and Suggestion cards use the width effectively; sticky buttons remain 52px high.
- Calendar month controls measured 40×40 and date cells about 38px high despite available width; the issue is token choice, not viewport constraint.

## Korean Wrapping

Observed:

- screen/hero titles use phrase-level wrapping; no primary CTA label split was observed.
- narrow card metadata remains on compact lines or uses intentional truncation.
- DURI/Preference long prompts wrap in readable chunks.
- no severe last-one-character orphan was captured in the primary screenshots.

P1 content issue:

- generated suggestion title `광안리을 2026-07-19로 나눠볼까요?` uses the wrong object particle.
- recommendation: all generated place-name particles must use the existing Korean particle helper or an equivalent normalized formatter. This is content correctness, not a CSS line-break issue.

The DURI `keep-all` principle should be extended to screen/section headings and primary button labels, not applied indiscriminately to dense metadata.

## Touch Targets

| Control | Observed | Target | Assessment |
|---|---:|---:|---|
| common buttons | minHeight 44/52 | >=44 | PASS |
| sticky primary | 52 | >=44 | PASS |
| bottom tabs | 64 bar | >=44 | PASS |
| calendar date | 38 high | >=44 | **P1** |
| calendar month button | 40×40 | >=44 | **P1** |
| common back visual box | 38×38 | >=44 effective | P1 unless hitSlop guarantees 44 |
| compact detail/info icons | 38×38 | >=44 effective | P1/P2 by context |
| chips | 30~40 visual | >=44 effective when isolated | verify hitSlop/group semantics |
| Workspace drag handle | slider semantic + edit alternative | alternative required | PASS |

Recommended Fix Direction: define `control.touchMin=44`; where the visual stays compact, enforce and test hitSlop/effective box. Add automated layout/accessibility checks for calendar/back/save/help.

## Focus

Runtime web pointer/touch interaction left a black browser default outline on bottom tabs and primary/sticky controls. This reproduces the prior audit concern.

Expected contract:

```text
Pointer/touch focus: no persistent black default outline
Keyboard focus-visible: 2px primary blue ring with sufficient offset/contrast
Disabled controls: not focusable where platform semantics require
```

Do not set `outline: none` globally. Use platform/web focus-visible styling and retain a visible keyboard indicator.

## Keyboard

- `Screen` uses `KeyboardAvoidingView` and `keyboardShouldPersistTaps="handled"`.
- Tab bar hides on keyboard.
- Create/Preference sticky footers did not overlap content in non-keyboard screenshots.
- Text/time/memo inputs use labelled fields and disabled/validation copy.
- A physical software-keyboard viewport and screen-reader traversal were not forced in this audit; native iOS/Android keyboard behavior remains device-smoke work.

Recommended device smoke:

1. Create Trip accommodation field with keyboard open and sticky footer.
2. Workspace schedule memo/time fields with modal resize.
3. Profile edit and document/TODO editor.
4. Preference keyboard traversal on web.

## Safe Area

- Main tabs, sticky footers and full-screen modals use safe-area components/padding.
- Workspace sheet and editor footer stayed above the 844px viewport bottom.
- Suggestion/Create/Preference primary actions did not overlap scroll content at 360/390/430.
- Invite and some feature-local modals use SafeAreaView visually but do not consistently mark modal semantics.

## Drag / Alternative Interaction

- Workspace scheduled items expose `slider` roles for start-time move and duration resize.
- Every scheduled item also exposes an `일정 편집` button with date/time text inputs and quick duration buttons.
- Candidate Sheet height handle has slider semantics; its essential candidate actions remain available without resizing.
- DAY order mentions long press; `DAY 관리` provides a button path. Verify complete keyboard/screen-reader reorder behavior on devices.

No essential primary action was found to be drag-only.

## Modal Semantics

- Several modal families correctly apply `accessibilityViewIsModal` and an accessible label.
- Invite manager appeared as generic content rather than a dialog in the runtime accessibility tree.
- modal inventory shows inconsistent adoption across Invite, My Page, Explore, Create, Trip Home legacy and filter controls.

Recommended Fix Direction: share focus containment, labelled title, modal-view semantics, close/dismiss and safe-area behavior. Keep layout-specific modal components separate.

## Contrast and Type Size

- navy/white and blue/white primary combinations appear strong.
- muted blue-gray on white is readable at body sizes.
- pastel badges frequently use 9~11px type; physical-device and WCAG contrast measurement should be part of final polish.
- avoid further reducing metadata below 11px; prefer spacing/truncation over 9px labels.

## Priority

- P0: reload hang makes accessibility loading surface non-terminating.
- P1: focus-visible, 44px touch targets, modal semantics, Korean particle correctness.
- P2: badge type/contrast measurement, icon registry, device keyboard/screen-reader smoke.
