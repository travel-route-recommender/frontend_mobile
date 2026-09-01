# Trip Home Design Extension

This document extends `design/review/home/HOME_DESIGN_FOUNDATION.md` with Trip-specific composition rules. It does not replace the Home foundation or change the global theme.

## 1. Page Composition

```text
Trip Identity
→ Next Action
→ Quick Menu
→ Preference Summary
→ Planning Summary
→ DURI Analysis
→ Travel Records
```

- Page base: white.
- Horizontal padding: 20px.
- Major section gap: 26px.
- Section heading: 19/25, weight 800, `#17265F`.
- Bottom content padding: 88px on this nested Stack screen. There is no Bottom Tab on the current route.
- Use one dominant action surface, one semantic DURI surface, compact secondary sections, and disclosure for detailed management.

## 2. Trip Identity Card

- Surface: white.
- Border: 1px `#DCE7F7`.
- Radius: existing 22px Card radius.
- Internal padding: 18px.
- Trip title: 20/27, weight 900, maximum two lines.
- Metadata: 13/19, weight 700; secondary metadata 11/17.
- Member avatars: 34px, 8px negative overlap, 2px white ring.
- Stored lifecycle badge is authoritative for capability decisions.
- Date-derived timing may appear as secondary text, but must not replace the stored lifecycle.
- Drafting uses peach, confirmed uses mint, completed uses neutral, and owner uses primary soft blue.
- Do not use a destination photo unless a future Trip Identity variant has a specific content need.

## 3. Next Action Card

- Section label: `지금 할 일`.
- Surface: `#F2F8FF`.
- Border: 1px `#CFE4FF`.
- Radius: 22px.
- Minimum height: 202px.
- Padding: 18px.
- Copy column: 59% of card width.
- Illustration: right/bottom anchored, 46% width, 170px height, `contain`.
- Primary message: 19/25, weight 900.
- CTA: solid `#4388FF`, radius 13px, minimum height 44px.
- Preparation summary format: `<completed>개 완료 · <active>개 진행 중 · <pending>개 대기` using actual state.
- The progress bar represents completed steps only. Do not mix partial active credit with a completed-step label.
- Detailed preparation steps remain behind a 44px disclosure target.

Next-action priority:

1. Completed: view itinerary/records.
2. Current member response incomplete: answer preference.
3. No candidates: collect places.
4. Candidates but no itinerary: create itinerary.
5. Populated editable itinerary: continue itinerary.

CTA copy and route must be derived in the same branch.

## 4. Quick Menu

- Contains secondary actions only. Do not duplicate the Next Action destination.
- Representative editable actions: find more places, invite companions, add a document.
- Layout: one row, equal flexible widths, 10px gap.
- Minimum height: 76px.
- Radius: 18px.
- Icon box: 30px, primary soft blue, 10px radius.
- Label: 11/15, weight 800, one line.
- On narrow widths retain three equal columns and shorten labels before changing to a two-row grid.
- Every label must predict the actual existing destination or modal.

## 5. Preference Summary

- One section heading with an actual response-count badge.
- Member summary uses equal compact cells with a 34px avatar, name, and semantic state pill.
- Complete: mint `#EAF7EE` / `#2E9B66`.
- Pending: peach `#FFF0E2` / `#D67B24`.
- Personal result action remains visible for the current completed member.
- Retest and verbose member rows remain under disclosure.
- Group insight shows one representative actual dimension, response coverage, the first shared actual tag when available, and the existing match rate.
- All group dimensions and member choices must remain available under disclosure; do not delete them to shorten Trip Home.

## 6. Planning Summary

- Candidates and itinerary belong to one section.
- Header helper: `후보 모으기 → 일정에 배치`.
- Candidate metric uses planning lavender `#F0EDFF`.
- Itinerary metric uses primary soft blue `#DDEBFF`.
- Metric cells: minimum 84px, 16px radius.
- Derived unplaced count equals candidates whose place ID is absent from current itinerary place IDs.
- Main CTA:
  - no itinerary: `일정 만들기`;
  - editable populated: `일정 계속 만들기`;
  - completed: `일정 보기`.
- Existing Explore and Planning routes remain authoritative.
- Candidate rows and itinerary rows are an expandable preview, not separate full cards.

## 7. DURI Analysis Card

- Surface: `#F3F1FF`.
- Border: 1px `#D9D5FF`.
- Radius: 22px.
- Minimum height: 224px.
- Padding: 18px.
- Copy column: 58%.
- Illustration: right/bottom anchored, 48% width, 164px height, `contain`.
- CTA: translucent white, primary outline, 43px minimum height.
- State order: no itinerary, engine unavailable, loading, stale session, current session, ready.
- No itinerary routes to the existing planning surface.
- Ready, existing, and stale states route to the existing Analysis screen.
- Loading and unavailable states are disabled and explain why.
- Never use itinerary count alone to claim that a report exists.

## 8. Travel Record Row

- Documents and TODO share one white bordered parent Card.
- Each row minimum height: 68px.
- Icon box: 36px, 10px radius.
- Title: 13/18, weight 800.
- Meta: 10/15, count: 11/16.
- A hairline `#DCE7F7` divider separates rows.
- Rows expand independently.
- Compact mode changes presentation only; existing loading, empty, populated, unavailable, permission, filter, editor, review, share, delete, and persistence behavior remains inside the expansion or modal.

## 9. Character and Image Usage

- Maximum primary character placements on Trip Home: two.
- Next Action uses the official continue-schedule image.
- DURI uses the official analysis image.
- Use `contain`, keep transparent backgrounds, and mark decorative images hidden from accessibility reading order.
- Do not infer avatar gender from names. Existing profile image/initial mapping remains authoritative.
- Do not crop a design reference screenshot into production UI.

## 10. Responsive and Accessibility Rules

- Validate at 360, 390, and 430px widths.
- Trip title: maximum two lines.
- Keep all primary and disclosure actions at least 40–44px tall.
- Keep Quick Menu labels to one line.
- Keep illustrations inside their semantic card and outside the copy column.
- Counts, lifecycle, role, completion, and analysis states must come from current stores/selectors.
- Accessibility labels should include compact row counts and expanded state.
- The final interactive content must clear the current screen's safe area and any navigation chrome actually present.
