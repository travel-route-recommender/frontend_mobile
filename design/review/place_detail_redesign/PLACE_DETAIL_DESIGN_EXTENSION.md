# DURI Place Detail Design Extension

이 문서는 `design/review/home/HOME_DESIGN_FOUNDATION.md`와 `design/review/explore_redesign/EXPLORE_DESIGN_EXTENSION.md`를 대체하지 않는다. 최종 구현된 Place Detail 전용 IA, 시각 규칙, 상태 표현, component boundary만 추가한다.

## 1. Scope

- 대상: `src/features/places/screens/PlaceDetailScreen.tsx`
- 비대상: Saved, Explore list/map, Workspace, DURI Analysis, My Page
- 기준 이미지: `design/reference/place_detail_target.png`
- 보조 카드 기준: `design/image/Place_card.png`
- 기준 이미지는 구조와 위계만 참고하며 production UI에 crop 또는 background asset으로 사용하지 않는다.
- 이름, 이미지, 주소, 설명, 평점, 태그, 실용 정보, 여행 상태, 유사 장소는 현재 repository/query/store 값만 사용한다.

## 2. Page Composition

```text
Hero
→ Identity
→ Short Description
→ Trip Context? (explicit trip-scoped only)
→ Travel Action / State
→ Basic Information
→ Review Summary
→ Similar Places
```

- page base: white `#FFFFFF`
- horizontal gutter: 20px
- major section gap: 26px
- content bottom padding: 48px + Screen safe area
- 일반 정보는 white page에 직접 배치하고, 의미가 있는 context/state/info group에만 bounded surface를 사용한다.
- DURI character는 일반 Place Detail에 배치하지 않는다.

## 3. Hero

- 실제 `Place.imageUrl` 한 장을 `cover`로 렌더링한다.
- responsive height: `clamp(264px, viewport × 0.72, 300px)`
- 전체 너비를 사용하며 image 위에는 뒤로가기와 개인 저장 heart만 둔다.
- back / heart target: 46×46px, white 96% surface, pill radius
- 장소명과 metadata는 Hero 위에 중복 렌더링하지 않는다.
- Hero 아래 Identity panel은 22px overlap, 28px top radius로 이미지와 본문을 연결한다.
- 이미지 실패 시 fake photo나 reference crop을 사용하지 않고 `이미지 준비 중` neutral fallback을 표시한다.

## 4. Identity

- order: category + short location → place name → real rating + tags
- category: Peach `#FFF0E2`, text `#D67B24`, 28px pill
- short location: 실제 주소 앞 두 token, 주소가 없으면 resolved region
- name: 28/36, weight 900, maximum 2 lines, deep navy `#17265F`
- rating: 실제 finite number가 있을 때만 star + one-decimal value 표시
- tags: 최대 2개, 초과분은 실제 개수 `+N`
- tag tones: Primary Soft와 Mint를 교차 사용
- rating, tags, hidden count 중 존재하는 값만 자연스럽게 reflow한다.

## 5. Description

- 위치/주소보다 먼저 배치한다.
- 14/23, deep navy body
- 긴 설명은 3 lines로 접고 기존 `더 보기 / 접기` interaction을 유지한다.
- 실제 설명이 없으면 기존 fallback copy를 사용하며 fake 설명은 만들지 않는다.

## 6. Trip Context

- `tripId`와 `origin`이 route에 명시되고 현재 source에 trip이 있을 때만 표시한다.
- 개인 Explore/Home/Saved 진입에는 global active trip이 있더라도 context card를 강제로 표시하지 않는다.
- surface: Lavender `#F0EDFF`
- border: `#D9D5FF`
- radius: 18px
- minimum height: 88px
- content: 실제 trip title, resolved region, candidate count, unique scheduled place count
- candidate count source: `candidatesByTripId[tripId].length`
- scheduled count source: `itineraryByTripId[tripId]`의 unique `placeId`
- explicit trip route는 eligible member trip일 때 기존 active trip을 route `tripId`에 동기화해 mutation target과 화면 상태의 drift를 막는다.

## 7. Save and Travel Semantics

개인 저장과 여행 계획 상태는 서로 독립이다.

### Save Heart

- not saved: `♡`, Blue Gray
- saved: `♥`, Primary Blue `#4388FF`
- Hero 우측 상단에만 표시한다.
- 별도의 large 저장 CTA나 `저장됨` text button을 두지 않는다.

### Not Candidate

- solid Primary Blue `#4388FF`
- label: `후보에 담기 →`
- minimum height: 54px
- 개인 Explore에서 대상 trip이 없으면 기존 Candidate Trip Picker를 연다.
- fixed bottom bar 대신 본문 flow 안에 배치한다.

### Current Candidate

- Lavender surface / border
- label: `✦ 현재 여행 후보`
- right secondary action: `해제`
- 기존 `requestCandidate` mutation과 removal permission feedback을 사용한다.

### Scheduled

- Mint `#EAF7EE`, border `#CDEBDA`, text `#2E9B66`
- label: `▣ 일정 포함됨`
- mutation CTA는 제공하지 않는다.
- explicit trip context에서 기존 Workspace route를 사용할 수 있을 때만 `일정 보기`를 표시한다.

### Completed Trip

- 기존 candidate/scheduled state는 읽기 상태로 보존한다.
- 새로운 후보 추가는 neutral locked message로 막는다.
- 완료 trip의 mutation capability를 새로 만들지 않는다.

## 8. Fixed Bottom Decision

Place Detail에는 fixed bottom action bar를 사용하지 않는다.

- 저장은 Hero heart로 이동한다.
- 여행 행동은 설명/context 다음 본문에 단일 surface로 배치한다.
- 작은 viewport에서도 CTA가 설명하는 대상과 함께 읽힌다.
- modal, feedback, member gate의 기존 layering은 유지한다.
- content가 고정 바에 가려지는 문제와 별도의 128px reserve를 제거한다.

## 9. Basic Information

- heading: 19/25, weight 900
- address와 실제 `infoItems`를 한 bordered group 안에 표시한다.
- empty/generic 값은 row를 만들지 않는다.
- row order: icon → label → value
- row minimum height: 68px
- icon box: 34px, 11px radius
- semantic tone:
  - location: Primary Soft
  - time/date/closed/check-in/out: Mint
  - homepage/site: Lavender
  - phone/contact: Peach
  - other actual fields: Primary Soft information symbol
- full address는 Basic Information에만 표시하고 Identity에는 short location만 표시한다.
- 실제 capability가 없는 chevron, website open, directions action은 만들지 않는다.

## 10. Review Summary

- review entity/query가 없으므로 count, rating distribution, author, review CTA를 만들지 않는다.
- compact bordered empty state로 `아직 등록된 리뷰가 없어요.`만 표시한다.
- 새로운 review business logic을 추가하지 않는다.

## 11. Similar Places

- current `findSimilarPlaces` 결과를 최대 3개 사용한다.
- horizontal compact rail
- card width: 154–178px responsive
- structure: actual image + name + short location + save heart
- related heart는 personal saved mutation을 재사용한다.
- candidate CTA, tags, fake popularity, review data를 넣지 않는다.
- card body와 heart는 sibling controls이며 nested button을 만들지 않는다.
- related Detail href는 explicit `tripId`와 `origin`을 보존한다.
- 기존 shared legacy `PlaceCard`를 수정하지 않으므로 Saved appearance는 변하지 않는다.

## 12. Loading, Error, Missing, Fallback

- remote initial loading은 final Hero height와 rounded content panel geometry를 가진 skeleton으로 표시한다.
- loading Hero/Identity/description/action block의 크기를 final layout과 맞춰 layout shift를 줄인다.
- repository unavailable, hydration error, remote error, missing place는 기존 ErrorState/retry/back behavior를 보존한다.
- place 변경 시 Detail scroll offset을 0으로 복원한다.

## 13. Responsive Rules

- validated viewports: 360×844, 390×844, 430×844
- page gutter 20px 유지
- Hero: 264px at 360, approximately 281px at 390, 300px at 430
- place name maximum 2 lines
- short location maximum 1 line
- address value는 줄바꿈 가능하고 잘라내지 않는다.
- CTA/state bar는 available width를 사용한다.
- similar card 2개가 한 viewport 폭 안에서 비교되거나 다음 카드가 자연스럽게 이어진다.
- horizontal overflow와 fixed action overlap을 만들지 않는다.

## 14. Accessibility and Interaction

- back, hero heart: 46px targets
- primary travel action: 54px
- release/schedule secondary action: minimum 40px
- heart uses `accessibilityState.selected`
- candidate release uses selected state
- scheduled state has descriptive accessibility label
- info values remain selectable
- picker, feedback alert, member gate accessibility behavior remains shared implementation에 위임한다.

## 15. Shared Component Strategy

- data contract: existing `PlaceCardViewModel`
- mutation/gates: existing `usePlaceActions`
- trip semantics: existing `selectCandidateStateForPlace`
- picker/feedback: existing shared Place Explore Controls
- related image fallback: existing common `RemoteImage`
- full Explore card와 legacy Saved card를 Place Detail에 재사용하지 않는다.
- Place Detail-local presentation components는 Hero/Identity/Trip Context/Travel State/Info/Related density만 책임진다.
