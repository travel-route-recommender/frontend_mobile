# iOS App Store 출시 인계

## 적용 완료

- SDK 57용 EAS production build/submit 프로필
- production API 주소와 iOS 버전·빌드 번호·암호화 신고 설정
- 1024px 불투명 App Store 아이콘
- 한국어 스토어 설명·키워드·카테고리·연령 등급 초안
- 코드·백엔드 기준 App Privacy 데이터 목록 초안
- iOS 1.0 이메일 로그인·게스트 전용 정책과 iOS 소셜 SDK 제외
- `DELETE /users/me` 계정 삭제 클라이언트·백엔드 및 삭제 범위 테스트
- 약관·개인정보 수집 동의·만 14세 확인 분리와 서버 동의 이력
- 이용약관·개인정보 처리방침 운영 초안과 법률 검증 보고서
- 출시 차단 항목 자동 검사: `npm run verify:ios-release`
- Xcode 26.6·iOS 26.5 SDK arm64 Release 빌드와 산출물·개인정보 매니페스트 검사
- iOS Bundle ID를 `com.tripmatch.app.dev`로 확정(Android package는 변경하지 않음)

## 백엔드 적용 완료

백엔드에도 같은 이름의 `ios_release` 브랜치를 만들고 아래를 적용했다.

- `DELETE /api/v1/users/me`: 이메일 계정은 현재 비밀번호 재확인, 계정·기여 데이터·파일·세션 삭제
- 삭제된 사용자의 기존 Access Token 거부
- `/users` 인증 적용, 이메일 제거, 공유 여행방 구성원으로 검색 범위 제한
- 업로드 파일 기본 공개 비활성화와 서명 URL 사용
- 이메일·게스트 생성 시 동의 버전·시각과 만 14세 이상 확인 저장

iOS 1.0은 카카오·Google 로그인을 표시하거나 바이너리에 포함하지 않으므로 Apple 로그인 의무 대상이 아니다. 향후 iOS에 제3자 로그인을 추가할 때 Apple Guideline 4.8에 맞춰 동등한 개인정보 보호 로그인 수단을 함께 구현한다.

## 사용자만 직접 해야 하는 일

- Apple Developer Program 가입·계약·세금·은행 정보 처리
- App Store Connect 앱 레코드 생성
- EAS/Apple 계정 로그인 및 2단계 인증, 서명 자격 증명 승인
- EAS production 환경에 기존 iOS OAuth·지도 공개 키 등록
- 사업자·연락처·저작권, 고객지원 URL, 공개 개인정보 처리방침 URL 확정
- Render·MongoDB Atlas 리전·보유 기간·위탁/국외 이전 정보를 운영 계정에서 확인
- App Privacy 문답 작성, 심사용 연락처·로그인 계정 제공
- 검토용 계정으로 촬영한 실제 앱 화면 스크린샷의 공개 범위 최종 확인
- TestFlight 실기기 확인 후 심사 제출·수동 출시 승인

`store.config.json`의 연령 등급과 수동 출시는 현재 기능을 기준으로 한 초안이며, 제출 전에 사용자가 최종 확인해야 한다.

세부 검증과 빈칸은 `docs/LEGAL_VERIFICATION_REPORT.md`, 완성 대기 정책은 `docs/TERMS_OF_SERVICE_DRAFT.md`와 `docs/PRIVACY_POLICY_DRAFT.md`에 정리되어 있다.
