# Workspace Final Redesign Report

Date: 2026-08-29<br>
Route: `/trips/[tripId]/workspace`<br>
User-facing screen name: `여행 일정`<br>
Primary QA viewport: `390 × 844`

## Result

Workspace의 기능 계약은 유지하면서 Timeline을 첫 화면의 주 작업면으로 되돌렸다. 초기 Candidate Sheet는 Peek로 시작하고, DURI action은 Peek 바로 위에 고정했다. 일정 편집은 첫 화면에서 삭제·저장을 항상 실행할 수 있는 sticky footer로 변경했다.

## Scope

변경 범위는 Workspace와 Workspace에서 사용하는 compact DURI entry로 제한했다.

- `src/features/workspace/components/WorkspaceBoardSheet.tsx`
- `src/features/workspace/components/WorkspaceDateTabs.tsx`
- `src/features/workspace/components/WorkspaceScheduleGrid.tsx`
- `src/features/workspace/components/CandidateBoard.tsx`
- `src/features/workspace/components/CandidatePlaceCard.tsx`
- `src/features/workspace/components/WorkspaceEditorModals.tsx`
- `src/features/workspace/logic/workspaceBoardLayout.ts`
- `src/features/workspace/screens/WorkspaceScreen.tsx`
- `src/features/workspace/screens/ApiWorkspaceScreen.tsx`
- `src/features/workspace/selectors/workspaceSelectors.ts`
- `src/features/workspace/types.ts`
- `src/features/duri/components/DuriAnalysisEntryCard.tsx`
- `scripts/verify-workspace-editor.ts`

Home, Trip Home, Trip List, Explore, Place Detail, Saved, My Page 화면은 이번 리디자인에서 수정하지 않았다. Nested Workspace route의 실제 navigation shell도 유지했으며, 레퍼런스에만 있는 가짜 Bottom Tab이나 share/overflow action은 추가하지 않았다.

## Implemented Design

### Timeline-first IA

```text
여행 일정 Header
→ DAY selector
→ Timeline canvas
→ fixed compact DURI action
→ Candidate Sheet Peek / Half / Full
```

- Header를 `여행 일정`과 실제 지역·여행 기간 subtitle로 통일했다.
- 통계 카드와 여행 사실 편집을 첫 작업 흐름에서 제거하고, 여행 설정을 Timeline 아래의 secondary row로 이동했다.
- Timeline은 White Base, 낮은 대비의 grid, Mint 일정 block으로 재구성했다.
- move/resize handle은 기존 hit area와 15분 contract를 유지하면서 시각적으로 분리했다.

### Candidate Sheet

- Peek: `116px`, 초기 상태. 제목·미배치 count·확장 affordance만 노출한다.
- Half: safe viewport의 `54%`.
- Full: safe viewport에서 상단 `104px`를 남긴 높이.
- Drag 중에는 연속으로 움직이고, release 때 가장 가까운 Peek/Half/Full로 snap한다.
- 접근성 increment/decrement는 pixel 이동이 아니라 의미 상태 한 단계 이동으로 바꿨다.
- Peek에서는 검색·필터·카드 DOM을 아예 mount하지 않아 숨은 focus target이 남지 않는다.

### Candidate semantics

- Candidate/unscheduled는 Lavender identity와 White card를 사용한다.
- Scheduled는 Mint surface와 `일정 포함 · N회` 상태를 사용한다.
- canonical `scheduledItems`에서 DAY·시작·종료 시간을 투영해 실제 배치 정보를 보여준다.
- `해당 일정 보기`와 `+ 다른 시간`을 분리해 Scheduled가 추가 금지 상태로 오해되지 않게 했다.

### Schedule Edit

- modal header와 장소 identity를 고정된 상단 hierarchy로 정리했다.
- 실제 장소 이미지, category, address가 있을 때만 표시한다.
- form만 scroll되며 footer는 화면 하단에 고정된다.
- Edit footer: `삭제` + `변경 저장`.
- Add footer: `취소` + `일정에 추가`.
- read-only detail에는 mutation footer를 렌더하지 않는다.

### Empty DAY and DURI

- Empty DAY도 24시간 Timeline을 유지한다.
- 06:30 부근에 centered empty guidance와 `일정 먼저 만들기` 실제 add flow CTA를 배치했다.
- compact DURI action을 Candidate Peek 바로 위에 고정하고, Candidate Half/Full이 열리면 sheet가 자연스럽게 덮도록 z-order를 구성했다.
- CTA label은 stabilized resolver의 `일정 먼저 만들기`, `DURI 분석하기`, `분석 결과 보기`, `다시 분석하기`를 그대로 사용한다.

## Preserved Contracts

- 같은 Candidate를 같은 여행에 여러 itinerary item으로 추가할 수 있다.
- Scheduled는 `scheduledCount > 0`이며 재추가 금지 의미가 아니다.
- canonical relation은 `selectPlaceTripRelation`을 유지한다.
- Read-only에서는 Add, Duplicate Add, Drag, Resize, Edit Save, Delete, DAY/date/trip-fact mutation을 차단한다.
- Read-only에서도 DAY 전환, Timeline scroll, Candidate/일정 상세, 기존 분석 결과 view는 허용한다.
- Timeline/drag/resize는 15분 단위, editor/Store/API는 1분 정밀도를 유지한다.
- 기존 off-grid item을 자동 반올림하거나 migration하지 않는다.

## Visual Iteration

1. `iteration_1.png`: Timeline-first 구조와 Peek 적용. Candidate Half에서 duplicate heading 때문에 첫 카드 도달이 늦은 문제 발견.
2. `iteration_2.png`: expanded handle 축소, duplicate heading 제거, compact DURI dock 적용.
3. Final QA: Empty CTA를 DURI dock 위로 이동하고 focused DAY의 web outline을 제거. 추가 구조 변경 없이 최종 스크린샷 확정.

## Browser QA

정상 제품 흐름으로 `Home → 부산 1박 2일 여행 → 일정 계속 만들기 → Workspace` 진입을 확인했다.

| Scenario | Result |
| --- | --- |
| 390×844 initial Timeline + Peek | PASS |
| Candidate Peek / Half / Full snaps | PASS |
| Half 내부 vertical scroll | PASS |
| Scheduled Mint card + DAY/time + duplicate add affordance | PASS |
| DAY 1 → DAY 2 selection | PASS |
| Empty DAY centered CTA | PASS |
| Schedule Edit first-frame delete/save visibility | PASS |
| Editor inner scroll while footer stays fixed | PASS — save rect remained `top 780 / bottom 832` |
| DURI compact action above Peek | PASS |
| 360×844 horizontal overflow | PASS — `scrollWidth 360` |
| 430×844 horizontal overflow | PASS — `scrollWidth 430` |
| Console errors | PASS — none observed |

Read-only mutation coverage and DURI four-state labels were also rechecked through the contract verification scripts.

## Automated Verification

- `npm run typecheck` — PASS
- `npm run lint` — PASS
- `npm run verify:workspace-editor` — PASS, 100 scenarios + conflict validation
- `npm run verify:place-flow` — PASS
- `npm run verify:workspace-schedule-api` — PASS, 66 scenarios
- `npm run verify:duri-analysis` — PASS
- `npm run verify:trip-flow` — PASS
- `npm run build` — PASS, iOS/Android/Web export and 47 static routes

Expo implementation was checked against the exact Expo SDK 57 reference before code changes.

## Screenshots

- `before_workspace.png`
- `workspace_timeline_final_390.png`
- `workspace_candidate_final_390.png`
- `workspace_schedule_edit_final_390.png`
- `workspace_empty_day_final_390.png`

## Deferred

The known `15-minute Timeline vs 1-minute editor/storage` precision split remains intentionally unchanged. It is documented in `design/review/workspace/WORKSPACE_KNOWN_ISSUES.md` and must not be resolved with automatic rounding without a separate product decision.

## Final Status

- Contract PASS
- Interaction PASS
- Read-only PASS
- Responsive PASS
- Visual QA PASS
- Test PASS
