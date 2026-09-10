# iOS 실기기 테스트 전 준비 — 2026-09-10

범위: 약관 완성, 공개 URL·App Privacy, 새 production 빌드 업로드까지. 사용자 요청에 따라 실기기 테스트와 심사 제출은 수행하지 않는다. 앱은 `ios_release`에서만 관리하며 앱 `main` 병합이나 백엔드 변경은 하지 않는다.

## 약관·개인정보처리방침

- 운영자 및 개인정보 담당: Apple 개인 개발자명에 근거한 `HYUNHO SHIN`. 별도 법인·부서·사업장 주소를 만들지 않았다.
- 공개 문의 이메일: `shinhh787@gmail.com`. 심사 전화번호는 공개하지 않았다.
- 공고·시행일: `2026-09-10`.
- 사용자 전달 운영값: Render 싱가포르·운영 로그 7일. MongoDB Atlas 대한민국 AWS 서울(`ap-northeast-2`)·무료 클러스터·자동 백업/스냅샷 미사용.
- 작성 판단: 문의 기록은 문의 처리 완료 시까지, 분쟁이 진행 중이면 종료 시까지 보관하도록 정했다. 운영자는 실제 문의 처리에서도 이 기준을 준수해야 한다. Render 로그 7일을 문의 기록이나 다른 제공처의 보관 기간으로 확대하지 않았다.
- 서비스 계약 이행에 필요한 Render 국외 처리위탁의 항목·시점·방법·목적·기간·수탁자 연락처·거부 방법을 고지했다. 공식 근거: [개인정보 보호법 제28조의8](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029334737), [Render DPA](https://render.com/dpa).
- 앱 내 문구와 웹 JSON·약관 문서를 같은 원본으로 맞췄다. 계정 삭제 시 공동 일정 유지·탈퇴자 익명화·본인 업로드 삭제·방장 탈퇴 시 방 닫힘을 유지했다.
- 서버의 허용 동의 버전 계약을 바꾸지 않기 위해 약관 `1.0`, 개인정보 동의 `1.1`을 유지했다. 이번 수정은 미출시 초안 완성이다.

## 공개 페이지

- 고객지원: https://duri-tourmate-support.codex00101.chatgpt.site/
- 개인정보처리방침: https://duri-tourmate-support.codex00101.chatgpt.site/privacy
- 이용약관: https://duri-tourmate-support.codex00101.chatgpt.site/terms
- 사용자 요청으로 소유자 전용에서 공개로 변경했다. Sites version 2 배포 성공.
- Sites project: `appgprj_6aa16097a5048191ac06df42e82600c4`.
- Version: `appgprj_6aa16097a5048191ac06df42e82600c4~appgver_94d036799bbc8191ab28c4e769765e83`.
- Source: `0b2d114e421ae0e3ef1348a82f1c825aaa958720`.
- Deployment: `appgdep_6aa23104f6148191a3408526ba81fa3b`.
- 사이트 저장소는 앱·백엔드와 별개이며 위치는 `/Users/shin/Desktop/duri-support-site`이다.

## 검증 및 남은 진행

- 통과: 앱 타입 검사, 인증 계약·세션 검사, 여행 생성·수정·초대 흐름 검사, 장소 검색 흐름 검사, Git 공백 검사.
- 통과: 지원/개인정보/약관 3개 페이지 정적 빌드, 미확정 빈칸 제거 확인, 심사 전화번호 미노출 확인.
- `verify:ios-release`는 공개 URL·법적 문구 검사를 통과했으나 로컬 `store.config.json`에 심사 계정·연락처를 보관하지 않아 해당 1개 항목을 미통과로 표시한다. App Store Connect에 저장된 심사 정보와 로컬 메타데이터 존재 여부는 별개다. 비밀번호를 Git에 기록해 검사를 통과시키지 않는다.
- App Store URL 등록, App Privacy 게시, 새 iOS 빌드/업로드의 최종 결과는 아래 진행 결과에 별도 기록한다.

## 진행 결과

- App Privacy: 기존 7개 유형 초안의 게시 대기. 브라우저 Apple 로그인 세션이 만료되어 재로그인이 필요하다.
- 최종 iOS 빌드: 준비 중.
- 실기기 테스트: 사용자 요청으로 미실시.
- 심사 제출: 미실시.

정책 문구 작성과 코드 검사는 운영 보안·DPA 이행·모든 SDK 동작·실기기 소셜 로그인 성공에 대한 법률 또는 보안 인증을 의미하지 않는다.
