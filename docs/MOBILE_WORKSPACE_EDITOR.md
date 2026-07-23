# 모바일 워크스페이스 편집기

## 두리 분석·원자 적용 연결

workspace 하단 `DuriAnalysisEntryCard`는 분석 전/중/current/stale/engine unavailable을 구분한다. CTA는 report route로 이동하며 진입만으로 분석하거나 일정을 수정하지 않는다. 적용 성공은 route parameter 기반 기존 feedback banner를 쓰고 첫 affected date를 선택한다.

수동 add/update/move/remove/reorder 후에는 full input fingerprint가 달라져 기존 session/suggestion이 자동 stale이 된다. 최종 일정의 유일한 기준은 계속 `itineraryByTripId`이고 candidate scheduled, TripHome 일정 수와 준비율은 기존 selector가 갱신한다.

제안 적용은 기존 개별 편집 action을 연속 호출하지 않는다. 메모리에서 전체 next itinerary를 검증한 뒤 `applyDuriSuggestionAtomically`이 set 한 번으로 교체한다. 실패 시 일정, 후보, 다른 trip은 변경되지 않는다.

## 1. 화면 구조

기존 `app/trips/[tripId]/workspace.tsx` route는 선언만 유지하고 실제 구현은 `src/features/workspace/screens/WorkspaceScreen.tsx`에 둔다. 화면 상단 캔버스는 여행방 헤더와 관계 수치, 기존 가로 여행 날짜 탭, 선택 날짜의 08:00~24:00 시간표, 두리 분석 연결 경계를 제공한다. 일정 추가·이동·길이 조절·편집은 메인 시간표에서 시작하고 화면 아래의 단일 `WorkspaceBoardSheet`는 후보 장소 검색·필터·배치를 담당한다. 한 번에 선택된 DAY 하나만 표시하고 날짜 탭 선택과 시간표 캔버스 좌우 스와이프가 같은 `selectedDate`를 갱신한다.

시트는 화면 높이 기준 약 28%·58%·88%의 collapsed/mid/expanded snap을 제공한다. 전용 handle을 누르거나 위아래로 끌어 높이를 바꾸며, safe-area 하단 inset을 포함한다. 외부 bottom-sheet 패키지는 추가하지 않고 SDK 57의 React Native `Animated`, `PanResponder`, `useWindowDimensions`와 기존 safe-area-context를 사용한다.

## 2. 후보와 일정 관계

후보 원본은 `candidatesByTripId[tripId]`, 일정은 `itineraryByTripId[tripId]`다. 둘은 `placeId`로 `placesById`를 조회하지만 Place 객체를 관계 안에 복제하지 않는다. 후보를 일정에 넣어도 후보를 삭제하지 않고, 일정을 삭제해도 후보를 삭제하지 않는다. 후보·일정 수는 selector에서 파생한다.

## 3. scheduled 판정

`buildCandidateScheduleLookup`이 itinerary의 `placeId -> date[]` lookup을 만든다. 선택 날짜에 일정이 있으면 `scheduled-on-selected-date`, 다른 날짜에만 있으면 `scheduled-on-other-date`, 없으면 `unscheduled`다. 현재 `TripCandidate`에는 scheduled 필드가 없으며, 향후 레거시 필드가 생겨도 실제 itinerary 관계를 우선한다.

## 4. 여행 날짜 생성

`buildTripDateRange`는 `YYYY-MM-DD` 시작일과 종료일을 UTC date-only epoch로 계산하고 양 끝 날짜를 포함한다. 시스템 timezone과 무관하며 당일치기, 월·연도·윤년 경계를 처리한다. 시작일이 종료일보다 늦거나 유효하지 않으면 빈 배열을 반환한다. 마지막 날짜 탭 뒤의 `+ DAY 추가`는 종료일에 하루를 더하고 새 DAY를 즉시 선택한다. 서버 계약처럼 임의의 최대 여행 일수는 추가하지 않았다.

## 5. selectedDate

선택 날짜는 화면 로컬 상태이며 persist하지 않는다. 요청 날짜가 유효하면 유지하고, 아니면 오늘이 여행 기간 안인지 확인한 뒤 일정이 존재하는 첫 날짜, 시작일 순서로 선택한다. 날짜 탭과 좌우 스와이프는 별도의 page 상태를 만들지 않고 이 값만 바꾼다. 마지막 DAY를 추가하면 새 종료일로 즉시 이동한다. 후보 검색·필터·보드 접힘·열린 Modal도 비영속 UI 상태다.

## 6. 후보 보드 필터

후보 검색은 장소명, 주소, category label, tags를 공백 정규화 후 비교한다. 필터는 전체·공통 관심·내가 담은 장소·동행자가 담은 장소이며 기존 `addedByUserIds` 관계만 사용해 파생한다. 배치 여부는 각 카드에 계속 표시한다. 누락 Place 후보도 삭제·복구 정책을 안내하기 위해 카드로 유지하지만 일정 추가와 상세 이동은 차단한다.

## 7. 일정 정렬 기준

모바일 `ItineraryItem`에는 `order`와 `endTime`이 없다. 웹 실제 구현과 같이 날짜와 `startTime`을 표시 순서의 기준으로 사용한다. 동일 시간은 기존 배열 순서와 ID로 결정한다. 잘못된 시간은 유효 시간 뒤에 배치하며 중복 item ID는 selector에서 한 번만 표시한다.

## 8. 일정 추가 흐름

후보 카드 또는 일정표의 일정 추가 버튼에서 미배치 후보를 선택한다. 편집 Modal에서 날짜, 시작·종료 시간, 메모를 입력한다. Store action은 여행방·멤버·후보·Place·날짜·시간·중복·충돌을 검증한 뒤 한 번의 update로 item을 추가한다. 같은 Place는 여행 전체 일정에 한 번만 배치한다.

## 9. 시간 저장 형식

화면은 시작·종료 시간을 보여주지만 도메인은 웹과 동일하게 `startTime: HH:mm`과 `durationMinutes`만 저장한다. 종료 시간은 파생한다. native는 기존 SDK 57 호환 `@react-native-community/datetimepicker`, Web export는 검증된 HH:mm 입력을 사용한다. 08:00~24:00, 30분 단위, 최소 30분이며 자정을 넘는 일정은 허용하지 않는다.

## 10. 시간 충돌

`doTimeRangesOverlap`은 `leftStart < rightEnd && rightStart < leftEnd` 규칙을 사용한다. 10:00~11:00과 11:00~12:00처럼 경계가 맞닿으면 충돌이 아니다. 웹 실제 정책에 맞춰 충돌은 저장을 차단하고, 충돌 항목과 다음 빈 시간을 안내한다. 충돌 결과는 파생 상태라 persist하지 않는다.

## 11. 일정 수정

Edit Modal에서 날짜, 시작·종료 시간, note를 변경한다. Place 교체는 지원하지 않는다. 누락 Place 일정도 시간·note 수정과 삭제가 가능하다. `updateItineraryItem`은 자신을 제외한 중복·충돌을 검사하고 성공 시 한 번에 갱신한다.

## 12. 날짜 이동

편집 Modal에서 다른 여행 날짜를 선택하면 기존 시간을 유지한 채 대상 날짜로 이동한다. 대상 날짜 충돌은 차단한다. 성공하면 이동한 날짜 탭을 보여주며 양 날짜의 항목 수와 후보 scheduled 상태는 selector가 즉시 다시 계산한다.

## 13. 순서 변경

일정 블록 오른쪽 이동 핸들을 길게 누른 뒤 같은 DAY 시간축에서 위아래로 끌면 시작 시간이 30분 슬롯에 맞춰 이동한다. 블록 아래 핸들을 끌면 최소 30분부터 자정 종료 범위 안에서 체류시간을 30분씩 늘리거나 줄인다. React Native 기본 `PanResponder`와 `Animated`를 사용해 패키지를 추가하지 않았으며, 조작 중에는 바깥 세로 ScrollView, 시간표 스크롤과 DAY 좌우 스와이프를 잠근다. Store action이 자신을 제외한 시간 충돌과 08:00~24:00 경계를 다시 검증하며 실패하면 원래 위치나 길이를 유지한다. 접근성 `increment/decrement` 동작과 블록 편집 Modal의 직접 시간 선택을 제스처 대안으로 제공한다.

## 14. 일정 삭제

확인 Modal은 “일정에서만 제거되고 후보는 유지된다”는 정책을 명시한다. 삭제 후 후보가 다른 일정에도 없으면 자동으로 미배치 상태가 된다. 별도 scheduled 값이나 날짜별 count를 수정하지 않는다.

## 15. 후보 삭제 정책

일정에 한 번이라도 배치된 후보는 제거를 차단하고 먼저 일정을 제거하도록 안내한다. 현재 사용자가 담은 후보만 제거할 수 있다. 여러 멤버가 같은 후보를 담았다면 현재 사용자의 `addedByUserIds` 관계만 제거하고 후보 자체는 유지한다. 마지막 담기 관계라면 후보를 삭제한다. 개인 저장에는 영향이 없다.

## 16. 편집 권한

member와 초대 guest는 자신이 참여한 진행 여행방을 편집할 수 있다. anonymous와 비멤버는 접근할 수 없고, 완료 여행방은 읽기 전용이다. UI 비활성화뿐 아니라 모든 Store action이 trip 존재, 완료 상태, membership을 다시 검증한다.

## 17. 데이터 모드

- `mock`: normalized 후보·일정 Store action과 AsyncStorage persist 사용
- `api`: Candidates·Schedule 계약 대기 상태를 표시하고 mock으로 fallback하지 않음
- `hybrid`: 서버/로컬 trip·place·candidate·item ID 호환 전까지 표시·편집 차단

화면은 환경 변수를 직접 읽지 않고 `workspaceScheduleService` 정책 경계를 사용한다.

## 18. persist

기존 `tripsById`, `candidatesByTripId`, `itineraryByTripId`, `activeTripId`가 `duri-mobile-store` version 4에 포함된다. DAY 추가는 별도 필드를 만들지 않고 해당 여행방의 기존 `endDate`만 늘린다. 재정렬된 시작 시간과 새 DAY의 일정도 기존 itinerary 관계로 저장된다. 새 영속 필드가 없어 migration이나 persist version은 변경하지 않았고, 기존 정규화기는 확장된 여행 기간 안의 일정을 재시작 후 복원한다.

## 19. 파생 데이터 비영속 원칙

selectedDate, 후보 검색·필터, 시트 snap, Modal, 드래그·resize 중인 항목과 preview 시간, 종료 시간, 충돌, 날짜별 count, 후보 scheduleState, ViewModel은 저장하지 않는다. 후보 수·일정 수·준비율·TripHome 요약은 기존 relation selector에서 자동 갱신된다. 두리 분석 입력은 특정 DAY가 아니라 전체 여행 기간과 전체 itinerary를 사용하므로 DAY 추가나 어느 날짜의 일정 변경도 기존 분석을 stale로 만든다.

## 20. native gesture 검증 경계

PanResponder 기반 일정 이동·resize, DAY 스와이프, bottom sheet handle은 서로 다른 전용 영역에 responder를 연결한다. 일정 조작 중에는 바깥 ScrollView, 시간표 내부 ScrollView와 DAY 스와이프를 잠그며, 시트 자체 이동은 handle 영역에서만 시작한다. TypeScript·lint·순수 로직 검증 및 Expo export로 정적 확인하고 실제 터치 장치에서 길게 누르기, resize, 내부 스크롤, snap 감각을 최종 확인해야 한다. 편집 Modal과 접근성 조절 동작은 native gesture 검증 여부와 무관하게 사용할 수 있는 대안이다.

## 21. 두리 분석·제안 연결

현재 화면은 itinerary가 있으면 독립 Duri report route로 이동한다. report에서 local 분석과 제안을 명시적으로 실행하며, 제안 상세는 before/after/diff, stale fingerprint, 적용 확인과 Zustand 단일 update 기반 atomic apply를 제공한다. 분석과 제안 적용 범위는 현재 선택한 DAY에 제한되지 않고 전체 여행 일정이다. 다음 단계는 server Duri와 Schedule batch 계약, 실제 Directions 입력이다.

## 22. Schedule API mapper 대기

서버 계약 전에는 `day/startAt/endAt/sequence/scheduleDate` 같은 필드를 추측하지 않는다. add/update/delete/reorder batch endpoint, 동시 편집 충돌, version/ETag, 후보 제거 권한, guest 권한, 원자적 제안 적용 DTO가 Swagger로 확정된 뒤 모바일 `date/startTime/durationMinutes/placeId` mapper를 작성한다.
