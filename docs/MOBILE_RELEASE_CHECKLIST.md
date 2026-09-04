# 모바일 릴리스 체크리스트

## 앱 식별과 계정

- [ ] Android package 확정
- [ ] iOS bundle identifier 확정
- [ ] Apple Team ID와 Apple Developer 계정 준비
- [ ] Google Play Console 계정 준비
- [ ] EAS projectId와 organization 확정

## 브랜딩과 정책

- [ ] 두리 앱 아이콘 제작 및 adaptive icon 검수
- [ ] splash 이미지와 dark mode 정책 확정
- [ ] 개인정보 처리방침 공개 URL
- [ ] 이용약관과 고객지원 URL
- [ ] 스토어 설명, screenshot, 연령 등급

## 네이티브 연동

- [ ] Kakao native app Android/iOS 설정
- [ ] Google Cloud OAuth client Web/Android/iOS 설정
- [ ] Android OAuth client에 package name과 debug/release/Play App Signing SHA-1 등록
- [ ] iOS OAuth client에 bundle ID와 URL scheme 등록
- [ ] 지도·OAuth client id/key를 환경 변수 또는 secret 저장소에 등록
- [ ] `tripmatch://invite/:code` 하위호환 딥링크 실기기 검증
- [ ] 공개 HTTPS 초대 도메인과 `/api/v1/invites/:code` 안내 페이지 검증
- [ ] Android `assetlinks.json`의 package·Play/EAS SHA-256 검증
- [ ] iOS AASA의 Team ID·bundle ID·초대 경로 검증
- [ ] 카카오톡에서 HTTPS 링크를 눌러 설치된 Android/iOS 앱의 초대 화면 진입 검증
- [ ] 위치·사진·알림 권한 설명 문구 검수

## 품질과 배포

- [ ] Expo Doctor 통과
- [ ] Android/iOS production bundle 통과
- [ ] 주요 화면 작은 기기·큰 기기·safe area 검수
- [ ] 오프라인·hydrate 실패·잘못된 deep link 테스트
- [ ] EAS Build signing 설정
- [ ] TestFlight 배포와 내부 QA
- [ ] Play Internal Testing 배포와 내부 QA
- [ ] crash·analytics·개인정보 수집 고지 확정
