# Design Token Audit

## Source of Truth Reviewed

- `src/theme/tokens.ts`
- feature-local palettes in Home/Explore/Saved/Workspace/DURI/Create/Preference screens/components
- 12 design foundation/extension documents under `design/review/**`
- literal inventory across `src` and `app`

## Colors

### Current global tokens

| Token role | Current value | Note |
|---|---:|---|
| primary | `#4388FF` | matches foundation |
| primaryPressed | `#2F70E6` | coherent pressed state |
| primarySoft | `#DDEBFF` | coherent soft blue |
| text | `#243C8F` | differs from redesign dominant deep navy |
| textSecondary | `#6479A8` | differs from dominant muted blue gray |
| textMuted | `#91A3C5` | close but not foundation `#8290AE` |
| border | `#DCE8FA` | one digit-family drift from `#DCE7F7` |
| surface/background | light blue/white family | several screens override to white |

### Most frequent literals

| Count | Value | Observed role |
|---:|---:|---|
| 59 | `#17265F` | primary text/title |
| 42 | `#60719B` | secondary text |
| 36 | `#DCE7F7` | soft border |
| 17 | `#8290AE` | muted metadata |
| 17 | `#7569BE` | DURI strong |
| 16 | `#D9D5FF` | lavender border/accent |
| 15 | `#F3F1FF` | DURI/candidate surface |
| 15 | `#F2F8FF` | blue soft surface |
| 15 | `#EAF7EE` | scheduled/positive surface |
| 15 | `#FFFFFF` | explicit surface |
| 15 | `#2E9B66` | positive strong |
| 14 | `#F0EDFF` | lavender surface |
| 12 | `#4388FF` | primary blue |
| 11 | `#FFF0E2` | drafting/attention surface |
| 10 | `#735BC4` | DURI accent variant |
| 7 | `#F7FAFF` | page/soft surface |
| 6 | `#DDEBFF` | primary soft |
| 6 | `#D67B24` | attention strong |

### Fragmentation assessment

The semantic language is not actually inconsistent; implementation source of truth is. Foundation colors are repeatedly hard-coded because global tokens do not match the approved redesign. Consolidation should prefer the dominant/foundation values and keep explicit aliases for interactive states.

## Spacing

Current global scale: 4, 8, 12, 16, 20, 24, 32, 40.

Observed roles:

- page gutter: 20.
- compact inner gap: 8/12.
- card padding: 16/20.
- section gap: 24~28, with 28 often literal.
- tab bottom content: roughly 112.
- detail bottom content: 40.

Recommended: retain the numeric scale and add semantic aliases; do not introduce a new scale.

```text
spacing.page = 20
spacing.section = 24
spacing.sectionLarge = 28
spacing.card = 16
spacing.cardLarge = 20
spacing.compact = 8
spacing.inline = 12
spacing.detailBottom = 40
spacing.tabContentBottom = 112
```

## Radius

Current global scale: 10, 16, 22, 28, 999.

Direct numeric inventory:

| Radius | Occurrences |
|---:|---:|
| 5 | 1 |
| 7 | 2 |
| 8 | 1 |
| 9 | 1 |
| 10 | 5 |
| 11 | 2 |
| 12 | 10 |
| 13 | 5 |
| 14 | 10 |
| 15 | 5 |
| 16 | 13 |
| 18 | 21 |
| 20 | 6 |
| 22 | 10 |

`18` is the most frequent direct card radius but is absent from the global scale. `14` is common for inputs/compact cards and is also absent. This explains repeated local literals.

Recommended role set:

```text
radius.controlCompact = 12
radius.input = 14
radius.button = 16
radius.card = 18
radius.cardLarge = 22
radius.sheet = 28
radius.pill = 999
```

Migrate based on semantic role. Do not mechanically replace 13/15 with a neighbor without visual review.

## Typography

### Current global roles

| Role | Size / line / weight |
|---|---|
| display | 28 / 36 / 800 |
| title | 22 / 29 / 800 |
| subtitle | 17 / 24 / 700 |
| body | 15 / 22 / regular |
| bodyStrong | 15 / 22 / 700 |
| caption | 12 / 18 / 600 |
| button | 16 / 22 / 800 |

### Direct fontSize inventory

Values observed: 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 34, 36, 38, 40, 44, 54.

Most frequent: 11 (55), 10 (48), 13 (48), 12 (45), 14 (31), 18 (22). Small labels dominate the literal inventory and are the highest accessibility risk.

Recommended roles:

```text
typography.display        30/38/800   # limited hero/question use
typography.screenTitle    28/36/800
typography.sectionTitle   20/28/800
typography.cardTitle      17/24/700
typography.body           15/22/400
typography.bodyStrong     15/22/700
typography.supporting     13/20/500-600
typography.caption        12/18/600
typography.button         16/22/800
typography.badge          11/16/700
```

Do not force large Place hero and dense timeline labels into the same role.

## Shadows

Global `shadows.card` uses React Native shadow props/elevation 3; floating uses elevation 7. Runtime web warns that `shadow*` style props are deprecated in favor of `boxShadow`.

Visual audit confirms the intended philosophy: white surface + soft border + restrained shadow. No strong gradient or heavy 2px border system dominates. Recommendation:

```text
shadow.none
shadow.card      # subtle, preferably platform-compatible boxShadow on web
shadow.floating  # sheets/floating DURI entry only
```

Avoid adding feature-specific shadow values; retain border as the primary separation.

## Control Heights

Global tokens include touch minimum 44, tab bar 64. Direct inventory shows:

- minHeight 44: 39 occurrences.
- minHeight 52: 20.
- minHeight 40: 14.
- minHeight 38: 12.
- height 38: 8.
- height 40/42/44/48/52 and various min heights also occur.

Known 44px exceptions:

- calendar day cell: 38px.
- calendar month previous/next: 40×40.
- common header back visual box: 38×38.
- compact icons/result details: 38×38.

Recommended:

```text
control.touchMin = 44
control.field = 52
control.primaryButton = 52
control.secondaryButton = 44 or 52 by density
control.chip = 36 visual with >=44 effective hit target where isolated
control.tabBar = 64
```

## Proposed Canonical Color Set

```text
color.page              #FFFFFF
color.surface.soft      #F7FAFF
color.surface.blue      #F2F8FF
color.primary           #4388FF
color.primary.pressed   #2F70E6
color.primary.soft      #DDEBFF
color.text.primary      #17265F
color.text.secondary    #60719B
color.text.muted        #8290AE
color.border.soft       #DCE7F7
color.duri.surface      #F3F1FF
color.duri.surfaceAlt   #F0EDFF
color.duri.strong       #7569BE
color.scheduled.surface #EAF7EE
color.scheduled.strong  #2E9B66
color.attention.surface #FFF0E2
color.attention.strong  #D67B24
color.destructive       existing muted-red canonical value
color.overlay           existing overlay canonical value
```

## Migration Direction

1. Make approved foundation values the global semantic tokens.
2. Add missing role aliases for 18px card and 14px input rather than forcing existing 16/22 tokens.
3. Migrate common controls/header/screen first; then feature surfaces when they are next touched.
4. Add lint/static checks only after migration is mostly complete; a premature no-literal rule would produce noise.
5. Verify 360/390/430 screenshots and focus/touch behavior after each family migration.

No token or source change was made during this audit.
