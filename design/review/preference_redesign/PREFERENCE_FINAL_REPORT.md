# DURI Preference Test / Result Final Redesign Report

Date: 2026-08-30<br>
Scope: Detailed Personal Preference Test / Result only

## Before

- Detailed Test는 진입 즉시 질문을 시작해 목적, 저장 여부, 결과 활용을 미리 설명하지 못했다.
- 질문 유형별 화면이 각자 진행/이동 UI를 포함해 질문 본문보다 장면 카드와 장식이 강하게 보였다.
- Result는 유효한 정보를 한 번에 길게 노출했고, 재테스트가 주요 행동처럼 보였다.
- 변경 전 390×844 기준 화면은 `before_question.png`, `before_result.png`로 보존했다.

## Intro

- 기존 `/tests/personal` route 안에 presentation-only Intro state를 추가했다. 질문, 점수, draft, route contract는 변경하지 않았다.
- 실제 test definition에서 계산한 `5개 챕터 · 22개 질문`을 표시한다. compound 내부 선택 단위 26개는 진행 계산에만 사용한다.
- 테스트 목적, 답변 자동 저장, 결과의 여행 계획/동행자 성향 비교 활용을 순서대로 안내한다.
- 측정 근거가 없는 예상 소요 시간은 표시하지 않는다.
- 새 draft 또는 비어 있는 draft에서만 Intro를 보여준다. 답변이 있는 draft는 기존 resume 흐름으로 바로 이어진다.

## Question Shell

- `PreferenceFlowHeader`, detailed `PreferenceProgressBar`, scrollable question body, `PreferenceStickyFooter`를 모든 상세 질문 유형이 공유한다.
- White base, deep navy 질문, primary blue 선택/진행/CTA, lavender DURI context, soft border와 rounded card를 기존 DURI foundation에 맞춰 사용했다.
- `이전`/`다음` 또는 최종 action은 safe-area를 포함한 sticky footer에서 항상 발견 가능하다.
- 답이 완성되지 않은 상태에서는 기존 validation에 따라 `다음`을 비활성화한다.

## Question Variants

- Story single-select 15개: 작은 공식 avatar/context만 남기고 질문과 option을 주인공으로 구성했다.
- Accommodation compound scale: 세 실제 비교 항목과 각 8단계 scale을 그대로 유지했다.
- Stamina single-select: 실제 3개 행동 선택지를 유지했다.
- Budget ranking: 5개 항목을 한 순위씩 선택하는 기존 atomic interaction을 유지했다.
- Discovery multi-select: 2개의 내부 선택 단위와 최소 선택 validation을 유지했다.
- 모든 유형을 Reference의 3개 radio card로 강제하지 않았다.

## Progress Contract

- stabilization의 canonical progress resolver를 그대로 사용한다.
- 상위 진행은 `챕터 N / 5`, 내부 진행은 실제 단위에 따라 `질문 N / 15`, `숙소 기준 N / 3`, `체력 선택 1 / 1`, `예산 순위 N / 5`, `관심 장면 선택 N / 2`로 표시한다.
- 각 chapter의 표시 제목은 실제 config의 `progressTitle`에서 온다.
- 마지막 chapter 진입만으로 완료처럼 보이지 않으며, 두 번째 관심 장면 선택과 validation 완료 후에만 제출 action이 활성화된다.

## Scroll

- atomic question key가 바뀌는 Next, Previous, chapter transition, ranking/discovery 내부 전환에서 top reset을 유지한다.
- 같은 atomic question에서 option 또는 scale 값을 바꿀 때는 현재 scroll 위치를 유지한다.
- 브라우저 검증에서 Q1 option 변경은 scroll을 유지했고, Q1→Q2, chapter 2→3, ranking item 전환은 `scrollY = 0`을 확인했다.

## Result

- Hero의 가장 강한 hierarchy는 canonical `profileType`이다. 짧은 summary, actual preferred tags, actual traits, 공식 DURI asset 순으로 보조한다.
- trait는 긴 한국어가 좁은 열에서 깨지지 않도록 vertical compact rows로 표시한다.
- DURI가 해당 성향을 여행 계획에 어떻게 활용하는지 별도 lavender guide로 설명한다.
- detailed result는 compact summary와 `전체 보기` progressive disclosure로 보존했다. 실제 score/dimension이 있을 때만 펼친 상세에서 표시한다.
- matching detail이 없는 legacy result는 과거 detail을 연결하지 않고 명시적 safe fallback을 한 카드로 보여준다.

## Result Pair

- Result hero와 detailed result는 `resolvePreferenceResultPair`가 반환하는 같은 completed pair를 사용한다.
- 실제 제출 후 canonical `알찬 안정 계획형`과 해당 detail을 함께 확인했고, legacy fallback notice가 나타나지 않음을 검증했다.
- 별도의 UI용 score/profile/tag mapping을 만들지 않았다.

## CTA

- Member primary: `친구와 궁합 보기`.
- Secondary: `홈으로 이동`.
- Tertiary maintenance action: `테스트 다시 하기`.
- Guest/anonymous는 기존 permission과 실제 가능한 action을 유지한다.

## Character

- Repository의 공식 `duri_and_dusun_image.webp`를 Intro에서 한 번 사용했다.
- Result hero에는 repository의 공식 DURI asset을 한 번 사용하고 카드 안에서 전체 형태가 보이도록 배치했다.
- 질문에서는 큰 illustration을 반복하지 않고 작은 공식 avatar/context로 제한했다.
- Reference 이미지를 crop하거나 새 캐릭터 asset을 만들지 않았다.

## Reference Deviations

- 예상 소요 시간을 hard-code하지 않았다.
- chapter 이름은 실제 test config/source를 사용했다.
- sample score를 hard-code하지 않았다.
- sample tags 또는 profileType을 hard-code하지 않았다.
- actual question type을 3개의 option card로 강제하지 않았다.
- Intro/Result를 progress chapter로 추가하지 않았다. 실제 navigation model의 5개 test chapter만 진행률에 포함한다.
- trait는 실제 문장 길이 때문에 3-column 대신 읽기 쉬운 vertical rows를 사용했다.

## Guest

- Guest의 기존 테스트/결과 접근 정책과 CTA permission을 유지했다.
- Guest → Member preference migration 미지원은 이번 presentation redesign 범위에서 변경하지 않았다.

## Responsive

- 360×844, 390×844, 430×844에서 Intro, 긴 Question, Result Hero/trait, progress, sticky footer를 확인했다.
- 세 폭 모두 `document.body.scrollWidth`와 `document.documentElement.scrollWidth`가 viewport width와 같아 가로 overflow가 없다.
- scale과 ranking은 `preference_scale_qa_390.png`, `preference_ranking_qa_390.png`로 별도 확인했다.

## Functional Regression

- Answer selection, Next, Previous, disabled validation, chapter/inner progress: PASS.
- Draft persistence, exit confirmation, reload/resume, completed-result protection during retest: PASS.
- Submit and result replacement only after successful completion: PASS.
- Personal Result = My Page personal profileType = Trip Home member personal profileType: `알찬 안정 계획형`, PASS.
- Trip Home group/shared preference remained separate (`현재 우리 여행은`, shared score/tag), PASS.
- Onboarding Quick Test remained the existing 6-question flow and did not receive the detailed header/chapter shell, PASS.

## Tests

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run verify:preference-compatibility`: PASS, 48 assertions.
- `npm run verify:trip-flow`: PASS.
- `npm run verify:group-preferences`: PASS, 20 scenarios plus tag/profile assertions.
- `npm run verify:auth-session`: PASS.
- `npm run build`: PASS. Expo SDK 57 export generated Android, iOS, and Web bundles and 47 static routes.
- `git diff --check`: PASS; only existing line-ending warnings were reported.

## Screenshots

- Before: `before_question.png`, `before_result.png`.
- Final 360: `preference_intro_final_360.png`, `preference_question_final_360.png`, `preference_result_final_360.png`.
- Final 390: `preference_intro_final_390.png`, `preference_question_final_390.png`, `preference_result_final_390.png`.
- Final 430: `preference_intro_final_430.png`, `preference_question_final_430.png`, `preference_result_final_430.png`.
- Variant QA: `preference_scale_qa_390.png`, `preference_ranking_qa_390.png`.

## Remaining Issues

- Guest → Member preference migration remains a separate backlog item.
- This local QA used the repository's mock/local result path. Production API response compatibility remains covered by the existing result-pair and verification contracts, but should also be included in release-environment smoke testing.
- Screenshot captures run against the Expo development server; the small development control overlay visible at the lower-left in some captures is not part of the production export.
