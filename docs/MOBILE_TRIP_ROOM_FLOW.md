# 모바일 여행방 흐름

## 기준과 범위

`Frontend_new`의 `TripListPage`, `TravelRoomCard`, `NewTripPage`, `TripWizardSteps`, `TripRoomHomePage`, `TripRoomHomeSections`와 Store selector/action을 읽고 모바일 흐름의 기능 기준으로 삼았다. 웹 파일은 수정하지 않았고 HTML UI를 복사하지 않았다. Expo Router route는 선언만 담당하고 화면은 feature 아래에 둔다.

## 여행방 목록과 필터

`TripListScreen`은 `tripsById`와 중복 제거한 `tripOrder`에서 현재 `currentUserId`가 `TripMember.userId`로 참여한 방만 고른다. 진행 중, 완료, 전체 필터를 제공하며 기본값은 진행 중이다. 진행 중이 아닌 필터, 완료 필터, 전체 결과가 각각 비었을 때 서로 다른 안내를 표시한다. `api`와 `hybrid`에서는 Rooms 계약 대기 오류를 표시하고 mock 목록으로 전환하지 않는다.

정렬은 웹 기준과 같다.

- 진행 중: `status !== completed`, `startDate` 오름차순, 동률이면 한국어 제목과 ID
- 완료: `status === completed`, `endDate` 내림차순, 동률이면 한국어 제목과 ID
- 전체: 위 두 결정적 목록을 진행 중 → 완료 순서로 결합

## TripRoomCard ViewModel

`selectTripRoomCardViewModel`은 Store에 값을 다시 저장하지 않고 다음을 파생한다.

- 지역 이름과 대표 이미지
- 날짜 표시, D-day/여행 중/종료 후 경과일
- status 표시
- 유효한 멤버와 현재 사용자의 owner 여부
- 후보 수, 일정 수
- 기존 `selectRoomPreferenceResponseSummary` 기반 응답 완료 수
- 5단계 준비 진행률

없는 tripId 또는 현재 사용자가 참여하지 않은 tripId는 `undefined`다. 카드는 제목·여행지·날짜가 포함된 접근성 label, 아바타, 수치, 진행률을 한 개의 Pressable로 표시한다.

## 여행방 생성 Wizard

웹의 실제 5단계를 유지한다.

1. 여행지: `regionsById` 검색 및 Region ID 선택
2. 날짜: 시작일·종료일 선택
3. 여행 조건: 이동 방식, 예산, 일정 밀도
4. 동행자: 현재 사용자는 방장으로 고정, 나머지 demo User 선택
5. 최종 확인: 여행방 이름 입력, 모든 항목 검토와 단계별 수정

Android/iOS는 Expo SDK 57 권장 호환 버전의 `@react-native-community/datetimepicker`를 사용한다. Web export에서는 같은 컴포넌트 경계의 `YYYY-MM-DD` 입력을 사용한다. 날짜는 시간대가 섞이지 않는 date-only 문자열로 Store에 저장하며, 종료일은 시작일보다 빠를 수 없다. 지난 날짜는 여행 기록용으로 허용한다. 이름은 40자 이하이며 비우면 `${region.name} 여행`이 된다.

## CreateTripDraft와 persist

완료된 `TripRoom`과 생성 중 입력을 섞지 않는다. 별도 Zustand Store가 AsyncStorage key `duri-create-trip-draft`, version `1`로 다음만 저장한다.

- configVersion, ownerUserId, currentStep
- regionId, startDate, endDate
- transport, budgetLevel, intensity
- selectedMemberUserIds, title
- startedAt, updatedAt

root layout은 domain/auth/personal-test-draft/create-trip-draft 네 Store의 hydrate 완료를 기다린다. 버전이 맞지 않는 초안은 완료된 여행이나 성향 결과를 건드리지 않고 해당 초안만 폐기하며 안내한다. 다른 사용자 소유 초안은 이어 쓰지 않는다. 다시 진입하면 이어 쓰기 또는 새로 시작을 선택할 수 있고, 뒤로 나갈 때 저장 또는 삭제를 선택한다. 생성 오류 시 초안을 유지하고 성공한 경우에만 삭제한다.

## validation과 createTrip

각 단계는 다음 단계 진입 전에 Region 존재, ISO date-only 형식과 순서, 현재 owner 존재, 선택 User 존재 여부, 제목 길이를 검사한다. 선택 멤버는 ID 기준으로 중복을 제거하고 owner와 존재하지 않는 ID를 제외한다.

`createTrip`은 한 번의 Zustand `set`에서 고유 ID 생성, owner 자동 포함, 멤버 중복 제거, `tripsById`, 중복 없는 `tripOrder`, 빈 candidate/itinerary 관계, `activeTripId`를 함께 반영한다. 입력 객체는 수정하지 않는다. 제출 잠금으로 연속 터치 중복 생성을 막고 성공하면 `/trips/[tripId]?created=1`로 replace한다.

## 여행방 홈

`TripHomeScreen`의 섹션 순서는 다음과 같다.

1. 지역 이미지, 제목, 지역, 날짜, 기간, status, D-day, owner, 아바타 Hero
2. 워크스페이스, 장소 탐색, mock 동행자 추가 빠른 실행
3. 5단계 여행 준비 진행률
4. 기존 멤버별 응답 현황 UI
5. 기존 그룹 성향 진단 UI
6. 최근 후보 최대 3개, 추가 멤버와 일정 배치 여부
7. 날짜·시간순 일정 최대 3개와 배치 날짜 수
8. 로컬 두리 분석 가능 여부와 워크스페이스 CTA
9. 완료 여행의 읽기 중심 안내

준비 진행률은 웹과 동일하게 방 생성, 성향 응답, 후보 수집, 일정 구성, 최종 확인 5단계다. 완료는 1점, 진행 중은 0.5점, 대기는 0점으로 합산한 뒤 5로 나눈다. 응답 현황은 `selectRoomPreferenceResponseSummary`, 그룹 진단은 `diagnoseGroupPreferences`를 그대로 사용하며 Store에 응답률·진단·준비율을 저장하지 않는다.

후보는 `candidatesByTripId[tripId]`, 장소·추가자는 normalized ID 관계, 일정 배치는 itinerary placeId로 파생한다. 일정은 `itineraryByTripId[tripId]`를 날짜와 시간순으로 정렬한다. 워크스페이스에서 후보 검색·필터, 일정 추가·수정·날짜 이동·위아래 시간 재배치·삭제와 후보 제거 정책을 제공한다. 관계가 바뀌면 TripHome의 후보·일정 수와 준비 진행률은 별도 count 없이 자동 갱신된다.

## 데이터 모드

- `mock`: 기존 normalized Store를 읽고 로컬 여행방 생성·demo User 멤버 추가·AsyncStorage persist를 허용
- `api`: Rooms endpoint와 DTO 계약을 추측하지 않고 목록/상세/생성 계약 대기 오류 표시
- `hybrid`: 서버 roomId와 local roomId 연결 전까지 목록/생성을 api와 동일하게 보류; 로컬 분석과 서버 room을 임의 혼합하지 않음

mock 초대 Modal은 이미 Store에 있는 demo User만 멤버로 추가한다. 실제 사용자 검색, 초대 링크, 권한, 수락 상태, 알림은 구현하지 않았다.

## API 계약 대기와 다음 단계

Rooms API에는 내 방 목록/상세/생성/수정 DTO, status 전이, member role·권한, pagination·정렬, 날짜 정책, 서버 roomId, 오류 규격이 필요하다. Invite API에는 사용자 검색 범위, 링크/code 생성, 만료, 수락, 중복 가입, guest→member 병합 정책이 필요하다.

다음 Workspace 단계에서는 기존 route와 편집 관계를 유지하면서 두리 분석 리포트, suggestion before/after preview, fingerprint stale 검증과 원자적 apply를 연결한다. native gesture reorder는 서버 order/시간 정책과 접근성 대체 동작이 확정된 뒤 선택적으로 추가한다. 모든 mutation은 현재 tripId와 서버 계약 출처를 명시하고 mock/api 데이터를 섞지 않아야 한다.
