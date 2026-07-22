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

- 실제 로그인·회원가입·OAuth·JWT refresh
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
