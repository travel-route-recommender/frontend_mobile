# Trip List Design Extension

This document extends `design/review/home/HOME_DESIGN_FOUNDATION.md` and `design/review/trip_home_redesign/TRIP_HOME_DESIGN_EXTENSION.md` for Trip List only. It does not replace either foundation and does not change the global theme.

## 1. Product Role

- Home invites entry into the current travel context.
- Trip List compares every room the current user can access and makes the next room to continue easy to find.
- Trip Home expands one selected room into preparation and management.
- Trip List cards therefore stay denser than Home carousel cards and summarize, rather than duplicate, Trip Home.

## 2. Page Composition

```text
여행 + compact 새 여행
→ 진행 중 / 완료 / 전체 filters
→ selected-result count
→ compact Trip cards or filter-empty recovery
→ existing Bottom Navigation
```

- Page base: white.
- Horizontal padding: 20px.
- Header row: 62px minimum height.
- List card gap: 12px.
- Scroll bottom padding: 112px so content clears the unchanged tab bar.
- Populated screens use only the compact header create action; there is no repeated full-width create CTA.

## 3. Trip Filter

- Keep the existing local values and lifecycle partitions: `ongoing`, `completed`, and `all`.
- Counts always come from the current selector or API result.
- Selected: solid `#4388FF`, white text.
- Unselected: white, `#DCE7F7` border, muted blue-gray text.
- All three filters remain one row with a 44px minimum target at 360, 390, and 430px widths.
- The selected-result heading mirrors the actual filter and count: `진행 중 여행 N개`, `완료 여행 N개`, or `전체 여행 N개`.

## 4. Ongoing Trip Card

- Card surface: white, `#DCE7F7` border, 20px radius, existing `shadows.card`.
- Internal padding: 14px.
- Title: 18/24, weight 900, maximum two lines.
- Metadata: destination, stored date label, and member count in one line.
- Cover: existing Trip/Region source through `RemoteImage`; low 3.2:1 landscape ratio.
- The image is recognition support, not the dominant half of the card. Missing API images use the existing pastel DURI fallback without breaking card anatomy.
- Whole card is one press target and opens the existing Trip Home route.

Lifecycle badges reuse the foundation semantics:

| Lifecycle | Surface | Text role |
| --- | --- | --- |
| `planning` | `#F0EDFF` | lavender planning |
| `drafting` | `#FFF0E2` | peach work in progress |
| `confirmed` | `#EAF7EE` | mint confirmation |
| `completed` | neutral gray | archived completion |

Role is a smaller lavender badge. Date-derived timing remains muted secondary text and never replaces the stored lifecycle.

## 5. Completed Trip Card

- Completed cards retain identity, date, member count, optional cover, and whole-card navigation.
- The action row becomes `여행 기록 다시 보기` with a muted mint treatment.
- Candidate count, preference response, preparation percentage, and unfinished-preparation language are hidden from this summary.
- The destination remains the existing read-only Trip Home; no History route is introduced.

## 6. Trip Next Action

Trip List uses one short row and only facts available in `TripRoomCardViewModel`:

| State | Copy |
| --- | --- |
| completed lifecycle | `여행 기록 다시 보기` |
| zero candidates | `함께 가고 싶은 장소를 모아보세요` |
| candidates and zero itinerary items | `첫 일정을 만들어보세요` |
| one or more itinerary items | `일정을 계속 만들어보세요` |

The row is not a nested button. The whole card remains the single navigation target, avoiding conflicting press behavior.

## 7. Compact Metrics and Progress

- Ongoing summary format: `후보 N · 일정 N · 응답 N/N`.
- Values come from the existing card ViewModel.
- Do not use three metric tiles in Trip List.
- Do not display the weighted preparation percentage or a large progress bar. The calculation remains in the ViewModel for other consumers, but Trip List avoids contradicting Trip Home's completed-step progress contract.
- Completed cards do not show preparation metrics.

## 8. Trip True Empty

- True empty means total ongoing plus completed count equals zero.
- Filters are hidden.
- The header retains the compact `+ 새 여행` action for tab consistency.
- A soft-blue summary states `여행이 0개` and introduces the first-trip context.
- Use `assets/images/duri/trip-list/create-trip.png`, copied byte-for-byte from `design/image/create_trip.png`.
- Render with `resizeMode="contain"`, full characters and props visible, and decorative accessibility treatment.
- The contextual full-width `새 여행 만들기` CTA reuses the same create route and Member Gate as the header action.

## 9. Trip Filter Empty

- Filter empty means the total collection is nonzero while the selected lifecycle partition is empty.
- Filters and selected-result count remain visible.
- Do not use the DURI character illustration.
- Show concise functional copy and a 44px filter-switch action.
- The action changes only the current filter; it does not introduce a new route.

## 10. Data, Navigation, and Accessibility

- Store selectors, API partitioning, lifecycle, sorting, date helpers, role, member count, candidate count, itinerary count, preference count, and Member Gate remain authoritative.
- Reference sample titles, counts, dates, and destinations are never copied into production.
- Card accessibility labels include lifecycle, title, destination, dates, member count, muted timing when present, and the next-action summary.
- Color is never the only status signal; stored lifecycle labels remain visible.
- Existing Bottom Navigation, Home card, and Trip Home presentation components are not shared or restyled by this extension.

## 11. Responsive Rules

- Validate populated and true-empty states at 360, 390, and 430px widths.
- No horizontal overflow is permitted.
- Keep filters on one row and actions at least 44px high.
- Clamp title to two lines, metadata and compact metrics to one line.
- Cover height grows only through its fixed 3.2:1 ratio; wider devices do not turn the card into an image Hero.
- Empty illustration stays inside its container with `contain`; the CTA remains full width.
