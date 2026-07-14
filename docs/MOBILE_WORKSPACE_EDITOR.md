# 모바일 워크스페이스 편집기

## 두리 분석·원자 적용 연결

workspace 하단 `DuriAnalysisEntryCard`는 분석 전/중/current/stale/engine unavailable을 구분한다. CTA는 report route로 이동하며 진입만으로 분석하거나 일정을 수정하지 않는다. 적용 성공은 route parameter 기반 기존 feedback banner를 쓰고 첫 affected date를 선택한다.

수동 add/update/move/remove/reorder 후에는 full input fingerprint가 달라져 기존 session/suggestion이 자동 stale이 된다. 최종 일정의 유일한 기준은 계속 `itineraryByTripId`이고 candidate scheduled, TripHome 일정 수와 준비율은 기존 selector가 갱신한다.

제안 적용은 기존 개별 편집 action을 연속 호출하지 않는다. 메모리에서 전체 next itinerary를 검증한 뒤 `applyDuriSuggestionAtomically`이 set 한 번으로 교체한다. 실패 시 일정, 후보, 다른 trip은 변경되지 않는다.

## 1. 화면 구조

기존 `app/trips/[tripId]/workspace.tsx` route는 선언만 유지하고 실제 구현은 `src/features/workspace/screens/WorkspaceScreen.tsx`에 둔다. 화면은 여행방 헤더와 관계 수치, 여행 날짜 탭, 접을 수 있는 후보 보드, 선택 날짜 타임라인, 두리 분석 연결 경계 순서다. 후보는 가로 `FlatList`, 전체 화면과 일정은 세로 ScrollView 구조라 같은 방향의 큰 중첩 목록을 만들지 않는다.

## 2. 후보와 일정 관계

후보 원본은 `candidatesByTripId[tripId]`, 일정은 `itineraryByTripId[tripId]`다. 둘은 `placeId`로 `placesById`를 조회하지만 Place 객체를 관계 안에 복제하지 않는다. 후보를 일정에 넣어도 후보를 삭제하지 않고, 일정을 삭제해도 후보를 삭제하지 않는다. 후보·일정 수는 selector에서 파생한다.

## 3. scheduled 판정

`buildCandidateScheduleLookup`이 itinerary의 `placeId -> date[]` lookup을 만든다. 선택 날짜에 일정이 있으면 `scheduled-on-selected-date`, 다른 날짜에만 있으면 `scheduled-on-other-date`, 없으면 `unscheduled`다. 현재 `TripCandidate`에는 scheduled 필드가 없으며, 향후 레거시 필드가 생겨도 실제 itinerary 관계를 우선한다.

## 4. 여행 날짜 생성

`buildTripDateRange`는 `YYYY-MM-DD` 시작일과 종료일을 UTC date-only epoch로 계산하고 양 끝 날짜를 포함한다. 시스템 timezone과 무관하며 당일치기, 월·연도·윤년 경계를 처리한다. 시작일이 종료일보다 늦거나 유효하지 않으면 빈 배열을 반환한다. 서버 계약처럼 임의의 최대 여행 일수는 추가하지 않았다.

## 5. selectedDate

선택 날짜는 화면 로컬 상태이며 persist하지 않는다. 요청 날짜가 유효하면 유지하고, 아니면 오늘이 여행 기간 안인지 확인한 뒤 일정이 존재하는 첫 날짜, 시작일 순서로 선택한다. 후보 검색·필터·보드 접힘·열린 Modal도 비영속 UI 상태다.

## 6. 후보 보드 필터

후보 검색은 장소명, 주소, category label, tags를 공백 정규화 후 비교한다. 필터는 전체·미배치·배치 완료다. 누락 Place 후보도 삭제·복구 정책을 안내하기 위해 카드로 유지하지만 일정 추가와 상세 이동은 차단한다.

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

gesture drag-and-drop은 사용하지 않는다. 위·아래 버튼은 같은 날짜의 인접 항목 두 개를 대상으로 하며, 첫 항목의 위와 마지막 항목의 아래는 비활성화한다. 실제 정렬 기준이 시간인 도메인에 맞춰 두 항목의 체류 시간과 기존 사이 간격을 보존하면서 시작 시간을 원자적으로 재배치한다. 다른 날짜에는 영향을 주지 않는다.

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

기존 `candidatesByTripId`, `itineraryByTripId`, `activeTripId`가 `duri-mobile-store` version 4에 포함된다. 이번 단계에 새 영속 필드를 추가하지 않아 migration이나 persist version을 변경하지 않았다. 기존 정규화기는 중복 ID, 잘못된 날짜·시간과 관계를 복구한다.

## 19. 파생 데이터 비영속 원칙

selectedDate, 후보 검색·필터, 보드 접힘, Modal, 종료 시간, 충돌, 날짜별 count, 후보 scheduleState, ViewModel은 저장하지 않는다. 후보 수·일정 수·준비율·TripHome 요약은 기존 relation selector에서 자동 갱신된다.

## 20. 향후 gesture 전환

gesture reorder를 도입하려면 RN/Expo SDK 호환성, ScrollView 충돌, 접근성 대체 버튼, 시간 슬롯 재배치 정책을 먼저 확정해야 한다. gesture가 추가돼도 현재 위·아래 버튼은 접근성 대안으로 유지한다.

## 21. 두리 분석·제안 연결

현재 화면은 itinerary가 있으면 분석 준비 상태만 안내한다. 기존 로컬 분석·fingerprint·suggestion 로직은 변경하지 않았다. 다음 단계에서는 report를 읽기 전용으로 표시하고, 제안별 before/after preview와 stale fingerprint 검증 후 원자적 적용을 연결한다.

## 22. Schedule API mapper 대기

서버 계약 전에는 `day/startAt/endAt/sequence/scheduleDate` 같은 필드를 추측하지 않는다. add/update/delete/reorder batch endpoint, 동시 편집 충돌, version/ETag, 후보 제거 권한, guest 권한, 원자적 제안 적용 DTO가 Swagger로 확정된 뒤 모바일 `date/startTime/durationMinutes/placeId` mapper를 작성한다.
