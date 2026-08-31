# DURI Saved Final Redesign Report

## Before

기존 Saved는 `내 여행지 / 저장한 장소 / N곳`을 큰 Primary Blue hero로 표시하고, legacy `PlaceCard`에서 `♥ 저장됨`과 여행 액션을 같은 비중의 버튼으로 반복했다. 검색과 카테고리 필터는 동작했지만 전체 주소, 모든 태그, 중립색 일정 상태가 빠른 재탐색을 방해했다. Heart를 누르면 카드가 즉시 사라졌고 되돌리기 수단이 없었다.

변경 전 390×844 mock/member 상태는 저장 장소 2곳(감천문화마을, 광안리)이었으며, 둘 다 현재 `부산 1박 2일 여행` 일정에 포함되어 있었다. 기준 화면은 `before_saved.png`에 보존했다.

## Primary State

- 모든 상태에서 Screen Title을 `저장`으로 통일했다.
- 실제 resolved Saved 수로 `저장한 장소 N곳`을 표시한다.
- White base와 20px page gutter를 사용하고, 큰 Blue hero를 제거했다.
- Saved가 1곳 이상일 때만 compact search와 one-line category chips를 노출한다.
- 검색/필터가 활성화되지 않은 기본 상태에서는 중복 결과 문장을 숨긴다.
- Bottom Tab은 기존 route/layout을 그대로 사용한다.

## True Empty

- 실제 Saved 관계와 Place entity가 모두 0개일 때만 true empty를 표시한다.
- Search와 Filter를 숨기고 동일한 `저장` header hierarchy와 `0곳` count를 유지한다.
- `design/image/duri_no_plan.png` 원본 transparent asset을 `contain`으로 사용했다.
- CTA는 기존 Explore route인 `/(tabs)/explore`로 이동한다.
- missing relation만 존재하는 경우 DURI true empty를 잘못 표시하지 않고 별도 관계 안내를 유지한다.

## Search / Filter Empty

- Saved 자체는 존재하므로 Search와 Category Filter를 그대로 유지한다.
- `검색 결과 0곳`, 간결한 안내, 단일 `조건 초기화` CTA를 제공한다.
- true empty 전용 DURI illustration은 사용하지 않는다.

## Place Card

Saved 전용 `SavedPlaceCard`를 추가해 Explore/Place Detail의 외형을 변경하지 않았다. 실제 `PlaceCardViewModel`과 기존 selectors/actions는 재사용했다.

- 92×100 recognition image
- 실제 category, place name, 짧은 시/군·구 location
- 실제 rating이 있을 때만 `★ N.N`
- tag 최대 2개와 실제 초과 수 `+N`
- 독립된 filled Heart hit target
- 별도 하단 travel state/action
- card identity는 기존 Place Detail route로 이동

## State Semantics

- Heart / Primary Blue: 개인 Saved와 현재 가능한 후보 추가 행동
- Lavender: 현재 active trip의 Candidate + `해제`
- Mint: 현재 active trip의 Scheduled + 실제 workspace route가 있는 `일정 보기`
- active trip이 보이지 않는 개인 Saved context에서는 `후보에 담기`가 특정 trip을 직접 변경하지 않고 picker를 연다.
- 다른 trip의 scheduled relation을 candidate로 축약하지 않도록 additive `scheduledTripIds` projection을 추가했다.

## Unsave

Undo를 구현했다. 기존 `toggleSavedPlace` mutation을 `usePlaceActions.toggleSaved(..., { silent: true })`로 동일하게 재사용하며 별도 Saved state를 만들지 않았다.

실제 검증 순서:

1. Saved Heart tap
2. 카드 즉시 제거와 count/category 갱신
3. `저장에서 삭제했어요. 실행 취소` alert 노출
4. `실행 취소` tap
5. 같은 Place ID 복구와 접근성 announcement 확인

Undo는 5.2초 동안 노출되며 한 번에 가장 최근 제거를 복구한다.

## Candidate Picker

- Saved의 context-free `후보에 담기`는 mock/local data에서 항상 기존 candidate picker를 연다.
- candidate/scheduled row의 기존 disabled semantics는 유지했다.
- 여행은 존재하지만 모든 row가 disabled인 상태를 실제 UI로 재현했다.
- 이 상태에서 기존 관계를 그대로 보여주면서 `새 여행 만들기`와 `계속 탐색`을 함께 제공한다.
- `새 여행 만들기`는 기존 `/trips/new` route를 재사용한다.

## Data Integrity

- fixture, backend, API contract를 수정하지 않았다.
- 장소명, count, rating, candidate/scheduled state를 hard-code하지 않았다.
- 실제 demo rating 4.9/4.8과 실제 itinerary relation만 표시했다.
- unresolved Saved IDs는 자동 삭제하지 않는다.

## Shared Components

- Saved 외형은 Saved-specific component로 격리했다.
- `usePlaceActions`에는 default behavior를 보존하는 optional silent Saved toggle과 explicit picker entry만 추가했다.
- shared picker 변경은 all-disabled recovery와 조사 처리뿐이며 기존 selectable row behavior는 그대로다.
- `PlaceCardViewModel.scheduledTripIds`는 additive selector projection이다.
- Explore와 Place Detail의 component/style은 수정하지 않았다.

## Visual Iterations

- Baseline: `before_saved.png`
- Primary iteration: `iteration_primary_1.png`
- Empty iteration: `iteration_empty_1.png`
- Final primary: `saved_primary_final_390.png`
- Final true empty: `saved_empty_final_390.png`
- Final filter empty: `saved_filter_empty.png`
- Final all-disabled picker: `saved_candidate_picker.png`
- Candidate Lavender: `saved_candidate_lavender.png`

Primary에서는 hero 제거, header/search/filter 밀도, independent Heart, actual rating/tag limit, Mint state bar를 조정했다. Empty에서는 illustration 크기, clipping, CTA hierarchy, Bottom Tab 여백을 비교했다.

## Responsive

브라우저에서 다음 CSS viewport로 primary와 true empty를 각각 확인했다.

| Width | Height | Primary | True Empty |
| --- | ---: | --- | --- |
| 360 | 800 | PASS | PASS |
| 390 | 844 | PASS | PASS |
| 430 | 932 | PASS | PASS |

Category chips는 horizontal overflow를 유지하고, card state bar는 one-line truncation을 사용하며, illustration/CTA와 Bottom Tab은 겹치지 않았다.

## Tests

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run verify:place-flow`: PASS
- `npm run verify:trip-flow`: PASS
- Browser interaction: populated, filter empty, true empty, Undo recovery, Candidate release/restore, selectable picker, context-free picker, all-disabled picker recovery PASS
- Browser console: runtime error 없음. React Native Web의 기존 shadow deprecation과 Explore sheet native-driver fallback warning만 관찰됨.

## Remaining Issues

- Saved-local data fetch가 별도로 존재하지 않아 loading은 기존 app hydration/loading boundary를 계속 사용한다. 이번 디자인 변경에서 data fetch architecture를 추가하지 않았다.
- API data source의 candidate add는 기존 server trip-explore context contract를 유지한다. Saved에서 API contract를 우회하거나 새 backend mutation을 만들지 않았다.
- Undo는 가장 최근 제거 1건을 대상으로 한다. 여러 건 동시 Undo queue는 현재 제품 범위를 넘어 추가하지 않았다.
