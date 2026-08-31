# DURI Typography / Responsive Polish Report

## Scope

기존 DURI Analysis / Suggestion Preview의 IA, 카드 구조, 섹션 순서, 색상, 기능과 비즈니스 로직은 유지했다. 이번 변경은 한국어 단어 단위 줄바꿈과 360px Hero의 텍스트·일러스트 비율 조정에만 한정했다.

## Modified Components

- `src/features/duri/components/DuriKoreanText.tsx`
- `src/features/duri/components/DuriPlanningIllustration.tsx`
- `src/features/duri/components/DuriAnalysisReport.tsx`
- `src/features/duri/components/DuriAnalysisIntro.tsx`
- `src/features/duri/components/DuriSuggestionPreviewContent.tsx`
- `src/features/duri/components/AnalysisIssueCard.tsx`
- `src/features/duri/components/SuggestionChangeCard.tsx`

분석 엔진, 제안 엔진, 데이터 모델, 저장소, fingerprint, stale, read-only, apply 및 workspace 연결 코드는 수정하지 않았다.

## Korean Wrapping

`DuriKoreanText`를 DURI Hero heading, summary, suggestion title, issue/strength title 및 긴 변경 문구에만 제한적으로 적용했다.

- Web: `word-break: keep-all`과 `overflow-wrap: break-word`를 함께 사용한다. 일반 한국어 단어는 음절 중간에서 끊지 않으며, 컨테이너보다 긴 단일 단어만 안전하게 줄바꿈할 수 있다.
- iOS: `lineBreakStrategyIOS="hangul-word"`를 사용하고, 연속된 한글 단어 안에 보이지 않는 word joiner를 동적으로 삽입한다.
- Android: hyphenation을 끄고 simple break strategy와 동일한 word joiner 처리를 사용한다.
- 특정 예시 문구에 맞춘 `\n`이나 copy 변경은 추가하지 않았다. 동적 분석·제안 결과에도 같은 규칙이 적용된다.

실제 Web 캡처에서 `word-break: keep-all`과 `overflow-wrap: break-word`가 적용된 것을 확인했다. 360px의 주요 문구는 다음처럼 표시된다.

- `조금 조정하면 더` / `좋아요`
- `한 날짜에 일정이` / `집중되어 있어요`
- `국제시장에서 저녁` / `일정 추가`

## 360px Hero Adjustment

글자 크기와 line-height는 변경하지 않았다. 360px에서만 캐릭터 영역을 축소해 copy width를 확보했다.

| Hero | 기존 | 360px 조정 | 변화 |
| --- | --- | --- | --- |
| Analysis | width 44%, min 118, max 154, height 142 | width 39%, min 104, max 136, height 132 | 최소 너비 약 11.9% 축소 |
| Suggestion | width 42%, min 112, max 148, height 156 | width 37%, min 100, max 132, height 146 | 최소 너비 약 10.7% 축소 |

캐릭터 asset, resize mode와 배치 방향은 유지했다.

## 390 / 430 Regression

390px와 430px에는 compact illustration style이 적용되지 않는다. 기존 Hero 최소 높이, 카드 높이, 간격, 색상과 캐릭터 크기를 유지했다. 두 너비에서 Analysis와 Suggestion의 수평 overflow가 없고, Hero와 하단 콘텐츠가 기존 순서대로 표시되는 것을 확인했다.

## Sticky Footer

360/390/430에서 적용 버튼이 모두 viewport 기준 `top 780px`, `bottom 832px`에 유지된다. 360px Suggestion 본문을 스크롤하기 전과 후에도 위치가 변하지 않았다.

## Functional QA

- Analysis에서 제안 생성 후 Suggestion Preview로 이동
- Preview의 `적용하지 않기`로 Analysis 복귀
- Back navigation과 현재 분석 결과 유지
- Apply 버튼 노출과 sticky 위치
- stale/read-only/atomic apply는 기존 DURI verification으로 회귀 확인

## Screenshots

360px, 390px, 430px Analysis와 Suggestion 캡처는 요청된 너비와 844px 높이로 로컬 시각 QA에 사용했으며 장기 저장소 산출물에는 포함하지 않는다.

## Verification

- `npm run typecheck` — PASS
- `npm run lint` — PASS
- `npm run verify:duri-analysis` — PASS: analysis 29, suggestion 20, atomic 10, end-condition 19 및 evidence/OCR/congestion 시나리오
- `npm run build` — PASS: Android, iOS, Web bundle 및 47개 static route export
- `git diff --check -- src/features/duri` — PASS

## Result

- Analysis 360: PASS
- Suggestion 360: PASS
- Korean Word Wrapping: PASS
- Analysis Hero: PASS
- Suggestion Hero: PASS
- 390 Regression: PASS
- 430 Regression: PASS
- Sticky Footer: PASS
