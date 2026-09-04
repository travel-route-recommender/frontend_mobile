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
3. 여행 사실: 이동 방식, 선택 숙소 위치, 선택 종료 지점·시각·예상 이동 및 준비시간
4. 동행: 동행 유형 선택, 현재 사용자는 방장으로 고정, 나머지 demo User 선택
5. 최종 확인: 여행방 이름 입력, 모든 항목 검토, 항목별 edit session, 생성 완료·초대

Android/iOS/Web는 새 패키지 없이 React Native `Pressable` 기반 같은 월간 달력 UI를 사용한다. 첫 선택은 시작일, 두 번째 선택은 종료일이며 같은 날을 두 번 누르면 당일치기다. 종료일까지 고른 뒤 새 날짜를 누르면 새 범위를 시작한다. 날짜는 시간대가 섞이지 않는 date-only 문자열로 저장하며, 지난 날짜는 기존 정책대로 허용한다.

날짜 미정은 `dateUndecided: true`, `startDate: null`, `endDate: null`만 허용한다. 초기 Day mapper는 이 상태를 `draft-day-1 / Day 1 / date: null / items: []`로 만들고, 날짜가 있으면 시작일부터 종료일까지 양 끝을 포함한 Day 목록을 만든다. 현재 workspace 전체 UI는 다시 만들지 않았으며 날짜 미정 방에서는 실제 날짜를 정해야 일정 편집 보드가 열린다는 명시적 안내를 표시한다.

확인 화면에서 여행지·날짜·조건·동행을 수정하면 persisted Draft의 `currentStep`을 되돌리지 않고 local edit copy를 연다. `수정 완료`만 해당 Step의 필드를 Draft에 반영하며 취소, 헤더 뒤로가기, Android hardware back은 copy만 폐기하고 확인 화면으로 돌아간다.

## CreateTripDraft와 persist

완료된 `TripRoom`과 생성 중 입력을 섞지 않는다. 별도 Zustand Store가 AsyncStorage key `duri-create-trip-draft`, version `3`으로 다음만 저장한다. version 1·2의 기존 초안은 날짜와 이름을 보존하고 legacy `walking`을 `public`으로 합쳐 version 3 구조로 정규화한다. 이전 방 생성 화면의 개인 예산·일정 밀도 값은 이관하지 않는다.

- configVersion, ownerUserId, currentStep
- regionId, startDate, endDate, dateUndecided
- transport, accommodationLocation, endCondition
- companionType, expectedMemberCount, selectedMemberUserIds
- roomName, isRoomNameCustomized
- startedAt, updatedAt

root layout은 domain/auth/personal-test-draft/create-trip-draft/invite/trip-document 여섯 persisted 영역의 hydrate 완료를 기다린다. 각 영역의 진행·오류 flag는 별도 non-persist Store에 두어 storage를 읽기 전에 빈 도메인 상태를 다시 저장하지 않는다. 지원하지 않는 버전의 초안은 완료된 여행이나 성향 결과를 건드리지 않고 해당 초안만 폐기하며 안내한다. 다른 사용자 소유 초안은 이어 쓰지 않는다. 다시 진입하면 이어 쓰기 또는 새로 시작을 선택할 수 있고, 뒤로 나갈 때 저장 또는 삭제를 선택한다. 생성 오류 시 초안을 유지하고 성공한 경우에만 삭제한다.

지역 선택 시 이름이 자동 상태라면 `${region.name} 여행`을 즉시 저장한다. 사용자가 이름 입력을 한 번이라도 수정하면 `isRoomNameCustomized`가 `true`가 되어 이후 지역 수정이 이름을 덮어쓰지 않는다. 이름은 공백을 허용하지 않고 기존 40자 제한을 유지한다.

## validation과 createTrip

각 단계는 다음 단계 진입 전에 Region 존재, 날짜 미정/범위의 상호 배타성, ISO date-only 형식과 순서, 이동 방식, 숙소 길이, 종료 지점·15분 단위 마감 시각·예상 이동시간·승차/반납 준비시간, 동행 유형, 현재 owner, 선택 User, 공백이 아닌 이름과 40자 제한을 검사한다. 날짜 미정으로 바꾸면 종료 조건을 즉시 제거하며 mapper와 Store 경계에서도 함께 저장되는 것을 거부한다. 선택 멤버는 ID 기준으로 중복을 제거하고 owner와 존재하지 않는 ID를 제외한다.

`mapDraftToCreateTripRoomRequest`는 Draft를 frontend mock contract로 바꾼다. 새 방에는 `car` 또는 대중교통·도보를 뜻하는 `public`, 선택 숙소, 선택 종료 조건만 사실 정보로 전달한다. 개인 예산·일정 밀도는 각 참여자의 별도 성향 조사 결과를 사용하며 생성 request에 포함하지 않는다. 종료 조건의 이동시간은 실제 이동시간 API가 없으므로 사용자가 확인한 예상 분을 저장한다. expected member count는 별도 입력이 없으면 실제 선택된 owner+동행자 수에서 파생한다. areaCode·sigunguCode는 Region option에 실제 값이 있을 때만 전달하며 mock에서 허위 코드를 만들지 않는다.

`CreateTripRoomService`와 `useCreateTripRoomMutation`은 idle/pending/success/error와 중복 요청 잠금을 담당한다. mock adapter의 `createTrip`은 한 번의 Zustand `set`에서 고유 ID 생성, owner 자동 포함, 멤버 중복 제거, `tripsById`, 중복 없는 `tripOrder`, 빈 candidate/itinerary 관계, `activeTripId`를 함께 반영한다. 생성 실패 시 Draft를 유지하고, 성공 응답을 받은 뒤에만 Draft를 초기화한다.

성공 화면과 여행방 초대 Modal은 API 서버의 HTTPS 초대 링크, OS 공유 창, `expo-clipboard` 복사와 여행방 이동을 제공한다. 설치된 앱에서는 Android App Link/iOS Universal Link가 초대 화면을 열며, 기존 `tripmatch://invite/{code}`도 호환한다. Web Share에는 HTTPS 주소만 `url` 필드로 전달해 `Invalid URL` 오류를 막는다. 별도 카카오톡 버튼은 OS 공유와 중복되므로 제공하지 않는다. 상세 배포 조건은 `MOBILE_INVITE_LINK_FLOW.md`를 따른다.

## 여행방 홈

`TripHomeScreen`의 섹션 순서는 다음과 같다.

1. 지역 이미지, 제목, 지역, 날짜, 기간, status, D-day, owner, 아바타 Hero
2. 워크스페이스, 장소 탐색, 초대 링크 관리 빠른 실행
3. 5단계 여행 준비 진행률
4. 기존 멤버별 응답 현황 UI
5. 기존 그룹 성향 진단 UI
6. 로컬 예약·티켓 문서함
7. 최근 후보 최대 3개, 추가 멤버와 일정 배치 여부
8. 날짜·시간순 일정 최대 3개와 배치 날짜 수
9. 로컬 두리 분석 가능 여부와 워크스페이스 CTA
10. 완료 여행의 읽기 중심 안내

준비 진행률은 웹과 동일하게 방 생성, 성향 응답, 후보 수집, 일정 구성, 최종 확인 5단계다. 완료는 1점, 진행 중은 0.5점, 대기는 0점으로 합산한 뒤 5로 나눈다. 응답 현황은 `selectRoomPreferenceResponseSummary`, 그룹 진단은 `diagnoseGroupPreferences`를 그대로 사용하며 Store에 응답률·진단·준비율을 저장하지 않는다.

후보는 `candidatesByTripId[tripId]`, 장소·추가자는 normalized ID 관계, 일정 배치는 itinerary placeId로 파생한다. 일정은 `itineraryByTripId[tripId]`를 날짜와 시간순으로 정렬한다. 워크스페이스에서 후보 검색·필터, 일정 추가·수정·날짜 이동·위아래 시간 재배치·삭제와 후보 제거 정책을 제공한다. 관계가 바뀌면 TripHome의 후보·일정 수와 준비 진행률은 별도 count 없이 자동 갱신된다.

## 데이터 모드

- `mock`: 기존 normalized Store를 읽고 로컬 여행방 생성·demo User 멤버 추가·AsyncStorage persist를 허용
- `api`: Rooms endpoint와 DTO 계약을 추측하지 않고 목록/상세/생성 계약 대기 오류 표시
- `hybrid`: 서버 roomId와 local roomId 연결 전까지 목록/생성을 api와 동일하게 보류; 로컬 분석과 서버 room을 임의 혼합하지 않음

mock 생성 완료 화면과 초대 Modal은 여행방별 로컬 code/revision을 발급하고, 교체·중지 상태를 `duri-trip-invites`에 저장한다. API 모드는 서버가 링크 발급·교체·미리보기·수락·게스트 참여와 중복 가입 방지를 담당하므로 다른 기기에서도 같은 여행방에 참여할 수 있다.

## 예약·티켓 문서함

여행방 홈은 숙소 예약, 입장권, 기차·버스표, 렌터카 확인서와 기타 PDF·이미지를 15MB까지 추가하는 기기 전용 문서함을 제공한다. native는 Expo document directory 아래 앱 전용 경로로 복사하며, Web Blob은 현재 브라우저 탭에서만 유지되고 새로고침 시 제거된다. 일정 편집 Modal에서 문서를 선택해 일정 ID와 연결할 수 있고 일정 삭제 시 링크만 정리하며 원본 문서는 여행방 문서함에 유지한다. 두리가 장소를 교체하거나 일정을 제외하면 기존 티켓 연결을 해제하고 파일은 보존한다.

현재 파일과 metadata는 Backend로 전송하지 않으며 다른 동행자·다른 기기와 동기화되지 않는다. 서버 연동 요구사항은 `FRONTEND_ONLY_BACKEND_REQUIREMENTS.md`를 따른다.

## API 연결 원칙

Rooms·Invite API의 방 목록/상세/생성/수정, 멤버 권한, 초대 링크 발급·교체·미리보기·수락과 게스트 입장은 연결되어 있다. 서버 roomId와 version을 기준으로 읽고 쓰며, API 데이터가 실패했을 때 mock 방으로 자동 전환하지 않는다.

Workspace는 서버 schedule/facts version, 잠금·예약·티켓, 날짜 변경과 제안 적용의 충돌 검증을 사용한다. 모든 mutation은 현재 tripId와 서버 계약 출처를 명시하고 mock/api 데이터를 섞지 않는다.
