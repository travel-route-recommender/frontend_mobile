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

1. 여행지: `RegionService`의 인기 mock 목록·검색 결과에서 Region ID 하나 선택
2. 날짜: 월간 달력에서 시작일·종료일 범위 선택 또는 날짜 미정
3. 여행 조건: 이동 방식, 예산, 일정 밀도
4. 동행: 동행 유형 선택, 현재 사용자는 방장으로 고정, 나머지 demo User 선택
5. 최종 확인: 여행방 이름 입력, 모든 항목 검토, 항목별 edit session, 생성 완료·초대

Android/iOS/Web는 새 패키지 없이 React Native `Pressable` 기반 같은 월간 달력 UI를 사용한다. 첫 선택은 시작일, 두 번째 선택은 종료일이며 같은 날을 두 번 누르면 당일치기다. 종료일까지 고른 뒤 새 날짜를 누르면 새 범위를 시작한다. 날짜는 시간대가 섞이지 않는 date-only 문자열로 저장하며, 지난 날짜는 기존 정책대로 허용한다.

날짜 미정은 `dateUndecided: true`, `startDate: null`, `endDate: null`만 허용한다. 초기 Day mapper는 이 상태를 `draft-day-1 / Day 1 / date: null / items: []`로 만들고, 날짜가 있으면 시작일부터 종료일까지 양 끝을 포함한 Day 목록을 만든다. 현재 workspace 전체 UI는 다시 만들지 않았으며 날짜 미정 방에서는 실제 날짜를 정해야 일정 편집 보드가 열린다는 명시적 안내를 표시한다.

확인 화면에서 여행지·날짜·조건·동행을 수정하면 persisted Draft의 `currentStep`을 되돌리지 않고 local edit copy를 연다. `수정 완료`만 해당 Step의 필드를 Draft에 반영하며 취소, 헤더 뒤로가기, Android hardware back은 copy만 폐기하고 확인 화면으로 돌아간다.

## CreateTripDraft와 persist

완료된 `TripRoom`과 생성 중 입력을 섞지 않는다. 별도 Zustand Store가 AsyncStorage key `duri-create-trip-draft`, version `2`로 다음만 저장한다. version 1의 기존 초안은 날짜와 이름을 보존해 version 2 구조로 정규화한다.

- configVersion, ownerUserId, currentStep
- regionId, startDate, endDate, dateUndecided
- transport, budgetLevel, intensity
- companionType, expectedMemberCount, selectedMemberUserIds
- roomName, isRoomNameCustomized
- startedAt, updatedAt

root layout은 domain/auth/personal-test-draft/create-trip-draft 네 Store의 hydrate 완료를 기다린다. 지원하지 않는 버전의 초안은 완료된 여행이나 성향 결과를 건드리지 않고 해당 초안만 폐기하며 안내한다. 다른 사용자 소유 초안은 이어 쓰지 않는다. 다시 진입하면 이어 쓰기 또는 새로 시작을 선택할 수 있고, 뒤로 나갈 때 저장 또는 삭제를 선택한다. 생성 오류 시 초안을 유지하고 성공한 경우에만 삭제한다.

지역 선택 시 이름이 자동 상태라면 `${region.name} 여행`을 즉시 저장한다. 사용자가 이름 입력을 한 번이라도 수정하면 `isRoomNameCustomized`가 `true`가 되어 이후 지역 수정이 이름을 덮어쓰지 않는다. 이름은 공백을 허용하지 않고 기존 40자 제한을 유지한다.

## validation과 createTrip

각 단계는 다음 단계 진입 전에 Region 존재, 날짜 미정/범위의 상호 배타성, ISO date-only 형식과 순서, 동행 유형, 현재 owner, 선택 User, 공백이 아닌 이름과 40자 제한을 검사한다. 선택 멤버는 ID 기준으로 중복을 제거하고 owner와 존재하지 않는 ID를 제외한다.

`mapDraftToCreateTripRoomRequest`는 Draft를 frontend mock contract로 바꾼다. 기존 이동·예산·밀도는 `travelStyles` token과 구조화 필드를 함께 제공하고, expected member count는 별도 입력이 없으면 실제 선택된 owner+동행자 수에서 파생한다. areaCode·sigunguCode는 Region option에 실제 값이 있을 때만 전달하며 mock에서 허위 코드를 만들지 않는다.

`CreateTripRoomService`와 `useCreateTripRoomMutation`은 idle/pending/success/error와 중복 요청 잠금을 담당한다. mock adapter의 `createTrip`은 한 번의 Zustand `set`에서 고유 ID 생성, owner 자동 포함, 멤버 중복 제거, `tripsById`, 중복 없는 `tripOrder`, 빈 candidate/itinerary 관계, `activeTripId`를 함께 반영한다. 생성 실패 시 Draft를 유지하고, 성공 응답을 받은 뒤에만 Draft를 초기화한다.

성공 화면은 `https://example.invalid/invite/mock-*` 형태임을 명시한 mock 링크, Kakao placeholder, 링크 복사, 기본 공유, 여행방 이동을 제공한다. Kakao SDK가 없어도 기본 `Share` sheet로 fallback한다. `expo-clipboard`를 임의 설치하지 않았기 때문에 Web은 browser clipboard로 실제 복사하고 Android/iOS의 복사 버튼은 기본 공유 sheet를 열어 복사할 수 있도록 안내한다. native 직접 복사는 패키지 승인 후 `InviteShareService.copyLink` adapter만 교체하면 된다.

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

mock 생성 완료 화면과 초대 Modal은 기존 demo User와 mock token만 사용한다. 실제 사용자 검색, 초대 링크 발급, 만료·권한·수락 상태, 알림은 구현하지 않았다.

## API 계약 대기와 다음 단계

Rooms API에는 내 방 목록/상세/생성/수정 DTO, status 전이, member role·권한, pagination·정렬, 날짜 정책, 서버 roomId, 오류 규격이 필요하다. Invite API에는 사용자 검색 범위, 링크/code 생성, 만료, 수락, 중복 가입, guest→member 병합 정책이 필요하다.

다음 Workspace 단계에서는 기존 route와 편집 관계를 유지하면서 두리 분석 리포트, suggestion before/after preview, fingerprint stale 검증과 원자적 apply를 연결한다. native gesture reorder는 서버 order/시간 정책과 접근성 대체 동작이 확정된 뒤 선택적으로 추가한다. 모든 mutation은 현재 tripId와 서버 계약 출처를 명시하고 mock/api 데이터를 섞지 않아야 한다.
