# iOS 출시 법률·개인정보 검증 보고서

검증일: 2026-09-09
대상: `frontend_mobile/ios_release`, `Backend/main`
판정: **조건부 미통과 — 코드 조치 완료, 운영자 확정값과 운영 증빙이 남음**

> 2026-09-10: 운영자·문의 이메일·시행일 및 확인된 서버 정보로 정책 본문을 완성하고 공개했다. 아래 기존 미확정값 목록 중 완료된 항목은 [최신 준비 기록](./IOS_PRE_TEST_STATUS_2026-09-10.md)으로 대체한다. 실기기 검증과 운영 보안 증빙이 완료되었다는 뜻은 아니다.

이 문서는 코드와 공식 자료의 대조 결과이며 개별 사업자에 대한 법률 자문을 대체하지 않는다.

### 2026-09-10 운영 정보 보완

- 사용자에게 전달받은 백엔드 담당자 확인값: MongoDB Atlas 데이터베이스는 대한민국 AWS 서울(`ap-northeast-2`), 무료 클러스터이며 자동 백업·스냅샷 미사용. Render는 싱가포르, 운영 로그 보관 기간 7일.
- 앱 내 개인정보 처리방침·수집 동의와 방침 초안에 위 확인값을 반영했다. 백엔드 배포·운영 설정은 변경하지 않았다.
- 자료 대조에 따른 판단: 국내 데이터베이스와 별개로 Render API 서버의 싱가포르 처리는 국외 처리위탁 안내 대상이다. 수탁자 법인명과 연락처는 [Render DPA](https://render.com/dpa)에서 `Render Services, Inc.` / `privacy@render.com`을 확인했다.
- “자동 백업 없음”은 Atlas 무료 클러스터의 자동 백업·스냅샷에만 적용한다. Render 업로드 파일 백업, 수동 백업, Atlas 자체 로그, 문의 이메일 보관 기준은 이번 답변에서 확인되지 않았다. 단일한 7일 보관·모든 백업 없음으로 기재하지 않는다.
- 다음 기존 체크리스트 중 리전과 Render 로그 보관 기간은 위 전달값으로 보완되었다. DPA 이행, 실제 로그 항목, 운영 보안 설정과 실기기 시험까지 확인 완료된 것은 아니다.

## 검증 기준

- Apple App Review Guidelines 1.2, 2.1, 4.8, 5.1.1
- Apple 인앱 계정 삭제 지침과 App Store Connect App Privacy 지침
- 개인정보 보호법 제21조·제22조의2·제26조·제28조의8·제30조
- 개인정보보호위원회 「개인정보 처리방침 작성지침(2026.4. 개정)」

## 코드에서 확인한 조치

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| 인앱 계정 삭제 | 충족 | 마이페이지 → `DELETE /users/me`; 이메일 계정 비밀번호 재확인 |
| 삭제 범위 | 충족 | 계정 식별정보 삭제·익명화, 업로드 티켓·문서 삭제, 공동 일정 유지, 방장 탈퇴 시 방 닫힘 |
| 삭제 후 토큰 차단 | 충족 | JWT 검증 시 사용자 존재 여부 재확인 |
| 개인정보 최소 공개 | 개선 완료 | `/users` 인증 적용, 이메일 제거, 본인과 공유 여행방 구성원으로 범위 제한 |
| 업로드 파일 접근 | 개선 완료 | `/uploads` 기본 공개를 끄고 구성원용 만료 서명 URL 사용 |
| iOS 로그인 4.8 | 코드 충족 | iOS 카카오 로그인과 동등한 Apple 로그인을 함께 제공 |
| 필수 동의 구분 | 개선 완료 | 이용약관, 개인정보 수집·이용, 만 14세 이상 확인을 각각 표시 |
| 동의 증빙 | 개선 완료 | 이메일·게스트·최초 카카오·Apple 가입 시 약관/동의 버전과 서버 시각 저장 |
| 앱 내 정책 접근 | 초안 완료 | 로그인·마이페이지에서 약관 및 개인정보 처리방침 접근 가능 |
| 광고·추적·분석 SDK | 코드상 없음 | 의존성·권한·호출 검색 결과 |
| 기기 GPS 위치 | 코드상 없음 | 위치 권한 및 위치 SDK 없음; 여행 장소 좌표는 사용자의 현재 위치가 아님 |
| iOS Release 산출물 | 새 빌드 검증 필요 | 카카오·Apple 네이티브 SDK가 추가되어 새 EAS production archive와 실기기 로그인을 확인해야 함 |

## App Store Connect App Privacy 입력 초안

모든 항목의 목적은 `App Functionality`, 여행 성향·추천 관련 항목은 추가로 `Product Personalization`이다. 코드상 추적은 없다.

| Apple 데이터 유형 | 연결 여부 | 근거 |
| --- | --- | --- |
| Contact Info → Email Address | 사용자 연결 | 이메일 회원 및 카카오·Apple 제공 이메일 인증 |
| Contact Info → Name | 사용자 연결 | 가입 닉네임 및 카카오·Apple 제공 이름 |
| Identifiers → User ID | 사용자 연결 | 내부 ID와 카카오·Apple 계정 식별자 |
| User Content → Photos or Videos | 사용자 연결 | 티켓·예약 이미지 업로드 |
| User Content → Other User Content | 사용자 연결 | 일정·후보·의견·할 일·메모·문서 |
| Usage Data → Product Interaction | 사용자 연결 | 저장 장소, 후보 의견, 일정 편집, 여행 성향 응답 |
| Search History | 사용자 연결 | 검색어가 서버·외부 API 요청 및 단기 캐시 키로 처리되고 로그인 요청에는 인증 토큰이 함께 전송됨. 수집 전 비식별이 증명되지 않아 보수적으로 연결 신고 |

현재 iOS 앱 코드만 기준으로 Device ID, Precise/Coarse Location, Purchases, Payment Info, Diagnostics, Advertising Data는 수집 항목으로 확인되지 않았다. 사용자가 자유 형식 문서에 임의로 포함한 정보와 앱이 특정 항목으로 요구하는 정보는 Apple 분류 기준상 구분한다.

## 출시 차단 항목

### 사용자가 확정·제공해야 하는 값

1. 운영자 법적 명칭, 사업장 주소, 고객지원 이메일·전화
2. 개인정보 보호책임자, 담당부서, 이메일·전화
3. 약관·처리방침 공고일과 시행일
4. 저작권 소유자, 고객지원 URL, 공개 개인정보 처리방침 URL
5. 심사용 담당자 연락처와 심사 계정

### 운영 계정에서 확인해야 하는 증빙

1. Render 법인명·운영 리전·로그 보유 기간·업로드 파일 영속 저장 및 백업 정책
2. MongoDB Atlas 클라우드 제공자·주/보조 리전·백업/로그 보유 기간
3. Render·MongoDB 처리위탁/DPA와 국외 이전의 법적 근거·고지 항목
4. 운영 환경 `UPLOADS_PUBLIC=false`, 강한 JWT·서명 비밀값, HTTPS, 데이터베이스 접근 통제
5. 운영 백업에서 계정 삭제 정보가 최종 파기되는 기한과 복구 시 재삭제 절차

### 제품·심사상 추가 차단 가능성

1. 여행방에서 사용자 업로드·자유 입력 콘텐츠를 공유하지만 신고, 차단, 유해 콘텐츠 필터와 공개 연락처 기능이 없다. Apple Guideline 1.2 적용 대상으로 판단되면 심사 거절 위험이 있다.
2. 운영 백엔드에 최신 `main`과 Apple 환경변수가 배포되지 않으면 카카오·Apple 로그인이 실패한다.
3. Kakao Developers에 `com.tripmatch.app.dev` iOS 플랫폼이 등록되지 않으면 카카오 로그인 복귀가 실패한다.
4. Apple 서명된 production archive에서 PrivacyInfo.xcprivacy, 포함 SDK 목록, `NSLocalNetworkUsageDescription`·Bonjour 항목을 최종 확인해야 한다.
5. 운영 계정 삭제 E2E 시험에서 사용자 문서, 공유방 참조, 파일, 캐시·로그·백업의 삭제 결과를 증빙해야 한다.

## 공식 근거

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple account deletion: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple App Privacy: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- Apple App Privacy data types: https://developer.apple.com/app-store/app-privacy-details/
- 개인정보보호위원회 2026.4 처리방침 작성지침: https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=D010030000&nttId=12018
- 개인정보 보호법: https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B0%9C%EC%9D%B8%EC%A0%95%EB%B3%B4%EB%B3%B4%ED%98%B8%EB%B2%95
