# DURI Explore Final Redesign Report

## Before

기존 Explore는 검색 필드 아래의 큰 지도를 기본 surface로 사용하고, 장소 목록은 collapsed/half/expanded 결과 시트 안에 배치했다. 지도 키가 없는 mock/web 환경에서는 큰 빈 지도 영역과 설정 문구가 첫 viewport 대부분을 차지했다. 기존 PlaceCard는 88×88 이미지, 전체 주소, 가로 스크롤 태그, `저장`과 `여행방 후보 추가` 두 개의 동일 무게 버튼을 사용했다.

`before_explore.png`은 프로덕션 소스 수정 전에 감사 단계에서 확인한 동일 390×844 mock 상태를 요청 경로에 보존한 baseline이다.

## IA Changes

최종 기본 구조는 다음과 같다.

```text
탐색 Header
→ Search
→ Trip Context (trip-scoped only)
→ Region / Filter / Map
→ Result Summary / Sort
→ Explore Place Cards
→ Bottom Navigation (personal Explore only)
```

- 기본 진입을 map-first에서 list-first로 변경했다.
- 지도는 `지도` secondary action을 눌렀을 때 기존 map + draggable result sheet 구조로 진입한다.
- 지도 mode에 `목록 보기`를 추가해 장소 목록으로 즉시 돌아올 수 있다.
- 지도 키가 없어도 list mode는 지도 surface를 렌더링하지 않으므로 검색과 카드 탐색이 정상 동작한다.
- 개인 Explore에는 trip context를 표시하지 않는다.
- trip-scoped Explore는 검색 바로 아래에 실제 여행방 이름, 지역, 후보 수, 일정 수를 표시한다.
- 후보 대상 여행방을 검색 조건과 분리했다. Explore에서는 Filter Sheet의 여행방 선택 영역을 숨기고, 개인 탐색의 후보 행동은 기존 Candidate Trip Picker를 사용한다.
- 결과 문구를 `부산에서 둘러볼 장소 6곳`처럼 지역과 실제 결과 수가 한 문장에 보이도록 변경했다.
- 실제 popularity algorithm이 없는 기존 입력 순서는 `인기순` 대신 `기본순`으로 표현한다. 나머지는 `리뷰 높은 순`, `가까운 순`이다.

## Place Card

`design/image/Place_card.png`를 구조 reference로 사용하되 이미지를 crop해 UI로 사용하지 않았다. 모든 surface, 텍스트, badge, heart, tag, action과 semantic state는 React Native component와 StyleSheet로 구현했다.

최종 Explore 전용 카드:

- white surface, `#DCE7F7` border, 18px radius, 기존 `shadows.card`
- 실제 장소 이미지 104×160, cover, 14px radius, 기존 `RemoteImage` fallback
- 오른쪽 상단 category badge와 save heart
- 장소명 17/22, weight 800
- 전체 도로명주소 대신 주소 앞 두 토큰과 category를 사용한 `부산 사하구 · 문화마을` 형식
- 실제 rating이 숫자로 존재할 때만 표시
- tag 최대 2개와 실제 초과 수 `+N`
- 다른 여행 후보 관계는 작은 secondary text로 축소
- 오른쪽 정보 컬럼 하단에 후보/상태 control 배치
- 이미지와 정보 본문이 Place Detail로 이동하고, heart와 candidate action은 형제 control로 독립 동작

390×844 개인 Explore 첫 viewport에는 2개의 카드 전체와 3번째 카드 일부가 보여 비교 화면의 밀도 목표를 충족한다.

## State Semantics

### Saved

- 개인 저장은 우측 상단 heart 하나로 표현한다.
- 미저장 `♡`, 저장 `♥`를 사용한다.
- 저장된 heart는 Primary Blue `#4388FF`다.
- 후보·일정 상태와 독립적으로 표시된다.

### Not Candidate

- 실행 가능한 주요 행동은 solid Primary Blue `후보에 담기 →`다.
- 개인 Explore에서는 기존 Candidate Trip Picker를 연다.
- trip-scoped Explore에서는 기존 활성 여행방 비즈니스 로직을 사용한다.

### Current Candidate

- Lavender `#F0EDFF` surface와 `#D9D5FF` border를 사용한다.
- `✦ 현재 여행 후보`와 secondary `해제`를 한 상태 bar에 표시한다.
- 해제는 기존 candidate removal logic을 그대로 호출한다.

### Scheduled

- Mint `#EAF7EE` surface와 `#2E9B66` text를 사용한다.
- `▣ 일정 포함됨`을 완료형 read-only state로 표시한다.
- 기존 scheduled 판정과 disabled semantics를 유지한다.

## Data Integrity

- 장소 repository/query, mock/API/hybrid 선택 정책을 변경하지 않았다.
- 카드의 이름, 이미지, category, address, rating, tags, saved, candidate, scheduled는 기존 ViewModel과 store 값만 사용한다.
- mock에서 실제 rating이 존재해 4.9/4.8 등의 값이 보이며 임의 rating은 추가하지 않았다.
- rating이 없는 Place는 rating 영역을 렌더링하지 않고 metadata가 자연스럽게 reflow된다.
- tag는 ViewModel의 중복 제거 결과에서 최대 2개만 표시하고 초과 개수는 실제 배열 길이에서 계산한다.
- trip context의 후보 수는 `candidatesByTripId`, 일정 수는 `itineraryByTripId`의 고유 `placeId`에서 계산한다.
- fake place, fake state, mock fixture 변경은 없다.

## Preserved Features

다음 기존 기능을 유지하고 실제 UI로 확인했다.

- 장소 검색과 연관 검색어
- 지역 선택과 다중 지역 데이터 계약
- category/classification/event filter
- 기본/평점/거리 정렬과 거리 기준 장소 sheet
- personal Saved toggle
- candidate/scheduled 판정과 mutation gate
- Candidate Trip Picker
- trip-scoped Explore 및 origin 기반 return navigation
- map marker/result sheet mode
- Place Detail navigation과 back
- pagination/backend load-more
- guest/member gate
- loading/error/empty state rendering
- 공용 feedback banner

## Shared Component Strategy

기존 `src/features/places/components/PlaceCard.tsx`는 수정하지 않았다. 따라서 Saved와 Place Detail의 유사 장소 appearance는 이번 작업으로 바뀌지 않는다.

Explore 전용 `ExplorePlaceCard`를 새로 만들고 `ExploreScreen`에서만 사용한다. 데이터 계약은 기존 `PlaceCardViewModel`과 `usePlaceActions`를 그대로 재사용한다. 향후 Saved/Place Detail redesign 시 base token과 semantic state만 선택적으로 확장할 수 있다.

공유 `PlaceExploreControls`에는 다음처럼 비파괴적인 변경만 적용했다.

- 실제 정렬 의미에 맞는 label
- 검색 버튼의 사용자 행동 중심 accessibility label
- `showTripTarget` optional prop; 기본값은 `true`, Explore만 `false`
- Filter Sheet의 white surface override

## Visual Iterations

### Iteration 1

- list-first IA, 지역/필터/지도 row, 결과 summary, Explore 전용 카드 적용
- 저장을 heart로 이동하고 card action을 단일 후보 CTA로 축소
- 문제: 후보 action이 카드 전체 폭을 사용해 reference보다 이미지와 정보의 결속이 약했다.

### Iteration 2

- 실제 이미지를 카드 전체 높이의 좌측 column으로 확장
- 후보/후보 해제/일정 포함 control을 우측 정보 column 하단으로 이동
- 카드 높이와 gap을 보정해 약 2~3개 비교 밀도 확보
- Lavender candidate, Mint scheduled, Primary candidate action을 실제 trip state로 확인

추가 3차 시각 변경은 필요하지 않았다. 마지막 변경은 카드 본문과 내부 action의 interaction 영역을 명확히 한 동작 보정이며 시각값은 Iteration 2와 같다.

## Responsive

| Width | 결과 |
|---:|---|
| 360×844 | PASS. 검색, 3개 control, 결과/정렬, 104px 이미지, 긴 장소명, heart와 CTA가 잘림 없이 표시된다. |
| 390×844 | PASS. 기준 viewport에서 카드 2개 전체와 3번째 일부가 보이고 Bottom Tab과 겹치지 않는다. |
| 430×844 | PASS. 여유 폭을 카드 정보 column이 사용하며 지나친 stretching이나 action 분리가 없다. |

반응형 캡처:

- `explore_final_360.png`
- `explore_final_390.png`
- `explore_final_430.png`

상태 캡처:

- `place_card_default.png`
- `place_card_saved.png`
- `place_card_candidate.png`
- `place_card_scheduled.png`

## Tests

### Automated

- `npm run typecheck` — PASS
- `npm run lint` — PASS, 0 errors / 0 warnings
- `npm run verify:place-flow` — PASS
  - search
  - region
  - classification
  - sorting
  - scheduled state
  - region alias assertions

### Browser interaction

- 연관 검색어 `감천문화마을` 노출 — PASS
- 저장 heart toggle 후 원상 복구 — PASS
- heart 동작 중 Place Detail 이동 없음 — PASS
- 후보 CTA → Candidate Trip Picker — PASS
- 후보 CTA 동작 중 Place Detail 이동 없음 — PASS
- 카드 이미지/정보 본문 → `/places/gamcheon` → Explore 복귀 — PASS
- Filter Sheet에서 trip target 중복 제거, 실제 filter 유지 — PASS
- `기본순 / 리뷰 높은 순 / 가까운 순` 노출 — PASS
- 지도 mode 진입, 기존 map/result sheet, 목록 복귀 — PASS
- trip context `부산 1박 2일 여행 · 후보 6 · 일정 3` — PASS

## Remaining Issues

- 현재 로컬 환경에는 Kakao JavaScript key가 없어 지도 mode 자체에는 기존 key 안내가 표시된다. 기본 list 탐색에는 영향을 주지 않는다.
- mock mode에는 backend classification tree가 없어 Filter Sheet의 상세 테마는 기존 unavailable 안내를 표시한다.
- 지도 mode는 기존 draggable result sheet 구조를 유지한다. 이번 범위는 list-first 전환이며 map mode 자체의 대규모 redesign은 하지 않았다.
- Candidate Trip Picker와 feedback component는 기능 연결만 확인했으며 별도 redesign하지 않았다.

## Modified Production Files

- `src/features/explore/screens/ExploreScreen.tsx`
- `src/features/explore/components/ExplorePlaceCard.tsx`
- `src/features/places/components/PlaceExploreControls.tsx`

Place Detail, Saved, Workspace, DURI Analysis, My Page source는 수정하지 않았다.
