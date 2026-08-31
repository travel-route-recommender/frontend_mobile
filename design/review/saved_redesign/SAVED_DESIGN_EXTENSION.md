# Saved Design Extension

이 문서는 기존 Home / Trip Home / Explore / Place Detail foundation을 대체하지 않는다. 개인 장소 collection인 Saved에만 필요한 확장 규칙을 기록한다.

## Saved Count

- Screen Title은 모든 상태에서 `저장`이다.
- count는 `저장한 장소 N곳` 형식으로 actual resolved count를 사용한다.
- supporting copy는 count 바로 아래에 두고 Primary Blue hero surface를 만들지 않는다.
- unresolved relation은 count/true-empty와 섞지 않고 별도 warning으로 보존한다.

## Saved Search

- Saved count가 1 이상일 때만 노출한다.
- local live filtering과 기존 검색 대상(name/address/category/summary/region/tags)을 유지한다.
- 높이 48px의 restrained outlined field를 사용한다.
- 결과 수는 query/category가 활성일 때만 표시한다.

## Saved Filter

- Saved count가 1 이상일 때만 노출한다.
- category는 actual resolved Saved places에서 파생한다.
- one-line horizontal chips와 최소 44px target을 사용한다.
- unselected는 White/subtle border, selected는 Primary Soft/Blue로 표현한다.
- true empty에는 필터를 표시하지 않는다.

## Saved Compact Place Card

- White card, 18px radius, 12px list gap, existing foundation shadow를 사용한다.
- image는 재식별에 충분한 compact portrait/square crop을 사용한다.
- title은 Deep Navy, location/category는 Muted Blue Gray다.
- 전체 주소와 summary는 Place Detail로 넘긴다.
- rating은 실제 값이 있을 때만 표시한다.
- tag는 최대 2개와 `+N`을 사용한다.
- card identity, Heart, travel action은 sibling hit targets다.

## Saved / Travel Independence

- Saved list의 Heart는 항상 filled다. `저장됨` 문구를 반복하지 않는다.
- Heart는 개인 Saved만 변경한다.
- Blue는 현재 가능한 `후보에 담기` 행동이다.
- Lavender는 visible current-trip Candidate state와 release다.
- Mint는 visible current-trip Scheduled state다.
- general Saved가 명시적 trip context를 보여주지 않을 때 add는 picker를 사용한다.
- other-trip schedule은 `다른 여행 일정 N`, candidate는 `다른 여행 후보 N`처럼 안정적으로 구분한다.

## True Empty

- 실제 Saved count가 0이고 unresolved relation도 없을 때만 사용한다.
- 동일 header와 `0곳` count를 유지한다.
- Search/Filter를 숨긴다.
- official `duri_no_plan` asset 하나만 `contain`으로 사용한다.
- CTA는 `장소 둘러보기`이며 기존 Explore route로 이동한다.
- DURI illustration은 populated, filter empty, loading, error에 사용하지 않는다.

## Filter Empty

- Search/Filter를 유지한다.
- `검색 결과 0곳`과 compact 안내를 표시한다.
- reset action은 한 곳에만 둔다.
- 큰 character illustration을 사용하지 않는다.

## Unsave Feedback

- Heart tap은 즉시 목록에서 제거한다.
- 가장 최근 제거의 Place ID/name을 짧게 유지하고 기존 Saved mutation을 반대로 호출하는 `실행 취소`를 제공한다.
- alert는 Bottom Tab 위에 배치하고 screen-reader live announcement를 제공한다.
- confirm modal은 사용하지 않는다.

## Candidate Picker Recovery

- existing candidate/scheduled rows는 관계 확인을 위해 유지한다.
- selectable trip이 하나도 없으면 `새 여행 만들기`와 `계속 탐색`을 함께 제공한다.
- 새 route나 fake selectable row를 만들지 않는다.
