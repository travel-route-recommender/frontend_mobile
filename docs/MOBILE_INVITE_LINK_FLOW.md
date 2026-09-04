# 모바일 여행방 초대 링크 흐름

## 현재 범위

API 모드는 서버가 발급한 초대 코드·HTTPS 링크로 다른 기기의 사용자를 여행방에 참여시킨다. mock 모드는 개발 편의를 위해 기기 내부 링크 상태를 별도로 유지하며 API 데이터와 섞지 않는다.

여행방 홈의 `동행자 초대`에서 다음 기능을 제공한다.

- 여행방별 활성 초대 링크와 8자리 코드 발급
- `expo-clipboard`를 통한 링크 복사
- React Native OS 공유 창을 통한 초대 링크 공유
- 새 링크 발급으로 이전 로컬 링크 무효화
- 현재 링크 사용 중지와 재발급
- 링크 진입 시 여행방·revision·코드 재검증
- 기존 member/guest의 중복 없는 참여 또는 비로그인 사용자의 mock guest 참여
- 참여 성공 후 해당 여행방을 active trip으로 선택하고 바로 이동

## 파일과 책임

| 위치 | 책임 |
|---|---|
| `src/features/invitations/logic/tripInviteLinks.ts` | 코드 생성, 딥링크 생성, 활성·교체·중지·완료 상태 검증 |
| `src/features/invitations/store/useTripInviteStore.ts` | `duri-trip-invites` AsyncStorage 상태와 link revision 관리 |
| `src/features/invitations/hooks/useTripInviteHydration.ts` | client mount 이후 저장소 복원과 오류·재시도 처리 |
| `src/features/invitations/services/inviteShareService.ts` | 클립보드, Native OS 공유와 Web Share adapter |
| `src/features/invitations/services/tripInviteApi.ts` | API 초대 링크 조회·재발급과 HTTPS 주소 정규화 |
| `src/features/invitations/components/TripInviteManagerModal.tsx` | 발급·공유·교체·중지 UI |
| `app/invite/[code].tsx` | 딥링크의 `code`, `tripId`, `revision`을 참여 화면에 전달 |
| `app/+native-intent.tsx` | 외부 HTTPS/custom scheme을 초대 route로 변환 |
| `app.config.js` | Android App Link와 iOS Universal Link native 설정 |
| `src/features/auth/screens/AuthScreens.tsx` | 최신 링크 재검증, 멤버 추가, 여행방 이동 |

## 링크 형식과 수명주기

운영 공유 링크는 다음 형식이다.

```text
https://{API_HOST}/api/v1/invites/{CODE}
```

메시지 앱은 표준 HTTPS 링크를 받는다. 설치된 앱은 App/Universal Link로 `/invite/{CODE}`를 열고, OS 연결이 아직 완료되지 않은 환경에서는 HTTPS 안내 페이지의 `두리 앱에서 열기` 버튼이 `tripmatch://invite/{CODE}`로 연결한다. 앱은 두 형식을 같은 초대 화면으로 해석한다.

링크를 새로 발급하면 서버 코드가 바뀌어 이전 코드는 거부된다. 참여 버튼을 누를 때도 서버가 최신 활성 코드, 완료된 방, 중복 참여를 다시 검증한다. mock에서는 revision·코드·여행방 조합을 기기 Store에서 같은 방식으로 확인한다.

mock 코드는 테스트 재현성을 위한 결정적 값이므로 보안 토큰이 아니다. 운영 환경에서는 충분한 entropy의 불투명한 서버 토큰, 만료 시간, 해시 저장, rate limit과 감사 로그가 필요하다.

초대 Store는 `skipHydration`으로 선언하고 root layout이 client effect에서 명시적으로 복원한다. 따라서 Web static render 중 `AsyncStorage`가 브라우저의 `window`를 먼저 참조하지 않으며, 앱 화면은 초대 링크를 포함한 모든 필수 Store 복원이 끝난 뒤 열린다.

## 링크 공유

현재 UI는 앱을 특정하지 않는 `초대 링크 공유`와 `링크 복사`만 제공한다. OS 공유 창에서 사용자가 카카오톡을 포함한 설치된 앱을 선택할 수 있으며, 단순 텍스트·링크 공유에는 Backend가 필요하지 않다. 카카오톡 전용 버튼은 같은 OS 공유 창을 중복 호출하므로 제공하지 않고 Kakao Developers 앱 키도 코드에 임의로 넣지 않는다.

API 모드의 HTTPS 주소는 Web Share API의 표준 `url` 필드에 전달한다. 로컬 mock의 `tripmatch://` 커스텀 스킴은 `url` 필드가 아닌 텍스트에만 포함해 브라우저의 `Invalid URL` 오류를 막는다. Web Share API를 지원하지 않거나 공유 창을 열지 못한 브라우저에서는 `링크 복사`를 사용한다.

카카오톡 공유 템플릿을 곧바로 실행하는 정식 연동으로 교체하려면 Kakao Developers 앱, Android package key hash와 iOS bundle 설정, native/JavaScript SDK 선택, 메시지 template 및 운영 링크 정책이 먼저 확정되어야 한다. 그 전까지는 범용 OS 공유를 사용한다.

## mock 모드의 한계

- 링크 발급·교체·중지 상태는 발급한 기기에만 저장된다.
- 기본 demo 여행방은 동일 seed가 있는 기기에서 확인할 수 있지만, 한 기기에서 새로 만든 여행방 데이터는 다른 기기에 존재하지 않는다.
- `tripmatch://` 링크는 앱이 설치된 development/production build에서만 확인할 수 있다.
- 다른 기기에서 실제 방을 조회하거나 링크 폐기 상태를 공유하는 검증은 API 모드에서 수행한다.
- 수신자가 이미 member라면 그 ID로 멱등하게 추가하고, 인증 사용자가 없을 때만 안정적인 로컬 guest ID를 만든다. guest에서 member로 병합하는 정책은 아직 없다.

## 운영 배포 조건

- Frontend 빌드의 `DURI_INVITE_LINK_BASE_URL`과 Backend `APP_BASE_URL`이 같은 공개 HTTPS 초대 주소를 가리켜야 한다.
- Backend에 Android package·서명 SHA-256과 Apple Team ID·bundle ID를 설정하고 루트의 두 association 응답을 확인한다.
- App/Universal Link 설정은 native manifest/entitlement에 들어가므로 설정 변경 뒤 앱을 새로 빌드·설치한다.
- 앱 미설치 시에는 HTTPS 안내 페이지가 표시되며 임의의 여행방 정보는 노출하지 않는다.

## 검증

`npm.cmd run verify:trip-flow`은 HTTPS/custom scheme 경로 변환, Web Share payload, 활성 링크 해석, 수동 코드 해석, 교체 전 stale 링크, 중지 링크, 완료 여행과 위조된 조합을 회귀 검증한다. `npm.cmd run verify:release-config`, `npm.cmd run typecheck`과 Expo Android/Web export도 함께 통과해야 한다.
