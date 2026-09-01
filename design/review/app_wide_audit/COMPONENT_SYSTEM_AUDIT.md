# Component System Audit

## Summary

Source inventory: 357 TS/TSX files, 101 files with `StyleSheet.create`, 63 importers of `components/common`, 17 files containing `Modal`, 24 files containing `ScrollView`, 3 files containing FlatList/SectionList. The common layer is intentionally small: `Screen`, `PrimaryButton`, `SecondaryButton`, `IconButton`, `TextField`, `AppHeader`, `Avatar`, `Card`, `Chip`, `Divider`, `RemoteImage`, `SectionHeader`.

The app does not need a single universal component for every similar shape. The highest-value work is to share behavioral/semantic contracts while preserving domain components such as Place Card and Trip Card.

| UI Pattern | Current Implementations | Consistency | Shared Candidate | Risk |
|---|---|---|---|---|
| Screen shell | common `Screen`; feature-local full-bleed/white shells | macro padding/safe area consistent | `page/background/contentInset` role props | P1 token bypass if default/background diverge |
| Header | common `AppHeader`; Trip Home hero; Place overlay; wizard; preference test; report headers | visually related, behavior differs | back target, safe area, title/right-action contract | P1 38px back/focus differences |
| Primary button | common `PrimaryButton`; card CTAs; quick actions; sticky feature buttons | blue family consistent | height/loading/disabled/focus tokens | P1 focus-visible and duplicate local styles |
| Secondary button | common outline + local text/compact actions | mostly consistent | outline/destructive/tertiary semantic variants | P2 label/height drift |
| Sticky footer | Workspace edit; Suggestion; Create; Preference | safe-area/52px family consistent | layout contract (`safeArea`, border, keyboard, button slots) | P1 separate implementations may regress overlap/focus |
| Card shell | common `Card`; Home/Place/Saved/Trip/DURI local cards | surface philosophy consistent | border/radius/shadow tokens only | P2; do not merge domain cards |
| Place card | Explore, Saved, related places | canonical relation consistent; density differs | shared relation action/badge subparts | P1 if copied state logic drifts |
| Trip card | Home compact, Trip List rich, Trip Home hero | same trip model, different tasks | shared lifecycle/count presenters | P2; universal card would be premature |
| Chip/filter | common `Chip`; Explore/Saved filters; Workspace candidates | semantic color mostly consistent | filter/status/candidate/scheduled roles | P2 height/label drift |
| Badge | lifecycle, DURI, candidate/scheduled, count | semantic meaning consistent | semantic badge tokens | P2 local styles |
| Input | common `TextField`; search; calendar; time; memo; profile | border/radius family related | field shell/focus/error contract | P1 38/40 target and web focus |
| Empty state | common feedback + feature-local Home/Saved/Explore | content principle consistent | copy/CTA/illustration slots, not one visual | P2 over-abstraction risk |
| Error/loading | common `ErrorState`, `LoadingState`; scoped loaders | common copy/retry structure | timeout/retry contract | **P0 root loading never settles** |
| Modal | Workspace frame; Invite; My Page confirms; Explore pickers; Create exit; Preference guidance | visually uneven; semantics uneven | modal a11y/safe-area/dismiss/destructive contract | P1; Invite lacks modal semantics |
| Bottom sheet | Workspace candidate; Explore filters/pickers | purpose-specific | handle/overlay/snap/scroll primitives | P2; snap behavior should stay feature-owned |
| Bottom tabs | Expo Router tab layout | single implementation | keep single source | P1 pointer outline; P2 glyph icon registry |
| Character/illustration | official assets + two `design/image` requires | visual family mostly consistent | typed runtime asset registry | P1 production/design directory coupling |

## Header Family Assessment

The following should share behavioral rules, not necessarily markup:

- Trip Home: detail/hero header.
- Workspace/DURI Analysis/Suggestion: back + title + optional subtitle/report index.
- Create Trip/Preference: back/exit + progress.
- Place Detail: full-bleed overlay.

Canonical contract candidate:

```text
effective back target >= 44
safe-area aware
screen title role and accessibility heading
optional subtitle and right action
keyboard/pointer focus-visible behavior
direct-entry fallback supplied by screen
```

## Button Family Assessment

Keep these semantic variants:

- Primary Filled: one page-level next/apply action.
- Secondary Outline: reversible/alternate action.
- Tertiary Text: compact navigation.
- Destructive: delete/disable with confirmation.
- Sticky Footer Button: layout role, not a new color role.
- Icon Button: save/back/help/more with 44px effective target.

Card-level repeated blue CTAs in Explore are list item actions and are not page-level primary conflict. Loading/disabled behavior should come from common controls or a shared state hook.

## Modal Inventory Assessment

React Native Modal appears in 17 source files. Strong implementations (`WorkspaceEditorModals`, document/TODO modals) use safe-area and `accessibilityViewIsModal`. Invite, My Page edit/delete, Explore popovers, Trip Home legacy invite, Create exit, and some filter controls vary.

High-value common contract:

- focus containment and `accessibilityViewIsModal`.
- labelled title and close action.
- outside-tap/back dismissal policy.
- safe area and max-height/internal scroll.
- footer slot with disabled/loading state.
- destructive confirm copy and irreversible action separation.

Do not force full-screen picker, compact confirm, and resizable schedule editor into one monolithic component.

## Shared Candidates

1. `HeaderContract` behavior and tokens; retain feature layouts.
2. `StickyActionBar` shell for safe-area, border, keyboard and focus.
3. `ModalSurface` accessibility/safe-area primitives; retain modal-specific body.
4. `SemanticBadge` roles: filter, lifecycle, candidate, scheduled, DURI, count.
5. `RuntimeIllustrationRegistry` under assets, removing direct `design/image` imports.
6. canonical `PlaceRelationAction` presenter used by Explore/Saved/Detail.
7. focus-visible and touch target helpers for web/native.

## Premature Abstraction Warnings

- Keep Place Card, Trip Card, DURI issue card, Preference option, and Create selection card separate. Their data density and interaction contracts differ.
- Keep Workspace candidate sheet and ordinary bottom sheets separate; snap/drag/internal scroll is tool-specific.
- Do not normalize every radius by changing all components at once. First define roles, then migrate touched surfaces.
- Do not replace domain copy with a generic empty-state string set. Share layout semantics while feature copy remains owned by the feature.

## Priority

- P0: root loading contract and Invite capability are functional, not component-polish tasks.
- P1: modal semantics, 44px target, focus-visible, runtime asset registry, header/sticky behavior.
- P2: badge/card/radius/typography migration and official icon registry.
