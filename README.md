# 두리 모바일 (Duri Mobile)

함께 여행할 사람들의 장소 후보, 일정, 여행 성향을 한곳에서 조율하는 **두리**의 React Native + Expo 모바일 애플리케이션입니다.

이 저장소는 웹에서 검증한 핵심 여행 계획 흐름을 Android, iOS, Web에서 실행 가능한 모바일 UI로 옮긴 프론트엔드 프로토타입입니다. 인증은 백엔드 API를 사용하고, 여행·장소 데이터와 두리 분석 엔진은 환경 변수로 구현 단계를 선택합니다.

> **현재 상태**
> 인증 성공은 실제 백엔드 응답으로만 확정합니다. 여행·장소 기능의 `mock`, `api`, `hybrid`, `server` 모드는 계약이 확정되지 않은 기능을 다른 데이터로 몰래 대체하지 않고 명시적인 연결 대기 상태를 보여줍니다.

## 목차

- [주요 기능](#주요-기능)
- [성향 테스트와 궁합도](#성향-테스트와-궁합도)
- [기술 스택](#기술-스택)
- [빠른 시작](#빠른-시작)
- [환경 변수](#환경-변수)
- [인증 개발 환경](#인증-개발-환경)
- [주요 화면과 라우트](#주요-화면과-라우트)
- [프로젝트 구조](#프로젝트-구조)
- [상태와 데이터 흐름](#상태와-데이터-흐름)
- [워크스페이스 편집기](#워크스페이스-편집기)
- [두리 분석과 제안](#두리-분석과-제안)
- [검증과 빌드](#검증과-빌드)
- [현재 제약 사항](#현재-제약-사항)
- [문제 해결](#문제-해결)
- [문서](#문서)
- [기여 방법](#기여-방법)

## 주요 기능

### 인증과 온보딩

- 이메일·Kakao 로그인과 이메일 가입 UI, Google 백엔드 계약 대기 상태
- 익명 둘러보기, 초대 코드 기반 guest 참여
- `anonymous`, `guest`, `member` 세션과 기능 권한 분리
- 닉네임·프리셋 아바타 설정 및 온보딩 소개
- 앱 시작 시 인증·도메인·작성 중 초안의 명시적 hydration

### 홈과 장소 탐색

- 홈, 탐색, 여행방, 저장, 마이페이지의 5개 하단 탭
- 장소명·주소·지역·카테고리·태그·설명 통합 검색
- 지역·카테고리 필터와 정렬
- 장소 상세, 비슷한 장소, 개인 저장, 여행 후보 추가
- 목록과 지역 보드가 공유하는 탐색 상태

### 여행방

- 진행 중·완료·전체 여행방 필터
- 목적지 → 날짜 → 조건 → 동행자 → 확인의 5단계 생성 Wizard
- D-day, 멤버, 후보, 일정, 성향 응답률, 준비율 요약
- 작성 중인 여행방 초안 저장과 복구
- mock 데이터에 포함된 동행자 추가

### 여행 워크스페이스

- `DAY 1 / DAY 2 / + DAY 추가` 형태의 가로 날짜 selector
- 선택한 DAY의 일정 요약 캔버스와 좌우 스와이프
- 약 28% / 58% / 88%로 전환되는 하단 작업 시트
- 한 시트 안에서 `일정 보드`와 `후보 장소` 전환
- 일정 추가·수정·날짜 이동·삭제·순서 변경
- 길게 누른 뒤 끌어 놓는 일정 재정렬과 위·아래 버튼 fallback
- 후보 검색과 `전체 / 공통 관심 / 내가 담은 장소 / 동행자가 담은 장소` 필터
- 시간 범위, 30분 단위, 중복 배치, 일정 충돌, 편집 권한 검증

### 여행 성향과 두리 분석

- 메신저·친구 선택·여행 현장을 섞은 15개 상황 문항과 숙소·체력·예산·탐색 질문
- 도전 실행형·신중 탐색형·안정 계획형 분류와 여유로운·알찬 일정 수식어
- 중간 답변 복구, 결과 저장, 상세 결과 확인, 재테스트 보호
- 친구 한 명 또는 여러 명과 6개 항목을 비교하는 회원용 여행 궁합도
- 여행방 멤버별 응답 상태와 그룹 여행 성향 진단
- 일정 밀도·식사·충돌·날짜 균형·동선·후보 활용 분석
- 일정 개선 제안의 before/after와 항목별 diff
- 분석 이후 일정이 바뀐 경우 stale fingerprint로 적용 차단
- 전체 다음 일정을 검증한 뒤 한 번에 반영하는 atomic apply

## 성향 테스트와 궁합도

### 개인 여행 성향 테스트

개인 테스트는 `/tests/personal`에서 시작하며, 실제 여행에서 마주칠 법한 대화와 선택 장면으로 응답 피로도를 낮춘 5개 단계로 구성됩니다.

| 단계 | 입력 | 결과에 반영되는 값 |
| --- | --- | --- |
| 여행 장면 | 도전·안정 6문항(5점 척도)과 활동 8종 및 일정 밀도에 관한 9문항(선호·중간·불호) | 새로운 경험 접근 유형, 활동 선호, 일정 밀도 |
| 숙소 | 숙소 의미, 위치↔시설, 편안함↔가격의 3축 8점 척도 | 숙소 기준 |
| 체력 | 하루 종일 이동한 뒤의 행동 3가지 중 선택 | 낮은 편·보통·높은 편 |
| 예산 | 숙소·맛집·체험·쇼핑·이동을 많이 쓰고 싶은 순서대로 선택 | 5개 예산 카테고리 우선순위 |
| 여행지 탐색 | 대표 명소와 로컬 탐방 관심도를 각각 4점으로 선택 | 명소 필수도·로컬 관심도 |

이동수단 자체는 개인 테스트에서 묻지 않습니다. 예산 단계의 `이동`은 교통수단 선호가 아니라 이동 편의에 예산을 얼마나 우선 배정할지를 의미합니다.

도전·안정 6문항은 앱에 포함된 결정트리 모델로 `도전 실행형`, `신중 탐색형`, `안정 계획형` 중 하나를 분류합니다. 일정 밀도 60%, 휴식 선호의 역방향 25%, 체력 15%를 조합해 최종 유형 앞에 `여유로운` 또는 `알찬` 수식어를 붙입니다. 상세 결과에서는 활동 선호, 숙소 기준, 체력, 예산 우선순위와 여행지 탐색 점수를 확인할 수 있습니다.

작성 중 응답은 로컬 초안으로 복구되며 완료 결과는 사용자별로 저장됩니다. 결과 화면에서 재테스트를 시작할 수 있고, 완료 전에는 기존 결과를 덮어쓰지 않습니다.

관련 라우트:

- `/tests/personal`: 질문 진행
- `/tests/personal/review`: 응답 검토
- `/tests/personal/result`: 요약·상세 결과와 재테스트

### 친구와 궁합도 확인

궁합도는 완료된 개인 성향 결과가 있는 회원이 `/friends`에서 저장한 친구를 한 명 이상 선택해 확인합니다. 현재 친구 데이터와 계산 엔진은 `mock/local`이며 `api`, `hybrid` 모드에서는 백엔드 계약 대기 상태를 명시적으로 반환합니다.

궁합도는 이동수단을 제외한 6개 항목을 비교합니다.

| 항목 | 비교 기준 | 전체 가중치 |
| --- | --- | ---: |
| 일정 밀도 | 일정 밀도와 활동 중 휴식 선호의 유사도 | 24% |
| 체력 | LOW·NORMAL·HIGH 점수 차이 | 20% |
| 숙소 스타일 | 숙소 의미·위치/시설·편안함/가격 3축 유사도 | 20% |
| 예산 소비 | 5개 예산 카테고리의 순위 차이 | 16% |
| 새로운 경험 접근 | 탐색 성향과 신중성의 일치 또는 보완 관계 | 10% |
| 여행지 탐색 | 대표 명소와 로컬 관심의 일치 또는 보완 관계 | 10% |

예산 궁합은 각 카테고리의 순위 차이 절댓값을 모두 합산한 뒤, 5개 항목에서 가능한 최대 차이 `12`로 정규화합니다.

```text
예산 점수 = 100 × (1 - 순위 차이 합 / 12)
```

현재 궁합도 알고리즘은 v6이며, 전체 점수는 위 가중치의 산술평균입니다. 예산 점수가 0점이어도 전체에서는 가중치 16%만 감점되고, 예산 항목에는 `사전 조율` 안내를 표시합니다. 함께 여행할 때 분리하기 어려운 조건에는 다음 하드캡을 적용합니다.

- 일정·체력·숙소 중 하나가 25점 미만: 전체 최대 39점
- 일정·체력·숙소 중 하나가 25점 이상 40점 미만: 전체 최대 59점
- 새로운 경험·여행지 탐색 중 하나가 25점 미만: 전체 최대 79점
- 예산: 전체 하드캡 없음

두 사람은 한 쌍의 결과를 그대로 사용합니다. 세 명 이상은 신청자와 친구뿐 아니라 친구끼리도 포함한 모든 조합을 비교하고, 항목별 중앙 관계 70%와 가장 낮은 관계 30%를 반영합니다. 항목 상태는 `성향 일치`, `보완 시너지`, `조율 가능`, `사전 조율`로 구분합니다.

| 전체 점수 | 궁합 유형 |
| ---: | --- |
| 0~19 | 조율이 많이 필요한 사이 |
| 20~39 | 차이를 즐길 수 있는 사이 |
| 40~59 | 적당히 맞춰가는 사이 |
| 60~79 | 꽤 잘 맞는 여행 메이트 |
| 80~100 | 찰떡 여행 메이트 |

관련 라우트:

- `/friends`: 궁합도를 확인할 친구 저장
- `/tests/compatibility`: 친구 선택과 궁합도 계산
- `/tests/compatibility/result`: 전체 점수, 관계 유형과 항목별 상세

## 기술 스택

| 구분 | 기술 |
| --- | --- |
| 앱 프레임워크 | Expo SDK 57 (`expo ~57.0.4`) |
| UI 런타임 | React 19.2.3, React Native 0.86.0 |
| 라우팅 | Expo Router 57, typed routes |
| 언어 | TypeScript 6 |
| 클라이언트 상태 | Zustand 5 |
| 영속 저장 | AsyncStorage, Expo SecureStore adapter |
| 서버 상태 경계 | TanStack Query 5 |
| 애니메이션·제스처 | React Native Animated/PanResponder, Reanimated, Gesture Handler |
| 이미지·네이티브 UI | Expo Image, Expo UI, Expo Symbols |
| 품질 도구 | Expo ESLint, TypeScript, 순수 fixture 검증 스크립트 |

Expo SDK 57은 React Native 0.86, React 19.2.3, Node.js 22.13.x 이상 조합을 기준으로 합니다. 세부 SDK 정보는 [Expo SDK 57 문서](https://docs.expo.dev/versions/v57.0.0/)를 참고하세요.

## 빠른 시작

### 1. 준비물

- Node.js `22.13.x` 이상
- npm
- Android 테스트: Android Studio와 Emulator 또는 Android 기기
- iOS 테스트: macOS, Xcode와 Simulator 또는 iOS 기기
- 기기 테스트 시 SDK 57을 지원하는 Expo Go 또는 development build

### 2. 저장소 받기

```bash
git clone https://github.com/travel-route-recommender/frontend_mobile.git
cd frontend_mobile
npm ci
```

`package-lock.json`이 포함되어 있으므로 같은 의존성 구성을 재현하려면 `npm install`보다 `npm ci`를 권장합니다.

### 3. 환경 파일 만들기

macOS 또는 Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

현재 로컬 데모는 `.env.example`의 기본값 그대로 실행할 수 있습니다.

### 4. 개발 서버 실행

```bash
npm start
```

Expo 터미널에서 다음 방식으로 실행할 수 있습니다.

- `a`: Android Emulator
- `i`: iOS Simulator(macOS 필요)
- `w`: Web
- QR 코드: Expo Go 또는 development build가 설치된 실제 기기

플랫폼을 바로 지정하려면 다음 스크립트를 사용합니다.

```bash
npm run android
npm run ios
npm run web
```

## 환경 변수

공개 가능한 클라이언트 설정만 `.env`에 둡니다.

| 변수 | 허용 값 | 기본값 | 현재 동작 |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_DATA_SOURCE` | `mock`, `api`, `hybrid` | `mock` | `mock`만 전체 로컬 흐름 제공. 나머지는 계약 대기 상태 표시 |
| `EXPO_PUBLIC_API_BASE_URL` | API base URL | `http://localhost:3000/api/v1` | 향후 API client가 사용할 주소. 현재 endpoint 미구현 |
| `EXPO_PUBLIC_DURI_ENGINE` | `local`, `server` | `local` | `local` 분석 사용. `server`는 계약 대기 상태 표시 |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google Cloud의 Web OAuth client ID | 빈 값 | Google ID Token의 audience로 사용 |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google Cloud의 iOS OAuth client ID | 빈 값 | iOS Google Sign-In과 callback URL scheme 구성 |
| `EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY` | Kakao Native app key | 빈 값 | 네이티브 Kakao 로그인 SDK 초기화 |
| `EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY` | Kakao JavaScript key | 빈 값 | 탐색 지도 WebView에서 Kakao 지도 SDK를 로드 |
| `EXPO_PUBLIC_KAKAO_MAP_BASE_URL` | Kakao 플랫폼 등록 도메인 | `http://localhost:3000` | WebView inline HTML의 base URL |

기본 예시:

```dotenv
EXPO_PUBLIC_DATA_SOURCE=api
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
EXPO_PUBLIC_DURI_ENGINE=local
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY=
EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY=
EXPO_PUBLIC_KAKAO_MAP_BASE_URL=http://localhost:3000
```

`EXPO_PUBLIC_*` 값은 앱 번들에 포함될 수 있으므로 비밀번호, API secret, private key, refresh token을 넣으면 안 됩니다. 환경 변수를 바꾼 뒤에는 Expo 개발 서버를 다시 시작하세요.

Google/Kakao 네이티브 로그인은 Expo Go에서 실행되지 않으므로 Android/iOS development build에서 확인합니다. Google은 Web, Android, iOS OAuth client를 같은 Google Cloud project에 만들고, 앱에서 ID Token을 요청할 때 Web OAuth client ID를 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`에 사용합니다. Android OAuth client에는 package name `com.tripmatch.app.dev`와 빌드 인증서 SHA-1을 등록하고, iOS OAuth client에는 bundle ID `com.tripmatch.app.dev`를 등록합니다. 백엔드의 `GOOGLE_OIDC_AUDIENCES`에도 같은 Web client ID를 허용해야 합니다.

## 인증 개발 환경

인증은 `EXPO_PUBLIC_DATA_SOURCE`와 관계없이 백엔드 API를 사용합니다. 앱에 내장된 데모 계정이나 고정 초대 코드는 없으며, 로그인·회원가입·초대 참여는 실제 백엔드 데이터로 확인해야 합니다.

## 주요 화면과 라우트

Expo Router의 route group은 URL에 포함되지 않습니다.

| 영역 | 라우트 | 설명 |
| --- | --- | --- |
| 진입 | `/` | hydration과 세션 상태에 따라 첫 화면 결정 |
| 인증 | `/login`, `/signup-choice`, `/signup-email`, `/invite`, `/terms` | 로그인·가입·초대·임시 약관 |
| 온보딩 | `/profile`, `/intro` | 프로필과 서비스 소개 |
| 하단 탭 | `/home`, `/explore`, `/trips`, `/saved`, `/mypage` | 앱의 5개 주요 탭 |
| 장소 | `/explore/map`, `/places/[placeId]` | 지역 보드와 장소 상세 |
| 여행방 | `/trips/new`, `/trips/[tripId]` | 여행방 생성과 상세 |
| 워크스페이스 | `/trips/[tripId]/workspace` | 날짜별 후보·일정 편집 |
| 두리 분석 | `/trips/[tripId]/analysis` | 전체 여행 일정 분석 리포트 |
| 두리 제안 | `/trips/[tripId]/suggestions/[suggestionId]` | 제안 비교·확인·적용 |
| 개인 성향 | `/tests/personal`, `/tests/personal/review`, `/tests/personal/result` | 테스트·검토·결과 |
| 친구·궁합도 | `/friends`, `/tests/compatibility`, `/tests/compatibility/result` | 친구 저장·선택과 여행 궁합도 결과 |
| 딥링크 | `/invite/[code]` | `tripmatch://invite/:code` 수신 경계 |

잘못된 `placeId`, `tripId`, 초대 코드와 존재하지 않는 route에는 복구 가능한 오류 상태 또는 not-found 화면을 제공합니다.

## 프로젝트 구조

```text
frontend_mobile/
├─ app/                         # Expo Router route 선언과 parameter 경계
│  ├─ (auth)/                  # 로그인·가입·초대
│  ├─ (onboarding)/            # 프로필·온보딩
│  ├─ (tabs)/                  # 홈·탐색·여행·저장·마이
│  ├─ places/[placeId].tsx
│  ├─ trips/[tripId]/          # 여행 홈·워크스페이스·분석·제안
│  └─ tests/                   # 개인 성향 테스트와 친구 궁합도
├─ assets/                      # 앱 아이콘·splash 등 정적 자산
├─ docs/                        # 기능·아키텍처·회귀 검증 문서
├─ scripts/                     # 순수 로직 및 상태 무결성 검증기
├─ src/
│  ├─ components/              # 공통 UI와 feedback 상태
│  ├─ config/                  # 환경 변수 parser
│  ├─ core/state-integrity/    # normalized 상태 validator
│  ├─ data/mock/               # 정규화된 데모 데이터
│  ├─ domain/                  # 플랫폼 비의존 도메인 타입
│  ├─ duri/                    # 플랫폼 비의존 분석·제안 엔진
│  ├─ features/                # 기능별 화면·컴포넌트·서비스·순수 로직
│  ├─ query/                   # QueryClient와 query key
│  ├─ services/                # API·token·data source 경계
│  ├─ store/                   # Zustand domain Store와 migration
│  ├─ theme/                   # 색상·간격·radius 등 디자인 토큰
│  └─ utils/                   # 공통 유틸리티
├─ .env.example
├─ app.json
└─ package.json
```

`app/` 파일은 가능한 한 얇게 유지합니다. 실제 화면과 기능 코드는 `src/features/*`에 두고, 플랫폼과 무관한 계산은 `src/domain`, `src/duri`, feature별 `logic` 또는 `selectors`로 분리합니다.

## 상태와 데이터 흐름

### 정규화된 도메인 상태

사용자, 지역, 장소, 여행방, 후보 장소, 일정, 성향 결과, 저장 장소는 ID 기반 map과 relation으로 관리합니다. Place 객체를 후보나 일정에 복제하지 않으며 화면에 필요한 수치와 상태는 selector에서 파생합니다.

대표 흐름은 다음과 같습니다.

```text
Place
  ├─ savedPlaceIdsByUserId     개인 저장
  ├─ candidatesByTripId        여행방 후보
  └─ itineraryByTripId         날짜·시간이 있는 실제 일정
```

### 영속 저장

- 도메인 Store: AsyncStorage `duri-mobile-store`, schema version 4
- 개인 성향 작성 초안: `duri-personal-preference-draft`
- 여행방 생성 초안: `duri-create-trip-draft`
- 탐색 필터, 선택 DAY, 열린 modal, bottom sheet snap, 분석 session과 receipt: 비영속 상태
- access token, refresh token, 비밀번호, secret: AsyncStorage 저장 금지

root layout은 Store hydration이 모두 끝나기 전에 빈 화면이나 잘못된 redirect를 렌더하지 않습니다. 저장 데이터 복구에 실패하면 재시도 가능한 오류 화면을 표시합니다.

### 데이터 모드 원칙

- `mock`: 정규화 Store, local service와 데모 데이터를 사용합니다.
- `api`: 실제 DTO와 endpoint가 확정되기 전까지 명시적인 unavailable 결과를 반환합니다.
- `hybrid`: 서버 ID와 local ID, 캐시 경계가 합의되기 전까지 서로 다른 데이터를 섞지 않습니다.

API 연결 실패를 mock 성공으로 위장하지 않는 것이 이 프로젝트의 중요한 데이터 원칙입니다.

## 워크스페이스 편집기

워크스페이스는 상단의 맥락 확인 영역과 하단의 실제 작업 영역으로 나뉩니다.

```text
여행방 헤더와 진행 요약
DAY 1 / DAY 2 / + DAY 추가
선택 DAY 일정 요약 캔버스
────────────────────────────
Bottom Sheet: 28% / 58% / 88%
  [일정 보드] [후보 장소]
  일정 편집 또는 후보 검색·배치
```

- 날짜 탭과 캔버스 스와이프는 하나의 `selectedDate`를 공유합니다.
- 시트 이동은 handle에서만 시작해 내부 스크롤·DAY 스와이프·일정 drag와 충돌하지 않게 분리합니다.
- 일정 drag 중에는 시트 내부 ScrollView와 DAY 스와이프를 잠급니다.
- 제스처 사용이 어렵거나 실제 기기에서 불안정할 때도 위·아래 이동 버튼으로 같은 작업을 할 수 있습니다.
- `startTime + durationMinutes`가 일정 시간의 기준이며 종료 시간은 파생합니다.
- 일정 추가·수정·삭제, 후보 제거는 UI뿐 아니라 Store action에서도 여행방 상태와 membership을 다시 검증합니다.

세부 정책은 [모바일 워크스페이스 편집기](docs/MOBILE_WORKSPACE_EDITOR.md)에 정리되어 있습니다.

## 두리 분석과 제안

`src/duri`는 React와 Store를 import하지 않는 순수 분석 엔진이고, `src/features/duri`는 모바일 application/UI 계층입니다.

분석과 제안 적용 흐름:

1. 한 여행방의 멤버 성향, 후보, 전체 일정을 immutable snapshot으로 구성합니다.
2. 전체 입력 fingerprint와 algorithm version을 기록합니다.
3. 일정 문제와 조율 포인트를 분석합니다.
4. 제안의 before/after, stable ID 기반 diff와 기대 효과를 계산합니다.
5. 사용자가 적용하기 직전에 fingerprint와 전체 next itinerary를 다시 검증합니다.
6. `applyDuriSuggestionAtomically`이 해당 여행의 일정을 Zustand update 한 번으로 교체합니다.

분석 뒤 사용자가 일정을 수동으로 바꾸면 기존 제안은 stale 상태가 되어 적용되지 않습니다. 현재는 local 엔진만 동작하며, server 분석과 Schedule batch API는 계약 확정 후 연결할 예정입니다.

## 검증과 빌드

### 기본 품질 검사

```bash
npm run lint
npm run typecheck
npx expo-doctor
```

### 기능별 회귀 검사

| 명령 | 검증 범위 |
| --- | --- |
| `npm run verify:group-preferences` | 멤버 응답 집계와 그룹 성향 진단 |
| `npm run verify:preference-compatibility` | 개인 성향 특징값·분류와 친구 궁합도 계산·하드캡 |
| `npm run verify:trip-flow` | 여행방 정렬·날짜·초안·생성·준비율 |
| `npm run verify:place-flow` | 검색·필터·저장·후보·권한 관계 |
| `npm run verify:workspace-editor` | DAY, 일정 편집·충돌·순서·후보 관계 |
| `npm run verify:duri-analysis` | 분석·제안·stale·atomic apply |
| `npm run validate:state` | 현재 데모 상태의 무결성 진단 |
| `npm run verify:state-integrity` | 손상 상태 fixture와 안전한 복구 경계 |

### 전체 플랫폼 export

```bash
npm run build
```

이 명령은 Android, iOS, Web 번들을 `dist/`에 export해 Metro bundling과 정적 자산 참조를 확인합니다. Play Store용 AAB나 App Store용 IPA를 만드는 production build는 아니며, EAS 프로젝트와 signing 설정이 별도로 필요합니다.

권장 검증 순서:

```bash
npm run lint
npm run typecheck
npm run verify:preference-compatibility
npm run verify:group-preferences
npm run verify:trip-flow
npm run verify:place-flow
npm run verify:workspace-editor
npm run verify:duri-analysis
npm run validate:state
npm run verify:state-integrity
npm run build
```

순수 fixture 검증이 통과해도 bottom sheet handle, DAY 스와이프, 일정 drag, 키보드, safe area는 Android와 iOS 실제 터치 환경에서 별도로 확인해야 합니다.

## 현재 제약 사항

### 백엔드 계약 대기

- 운영 Auth 서버 smoke/E2E와 Google/Kakao 계정 병합 정책
- 여행방·장소·저장·후보·일정 API
- 초대 코드 조회·수락과 실제 사용자 초대
- 두리 server engine과 일정 batch mutation
- guest 계정을 정식 member 계정으로 병합하는 정책

### 네이티브·출시 준비 대기

- 좌표 기반 실제 지도와 위치 권한
- push notification과 universal/app link 배포 도메인
- Android package, iOS bundle identifier, EAS project ID
- store signing, TestFlight, Play Internal Testing
- 정식 앱 아이콘·splash·스토어 screenshot
- 확정된 이용약관과 개인정보 처리방침

### 현재 사용하는 대체 구현

- 지도 화면은 좌표 marker 대신 장소·지역 탐색 보드를 제공합니다.
- 초대는 실제 검색이나 알림 없이 기존 mock 사용자를 여행방에 추가합니다.
- Auth UI와 SecureStore adapter는 있으나 실제 token 발급·refresh는 없습니다.
- Web export는 모바일 UI 확인용이며 production 웹 서비스 배포 설정은 포함하지 않습니다.

## 문제 해결

### Metro cache 때문에 변경 내용이 보이지 않을 때

```bash
npx expo start -c
```

### 저장된 mock 상태를 처음부터 확인하고 싶을 때

Android/iOS에서는 Expo Go 또는 development build의 앱 데이터를 지운 뒤 다시 실행합니다. Web에서는 해당 개발 주소의 브라우저 저장소를 지웁니다. `node_modules`나 소스 파일을 삭제할 필요는 없습니다.

### Windows PowerShell에서 `npm.ps1` 실행이 차단될 때

PowerShell 실행 정책을 임의로 낮추는 대신 `npm.cmd`를 사용할 수 있습니다.

```powershell
npm.cmd ci
npm.cmd start
```

### iOS Simulator가 열리지 않을 때

iOS Simulator와 Xcode는 macOS에서만 실행할 수 있습니다. Windows에서는 Android Emulator, 실제 기기 또는 Web을 사용하세요.

### 환경 변수를 바꿨는데 반영되지 않을 때

실행 중인 Expo 서버를 종료하고 다시 시작합니다. 그래도 남아 있으면 `npx expo start -c`로 Metro cache를 비웁니다.

## 문서

| 문서 | 내용 |
| --- | --- |
| [모바일 아키텍처](docs/MOBILE_ARCHITECTURE.md) | route, feature 경계, Store, persist, service 구성 |
| [웹 → 모바일 대응표](docs/WEB_TO_MOBILE_MAPPING.md) | 웹 화면과 모바일 route·기능 대응 |
| [모바일 마이그레이션 상태](docs/MOBILE_MIGRATION_STATUS.md) | 단계별 구현 이력과 계약 대기 기록 |
| [인증·온보딩](docs/MOBILE_AUTH_ONBOARDING.md) | 세션 종류, mock 인증, member gate |
| [장소 탐색 흐름](docs/MOBILE_PLACE_EXPLORATION_FLOW.md) | 검색·저장·후보 추가와 권한 |
| [여행방 흐름](docs/MOBILE_TRIP_ROOM_FLOW.md) | 목록·생성 Wizard·여행 홈 |
| [워크스페이스 편집기](docs/MOBILE_WORKSPACE_EDITOR.md) | bottom sheet, DAY, 일정·후보 편집 정책 |
| [개인 여행 성향 테스트](docs/MOBILE_PREFERENCE_TEST.md) | 질문·draft·결과·재테스트 |
| [그룹 여행 성향 진단](docs/MOBILE_GROUP_PREFERENCE_DIAGNOSIS.md) | 응답 집계와 그룹 조율 지표 |
| [두리 분석·제안·원자 적용](docs/MOBILE_DURI_ANALYSIS_AND_SUGGESTIONS.md) | 분석 입력, fingerprint, preview, apply |
| [상태 무결성](docs/MOBILE_STATE_INTEGRITY.md) | validator, migration과 session isolation |
| [E2E 기능 Inventory](docs/MOBILE_E2E_FEATURE_INVENTORY.md) | 전체 route별 입력·권한·상태·오류 |
| [E2E 회귀 보고서](docs/MOBILE_E2E_REGRESSION_REPORT.md) | 자동·수동 검증 범위와 남은 QA |
| [릴리스 체크리스트](docs/MOBILE_RELEASE_CHECKLIST.md) | 앱 식별, 정책, native 연동과 배포 준비 |

## 기여 방법

1. `main`에서 작업 브랜치를 만듭니다.
2. 기존 화면·디자인 토큰·정규화 관계를 최대한 재사용합니다.
3. 기능과 함께 필요한 순수 로직 검증 또는 fixture를 갱신합니다.
4. lint, typecheck, 관련 검증 스크립트와 전체 export를 실행합니다.
5. 변경 목적, 테스트 방법, mock/placeholder 여부를 Pull Request에 적습니다.

예시:

```bash
git checkout -b feature/mobile-workspace
git add .
git commit -m "feat(mobile): refine workspace editing flow"
git push -u origin feature/mobile-workspace
```

작업 시 다음 원칙을 지켜 주세요.

- 동작하는 화면을 통째로 다시 쓰기보다 기존 컴포넌트를 재사용합니다.
- React, Expo, TypeScript를 임의로 업그레이드하지 않습니다.
- API 계약이 없으면 endpoint나 DTO를 추측하지 않습니다.
- Store에 파생 값을 중복 저장하지 않습니다.
- unrelated refactor와 broad file rename을 피합니다.
- 변경 후 `npm run build`까지 통과하는지 확인합니다.

## 라이선스

이 저장소의 라이선스 정보는 [LICENSE](LICENSE)를 확인하세요.

## 일정표 에셋 관리

일정표·드래그 기능 본체: [`DraggableItineraryEditor.tsx`](src/features/preferences/components/DraggableItineraryEditor.tsx)

재사용 에셋 진입점: [`itinerary-schedule-builder.tsx`](src/features/preferences/assets/itinerary-schedule-builder.tsx)

8종류 블록의 이름·아이콘·색상: [`travel-preference-test-config.ts`](src/features/preferences/config/travel-preference-test-config.ts)

08:00~24:00 시간 슬롯·일정표 행 설정: [`travel-preference-test-config.ts`](src/features/preferences/config/travel-preference-test-config.ts)
