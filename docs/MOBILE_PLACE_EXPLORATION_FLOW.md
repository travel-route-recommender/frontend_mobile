# 모바일 장소 탐색 흐름

## 데이터 구조와 원칙

웹 기준의 `Place`, `Region`, `TripCandidate`, `TripRoom`, `ItineraryItem`을 그대로 사용한다. Place 원본은 `placesById`, 지역은 `regionsById`, 개인 저장은 `savedPlaceIdsByUserId[userId]`, 여행 후보는 `candidatesByTripId[tripId]`, 일정 배치는 `itineraryByTripId[tripId]`에서 placeId로 연결한다. 저장과 후보는 서로 다른 관계이며 어느 한쪽의 mutation이 다른 관계를 변경하지 않는다. 카드·후보·일정에 Place 객체 전체를 복제하지 않는다.

현재 Place에는 이름, regionId, imageUrl, category, tags, rating, distanceLabel, address, summary가 있고 좌표나 source는 없다. 따라서 출처, 전화번호, 운영시간, 리뷰 수, 가격, 지도 좌표를 생성하거나 표시하지 않는다.

## 검색·필터·정렬

`normalizeSearchKeyword`는 앞뒤 공백과 연속 공백을 정리하고 한글을 유지한 채 대소문자를 무시한다. 검색 대상은 장소명, 주소, Region 이름/축약명, category, tags, summary다.

- 지역: `regionsById`의 실제 regionId, 잘못된 ID는 전체로 fallback
- 카테고리: 현재 결과 Place에 실제 존재하는 category만 노출
- 정렬: Store 기본순, 이름 가나다순, 개인 저장 우선

실제 위치, 인기도, 추천 점수가 없으므로 거리순·인기순·추천순은 제공하지 않는다. 검색 상태는 비영속 `useExploreSearchStore`에 두어 목록과 지도 화면이 keyword, regionId, category, sort를 공유한다. 앱 재시작이나 domain persist에는 저장하지 않는다.

## 목록과 지역 지도 fallback

`ExploreScreen`은 FlatList로 결과를 표시하고 상단에 검색, 활성 여행방, 지역/카테고리, 정렬, 목록/지도 전환을 둔다. `TripHome` 또는 Workspace에서 진입하면 activeTripId와 여행방 regionId를 탐색 초기값으로 설정한다. 사용자는 이후 지역을 바꿀 수 있다.

`react-native-maps`는 설치하지 않았다. 현재 Place 타입에 좌표가 없으므로 임의 marker 좌표를 만들 수 없기 때문이다. `ExploreMapScreen`은 실제 지도가 아님을 명시하는 지역별 장소 보드로 구현했으며 목록과 동일한 검색 모델을 사용한다. 지역별 실제 결과 수, 장소 선택, 상세·저장·후보 CTA를 제공한다. 향후 Place DTO에 검증 가능한 latitude/longitude가 추가되면 `parsePlaceCoordinate`를 통과한 장소만 native marker로 전환한다.

## PlaceCard ViewModel과 상세

`buildPlaceCardViewModel`은 잘못된 placeId에서 null을 반환하고 다음을 관계에서 파생한다.

- Region 이름과 category label
- 최대 3개 tag와 추가 tag 수
- 현재 사용자의 저장 여부
- 현재 사용자가 참여한 여행방의 후보 roomId
- activeTrip의 not-added/candidate/scheduled 상태

scheduled 판정은 candidate 내부 flag가 아니라 실제 itinerary placeId 관계를 우선한다. PlaceCard는 Store를 직접 읽지 않고 ViewModel과 callback만 받는다.

`PlaceDetailScreen`은 단일 실제 이미지, 이름, category, 실제 rating/distance 필드, tags, summary, address만 표시한다. 비슷한 장소는 현재 장소를 제외하고 같은 region, category, 겹치는 tag 점수로 최대 3개를 계산하며 AI 추천으로 표현하지 않는다. 잘못된 placeId는 ErrorState와 탐색 복귀 CTA를 제공한다.

## 개인 저장과 저장 화면

개인 저장은 기존 `toggleSavedPlace`를 사용한다. action은 현재 User와 Place 존재를 검증하고 `toggleUniqueId`로 중복 없는 ID 관계를 갱신한다. candidates와 itinerary는 변경하지 않는다.

정책은 다음과 같다.

- anonymous: 탐색·상세 가능, 저장·후보 추가는 Member Gate
- guest: 탐색·상세·참여 여행방 후보 추가 가능, 개인 저장은 정식 회원 전환 안내
- member: 개인 저장과 참여 중인 진행 여행방 후보 추가 가능

SavedScreen은 saved ID를 placesById로 resolve한다. 누락 ID는 유효 장소와 분리해 경고하되 관계를 자동 삭제하지 않는다. 검색, 실제 category 필터, 저장 해제, 상세, 후보 추가를 지원한다.

## 여행방 후보 선택

탐색 카드, 상세, 저장 화면, 지역 보드 preview가 같은 `AddCandidateTripPickerModal`을 사용한다. 선택 대상은 현재 사용자가 멤버인 완료되지 않은 여행방이다. 같은 Place는 서로 다른 여행방에 담을 수 있지만 같은 tripId에서는 한 개 후보 관계만 허용한다. itinerary에 이미 존재하면 scheduled로 표시하고 다시 후보로 담지 않는다.

권한과 중복은 `canAddPlaceCandidate`, `selectCandidateForPlace`, `selectCandidateStateForPlace`로 판정한 뒤 기존 `addCandidatePlace` action을 호출한다. 성공 시 activeTripId를 대상 방으로 바꾸고 feedback banner에서 Workspace로 이동할 수 있다. 후보 수, 준비 진행률, TripHome/Workspace 수치는 기존 selector가 관계에서 다시 파생하므로 별도 count를 persist하지 않는다.

후보 제거는 Workspace 후보 보드에서 제공한다. 일정에 배치된 후보는 먼저 일정을 제거하도록 차단하고, 현재 사용자가 담은 관계만 제거한다. 여러 멤버가 함께 담았다면 다른 멤버의 `addedByUserIds`와 후보는 유지하며 개인 저장에는 영향을 주지 않는다.

## 데이터 모드와 API 전환

- mock: normalized Store의 Place/Region과 저장·후보 관계 사용
- api: Places/Saves/Candidates 계약 대기 상태, mock fallback·가짜 mutation 금지
- hybrid: 서버 Place ID와 로컬 room 관계의 호환이 확인되기 전까지 api와 동일하게 차단

화면은 환경 변수를 직접 읽지 않고 `placeRepository` 정책 경계를 사용한다. 향후 검색·상세·유사 장소는 TanStack Query repository 결과로, 저장·후보는 서버 mutation으로 이동할 수 있다. endpoint와 DTO는 계약 전까지 구현하지 않는다.

## Workspace 연결과 다음 단계

후보 보드는 addedByUserIds, itinerary 기반 scheduled 상태, 권한 있는 제거, 날짜별 일정 배치와 위·아래 시간 재배치를 구현했다. Duri report, suggestion preview와 local atomic apply도 연결됐다. 다음 단계는 서버 room/place/candidate/schedule ID, batch/idempotency와 원자적 mutation 계약 확정이다.
