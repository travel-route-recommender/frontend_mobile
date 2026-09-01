# DURI Explore Design Extension

이 문서는 `design/review/home/HOME_DESIGN_FOUNDATION.md`를 대체하지 않는다. 최종 구현된 Explore 전용 구성과 semantic rule만 추가한다.

## 1. Page composition

```text
Explore Header
→ Search Field
→ Trip Context Bar? (trip-scoped only)
→ Region / Filter / Map controls
→ Result Summary / Sort
→ Explore Place Cards
```

- 기본 surface: white `#FFFFFF`
- page horizontal padding: 20px
- Header minimum height: 62px
- Header title: 22/29, weight 900, `#17265F`
- card gap: 12px
- list bottom padding: 112px
- personal Explore는 기존 Bottom Tab을 유지한다.
- trip-scoped Explore는 back action과 Trip Context Bar를 표시한다.
- 기본 mode는 list이며 map은 secondary mode다.

## 2. Search Field

- minimum height: 52px
- background: white
- border: 기존 `borderStrong`
- radius: 16px
- input typography: 기존 body
- search action: Primary Blue icon
- search dropdown은 동일 field 아래 anchored overlay로 연결한다.
- expanded 상태는 field와 dropdown의 경계를 하나의 surface처럼 만든다.
- accessibility action label은 구현 provider가 아니라 `장소 검색 실행`을 사용한다.

## 3. Filter Chip and control row

- control minimum height: 40px
- radius: pill
- surface: white
- border: `#DCE7F7`
- label: 11/16, weight 800, `#60719B`
- controls: region, filter, map
- region control은 남는 너비를 사용하며 최소 100px이다.
- active filter는 Primary Blue fill과 white label을 사용한다.
- 상세 활성 조건은 30px removable chip으로 다음 줄에 표시한다.
- sort는 Result Summary 우측의 독립 control로 둔다.

`후보를 담을 여행방`은 검색 filter가 아니다. Explore에서는 Filter Sheet에 표시하지 않는다. 개인 Explore는 후보 action 이후 Candidate Trip Picker를 사용하고, trip-scoped Explore는 route context를 사용한다.

## 4. Trip Context Bar

- trip-scoped Explore에만 표시
- position: Search 바로 아래, filter controls 위
- minimum height: 76px; map compact variant 68px
- padding: 12px vertical, 16px horizontal
- radius: 18px
- surface: Lavender `#F0EDFF`
- border: `#D9D5FF`
- icon surface: white 34px circle
- eyebrow: 10/15, weight 800, Lavender text `#735BC4`
- title: 15/20, weight 900, `#17265F`
- meta: 10/15, weight 700, `#60719B`
- content: 실제 trip title, region, candidate count, unique scheduled place count
- 개인 Explore에는 임시 active trip이 store에 있어도 표시하지 않는다.

## 5. Result Summary

- format: `<지역>에서 둘러볼 장소 <N>곳`
- text: 15/21, weight 800, `#17265F`
- backend next page가 있으면 `<N>곳 이상`
- sort control은 우측 124px 영역을 사용한다.
- 실제 input order는 `기본순`, rating은 `리뷰 높은 순`, distance는 `가까운 순`으로 표시한다.

## 6. Explore Place Card

- component: `ExplorePlaceCard`
- scope: Explore only
- surface: white
- border: 1px `#DCE7F7`
- radius: 18px
- padding: 12px
- shadow: existing `shadows.card`
- minimum body height: 160px
- structure: image column 104px + 12px gap + flexible information column
- image and information body open Place Detail
- heart and candidate action remain independent sibling controls and never create nested buttons

기존 shared `PlaceCard`를 수정하지 않으므로 Saved와 Place Detail appearance는 변하지 않는다.

## 7. Place Image

- width: 104px
- height: 160px
- aspect ratio passed to `RemoteImage`: 0.65
- resize mode: cover
- radius: 14px
- fallback: existing Primary Soft `RemoteImage` fallback
- actual Place image only; reference screenshot image를 사용하지 않는다.

## 8. Place information

### Category badge

- surface: Peach `#FFF0E2`
- text: `#D67B24`
- minimum height: 26px
- horizontal padding: 10px
- radius: pill
- text: 11/16, weight 800

### Place name

- maximum: 2 lines
- 17/22, weight 800
- color: `#17265F`

### Region metadata

- format: address의 앞 두 token + category
- example: `부산 사하구 · 문화마을`
- maximum: 1 line
- 11/16, weight 600
- color: `#60719B`
- 전체 도로명주소는 Place Detail에 남긴다.

### Rating

- 숫자형 실제 rating이 있을 때만 표시한다.
- star: `#F6B83F`
- value: 11/16, weight 700, `#60719B`
- fake/default rating을 만들지 않는다.

## 9. Save Heart

- tap target: 34×34px + 8px hitSlop
- not saved: `♡`, `#60719B`
- saved: `♥`, Primary Blue `#4388FF`
- candidate/scheduled 상태와 완전히 독립
- large `저장` button을 Explore card에 사용하지 않는다.

## 10. Tag

- 기본 최대 2개
- 초과하면 실제 초과 개수를 `+N`으로 표시
- minimum height: 23px
- horizontal padding: 8px
- radius: pill
- primary-soft와 mint-soft를 번갈아 사용
- text: 10/15, weight 700
- horizontal tag scrolling을 사용하지 않는다.

## 11. Candidate State

### Not candidate

- action minimum height: 38px
- radius: 12px
- surface: Primary Blue `#4388FF`
- label: `후보에 담기 →`
- text: 13/18, weight 800, white

### Current candidate

- state surface: Lavender `#F0EDFF`
- border: `#D9D5FF`
- text/icon: `#735BC4`
- label: `✦ 현재 여행 후보`
- `해제`는 동일 bar 우측 secondary action
- 카드 전체를 Lavender로 채우지 않는다.

## 12. Scheduled State

- state surface: Mint `#EAF7EE`
- border: `#CDEBDA`
- text/icon: `#2E9B66`
- label: `▣ 일정 포함됨`
- minimum height: 38px
- mutation CTA 없음
- 카드 전체를 Mint로 채우지 않는다.

## 13. Other-trip relation

- 기존 `candidateTripIds` 데이터는 보존한다.
- active trip state가 not-added일 때 `다른 여행 후보 N`으로 축약한다.
- 10/15, weight 700, muted `#8290AE`
- 주요 content나 action보다 먼저 강조하지 않는다.

## 14. Map mode

- list mode가 기본이다.
- `지도` control로 기존 map/result sheet mode에 진입한다.
- `목록 보기`로 list mode에 복귀한다.
- trip-scoped에서는 동일 Trip Context Bar compact variant를 지도 위에도 유지한다.
- map key unavailable은 지도 mode 내부에서 안내하되 list mode를 막지 않는다.

## 15. Responsive rules

- validate: 360, 390, 430px
- page gutter 20px 유지
- 104px image width 고정, 정보 column이 남는 너비를 사용
- region control만 flex-grow
- result summary는 한 줄, sort는 124px 고정
- 장소명 최대 2줄, region metadata 1줄
- tag는 wrap 가능하되 최대 2개 + count
- Bottom Tab을 고려해 list bottom padding 112px 유지

## 16. Character usage

- 기본 Explore Place Card에는 DURI 캐릭터를 사용하지 않는다.
- 실제 장소 사진이 주인공이다.
- 향후 region-required, no-result, map-unavailable 같은 안내 상태에만 character 사용을 검토한다.
