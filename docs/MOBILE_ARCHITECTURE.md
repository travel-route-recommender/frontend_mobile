# 모바일 아키텍처

## Router와 화면

Expo SDK 57의 Expo Router를 사용한다. `app/`은 route 선언과 parameter 경계만 담당하며 실제 화면은 `src/features/*/screens`에 둔다. 5개 하단 탭은 실험적 Native Tabs가 아닌 안정형 JavaScript `Tabs`다. 상세 화면은 root `Stack`에 포함된다.

## Feature 구조

- `src/components/common`: Screen, Header, 버튼, 입력, 카드, 칩, 아바타, 이미지 fallback
- `src/components/feedback`: Loading, Empty, Error 상태
- `src/features`: 화면과 feature별 네이티브 UI
- `src/domain`: 플랫폼 비의존 도메인 타입
- `src/duri`: 플랫폼 비의존 성향·분석·제안 엔진
- `src/data/mock`: normalized demo data
- `src/store`: Zustand state, persist, migration, selectors
- `src/services`: API·token·data source 경계
- `src/query`: QueryClient와 query key factory

## Store와 persist

웹의 normalized 구조를 유지한다. 상태에는 사용자, 지역, 장소, 여행방, 후보, 일정, 성향 결과, 분석 cache 자리와 사용자별 저장 ID가 있다. `zustand/middleware`의 `createJSONStorage`와 AsyncStorage를 사용하며 storage key는 `duri-mobile-store`, persist version은 `3`이다. migration은 알려지지 않은 저장값을 검증하고 normalized relation을 복구한다.

`skipHydration`으로 자동 초기화를 끄고 root layout에서 명시적으로 rehydrate한다. hydrate가 끝나기 전에는 빈 상태나 route redirect를 렌더하지 않는다. 복구 실패 시 재시도 가능한 ErrorState를 표시한다.

access token, refresh token, 비밀번호와 secret은 AsyncStorage persist 대상이 아니다.

## SecureStore

`TokenStorage` interface와 `nativeTokenStorage` adapter만 제공한다. 구현은 `expo-secure-store`를 사용하지만 실제 login, refresh, mock token은 없다. UI는 adapter를 직접 호출하지 않는다.

## Query와 서비스

QueryClient는 module singleton이다. query retry는 최대 1회, mutation retry는 비활성화했고 refocus 재요청을 끈다. endpoint는 추측하지 않았다. `ApiClient` interface, mock `TravelService`, query key factory를 두었고 API/hybrid mode는 계약이 없을 때 명시적으로 오류를 낸다. API 실패를 mock으로 몰래 전환하지 않는다.

## 데이터 소스

- `mock`: 현재 기본값. Store와 mock service가 로컬 데모 데이터를 사용
- `api`: OpenAPI 계약 수신 후 구현. 현재 명시적 미지원 오류
- `hybrid`: 캐시·로컬 엔진 경계를 정한 뒤 구현. 현재 명시적 미지원 오류

환경 변수는 `.env.example`에 공개 가능한 값만 둔다. `EXPO_PUBLIC_*`에는 secret을 넣지 않는다.

## Duri local engine

개인 성향 결과, 그룹 진단, GroupPlanningProfile, 일정 분석, suggestion fingerprint, preview와 적용 함수는 React와 Store를 import하지 않는 순수 함수다. 같은 normalized 입력에 대해 웹과 같은 분석 결과를 내도록 기준 구현을 유지한다.

## 딥링크

scheme은 `tripmatch`다. `tripmatch://invite/:code`는 `app/invite/[code].tsx`로 받을 준비만 했다. 빈 code는 복구 가능한 오류 설명을 표시한다. 실제 조회·수락·인증 전환은 백엔드 계약 후 연결한다.

## 출시 전 TODO

iOS bundle identifier, Android package, EAS projectId, Apple Team ID와 production URL은 결정하지 않았다. `app.json`에 임의의 값을 넣지 않는다.
