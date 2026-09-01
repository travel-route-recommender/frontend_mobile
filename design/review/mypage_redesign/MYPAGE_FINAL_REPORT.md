# DURI My Page Final Redesign Report

Review date: 2026-08-28<br>
Primary viewport: 390×844<br>
Responsive viewports: 360×844, 390×844, 430×844<br>
Runtime: Expo SDK 57 / React Native Web / Mock data source

## Before

The previous My Page used a full pale-blue page background and treated profile, preference, friends, account actions, and destructive actions as similarly weighted cards or large buttons. Its three activity metrics included a preference keyword count, but only the preference card had meaningful onward navigation. The first viewport therefore described the user, but still read as a control stack rather than a travel profile.

Baseline: `before_mypage.png`

## Member State

The Member information architecture is now:

```text
마이
→ Profile Identity
→ 여행 / 저장 Activity
→ 나의 여행 성향
→ 서비스
→ 계정
→ 위험 영역
→ unchanged Bottom Navigation
```

The Profile Identity card uses the current shared `Avatar`, current user name, canonical preference title, and a compact preferred-tag summary. Profile Edit still opens the existing nickname/profile-image modal. No DURI character is inferred from a name, role, or other user attribute.

## Preference Empty

A Member without a canonical result keeps the same profile/activity/service/account shell. The profile card shows only the no-result message; it does not render sample preference tags. The preference section becomes a dedicated empty card with the existing `/tests/personal` CTA and a small repository-owned DURI illustration.

The final fixture used a long nickname to validate the explicit one-line name truncation at 360px. The no-result identity copy is split into two balanced lines only at the compact breakpoint.

## Guest

Guest does not inherit the Member activity or preference composition. The page prioritizes:

```text
Guest Profile + badge
→ data-preserving Guest Upgrade card
→ Guest-allowed service rows
→ account
→ guest account deletion
```

The upgrade CTA was exercised in the running app and reached `/guest-upgrade`, backed by the existing `/(auth)/guest-upgrade` route. Guest service rows are limited to invite participation, Service Terms, and Privacy. Compatibility, Friends, and Onboarding remain hidden.

## Canonical Preference

My Page continues to call `resolvePreferencePresentation` with the same persisted result and detailed challenge/schedule inputs used by Personal Result. No My Page-only result, sample title, trait fallback, or tag list was introduced.

Runtime verification used the visible My Page title `여유로운 신중 탐색형`, opened Personal Result through the detail CTA, and confirmed that the result rendered the identical canonical title.

## Activity

Only two primary activity cards remain:

| Card | Data | Destination | Runtime result |
| --- | --- | --- | --- |
| 여행 | Trips containing the current user | `/(tabs)/trips` | `/trips` reached |
| 저장 | Current Member saved-place relation length | `/(tabs)/saved` | `/saved` reached |

The former preference-keyword metric was removed. Preferred tags are shown directly in the profile and preference areas.

## Avatar

The existing shared Avatar renderer and current `profileImageUrl`/initial state are preserved. The stable preset registry remains available with `duri-sky-scarf` and `duri-flower`, but preset selection is not connected to profile persistence because the backend contract still has no `avatarPresetId`.

No name-based, gender-based, role-based, `initial`-encoded, URL-encoded, or frontend-only preset persistence was added.

## Services

Member rows with actual destinations:

- 친구와 궁합 보기 → `/tests/compatibility`
- 친구 관리 → `/friends`
- 초대 코드로 참여 → `/(auth)/invite`
- 온보딩 안내 다시 보기 → `/(onboarding)/intro`
- 서비스 이용약관 → `/(auth)/terms?type=service`
- 개인정보 처리방침 → `/(auth)/terms?type=privacy`

Guest rows:

- 초대 코드로 참여
- 서비스 이용약관
- 개인정보 처리방침

Compatibility, Friends, and both legal destinations were exercised or route-verified in the running app. No reference-only menu item was added.

## Account / Danger

Logout is isolated in Account. Destructive actions are visually separated under Danger Area with the existing semantics:

- Member: `회원 탈퇴`
- Guest: `게스트 계정 삭제`

Both existing delete modal triggers were opened without executing deletion. Member showed `정말 탈퇴할까요?`; Guest showed `게스트 계정 삭제`. The existing Profile Edit modal also opened and closed successfully in both role checks.

## Target Deviations

- The reference gear was omitted because there is no separate Settings route.
- Reference profile characters were not copied or hard-coded. Current shared Avatar/user state remains authoritative.
- The result card does not include a decorative character because canonical identity, tags, and the detail CTA take priority and no dedicated result-card asset exists.
- Guest does not show Member Activity, Preference, Compatibility, Friends, or Onboarding, following the actual role gate instead of the reference menu breadth.
- Service icons use lightweight existing text glyphs instead of adding an icon dependency.
- The existing app Bottom Navigation was not restyled.

## Visual Iterations

- `member_iteration_1.png`: first Member implementation at 390×844.
- Member final: profile density, two actionable activity cards, compact canonical card, grouped menus.
- Preference Empty final: long-name fixture, balanced compact copy, small official DURI guide.
- Guest final: long-name fixture, visible Guest badge, role-gated services, data-preserving upgrade hero.

## Responsive

| Width | Result |
| --- | --- |
| 360 | PASS — intentional one-line long-name truncation, two-line empty identity, wrapped preference copy/tags, four-line compact Guest benefit copy, no horizontal overflow |
| 390 | PASS — primary reference comparison viewport; all primary CTAs remain above or reachable before the fixed tab bar |
| 430 | PASS — long Member/Guest names gain space, card content measure stays controlled, illustrations do not scale excessively |

Final responsive captures are included for all three states at all three widths.

## Tests

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run verify:preference-compatibility` | PASS — 42 assertions |
| `npm run verify:auth-session` | PASS |
| My Page ↔ Personal Result runtime title comparison | PASS |
| Member Trip/Saved navigation | PASS |
| Guest Upgrade visibility and route | PASS |
| Member Upgrade hidden | PASS |
| Profile Edit modal trigger | PASS |
| Member/Guest Delete modal trigger and copy | PASS |

The preference verification includes the My Page canonical display model, preferredTags keyword-count semantics, explicit demo-friend fixture behavior, zero friends for a fresh user, and no automatic preference result for a fresh user.

## Remaining Issues

- Backend-backed `avatarPresetId` persistence remains deferred by contract.
- The existing Profile Edit modal still exposes the current raw image URL field. Its larger avatar-picker redesign remains out of scope.
- Dialog keyboard/short-height polish remains a separate follow-up; this task preserved the existing modal structure and improved only the close target.

## Artifacts

- `before_mypage.png`
- `member_iteration_1.png`
- `mypage_member_final_360.png`
- `mypage_member_final_390.png`
- `mypage_member_final_430.png`
- `mypage_preference_empty_final_360.png`
- `mypage_preference_empty_final_390.png`
- `mypage_preference_empty_final_430.png`
- `mypage_guest_final_360.png`
- `mypage_guest_final_390.png`
- `mypage_guest_final_430.png`
