# 웹 → 모바일 대응표

## 두리 분석·제안 매핑 (2026-07-14)

| 웹 기준 | 모바일 구현 | 비고 |
|---|---|---|
| `DuriAnalysisWorkspace` | `app/trips/[tripId]/analysis.tsx` | 명시적 실행, coverage와 stale 추가 |
| `DuriSuggestionDrawer` | `app/trips/[tripId]/suggestions/[suggestionId].tsx` | 세로 before/after/diff와 최종 확인 |
| `features/duri-analysis` | `src/duri/duri-analysis` | 실제 4 category 알고리즘 재사용 |
| `features/duri-suggestions` | `src/duri/duri-suggestions` | 실제 7 suggestion/5 change/pure apply 재사용 |
| itinerary fingerprint | full input fingerprint + 기존 fingerprint | 후보·그룹 성향·trip 날짜 stale 포함 |
| `applyDuriSuggestion` | `applyDuriSuggestionAtomically` | 검증 뒤 Zustand set 한 번 |

모바일 context는 기존 시간 충돌 helper, 날짜 균형, 후보 활용을 보완한다. 분석·제안 UI와 local atomic apply는 완료되었고 실제 server Duri/Schedule batch와 Directions는 대기다. 세부 계약은 `MOBILE_DURI_ANALYSIS_AND_SUGGESTIONS.md`에 있다.

기준 프로젝트는 상위 `duri-home-ui`이며, 모바일 작업 중 기준 프로젝트 파일은 수정하지 않는다. 웹 UI는 React Native UI로 재작성하고 도메인 타입과 브라우저 비의존 순수 로직만 이식했다.

## Route 대응

| 웹 route | 웹 기준 화면 | 모바일 route | 모바일 화면 | 상태 |
|---|---|---|---|---|
| `/` | `DuriHomePage` | `app/index.tsx` → `app/(tabs)/home.tsx` | `SessionBootstrapScreen` → `HomeScreen` | 세션 분기 완료 |
| `/explore` | `DuriExploreListPage` | `app/(tabs)/explore.tsx` | `ExploreScreen` | 검색·지역/카테고리·정렬·후보 연결 완료 |
| `/explore/map` | `DuriExploreMapPage` | `app/explore/map.tsx` | `ExploreMapScreen` | 공유 필터 기반 좌표 없는 지역 보드 fallback 완료 |
| `/places/:placeId` | `PlaceDetailRoute`, `DuriPlaceDetailSheet` | `app/places/[placeId].tsx` | `PlaceDetailScreen` | 저장·후보 선택·유사 장소·오류 상태 완료 |
| `/trips` | `TripListPage`, `TravelRoomCard` | `app/(tabs)/trips.tsx` | `TripListScreen`, `TripRoomCard` | 필터·정렬·ViewModel 카드 완료 |
| `/trips/new` | `NewTripPage`, `TripWizardSteps` | `app/trips/new.tsx` | `CreateTripWizardScreen` | 5단계·draft 복구·native 날짜 선택 완료 |
| `/trips/:tripId` | `TripRoomHomePage`, `TripRoomHomeSections` | `app/trips/[tripId]/index.tsx` | `TripHomeScreen` | 준비율·응답/진단·후보/일정 요약 완료 |
| `/trips/:tripId/workspace` | `DuriWorkspaceScreen`, `CandidateBoardPanel`, `ScheduleEditorSheet` | `app/trips/[tripId]/workspace.tsx` | `WorkspaceScreen` | 후보 보드·날짜별 일정 추가/수정/이동/순서/삭제 완료 |
| `/saved` | `SavedPlacesPage` | `app/(tabs)/saved.tsx` | `SavedScreen` | 검색·카테고리·누락 관계·후보 연결 완료 |
| `/mypage` | `MyPage` | `app/(tabs)/mypage.tsx` | `MyPageScreen` | 기본 요약 완료 |
| `/tests/personal` | `PersonalPreferenceTestPage` | `app/tests/personal/index.tsx` | `PersonalTestScreen` | 전체 질문·저장 완료 |
| - | 웹은 마지막 문항에서 바로 제출 | `app/tests/personal/review.tsx` | `PersonalReviewScreen` | 모바일 답변 검토·수정 완료 |
| `/tests/personal/result` | `PersonalPreferenceResultPage` | `app/tests/personal/result.tsx` | `PersonalResultScreen` | 완료 |
| `/login` | `LoginPage` | `app/(auth)/login.tsx` | `LoginScreen` | mock 완료·API 계약 대기 표시 |
| `/signup` | 가입 방식 선택 | `app/(auth)/signup-choice.tsx` | `SignupChoiceScreen` | 완료 |
| `/signup/email` | 이메일 가입 | `app/(auth)/signup-email.tsx` | `SignupEmailScreen` | mock 완료·API 계약 대기 표시 |
| `/invite` | `InviteJoinPage` | `app/(auth)/invite.tsx` | `InviteJoinScreen` | mock guest 완료·API 계약 대기 표시 |
| `/onboarding/profile` | 프로필 설정 | `app/(onboarding)/profile.tsx` | `ProfileSetupScreen` | 완료 |
| `/onboarding/intro` | 서비스 소개 | `app/(onboarding)/intro.tsx` | `OnboardingIntroScreen` | 완료 |
| `/duri` | `DuriPage` | 여행별 workspace 내부 | `WorkspaceScreen` 분석 카드 | 별도 리포트 화면 미구현 |
| `/tests` | `PreferenceTestHomePage` | 없음 | 개인 테스트 직접 진입 | 미구현 |
| `/terms` | `TermsPage` | `app/(auth)/terms.tsx` | `TermsScreen` | 임시 안내 완료·정식 법률 문서 대기 |

## 재사용 등급

### A. 거의 그대로 재사용

- `src/domain`: User, Region, Place, TripRoom, TripMember, TripCandidate, ItineraryItem, UserPreferenceResult, TripAnalysis
- `src/duri/preferences`: 개인 성향 질문과 결과 계산
- `src/duri/group-preferences`: 그룹 진단과 GroupPlanningProfile 파생
- `src/duri/duri-analysis`: 밀도, 식사 누락, 동선, 선호 편중 분석
- `src/duri/duri-suggestions`: 제안 생성, preview, fingerprint, 적용
- `src/utils`: 날짜·시간 계산, validation, ID 생성
- `src/store/selectors.ts`: 후보, 일정, 응답 현황, 분석 입력 selector
- `src/data/mock/demoData.ts`: 부산 1박 2일 데모의 ID와 normalized 관계

### B. React Native에 맞게 수정

- Zustand persist storage를 웹 기본 storage에서 AsyncStorage로 교체
- hydrate 이전 렌더를 root layout에서 차단
- React Router parameter를 Expo Router `useLocalSearchParams`로 교체
- Query는 Provider, key factory와 service 경계까지만 구성
- 원격 이미지는 React Native `Image`와 오류 fallback으로 표시
- 인증 세션은 별도 Zustand Store와 AsyncStorage key로 분리
- guest 유도 UX는 Context 대신 `useMemberGate`와 Native Modal로 재작성
- 개인 성향 문항·계산·도메인은 웹 기준 파일과 동일하게 유지하고, 모바일에 영속 draft·검토·재테스트 보호 UX를 추가
- 웹 group-preferences의 5개 계획 차원과 spread 규칙을 유지하고, 모바일에 결과 유효성·coverage·tag 집계·조율 지표·네이티브 상태 카드를 추가
- 웹 여행 목록의 진행/완료 정렬, 5단계 생성 순서와 준비율 점수 규칙을 유지하고, 모바일에 FlatList 필터·native date picker·영속 생성 초안을 추가
- 웹 탐색의 keyword/category/후보·일정 상태와 저장 화면 여행방 선택 정책을 유지하고, 모바일에 Region 필터·결정적 정렬·공유 탐색 Store·좌표 없는 지역 보드를 추가
- 웹 워크스페이스의 08:00~24:00, 30분 slot, 60분 기본 체류, 여행 전체 Place 중복 차단, 충돌 차단 정책을 유지하고 모바일 날짜 탭·Modal·위/아래 버튼으로 재작성

### C. 모바일에서 재작성

- 모든 화면과 공통 UI
- 하단 탭과 Stack route
- modal, bottom sheet, 지도와 drag-and-drop
- HTML/CSS/Tailwind 기반 레이아웃

## 아직 미구현

- 실제 좌표 지도, workspace 제안 미리보기·원자적 적용 UI
- 그룹 진단 전용 route와 두리 분석 리포트 전용 화면 (여행방 상세 그룹 진단은 완료)
- 실제 로그인·회원가입·초대 수락 API, OAuth, JWT refresh
- Quiz questions/status/submit API와 server/local 결과 병합
- 푸시, WebSocket, 네이티브 gesture와 bottom sheet
