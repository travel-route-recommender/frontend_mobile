# DURI Avatar Preset Contract

- Status: frontend asset registry ready; Backend persistence deferred
- Registry: `src/features/auth/config/duri-avatar-presets.ts`

## Current Problem

- `User`에는 `initial`과 optional `profileImageUrl`만 있다.
- onboarding의 emoji preset은 `initial`에 저장되지만 로그인/API mapping은 nickname 첫 글자로 `initial`을 다시 만든다.
- Profile Edit는 nickname과 raw profile image URL만 지원한다.
- `BackendUser` 및 `ProfileUpdateInput`에 avatar preset field가 없다.
- 공통 `Avatar` renderer는 `profileImageUrl`이 있으면 이미지를, 없으면 `initial`의 첫 글자를 표시한다.
- Mock/API 어느 쪽에도 DURI preset ID를 영속화하는 계약이 없다.

Frontend-only field를 `User`에 추가하면 실제 저장이 되는 것처럼 보이므로 이번 작업에서는 domain과 API shape를 변경하지 않았다.

## Current Asset Registry

Registry ID는 사용자가 직접 선택하는 시각 preset을 뜻한다. 성별이나 사용자 이름을 뜻하지 않는다.

| Stable ID | Product label | Current source asset |
| --- | --- | --- |
| `duri-sky-scarf` | 하늘 스카프 두리 | `assets/images/duri/avatars/duri-male.png` |
| `duri-flower` | 꽃 장식 두리 | `assets/images/duri/avatars/duri-female.png` |

현재 asset 파일명의 `male`/`female`은 기존 파일명일 뿐 제품 ID나 자동 매핑 기준이 아니다. 파일명을 바꾸더라도 stable ID는 유지할 수 있어야 한다.

## Proposed Field

Backend 계약이 추가될 때 다음 의미의 field를 사용한다.

```ts
type DuriAvatarPresetId =
  | "duri-sky-scarf"
  | "duri-flower";

type AvatarProfileFields = {
  avatarPresetId?: DuriAvatarPresetId | null;
};
```

- `undefined`/field omission: 업데이트 요청에서 기존 값 유지
- `null`: 사용자가 preset을 명시적으로 해제
- known ID: Backend에 stable string ID 저장
- unknown ID: Backend validation error 또는 client fallback; 임의 asset 추정 금지

Label과 이미지 경로는 client registry의 presentation metadata이며 Backend에 저장하지 않는다.

## Proposed API Semantics

Profile response 예시:

```json
{
  "id": "user-id",
  "nickname": "여행자",
  "profileImageUrl": null,
  "avatarPresetId": "duri-sky-scarf"
}
```

Profile update 예시:

```json
{
  "nickname": "여행자",
  "avatarPresetId": "duri-flower"
}
```

Backend는 허용된 stable ID를 검증하고 auth/login, profile read/update 응답에서 같은 값을 반환해야 한다. custom image와 preset을 동시에 보존할지는 제품 정책으로 결정하되, renderer precedence는 일관되어야 한다.

## Fallback and Rendering Precedence

권장 우선순위:

1. explicit custom `profileImageUrl`
2. known `avatarPresetId`를 frontend registry로 resolve한 local asset
3. `initial`
4. 최종 안전 fallback `?`

근거는 사용자가 직접 설정한 custom image를 가장 구체적인 선택으로 존중하고, preset이 없거나 구버전/unknown ID일 때 현재 initial 동작을 유지하기 위해서다. broken remote image 처리 정책은 Avatar renderer 구현 시 별도로 정한다.

## Required Touchpoints

Backend 계약 확정 후 하나의 변경 세트에서 다음을 함께 수정해야 한다.

- `src/domain/user.ts`의 `User`
- `src/features/auth/services/authService.ts`의 `BackendUser`
- `ProfileUpdateInput`
- login/signup/guest-upgrade/profile response mapping
- real profile update request/response
- Mock auth profile update 및 session behavior
- `useDuriStore` persistence normalization/versioning
- onboarding profile setup
- My Page profile edit
- shared `Avatar` renderer 및 사용하는 모든 화면
- API fixture/contract tests
- legacy user migration 및 unknown-ID fallback tests

부분적으로 frontend field만 추가하지 않는다.

## Migration

- 기존 `initial` 값, emoji, nickname 또는 profile image로 preset을 추정하지 않는다.
- 기존 사용자는 현재 `profileImageUrl → initial` fallback으로 계속 표시한다.
- 사용자가 이후 chooser에서 preset을 직접 선택했을 때만 `avatarPresetId`를 저장한다.
- 알 수 없는 preset ID는 `initial`로 안전하게 fallback하고 자동으로 다른 ID로 치환하지 않는다.

## Gender and Selection Policy

- 이름, 성별, nickname, 기존 initial에 따라 preset을 자동 선택하지 않는다.
- 모든 preset은 모든 사용자에게 동일하게 제공한다.
- 선택은 사용자의 명시적 UI action으로만 변경한다.
- stable ID와 label은 시각 특징을 설명하며 성별을 나타내지 않는다.

## Deferred Work

이번 작업에서는 다음을 구현하지 않았다.

- Backend/DTO field
- frontend domain persistence field
- onboarding 또는 My Page avatar chooser
- Profile Edit의 raw URL UX 변경
- 기존 사용자 migration 실행
- 현재 Avatar rendering 변경
