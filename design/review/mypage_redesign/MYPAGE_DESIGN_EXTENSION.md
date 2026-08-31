# My Page Design Extension

This document extends, and does not replace, the established DURI Home and feature-screen design foundation.

## Page Role

My Page is a personal travel profile first and an account hub second. Its fixed order is:

```text
Identity → Activity → Preference → Service → Account → Danger
```

Guest is a role-specific exception:

```text
Guest Identity → Upgrade → Allowed Service → Account → Danger
```

## Shared Foundation

- Page base: White `#FFFFFF`
- Primary action: `#4388FF`
- Deep navy text: `#17265F`
- Secondary text: `#60719B`
- Muted text/icon: `#8290AE`
- Soft border: `#DCE7F7`
- Blue personal surface: `#F2F8FF`
- Lavender: `#F0EDFF`
- Mint: `#EAF7EE`
- Peach: `#FFF0E2`
- Horizontal page padding: 20
- Header height: 62
- Section interval: 24
- Card radius: 18–22
- Bottom content clearance: 112
- Minimum interactive target: 44

## Profile Identity Card

- Use the shared Avatar renderer and authoritative user state.
- Member result state: name → canonical preference title → up to three preferred tags plus `+N` → Profile Edit.
- Member empty state: name → no-result copy → Profile Edit. Never show sample tags.
- Guest state: name + `게스트` badge → benefit-led conversion copy → Profile Edit.
- Name is a single intentional line. Long names truncate rather than crowding the badge or Avatar.
- Preference type can use two lines. It must come from the canonical presentation resolver.
- Profile Edit remains a 44px target even when visually compact.

## Activity Card

- Only destinations with meaningful personal collections qualify: Trip and Saved.
- Use two equal cards in one row.
- Each card includes a soft icon circle, label + real count, destination helper, and chevron.
- Entire card is pressable and has a destination-aware accessibility label.
- Travel uses the blue surface family; Saved uses the lavender surface family.
- Preference tags are identity content and do not return as an activity metric.

## Preference Result Card

- Content order: canonical title → short canonical description → preferred tags → one detail action.
- Use up to four visible tags; represent overflow as `+#`.
- Pastel tag colors may rotate Peach, Mint, Lavender, and Blue while the card itself remains white.
- The only My Page result action is `성향 자세히 보기`.
- Retest remains in Personal Result.
- Compatibility belongs in Service.

## Preference Empty Card

- Keep the same section position as the result card.
- Use direct no-result title, short guide copy, and the existing Personal Test route.
- One small repository-owned DURI illustration is allowed.
- Do not use the reference image, cropped reference characters, or a Saved-style full-screen empty hero.

## Guest Upgrade Card

- Use a bounded Blue Soft surface, not a full-page tint.
- Content order: upgrade value title → data-retention explanation → one Primary action.
- A repository-owned DURI illustration may support the value message.
- The card is Guest-only and must route to the existing Guest Upgrade flow.
- At 360px, use deliberate benefit-copy line breaks to prevent Korean orphan characters.

## Service Menu Group

- Use one white grouped surface per section.
- Row anatomy: 32px pastel icon tile → label → chevron.
- Row minimum height: 56.
- Dividers begin after the icon column.
- Icon tiles may use semantic Blue/Mint/Peach/Lavender; do not tint the entire group.
- Render only routes allowed by the current role.

Member service order:

```text
Compatibility → Friends → Invite → Onboarding → Terms → Privacy
```

Guest service order:

```text
Invite → Terms → Privacy
```

## Account Row

- Logout lives in a separate Account group.
- Use neutral icon color and the same row geometry as Service.
- Preserve the existing immediate logout behavior.

## Danger Row

- Danger is a separate section and separate grouped surface.
- Use muted red for icon, label, and chevron.
- Copy follows actual deletion semantics: `회원 탈퇴` for Member, `게스트 계정 삭제` for Guest.
- The row opens the existing confirmation modal; it never deletes immediately.

## Responsive Rules

### 360

- Keep Avatar at 76 and truncate the name to one line.
- Balance the Member empty identity across two deliberate lines.
- Allow the canonical description and tags to wrap.
- Use deliberate four-line Guest benefit copy.
- Keep two equal Activity cards and all press targets at or above 44.

### 390

- Primary visual QA width.
- Preserve full Profile → Activity → Preference hierarchy before Service.
- Keep the fixed tab bar unchanged and content padding at 112.

### 430

- Do not enlarge Avatar or illustrations simply because more width exists.
- Let long names use the additional space.
- Keep content measure bounded by the fixed 20px page padding.

## Explicit Non-Rules

- No Settings gear without a Settings route.
- No avatar inference from name, role, gender, or profile copy.
- No preset ID in `initial` or `profileImageUrl`.
- No frontend-only preset persistence.
- No generic friend fallback.
- No Member-only menu on Guest.
- No reference screenshot or cropped reference asset in runtime UI.
- No new dependency for this screen.
