# 모바일 인증·온보딩

이 문서는 `Frontend_mobile`의 인증·온보딩 흐름과 서버 연결 경계를 설명한다. 인증은 `EXPO_PUBLIC_DATA_SOURCE`에 따라 mock 데모 또는 현재 `Backend`의 `/api/v1` 계약을 사용한다.

## 1. 인증 route

| route | 화면 | 역할 |
|---|---|---|
| `/(auth)/login` | `LoginScreen` | 이메일·Kakao 로그인 |
| `/(auth)/signup-choice` | `SignupChoiceScreen` | 이메일 또는 Kakao 시작 방식 선택 |
| `/(auth)/signup-email` | `SignupEmailScreen` | 이메일·비밀번호와 필수 약관 동의 |
| `/(auth)/invite` | `InviteJoinScreen` | 링크 preview, 활성 상태 검증, member 또는 guest 참여 |
| `/(auth)/terms?type=service` | `TermsScreen` | 임시 서비스 안내 문구 |
| `/(auth)/terms?type=privacy` | `TermsScreen` | 임시 개인정보 안내 문구 |
| `/invite/[code]` | redirect | 딥링크의 코드·tripId·revision을 초대 화면으로 전달 |

route 파일은 `src/features/auth/screens`의 화면만 export한다. 긴 화면 로직은 `app` 아래에 두지 않는다.

## 2. onboarding route

| route | 화면 | 완료 상태 |
|---|---|---|
| `/(onboarding)/profile` | `ProfileSetupScreen` | `profileCompleted` |
| `/(onboarding)/intro` | `OnboardingIntroScreen` | `onboardingIntroSeen` |
| `/(onboarding)/quick-test` | `OnboardingPreferenceTestScreen` | 6문항 간단 테스트 결과 저장 성공 시 `preferenceTestCompleted` |
| `/tests/personal` | `PersonalTestScreen` | 마이페이지에서 실행하는 상세 여행 성향 테스트 |

`app/index.tsx`의 bootstrap은 domain, auth, preference draft Store hydration이 끝난 뒤 세션 상태, 프로필 완료, 소개 확인 순으로 진입 위치를 결정한다. root layout은 여기에 여행방 생성 draft와 invite link Store까지 client에서 복원하고, 인증 세션의 사용자 ID를 기존 도메인 Store의 `currentUserId`와 맞춘다.

## 3. sessionKind

- `anonymous`: 로그인 없이 홈·탐색·장소 상세를 둘러보는 세션. 가짜 User를 만들지 않는다.
- `guest`: 초대 링크로 특정 여행방에 바로 참여한 임시 사용자. guest → member 병합은 현재 백엔드에 없다.
- `member`: 이메일 또는 Kakao로 시작한 회원 세션.
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
| `mock` | 고정 데모 로그인, 안정적인 ID의 이메일 가입, 여행방별 로컬 링크/code 참여가 동작한다. 운영 token은 만들지 않는다. |
| `api` | `Backend/FRONTEND_API_CONTRACT.md`의 login/signup/refresh/logout/Kakao/join-by-invite 및 invite preview/accept 계약을 호출한다. |
| `hybrid` | 공개·로컬 기능은 기존 설정을 따르되 Auth는 `api`와 같은 실제 서버 계약을 사용한다. mock으로 fallback하지 않는다. |

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

Refresh Token은 `expo-secure-store`에 저장하고 Access Token은 프로세스 메모리에만 둔다. 앱 재시작 또는 Access Token 만료 시 `/auth/refresh`로 두 토큰을 갱신한다. 백엔드 응답에는 `expiresIn`이 없으므로 Access JWT의 `exp`를 읽어 선제 갱신 시점을 계산한다. 로그아웃은 Bearer Access Token과 JSON body의 Refresh Token을 `/auth/logout`에 전달한 뒤 로컬 토큰을 비운다.

## 8. 실제 Auth API 계약

- 이메일 로그인: `POST /auth/login`에 `email`, `password`만 전송한다.
- 이메일 가입: `POST /auth/signup`에 `nickname`, `email`, `password`만 전송한다.
- 갱신: `POST /auth/refresh`에 JSON body `{ refreshToken }`만 전송한다.
- 로그아웃: Bearer 인증과 함께 `POST /auth/logout`에 `{ refreshToken }`을 전송한다.
- Kakao: Kakao Access Token을 `POST /auth/oauth/kakao`의 `{ accessToken }`으로 교환한다.
- 초대: 비회원은 `POST /auth/join-by-invite`, 기존 회원은 `POST /invites/:code/accept`를 사용한다. 미리보기는 `GET /invites/:code/preview`다.
- 성공 응답은 `{ accessToken, refreshToken, user }`, 게스트 참여는 여기에 `roomId`가 추가된다.
- 현재 백엔드 오류에는 커스텀 `code`가 없으므로 보호 API의 무코드 401은 한 번 갱신·재시도하고, refresh의 무코드 401은 세션 만료로 처리한다.

현재 백엔드에 없는 Google 로그인, guest → member 업그레이드, 계정 삭제는 별도 계약이 필요하다. API/hybrid 로그인·가입 화면에서는 Google 버튼을 노출하지 않는다.

Kakao 로그인은 Native SDK(`@react-native-kakao/user`)를 사용하며 `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY`가 필요하다. Kakao Developers의 Redirect URI는 http/https만 허용해 `tripmatch://` 같은 앱 스킴을 등록할 수 없으므로, 브라우저 OAuth 대신 Native SDK로 access token을 직접 받아 `/auth/oauth/kakao`에 넘긴다. Redirect URI 등록은 필요 없고 대신 [앱 설정] > [플랫폼]에 iOS 번들 ID(`com.tripmatch.duri`)와 Android 패키지명을 등록해야 한다. 앱 키가 바뀌면 config plugin이 Info.plist의 URL scheme(`kakao{NATIVE_APP_KEY}`)을 다시 써야 하므로 네이티브 재빌드가 필요하다. 로그인 취소는 `Cancelled`/`AccessDenied` 코드로 돌아온다.

프런트 mock 링크 관리, OS/Kakao 공유 경계와 추후 API 계약은 `MOBILE_INVITE_LINK_FLOW.md`를 따른다.

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
- `preferenceTestCompleted`: member/guest 성향 결과가 실제 도메인 Store에 저장된 뒤에만 `true`.

“다음에 하기”는 `preferenceTestCompleted`를 바꾸지 않는다. anonymous 체험 결과도 이 값을 바꾸지 않는다. 회원가입 온보딩에서는 기존 6문항 간단 테스트를 사용하고, 마이페이지의 마이테스트에서는 일정표 편집을 포함한 상세 테스트를 사용한다. 두 화면의 진행 상태는 서로 공유하지 않는다.

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

개인 성향 테스트를 서버 계약과 연결할 때는 다음이 필요하다.

1. 질문·답변·결과 DTO와 버전 정책 확정
2. 로컬 완료 결과와 서버 결과의 source-of-truth 정책 확정
3. guest 응답의 member 병합 정책 확정
4. 제출 중 offline/retry/idempotency 처리
5. 서버 저장 성공 기준으로 `preferenceTestCompleted`를 갱신할지 결정
6. 그룹 성향 진단과 여행방 참여 상태 재계산

## 법률 문서 TODO

현재 약관 화면은 프로토타입용 임시 안내다. 출시 전 법률 검토를 거친 서비스 이용약관·개인정보 처리방침, 수집 항목, 보유 기간, 파기 절차, 동의 버전 기록으로 반드시 교체해야 한다.
