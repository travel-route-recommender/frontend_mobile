# 모바일 인증·온보딩

이 문서는 `Frontend_mobile`의 프론트엔드 인증 프로토타입 범위와 서버 연결 경계를 설명한다. 현재 인증은 실제 운영 인증이 아니며 `EXPO_PUBLIC_DATA_SOURCE`에 따라 mock 데모 또는 계약 대기 상태로 동작한다.

## 1. 인증 route

| route | 화면 | 역할 |
|---|---|---|
| `/(auth)/login` | `LoginScreen` | 이메일·Kakao mock 로그인, 익명 둘러보기 |
| `/(auth)/signup-choice` | `SignupChoiceScreen` | 이메일 또는 Kakao 시작 방식 선택 |
| `/(auth)/signup-email` | `SignupEmailScreen` | 이메일·비밀번호와 필수 약관 동의 |
| `/(auth)/invite` | `InviteJoinScreen` | 초대 코드 기반 guest 참여 |
| `/(auth)/terms?type=service` | `TermsScreen` | 임시 서비스 안내 문구 |
| `/(auth)/terms?type=privacy` | `TermsScreen` | 임시 개인정보 안내 문구 |
| `/invite/[code]` | redirect | 딥링크 코드를 초대 화면으로 전달 |

route 파일은 `src/features/auth/screens`의 화면만 export한다. 긴 화면 로직은 `app` 아래에 두지 않는다.

## 2. onboarding route

| route | 화면 | 완료 상태 |
|---|---|---|
| `/(onboarding)/profile` | `ProfileSetupScreen` | `profileCompleted` |
| `/(onboarding)/intro` | `OnboardingIntroScreen` | `onboardingIntroSeen` |
| `/tests/personal` | 기존 `PersonalTestScreen` | 실제 결과 저장 성공 시 `preferenceTestCompleted` |

`app/index.tsx`의 bootstrap은 두 Store hydration이 끝난 뒤 세션 상태, 프로필 완료, 소개 확인 순으로 진입 위치를 결정한다. root layout은 인증 세션의 사용자 ID를 기존 도메인 Store의 `currentUserId`와 맞춘다.

## 3. sessionKind

- `anonymous`: 로그인 없이 홈·탐색·장소 상세를 둘러보는 세션. 가짜 User를 만들지 않는다.
- `guest`: mock 초대 코드로 특정 여행방에 참여한 임시 사용자. guest → member 병합은 구현하지 않는다.
- `member`: 이메일 또는 Kakao mock으로 시작한 회원 세션.
- `null`: 아직 시작 방법을 선택하지 않았거나 로그아웃한 상태.

## 4. 권한

| 기능 | anonymous | guest | member |
|---|---:|---:|---:|
| 홈·탐색·장소 상세 조회 | 허용 | 허용 | 허용 |
| 초대받은 여행 조회 | 불가 | 허용 | 참여 중이면 허용 |
| 장소 저장·해제 | 제한 안내 | 제한 안내 | 허용 |
| 새 여행방 생성 | 제한 안내 | 제한 안내 | 허용 |
| 후보 장소 추가 | 제한 안내 | 제한 안내 | 허용 |
| 일정 수정 | 제한 대상 | 제한 대상 | 참여 중이면 허용 |
| 개인 저장 탭·회원 카드 | 제한 안내 | 제한 안내 | 허용 |

현재 workspace 화면은 읽기 중심의 기반 화면이라 일정 편집 UI가 없다. 이후 편집 UI를 추가할 때도 `useMemberGate()`를 통과시키고 Store의 여행방 membership 검사를 함께 유지한다.

## 5. mock / api / hybrid

| mode | 인증 동작 |
|---|---|
| `mock` | 고정 데모 로그인, 안정적인 ID의 이메일 가입, 고정 코드 guest 참여가 로컬에서 동작한다. token은 만들지 않는다. |
| `api` | 실제 DTO와 endpoint를 추측하지 않는다. 제출 시 계약 연결 전 오류를 반환하고 네트워크를 호출하지 않는다. |
| `hybrid` | 공개·로컬 기능은 기존 설정을 따르되 Auth는 `api`와 동일하게 계약 대기 상태다. mock으로 fallback하지 않는다. |

개발 빌드의 인증 레이아웃 오른쪽 위에 현재 데이터 모드를 작게 표시한다.

## 6. AsyncStorage 저장 항목

`duri-auth-session` version 1에 다음 비민감 값만 저장한다.

- `sessionKind`
- `authStatus`
- `currentSessionUserId`
- `profileCompleted`
- `onboardingIntroSeen`
- `preferenceTestCompleted`

닉네임, 아바타, 여행, 저장 장소, 성향 결과는 기존 `duri-mobile-store`의 도메인 데이터다. 인증 Store에 중복 저장하지 않는다. migration과 비정상 값 정규화가 준비되어 있다.

## 7. SecureStore

`nativeTokenStorage` adapter와 로그아웃 시 `clearTokens()` 호출은 유지한다. 현재는 access/refresh token을 생성하거나 저장하지 않으므로 SecureStore에 새 인증 값이 기록되지 않는다. 실제 계약이 확정되면 token만 이 adapter를 통해 저장하고 AsyncStorage에는 넣지 않는다.

## 8. 실제 Auth API 계약 대기

- login/signup/join-by-invite request·response DTO
- access/refresh token 수명과 갱신 정책
- Kakao native SDK와 서버 exchange
- guest 계정 수명 및 member 병합
- 초대 코드 형식, 만료, 재사용, 오류 코드
- 이메일·비밀번호·닉네임의 서버 검증 규칙
- 약관 버전과 동의 이력

`UnavailableApiAuthService`는 `fetch`를 호출하지 않고 명시적인 unavailable 결과를 반환한다.

## 9. mock 정보

- 이메일: `demo@duri.app`
- 비밀번호: `duri2026`
- 초대 코드: `DEMO2026`
- 데모 회원 ID: `user-soomin`
- 데모 guest ID: `guest-demo2026`

이 값은 `src/features/auth/config.ts` 한 곳에 정의한다. 이메일 가입 ID는 정규화한 이메일로부터 안정적으로 생성하며 `Date.now()`를 사용하지 않는다.

비밀번호 6자, 닉네임 2~12자, 초대 코드 8자리 규칙은 mock UI 검증 기준일 뿐 서버 규칙이 아니다. 서버 계약 확정 후 config와 순수 validation을 함께 조정한다.

## 10. Member Gate 적용 위치

- 탐색 카드의 저장 토글
- 장소 상세의 저장·저장 해제
- 장소 상세의 여행 후보 추가
- 홈과 여행 탭의 새 여행방 생성 진입
- `/trips/new` 직접 접근
- 저장 탭 조회 및 저장 해제
- 마이페이지의 회원 전용 CTA

`GuestPromptModal`은 현재 화면 위에 열리며 닫으면 입력·검색·스크롤 화면 자체를 교체하지 않는다. 로그인, 회원가입, 닫기 동작을 제공하고 anonymous/guest 문구를 구분한다.

## 11. onboardingIntroSeen과 preferenceTestCompleted

- `onboardingIntroSeen`: 소개 화면을 확인했거나 “다음에 하기”를 누르면 `true`.
- `preferenceTestCompleted`: 성향 결과가 실제 도메인 Store에 저장된 뒤에만 `true`.

“다음에 하기”는 `preferenceTestCompleted`를 바꾸지 않는다. 현재 모바일에는 이전 단계에서 완성된 개인 성향 테스트가 이미 있으므로 이번 작업은 테스트 데이터나 계산을 다시 만들지 않고 완료 플래그 연결만 추가했다.

## 12. reference에서 반영한 디자인

- Safe Area + 키보드 회피 + 스크롤 + 하단 고정 CTA의 AuthLayout
- 두리 브랜드 영역과 큰 단일 CTA
- 라벨·입력·helper·error의 정보 계층
- 비밀번호 표시 토글과 약관 체크박스의 분리된 “보기” 링크
- 부드러운 radius의 가입 장점, 초대 안내, 소개 카드
- 진행률, 프리셋 아바타 선택, 현재 아바타 미리보기
- 화면 상태를 유지하는 guest 유도 Modal

모든 UI는 React Native `View`, `Text`, `Pressable`, `TextInput`, `ScrollView`, `FlatList`, `Modal`로 다시 작성했다.

## 13. 반영하지 않은 reference 로직

- `AuthContext`, `OnboardingContext`, 내부 state 기반 라우팅
- React Router, 웹 App shell, BottomNav
- `localStorage`와 reference storage key
- `setTimeout` mock API, mock OAuth token, `Date.now()` ID
- reference 성향 질문·결과 계산·지역 데이터
- Google·Apple 등 현재 제품 범위 밖 provider

## 14. 다음 단계

기존 개인 성향 테스트를 서버 계약과 연결할 때는 다음이 필요하다.

1. 질문·답변·결과 DTO와 버전 정책 확정
2. 로컬 완료 결과와 서버 결과의 source-of-truth 정책 확정
3. guest 응답의 member 병합 정책 확정
4. 제출 중 offline/retry/idempotency 처리
5. 서버 저장 성공 기준으로 `preferenceTestCompleted`를 갱신할지 결정
6. 그룹 성향 진단과 여행방 참여 상태 재계산

## 법률 문서 TODO

현재 약관 화면은 프로토타입용 임시 안내다. 출시 전 법률 검토를 거친 서비스 이용약관·개인정보 처리방침, 수집 항목, 보유 기간, 파기 절차, 동의 버전 기록으로 반드시 교체해야 한다.
