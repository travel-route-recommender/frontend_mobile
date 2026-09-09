# iOS App Store 출시 인계

## 적용 완료

- SDK 57용 EAS production build/submit 프로필
- production API 주소와 iOS 버전·빌드 번호·암호화 신고 설정
- 1024px 불투명 App Store 아이콘
- 한국어 스토어 설명·키워드·카테고리·연령 등급 초안
- 코드·백엔드 기준 App Privacy 데이터 목록 초안
- iOS 카카오·Apple 네이티브 로그인과 최초 가입 필수 동의
- `DELETE /users/me` 계정 삭제 클라이언트·백엔드 및 삭제 범위 테스트
- 약관·개인정보 수집 동의·만 14세 확인 분리와 서버 동의 이력
- 이용약관·개인정보 처리방침 운영 초안과 법률 검증 보고서
- 출시 차단 항목 자동 검사: `npm run verify:ios-release`
- Xcode 26.6·iOS 26.5 SDK arm64 Release 빌드와 산출물·개인정보 매니페스트 검사
- iOS Bundle ID를 `com.tripmatch.app.dev`로 확정(Android package는 변경하지 않음)

## 백엔드 코드 적용 완료·운영 배포 대기

백엔드 `main`에는 아래 코드가 반영되어 있으나 현재 운영 서버에는 최신 커밋이 배포되지 않았다.

- `DELETE /api/v1/users/me`: 이메일 계정은 현재 비밀번호 재확인, 계정 식별정보 삭제·익명화, 업로드 티켓·문서 삭제, 공동 일정 유지, 방장 여행방 닫힘
- 삭제된 사용자의 기존 Access Token 거부
- `/users` 인증 적용, 이메일 제거, 공유 여행방 구성원으로 검색 범위 제한
- 업로드 파일 기본 공개 비활성화와 서명 URL 사용
- 이메일·게스트 생성 시 동의 버전·시각과 만 14세 이상 확인 저장
- 카카오·Apple 로그인과 최초 소셜 가입 동의 저장

iOS에서 카카오 로그인을 제공하므로 Apple Guideline 4.8 대응을 위해 Apple 로그인을 동등하게 제공한다.

## 사용자만 직접 해야 하는 일

- Apple Developer Program 가입·계약·세금·은행 정보 처리
- App Store Connect 앱 레코드 생성
- EAS/Apple 계정 로그인 및 2단계 인증, 서명 자격 증명 승인
- Kakao Developers에 iOS Bundle ID와 URL scheme 등록
- 백엔드 운영 환경에 Apple Team ID·Key ID·Client ID·Private Key·토큰 암호화 키 등록
- 사업자·연락처·저작권, 고객지원 URL, 공개 개인정보 처리방침 URL 확정
- Render·MongoDB Atlas 리전·보유 기간·위탁/국외 이전 정보를 운영 계정에서 확인
- App Privacy 문답 작성, 심사용 연락처·로그인 계정 제공
- 검토용 계정으로 촬영한 실제 앱 화면 스크린샷의 공개 범위 최종 확인
- TestFlight 실기기 확인 후 심사 제출·수동 출시 승인

`store.config.json`의 연령 등급과 수동 출시는 현재 기능을 기준으로 한 초안이며, 제출 전에 사용자가 최종 확인해야 한다.

세부 검증과 빈칸은 `docs/LEGAL_VERIFICATION_REPORT.md`, 완성 대기 정책은 `docs/TERMS_OF_SERVICE_DRAFT.md`와 `docs/PRIVACY_POLICY_DRAFT.md`에 정리되어 있다.
