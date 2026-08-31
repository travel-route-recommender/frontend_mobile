# DURI Create Trip Design Extension

이 문서는 기존 DURI design foundation을 대체하지 않는다. Create Trip Wizard에서 추가로 사용하는 조합과 반응형 규칙만 정의한다.

## 1. Composition

```text
Create Trip Header
→ Five-step Progress
→ Scrollable Step Body
→ Sticky Action Footer
```

- page surface: White `#FFFFFF`
- horizontal gutter: 20px
- fixed top: Header 58px + progress
- body top padding: 20px
- section gap: 24px
- footer: white, top border `#DCE7F7`, safe-area 포함
- 본문만 스크롤하며 Header와 Footer는 움직이지 않는다.

## 2. Header

- center title: `새 여행 만들기`
- title: 17/23, weight 800, Deep Navy `#17265F`
- back/close target: 44×44px
- back는 이전 단계 또는 기존 route exit 의미를 유지한다.
- close는 모든 단계에서 draft save/delete modal을 연다.
- 별도의 브랜드 장식이나 character를 추가하지 않는다.

## 3. Five-step Progress

- labels: 목적지 / 날짜 / 여행 정보 / 멤버 / 확인
- node: 24×24px, number 11/14, weight 800
- active: Primary Blue fill + white number
- completed: Primary Soft fill + Primary Blue border/text
- upcoming: white fill + Border
- label: 9/12, weight 700
- connector는 1.5px이며 완료 구간만 Primary Blue다.
- 전체 너비를 5등분하고 360px에서도 label을 한 줄로 유지한다.

## 4. Step heading

- title: 23/31, weight 900, Deep Navy
- description: 13/19, weight 500, Secondary `#60719B`
- heading bottom space: 24px
- review edit에서는 Lavender metadata badge `확인 화면에서 수정 중`을 title 위에 표시한다.

## 5. Selection cards

### Shared

- surface: White
- border: 1px `#DCE7F7`
- radius: 16px
- compact minimum height: 56px
- selected surface: Blue Surface `#F2F8FF`
- selected border/text: Primary Blue `#4388FF`
- radio: 20×20px

### Grid

- two columns
- column width: 48%
- gap: 8px
- Destination cards는 별도 12px gap과 실제 image를 사용한다.
- Transport와 companion type은 설명을 생략하고 label 중심으로 압축한다.

### List

- full width
- label 14/19, weight 800
- description 11/16, weight 500
- 종료 조건처럼 선택 의미를 설명해야 하는 경우에 사용한다.

## 6. Destination cards

- two-column wrap
- radius: 18px
- image aspect ratio: 1.42
- actual `RegionOption.imageUrl` only
- name: 15/20, weight 800
- parent region: 10/15, weight 600
- 설명, 날씨, 명소 수처럼 현재 production 데이터에 없는 값은 표시하지 않는다.
- selected check는 이미지 우상단에 배치한다.

## 7. Date summary and calendar

- summary minimum height: 106px
- surface: Blue Surface
- border: Blue Border `#CFE4FF`
- radius: 18px
- departure/arrival columns + arrow + bottom duration pill
- undecided mode: Lavender surface/border and `Day 1부터 시작`
- calendar: white, 18px radius, 12px padding
- month control: 40×40px
- day cell height: 38px
- range: Primary Soft, endpoints: Primary Blue
- date semantics and selection algorithm은 visual layer에서 변경하지 않는다.

## 8. Travel information disclosure

- 이동 방식 → 숙소 → 마지막 날 귀환 일정 순서
- optional은 작은 Lavender pill `선택 사항`으로 표시한다.
- 귀환 상세는 선택 후에만 Blue Surface panel 안에 렌더링한다.
- 상세 field 순서: 종료 지점 / 마감 시각 / 이동시간 / 준비·반납 시간 / 메모
- 날짜 미정이면 Lavender 안내 panel만 표시한다.
- API에 아직 없는 local-only 필드는 page bottom의 작은 data note로 명확히 알린다.

## 9. Companion rows

- owner row: 64px minimum, white, border, radius 16px
- owner badge: existing selected Chip
- friend list: one bordered group, radius 16px, internal dividers
- friend row: 64px minimum
- selected row: Blue Surface + Primary checkbox
- candidate source: canonical saved-friend relation only
- friends empty: Blue Surface panel, 혼자 생성 가능 + 이후 초대 문구
- companion type은 friend count와 무관하게 필수다.

## 10. Review groups

- exactly three groups: 기본 정보 / 여행 정보 / 함께할 멤버
- surface: White
- border: `#DCE7F7`
- radius: 18px
- header minimum height: 48px
- action: Primary Blue 11/16, weight 800
- 기본 정보는 78px region thumbnail, region, date/duration을 사용한다.
- 여행 정보는 62px label column과 flexible value column을 사용한다.
- 멤버는 실제 avatar와 이름, 동행 유형, 실제 인원 수를 사용한다.
- 수정 action은 기존 editable step target에 연결한다.

## 11. DURI guide

- surface: Lavender `#F3F1FF`
- border: `#D9D5FF`
- radius: 18px
- title: 14/19, weight 800
- body: 12/18, weight 500
- 현재 가능한 다음 행동만 설명한다: 후보 장소 모으기와 일정 만들기.
- 결과 보장, 자동 추천 완료, 캐릭터의 발화처럼 오해될 문구는 사용하지 않는다.

## 12. Sticky footer

- horizontal padding: 20px
- top/bottom padding: 8px + safe-area
- top border: 1px `#DCE7F7`
- secondary width: 112px
- primary: remaining width
- minimum button height는 existing common button contract를 사용한다.
- step 1: 다음
- step 2–4: 이전 + 다음
- edit: 취소 + 수정 완료
- review: 이전 + 여행방 만들기
- validation disabled/loading semantics는 기존 button과 mutation state를 따른다.

## 13. Responsive rules

- required widths: 360 / 390 / 430
- page gutter와 footer gutter는 항상 20px
- progress는 5 equal columns
- grid는 2열을 유지하되 text가 길면 card 안에서 줄바꿈한다.
- review label column만 고정하고 value가 남는 너비를 사용한다.
- footer primary가 줄어들 수 있도록 secondary만 112px로 고정한다.
- 긴 form과 keyboard focus에서도 Header/Footer는 고정하고 Body만 스크롤한다.

## 14. Data and character rules

- UI에 표시할 값은 production query/store/draft/option에서만 가져온다.
- reference image의 sample region, date, friend, copy를 fixture로 만들지 않는다.
- canonical relation을 통과하지 않은 디렉터리 사용자를 후보로 보이지 않는다.
- owner와 중복 ID는 review 및 submit 전에 제거한다.
- Create Trip 기본 단계에는 DURI character illustration을 사용하지 않는다.
- character는 향후 사실 기반 empty/help state에서만 별도 검토한다.
