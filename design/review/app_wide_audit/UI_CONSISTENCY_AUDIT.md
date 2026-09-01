# App-wide UI Consistency Audit

## 1. Executive Summary

20개 primary 화면과 360/390/430 대표 상태를 함께 비교한 결과, DURI의 시각 언어는 macro level에서 일관적이다. white surface, navy information, blue action, lavender DURI/candidate, mint scheduled/positive, peach drafting/attention이 대부분 유지된다. 가장 큰 디자인 부채는 개별 화면의 품질이 아니라 foundation token과 구현 token의 이중화, feature-local header/modal/sticky-footer, focus/touch 접근성 contract 부재다.

Design readiness는 **PARTIAL**이다. P0 functional blocker와 별개로, P1 공통 polish를 마치면 새로운 redesign 없이도 design-ready 상태로 갈 수 있다.

## 2. Current Design Language

| Semantic | Foundation / dominant value | Current use | Assessment |
|---|---:|---|---|
| Page / surface | `#FFFFFF` | 모든 주요 redesign | 일관 |
| Primary information | `#17265F` | 제목 59회 literal | 일관하나 global token과 불일치 |
| Primary action | `#4388FF` | CTA, selected tab/chip | 일관 |
| Secondary/meta | `#60719B`, `#8290AE` | 설명·metadata | 일관하나 token 별칭 분산 |
| Soft border | `#DCE7F7` | cards/input/divider | 일관하나 token은 `#DCE8FA` |
| DURI / candidate | `#F0EDFF`, `#F3F1FF`, `#7569BE` | DURI hero, candidate | 대체로 일관 |
| Scheduled / positive | `#EAF7EE`, `#2E9B66` | 일정 card, complete | 일관 |
| Draft / attention | `#FFF0E2`, `#D67B24` | lifecycle, issue | 일관 |
| Destructive | muted red token | delete/disable | 의미는 일관, modal contract 분산 |
| Save | `♡` / `♥` | Explore, Saved, Detail | 일관 |

## 3. Page Foundation

| Screen family | Page padding | Header height/family | Section gap | Bottom/inset | Notes |
|---|---:|---|---:|---|---|
| Home | 20 | feature hero header | 24~28 | tab + 112 | white base, content hierarchy clear |
| Explore | 20 | title/search block | 16~24 | tab + 112 | filter controls compact |
| Trip List | 20 | title + right action | 20~24 | tab + 112 | list/empty both stable |
| Saved | 20 | title block | 20~24 | tab + 112 | true empty has CTA/character |
| My Page | 20 | title/profile card | 20~28 | tab + 112 | long service list scroll stable |
| Trip Home | 20 | detail back/header | 24~28 | 40 | no bottom tab, correct |
| Workspace | 20 shell, grid full-width | `AppHeader` family | 12~20 | sheet/DURI overlay | multi-layer tool surface |
| DURI / Suggestion | 20 | back + centered/left title | 20~24 | suggestion sticky 12+safe | same report family |
| Create Trip | 20 | wizard header | 16~24 | 64~76 sticky | step shell consistent |
| Preference | 20 | test header | 16~24 | 64~76 sticky | progress + question stable |
| Place Detail | full-bleed hero + 20 body | overlay back/save | 20~24 | 40 | deliberate distinct detail family |

`Screen` 기본 background는 token `colors.background`이지만 redesign screen 다수가 white를 직접 사용한다. 공통 원인은 screen-role token 부재이며, 개별 화면마다 이슈로 세지 않는다.

## 4. Header

- `AppHeader`는 back 38×38 visual box, title/subtitle, optional right action을 제공한다.
- Trip Home은 hero/detail header, Workspace/DURI는 app header, Suggestion은 compact report header, Create Trip은 progress wizard header, Preference는 test progress header, Place Detail은 overlay controls를 쓴다.
- 이 차이 자체는 도메인 목적상 타당하다. 다만 back hit target, safe-area inset, title role, right-action alignment를 공유하는 `HeaderContract`가 없다.
- P1: common back box가 38px이며 일부 header는 별도 `Pressable`을 사용한다. 최소 44px effective target과 focus-visible을 공통화한다.
- P2: title typography는 22/28/30px 축으로 정리하되 Place hero와 Preference question은 별도 semantic role로 유지한다.

## 5. Typography

Global token은 display 28/36/800, title 22/29/800, subtitle 17/24/700, body 15/22, bodyStrong 15/22/700, caption 12/18/600, button 16/22/800이다. 그러나 직접 fontSize는 9~54의 30개 값에 분포한다.

| Role | Dominant current | Deviation |
|---|---|---|
| Screen title | 22~28 / 800 | 24, 26, 28이 feature-local |
| Hero title | 28~30 / 800 | Home/Preference/Place에서 합리적 차이 |
| Section title | 17~20 / 700~800 | 18/19/20 분산 |
| Card title | 15~18 / 700~800 | domain density에 따라 분산 |
| Body | 14~15 / 20~22 | 비교적 안정 |
| Supporting | 12~14 / 18~20 | 12/13/14가 같은 metadata 역할에 혼용 |
| Caption/badge | 9~12 / 600~800 | 9/10px는 작은 viewport에서 가독성 위험 |
| Button | 14~16 / 700~800 | sticky primary는 16, compact card CTA는 14 |

P1은 “값이 많다”가 아니라 role token을 쓰지 않아 동일 역할의 수정이 앱 전역으로 전달되지 않는 점이다.

## 6. Color Semantics

- Primary blue는 Home CTA, Trip card CTA, Workspace add, Create/Preference next, Suggestion apply에서 동일 family다.
- Lavender는 DURI report, candidate sheet, personal soft context에 집중되어 장식 남용이 크지 않다.
- Mint는 scheduled/complete/positive에 쓰이며 candidate와 scheduled가 뒤집힌 화면은 없었다.
- Peach는 drafting/attention/조율 필요에 쓰인다.
- Deviation: global `colors.text=#243C8F`, `textSecondary=#6479A8`, `border=#DCE8FA`와 redesign dominant `#17265F`, `#60719B`, `#DCE7F7`가 이중 source of truth다.

## 7. Cards

| Card | Radius / shell tendency | Border / shadow | Assessment |
|---|---|---|---|
| Home Trip | 18~22 | soft border + light shadow | hierarchy clear |
| Explore/Saved Place | 18 | soft border + restrained shadow | sibling consistency good |
| Trip List | 18~20 | soft border, richer content | acceptable domain variant |
| Trip Home | 18~22 | white/soft blue/lavender | consistent semantic surfaces |
| My Page | 18~20 | soft border | consistent |
| DURI | 18~22 | lavender/mint/peach surface | semantic colors clear |
| Create selection | 14~16 | border selected state | denser input family |
| Preference option | 16~18 | soft border / selected blue | consistent |

Direct radius inventory is 5,7,8,9,10,11,12,13,14,15,16,18,20,22. Card consolidation candidate는 18/22, input/button 14/16, sheet 28로 좁힐 수 있다.

## 8. Buttons

- Common `PrimaryButton`, `SecondaryButton`, `IconButton`은 기본 minHeight 52/44 계열과 disabled/loading을 제공한다.
- Feature-local quick action, card CTA, compact text action, sticky footer button이 존재한다.
- Primary hierarchy는 대체로 한 화면 1개다. Explore list는 반복 card CTA이므로 page-level competing primary로 보지 않는다.
- Create, Preference, Suggestion sticky actions은 같은 blue family와 52px 높이지만 footer padding/border 구현은 별도다.
- Destructive action은 muted red이나 confirm modal 구조가 여러 feature에서 다르다.

## 9. Chips / Badges

- Filter chip은 white/selected blue, status badge는 semantic pastel, candidate는 lavender, scheduled는 mint, lifecycle draft는 peach를 쓴다.
- 형태는 pill이 지배적이며 의미 반전은 보이지 않았다.
- P2: chip/badge의 9~12px label, 28~38px 높이, border color를 `filter/status/count` 세 role로 문서화한다.

## 10. Inputs

- Common `TextField`와 feature-local search/calendar/time inputs가 공존한다.
- Search와 TextField는 52px, date cell은 38px, month button 40px, time input은 52px 계열이다.
- placeholder/error copy는 사용자 언어로 되어 있고 개발자 용어 노출은 주요 runtime에서 보이지 않았다.
- P1: web pointer interaction 후 black browser outline이 남았다. keyboard 접근성은 유지하고 `focus-visible` blue ring으로 통일해야 한다.
- P1: calendar target 38/40px는 mobile minimum 44px보다 작다.

## 11. Sticky Footer

- Schedule Edit, Suggestion, Create Trip, Preference 모두 safe-area 위 고정 action 영역을 제공하며 360/430에서 content overlap은 없었다.
- Suggestion은 secondary + primary 2-button, Create/Preference는 previous + primary 패턴이다.
- 높이/상단 border/background는 유사하지만 각 feature가 별도 구현한다.
- Shared candidate는 visual component 하나보다 `safe area + keyboard + focus + 52px control + border` contract다.

## 12. Modal / Bottom Sheet

- 17개 source file에서 React Native `Modal`을 사용한다.
- Workspace Candidate는 handle, peek/half/full, internal scroll, close/minimize가 있고 내부 구현 용어는 user copy에 노출되지 않았다.
- Workspace editor modal은 header/body/footer/safe area가 가장 완성도 높은 family다.
- Invite, My Page confirm, Explore picker, Create exit, Preference 안내 등이 별도 구현이다.
- P1: Invite modal은 accessibility tree에서 dialog로 노출되지 않았고 `accessibilityViewIsModal`이 없다.
- P0: Invite management에 owner guard가 없다. 시각적 modal 문제가 아니라 capability 문제다.

## 13. Empty / Error

- Saved true empty는 설명 + `장소 둘러보기` CTA + DURI character로 확정 원칙과 일치한다.
- Home fresh user true empty는 첫 여행 CTA를 제공한다.
- Explore pre-region/filter empty는 기능 안내 중심이며 캐릭터를 쓰지 않는다.
- Root loading은 중앙 progress 하나로 단순하지만 실제 reload에서 무기한 정지하므로 functional P0다.
- 주요 source의 ErrorState는 retry/back을 제공한다. 강제 network error fixture는 만들지 않았으며 API error는 **BACKEND-REVERIFY**다.

## 14. Character Usage

- Home hero/DURI, Trip Home, Saved true empty, DURI analysis, Create review, Preference intro/result, My Page guest/empty에서 사용된다.
- 작업 도구인 Workspace timeline에서는 character가 DURI entry banner에만 작게 제한되어 정보보다 커지지 않는다.
- 그림체는 대체로 official runtime assets와 동일하다.
- P1 asset registry: 두 컴포넌트가 `design/image/duri_no_plan.png`, `design/image/duri_analysis_planning.png`를 runtime에서 직접 require한다. screenshot/crop 재사용 증거는 없지만 production asset 경계가 부적절하다.

## 15. Bottom Navigation

- 홈/탐색/여행/저장/마이 5-tab, active blue/inactive muted, 64px family가 일관적이다.
- Detail/Workspace/DURI/Create/Preference/Place Detail에서는 bottom tab을 숨긴다. 현재 정책은 일관적이다.
- Pointer click 후 tab에 black outline이 남는 P1 focus issue가 있다.
- icon은 text glyph family이며 의미는 통일되지만 향후 official icon registry로 교체할 때 active/inactive pair를 한 source로 유지해야 한다.

## 16. Responsive

- 360/390/430에서 Home hero, Workspace, Candidate Sheet, DURI, Suggestion, Create Calendar, Preference question을 확인했다.
- representative screens의 `scrollWidth === innerWidth`; horizontal document overflow 없음.
- 360에서 chips와 candidate filters가 밀도 높지만 scroll/clip으로 접근 불가한 action은 없었다.
- 430에서 cards는 content max width를 유지하고 과도하게 늘어나지 않았다.
- Korean heading/button은 의미 단위로 wrap됐으며 primary CTA label wrap은 없었다.
- DURI-generated `광안리을`은 layout 문제가 아니라 content morphology P1다.

## 17. Accessibility

- 주요 Pressable의 back/save/radio/checkbox/toggle/selected semantics는 전반적으로 제공된다.
- Workspace drag/resize는 slider semantics와 edit modal alternative가 있어 drag-only가 아니다.
- minimum target는 common 44px가 있으나 calendar 38px, month 40px, back visual 38px 등 예외가 있다.
- modal semantics 적용이 불균일하다.
- color contrast는 주요 navy/blue/white 조합에서 육안상 충분하나 pastel 위 9~10px badge는 기기 실측이 필요하다.
- Keyboard focus는 제거하지 말아야 하며 pointer outline과 분리해야 한다.

## 18. Top Deviations

| Priority | Deviation | Evidence | Recommended Fix Direction |
|---|---|---|---|
| P1 | foundation/global token 이중화 | dominant literals vs `tokens.ts` | 실제 다수 사용값을 canonical semantic token으로 승격 |
| P1 | pointer black outline / focus contract 없음 | 390 runtime tab/sticky CTA | web `focus-visible` blue ring, pointer focus 분리 |
| P1 | 44px 미만 controls | calendar 38, month 40, back 38 | min target 또는 hitSlop contract |
| P1 | modal accessibility/structure 분산 | Invite runtime generic, 17 modal files | modal shell가 아닌 semantic/safe-area contract부터 공유 |
| P1 | runtime asset가 `design/image` 참조 | 2 direct require | approved asset registry로 이동 |
| P2 | typography/radius role fragmentation | fontSize 9~54, radius 14 values | role tokens 단계적 적용 |
| P2 | web shadow/Animated warnings | console warning | SDK57 compatible style/animation 정리 |

## 19. Proposed Design Tokens

코드에 적용하지 않은 후보값이다.

```text
color.page             #FFFFFF
color.surface.soft     #F7FAFF
color.primary          #4388FF
color.text.primary     #17265F
color.text.secondary   #60719B
color.text.muted       #8290AE
color.border.soft      #DCE7F7
color.duri.surface     #F3F1FF
color.duri.strong      #7569BE
color.positive.surface #EAF7EE
color.positive.strong  #2E9B66
color.attention.surface #FFF0E2
color.attention.strong #D67B24

spacing.page 20
spacing.section 24
spacing.card 16
spacing.compact 8

radius.card 18
radius.cardLarge 22
radius.input 14
radius.button 16
radius.sheet 28
radius.pill 999

control.touchMin 44
control.field 52
control.stickyButton 52
navigation.tabBar 64
```

Typography는 `screenTitle 28/36/800`, `sectionTitle 20/28/800`, `cardTitle 17/24/700`, `body 15/22/400`, `bodyStrong 15/22/700`, `supporting 13/20/500~600`, `caption 12/18/600`, `button 16/22/800`을 후보로 한다. hero/question은 별도 display role로 유지한다.

## 20. Priority

1. Functional P0를 먼저 해결한다. 디자인 polish만으로 release-ready가 되지 않는다.
2. focus-visible, 44px target, modal semantics, DURI content guard를 P1 공통 작업으로 묶는다.
3. dominant values를 global semantic token으로 승격하고 header/sticky/modal contract를 단계적으로 적용한다.
4. runtime asset을 official registry로 정리한다.
5. Auth 최종 UI는 backend 연동 후 별도 audit로 미룬다.
