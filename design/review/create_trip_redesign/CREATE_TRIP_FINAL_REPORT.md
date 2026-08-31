# DURI Create Trip Final Redesign Report

## Outcome

Create Trip의 기존 5단계 생성 흐름을 유지하면서 화면을 하나의 Wizard Shell로 재구성했다. 기준 구조는 `Header → 5-step Progress → Scrollable Body → Sticky Footer`이며, 실제 지역·날짜·이동 방식·귀환 일정·canonical 친구 관계·초안 값만 화면에 사용한다.

`design/reference/create_trip_flow_reference.png`는 정보 배치와 밀도만 참고했다. reference의 지역, 날짜, 인물, 문구를 데이터로 복사하지 않았다.

## Source priority

구현 판단은 다음 순서를 적용했다.

1. 현재 production code와 store/service/validation 계약
2. `CREATE_TRIP_REDESIGN_CONTRACT.md`와 `CREATE_TRIP_STABILIZATION_REPORT.md`
3. DURI Home design foundation
4. Create Trip reference image

따라서 시각 구조가 reference와 유사하더라도 실제 옵션 수, 친구 목록, 날짜, 지역 이미지와 review 값은 현재 앱 데이터가 결정한다.

## Wizard Shell

- Header: 뒤로 가기, 중앙 제목 `새 여행 만들기`, 닫기
- Progress: 목적지 / 날짜 / 여행 정보 / 멤버 / 확인의 5단계
- Body: 단계별 독립 스크롤, 단계 변경 시 상단 복원
- Footer: safe-area 안의 고정 이전/다음 또는 취소/수정 완료, 마지막 단계 `여행방 만들기`
- Back: 기존 이전 단계·수정 취소 동작 유지
- Close: 모든 단계에서 기존 `저장하고 나가기 / 초안 삭제하고 나가기` 모달 호출
- Web: 입력·하단 버튼 포커스가 문서 전체를 이동시키지 않도록 framed Screen이 document scroll을 잠그고 내부 본문만 스크롤

## Step changes

### 1. 목적지

- 검색과 실제 결과 수를 상단에 유지했다.
- 지역을 2열 compact card로 바꾸고 실제 `RegionOption` 이미지, 이름, 상위 지역만 표시한다.
- 선택 상태는 Primary Blue border, soft-blue surface, check mark로 표현한다.
- 로딩·오류·검색 결과 없음 상태와 재시도 동작은 기존 hook을 그대로 사용한다.

### 2. 날짜

- 선택 결과를 달력 위의 출발일/도착일/기간 summary에 배치했다.
- 기존 범위 선택, 재선택, 과거 날짜, 날짜 미정, `Day 1` 의미를 유지했다.
- 달력 셀과 월 이동 control을 compact하게 조정하되 40px 안팎의 터치 영역을 유지했다.

### 3. 여행 정보

- 실제 `transportOptions`만 2열 카드로 표시한다.
- 숙소는 선택 입력으로 분리했다.
- 날짜 미정이면 귀환 일정의 비활성 이유를 안내한다.
- 날짜가 정해지면 실제 종료 조건을 표시하고, 조건 선택 시에만 종료 지점·시각·이동시간·준비시간·메모를 progressive disclosure한다.
- 기존 validation과 `CreateTripEndConditionDraft` 필드를 변경하지 않았다.

### 4. 함께할 멤버

- 동행 유형은 친구 선택과 독립된 필수 2열 선택으로 유지했다.
- 방장은 고정 compact row다.
- 후보 목록은 `selectSavedFriendIds → resolveEligibleCompanionUsers`를 통과한 canonical 친구만 표시한다.
- 선택된 ID는 draft 복구, edit 시작, UI 표시, review, submit에서 반복 정제된다.
- 친구 0명 상태는 혼자 방을 만들 수 있고 이후 여행방에서 초대할 수 있음을 안내한다.

### 5. 확인

- 여행방 이름 입력을 유지했다.
- review는 `기본 정보`, `여행 정보`, `함께할 멤버` 세 그룹으로 재구성했다.
- 기존 목적지/날짜/여행 정보/멤버 edit target을 모두 유지했다.
- Lavender DURI 안내는 `후보 장소를 모으고 함께 여행 일정을 만들 수 있다`는 현재 제공 기능만 말한다.
- 최종 CTA는 `여행방 만들기`이며 기존 validation, mapper, mutation, 성공 화면, draft reset을 그대로 호출한다.

## Data integrity and preserved behavior

- 5-step 순서와 각 step validation 유지
- 날짜 범위·날짜 미정·종료 조건 정규화 유지
- owner 자동 포함, companion type 필수, 친구 선택 선택 사항 유지
- canonical friend relation과 stale/owner/guest/unrelated ID 제거 유지
- review edit의 copy/commit/cancel 유지
- local draft persistence, resume, save exit, delete exit 유지
- member gate와 guest 차단 유지
- mock/API/hybrid 정책과 create service 유지
- 새 dependency, 새 fixture, 가짜 지역·친구·평점·추천 문구 추가 없음

## Responsive and interaction QA

| 항목 | 결과 |
|---|---|
| 360×800 | PASS. progress, 긴 review 값, 2-button footer가 잘림 없이 표시된다. |
| 390×844 | PASS. 다섯 단계 기준 캡처와 모든 스크롤 경로를 확인했다. |
| 430×932 | PASS. 카드와 review column이 남는 폭을 사용하며 과도하게 늘어나지 않는다. |
| 단계 변경 스크롤 복원 | PASS. 이전/다음과 review edit 진입에서 body가 상단으로 복원된다. |
| 긴 정보 입력 | PASS. 마지막 메모에 포커스된 상태에서도 Header와 Footer가 유지된다. |
| canonical 친구 | PASS. 데모 회원의 명시적 친구 4명만 후보로 표시됐다. |
| fresh zero | PASS. verification에서 관계 없는 신규 회원의 후보가 0명임을 확인했다. |
| review edit | PASS. 여행 정보 수정 진입과 취소 후 review 복귀를 확인했다. |

## Screenshots

Baseline:

- `before_destination.png`
- `before_date.png`
- `before_info.png`
- `before_companions.png`
- `before_review.png`

Final 390×844:

- `create_trip_destination_final_390.png`
- `create_trip_date_final_390.png`
- `create_trip_info_final_390.png`
- `create_trip_companions_final_390.png`
- `create_trip_review_final_390.png`

## Verification

- `npm run typecheck` — PASS
- `npm run lint` — PASS after removing the only unused-import warning
- `npm run verify:trip-flow` — PASS
  - creation, date, edit, mapper, service, region, sorting, ViewModel, invite lifecycle
  - canonical friend fixture, fresh-member zero, stale/unrelated/guest/owner filtering, final payload boundary
- `npm run verify:auth-session` — PASS
- `npm run build` (`expo export --platform all`) — PASS
  - Android bundle PASS
  - iOS bundle PASS
  - Web bundle and `/trips/new` static route PASS

## Modified production files

- `src/components/common/Screen.tsx`
- `src/features/trip-creation/components/CreateTripWizardShell.tsx`
- `src/features/trip-creation/components/TripDateRangeCalendar.tsx`
- `src/features/trip-creation/components/TripDateStep.tsx`
- `src/features/trip-creation/components/TripDestinationStep.tsx`
- `src/features/trip-creation/config.ts`
- `src/features/trip-creation/presentation/createTripTheme.ts`
- `src/features/trip-creation/screens/CreateTripWizardScreen.tsx`

The earlier stabilization work in `eligibleCompanionMembers.ts` and `scripts/verify-trip-flow.ts` remains the functional boundary used by this redesign.
