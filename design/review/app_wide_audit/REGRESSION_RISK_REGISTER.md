# Regression Risk Register

Priority reflects likelihood × user impact during common-component polish or backend integration.

| Contract | Current Source | Consumers | Risk | Recommended Regression Test |
|---|---|---|---|---|
| Protected deep-link/reload settles | `app/_layout.tsx`, auth/domain hydration hooks | every protected route | **P0 current failure**: indefinite global loading | Member and Guest cold-load `/trips/:id`, `/workspace`, `/places/:id`; assert route or actionable error within timeout |
| Invite management is owner-only | Trip detail quick actions, `TripInviteManagerModal`, invite service/store | Trip Home mock/API | **P0 current failure**: participant/Guest sees rotate/disable | capability matrix UI test + API 403 for non-owner; owner view/share/rotate/disable success |
| Place relation is canonical | `placeSelectors.ts`, Workspace selectors, place actions | Explore, Detail, Saved, Workspace | P1: backend DTO mapping could fork candidate/scheduled meaning | fixture matrix for not-added/candidate/scheduled once/multiple across all four consumers |
| Saved is independent from candidate | saved state + place relation selectors | Explore/Detail/Saved | P1: combined API response may conflate personal/team state | save/un-save must not alter candidate/schedule and vice versa |
| Scheduled means count >=1, not add-block | relation selectors, workspace schedule service | Place CTA, Workspace duplicate add | P1: backend “already exists” rule could break duplicate scheduling | add same place at second non-conflicting time; relation reports count 2 |
| Workspace read-only capability | `workspaceCapabilities.ts`, mutation services | grid, candidate, editor, DURI apply | P0/P1: UI-only blocking can be bypassed by API | completed/read-only matrix: add/duplicate/drag/resize/save/delete rejected; view/scroll/DAY switch allowed |
| Suggestion preview and apply use same engine | DURI generation/apply services | Analysis, Preview, Workspace | P1: server recompute could differ from preview | apply exact preview fingerprint/change set or reject stale atomically |
| Suggestion stale fingerprint blocks apply | analysis snapshot/fingerprint | Preview apply | P1: concurrent schedule edits | generate→edit schedule→apply; assert no partial mutation and actionable stale copy |
| DURI entry state is consistent | `duriWorkspaceAction.ts` | Trip Home, Workspace | P1: partial API analysis metadata | 0 itinerary/no result/valid/stale four-state table |
| DURI time proposal is plausible | suggestion generation | Analysis/Preview/Apply | **P1 current issue**: automatic 00:00 placement | empty-day fixtures enforce configurable waking-hours or require explicit user confirmation for boundary hours |
| Korean place particle formatting | Korean particle helper / generated titles | DURI suggestion copy, candidate copy | **P1 current issue**: `광안리을` | 받침/무받침/Latin/numeric place-name snapshot tests |
| Canonical preference presentation | preference presentation resolver | My Page, Result, Trip Home | P1: backend profiles may expose conflicting labels | same user result renders same profileType/tags in all consumers |
| Canonical/detailed result pair coherence | `resolve-preference-result-pair.ts` | Result detail | P1: stale detail can attach to new result | same user with old/new completedAt; only exact pair accepted |
| Retest preserves old result until success | preference draft/result stores | Result, Question, My Page | P1: optimistic overwrite could erase stable result | start/cancel/reload retest keeps old result; successful completion swaps atomically |
| Create eligible companions | `eligibleCompanionMembers.ts` | Create Companions | P1: server search can leak unrelated users | owner excluded, accepted friends included, unrelated excluded, 0-friend state allowed |
| Create draft belongs to current user | draft store + local private data activation | Create Wizard, auth switching | P1 privacy: account-switch draft bleed | create draft A→logout→login B; B cannot see A; A resumes correct step |
| Preference draft belongs to current user | preference draft store + private data policy | Personal Test, auth switching | P1 privacy/result mix | same account-switch isolation and completed-result preservation |
| Guest→Member migration preserves allowed data | auth/local private data policy | My Page, trips, saved, drafts | BACKEND-REVERIFY | upgrade guest; allowed trip membership/drafts migrate once, credentials/private data remain isolated |
| Create Trip is atomic | room service/mapper/API | Create Review, Trip List | BACKEND-REVERIFY | double-click/network retry creates one room; owner/member/date facts coherent |
| Workspace API authorization mirrors UI | workspace API/service | Workspace editors, DURI apply | BACKEND-REVERIFY | participant/guest/completed role matrix at endpoint level |
| Invite invalidation is shared across devices | invite API/store | join flow, manager | BACKEND-REVERIFY | rotate/disable then old code fails on a second device; new code succeeds |
| Optional Place fields do not fabricate data | place API mapper/presentation | Explore, Detail, Saved | BACKEND-REVERIFY | null rating/image/openingHours/address; layout shows honest fallback, no fake number |
| Analysis unavailable/partial is explicit | DURI API mapper | Trip Home, Workspace, Analysis | BACKEND-REVERIFY | capability absent/error/partial source; no stale result labelled fresh |
| Modal accessibility contract | modal implementations | Invite, Create exit, Preference, Workspace, documents/TODO | P1 | screen-reader tree exposes one labelled modal; focus returns to trigger on close |
| Focus-visible contract | common/local controls, tabs | web all screens | P1 | pointer click no black outline; Tab navigation shows primary-blue ring |
| Touch minimum | controls/calendar/header/chips | mobile all screens | P1 | layout test or accessibility audit verifies >=44 effective targets |
| Runtime asset registry | asset imports | Home/My Page/Saved/DURI/Trip | P1 packaging | static check forbids `src/** -> design/image/**`; all registered assets bundle in Android/iOS/Web |

## Backend Integration Gates

Before calling the frontend backend-ready:

1. P0 reload and invite capability tests must pass in mock and API environments.
2. `verify:api-trip-contract` must run with approved non-production credentials.
3. Workspace/suggestion server mutations must enforce the same role/read-only/fingerprint contracts as the UI.
4. Preference/Create/Guest migration must be account-isolated and atomic.
5. optional/null Place and media payloads must be exercised, not only happy-path fixtures.

## Common-polish Gates

- Token migration must not change place relation, lifecycle, or role-driven color semantics.
- Header consolidation must preserve direct-entry back fallback.
- Sticky footer consolidation must be tested at 360/390/430 with keyboard.
- Modal consolidation must preserve destructive confirmation and focus return.
- Card consolidation should not merge Place and Trip domain components.
