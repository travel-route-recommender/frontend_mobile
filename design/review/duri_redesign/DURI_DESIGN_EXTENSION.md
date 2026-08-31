# DURI Design Extension

이 문서는 DURI Analysis와 Suggestion Preview에만 적용되는 디자인 확장 규칙이다. 공통 색상, 타이포그래피, 간격은 기존 Home·Trip Home·Workspace 파운데이션을 우선한다.

## Page Shell

- 페이지 바탕은 흰색이며 안전 영역을 포함한다.
- 좌우 기본 gutter는 20px이다.
- Analysis는 하나의 연속 ScrollView, Suggestion Preview는 스크롤 본문과 고정 footer로 나눈다.
- 실제 중첩 상세 경로에서는 Bottom Navigation을 중복 생성하지 않는다.

## Analysis Summary

- 첫 카드에는 연한 라벤더 바탕과 DURI 캐릭터를 사용한다.
- 헤드라인은 분석 세션의 실제 상태를 한 문장으로 요약한다.
- 대표 개선 포인트가 있으면 헤드라인 아래에 실제 결과를 기반으로 표시한다.
- 캐릭터는 공식 기획 이미지를 `contain`으로 한 번만 사용한다.

## Stats

- 네 개의 compact stat tile로 핵심 수치를 보여 준다.
- 값과 레이블은 현재 분석 결과에서 계산한다.
- 수치는 장식 목적으로 보정하거나 고정하지 않는다.

## Primary Action

- 생성 가능한 제안이 있으면 통계 직후에 파란색 주요 CTA를 둔다.
- loading, disabled, read-only, stale 상태는 버튼 모양과 보조 문구에서 함께 설명한다.
- 주요 행동은 390×844의 첫 viewport에서 찾을 수 있어야 한다.

## Strengths and Issues

- 검증된 강점은 연한 민트 카드로 표현한다.
- 개선이 필요한 항목은 연한 피치 계열 카드로 표현한다.
- 강점은 충돌 없음, 후보 활용, 전체 경로 확인처럼 실제 분석 결과로 증명되는 사실만 허용한다.
- 문제 행은 우선순위, 제목, 근거를 간결하게 보여 주고 세부 검사는 disclosure로 이동한다.

## Metrics and Evidence

- 분석 지표는 실제 엔진 metric만 표시한다.
- 전체 검사, 일정별 근거, 선호 근거는 기본 정보 흐름을 방해하지 않도록 접을 수 있어야 한다.
- technical ID, fingerprint, 내부 enum은 사용자 문구로 직접 노출하지 않는다.

## Suggestion Preview

- 라벤더 요약 카드에서 현재 제안의 핵심을 설명한다.
- 변경 내용은 가장 먼저, 이유와 출처 문제는 그다음에 배치한다.
- 영향은 엔진이 제공한 실제 효과만 표시한다.
- 영향을 받는 날짜와 일정은 별도 영역으로 구분한다.
- 완전한 Before/After 데이터는 보존하되 기본 접힘 상태로 제공한다.

## Sticky Apply Footer

- footer는 스크롤 본문과 독립적으로 하단 안전 영역에 고정한다.
- 보조 행동 `적용하지 않기`와 주요 행동 `일정에 적용`을 나란히 둔다.
- 적용 확인 모달에는 실제 변경 수와 날짜, 전체가 한 번에 적용된다는 설명이 있어야 한다.

## State Communication

- 재분석 실패 시 이전 성공 결과를 유지하고 눈에 보이는 오류 배너를 추가한다.
- stale 상태는 다시 분석해야 하는 이유와 행동을 일반 문장으로 안내한다.
- read-only 상태는 CTA를 비활성화하고 권한 원인을 설명한다.
- 오류나 제한을 색상만으로 전달하지 않는다.

## Responsive

- 360px, 390px, 430px 너비에서 수평 스크롤이 없어야 한다.
- stat tile과 버튼은 360px에서도 텍스트가 잘리지 않아야 한다.
- sticky footer는 화면 높이와 safe-area 변화에도 본문을 가리지 않도록 footer 높이만큼 scroll content padding을 확보한다.
