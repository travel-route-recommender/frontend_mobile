# 모바일 여행방 초대 링크 흐름

## 현재 범위

이 기능은 `frontend_mobile`의 mock 모드에서만 동작한다. Backend 코드는 수정하지 않았으며 `api`와 `hybrid` 모드에서는 로컬 여행방으로 fallback하지 않고 Invite API 계약 대기 안내를 표시한다.

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
| `src/features/invitations/components/TripInviteManagerModal.tsx` | 발급·공유·교체·중지 UI |
| `app/invite/[code].tsx` | 딥링크의 `code`, `tripId`, `revision`을 참여 화면에 전달 |
| `src/features/auth/screens/AuthScreens.tsx` | 최신 링크 재검증, 멤버 추가, 여행방 이동 |

## 링크 형식과 수명주기

현재 native 링크 형식은 다음과 같다.

```text
tripmatch://invite/{CODE}?tripId={TRIP_ID}&revision={REVISION}
```

앱 scheme은 `app.json`의 `tripmatch`다. 링크를 새로 발급하면 revision과 코드가 함께 바뀌며, 같은 기기의 Store에 최신 record가 있으면 이전 revision은 `stale`로 거부된다. 사용 중지된 record는 `disabled`, 완료된 여행은 `closed`, code와 tripId 조합이 맞지 않으면 `invalid`로 거부한다. 참여 버튼을 누를 때 Store의 최신 상태로 다시 검증해 화면 preview 이후 링크가 교체되는 경쟁 상태도 막는다.

mock 코드는 테스트 재현성을 위한 결정적 값이므로 보안 토큰이 아니다. 운영 환경에서는 충분한 entropy의 불투명한 서버 토큰, 만료 시간, 해시 저장, rate limit과 감사 로그가 필요하다.

초대 Store는 `skipHydration`으로 선언하고 root layout이 client effect에서 명시적으로 복원한다. 따라서 Web static render 중 `AsyncStorage`가 브라우저의 `window`를 먼저 참조하지 않으며, 앱 화면은 초대 링크를 포함한 모든 필수 Store 복원이 끝난 뒤 열린다.

## 링크 공유

현재 UI는 앱을 특정하지 않는 `초대 링크 공유`와 `링크 복사`만 제공한다. OS 공유 창에서 사용자가 카카오톡을 포함한 설치된 앱을 선택할 수 있으며, 단순 텍스트·링크 공유에는 Backend가 필요하지 않다. 카카오톡 전용 버튼은 같은 OS 공유 창을 중복 호출하므로 제공하지 않고 Kakao Developers 앱 키도 코드에 임의로 넣지 않는다.

`tripmatch://` 커스텀 스킴은 Web Share API의 URL 필드에 전달하지 않는다. 공유 문구의 텍스트에 링크를 포함해 브라우저의 `Invalid URL` 오류를 막고, Web Share API를 지원하지 않거나 공유 창을 열지 못한 브라우저에서는 `링크 복사`를 사용하도록 명확히 안내한다. Web 공유는 사용자 클릭과 HTTPS 보안 컨텍스트가 필요하다.

카카오톡 공유 템플릿을 곧바로 실행하는 정식 연동으로 교체하려면 Kakao Developers 앱, Android package key hash와 iOS bundle 설정, native/JavaScript SDK 선택, 메시지 template 및 운영 링크 정책이 먼저 확정되어야 한다. 그 전까지는 범용 OS 공유를 사용한다.

## 프런트 mock의 한계

- 링크 발급·교체·중지 상태는 발급한 기기에만 저장된다.
- 기본 demo 여행방은 동일 seed가 있는 기기에서 확인할 수 있지만, 한 기기에서 새로 만든 여행방 데이터는 다른 기기에 존재하지 않는다.
- `tripmatch://` 링크는 앱이 설치된 development/production build에서 확인해야 하며 웹 주소나 앱 설치 fallback 역할을 하지 않는다.
- 다른 기기에서 실제 방을 조회하거나 링크 폐기 상태를 즉시 공유하는 기능은 Backend 연동 전에는 제공할 수 없다.
- 수신자가 이미 member라면 그 ID로 멱등하게 추가하고, 인증 사용자가 없을 때만 안정적인 로컬 guest ID를 만든다. guest에서 member로 병합하는 정책은 아직 없다.

## 추후 Invite API 계약

Backend 연동 단계에서는 최소한 다음 계약을 함께 확정해야 한다.

1. 여행방의 초대 생성·재발급·폐기 endpoint와 owner/member 권한
2. 토큰 조회 시 room preview, 만료·폐기·완료·권한 오류 규격
3. 초대 수락의 인증/guest 처리와 중복 요청 idempotency
4. 동시 수락, 최대 인원, 차단 사용자, 탈퇴 후 재참여 정책
5. guest → member 병합과 기존 성향·일정 기여 데이터 소유권
6. HTTPS universal/app link, 앱 미설치 fallback과 링크 도메인 검증
7. Kakao template 링크와 서버 토큰을 분리하는 보안 정책

프런트 연결 지점은 `resolveMockTripInvite`, `useTripInviteStore`, `authService.joinByInvite`다. 서버 DTO를 추측해 현재 mock 데이터와 혼합하지 않는다.

## 검증

`npm.cmd run verify:trip-flow`은 활성 링크 해석, 수동 코드 해석, 교체 전 stale 링크, 중지 링크, 완료 여행, 위조된 조합과 링크 형식을 회귀 검증한다. `npm.cmd run typecheck`과 Expo Android/Web export도 함께 통과해야 한다.
