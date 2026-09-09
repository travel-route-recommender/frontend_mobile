# App Store Connect App Privacy 입력안

검증일: 2026-09-04
범위: iOS 1.0 코드와 현재 백엔드 계약

| Apple 데이터 유형 | 목적 | 사용자 연결 | 추적 |
| --- | --- | --- | --- |
| Contact Info → Email Address | App Functionality | 예 | 아니요 |
| Contact Info → Name | App Functionality | 예 | 아니요 |
| Identifiers → User ID | App Functionality | 예 | 아니요 |
| User Content → Photos or Videos | App Functionality | 예 | 아니요 |
| User Content → Other User Content | App Functionality | 예 | 아니요 |
| Usage Data → Product Interaction | App Functionality, Product Personalization | 예 | 아니요 |
| Search History | App Functionality | 예 | 아니요 |

## 데이터별 근거

- Email Address: 이메일 회원 및 카카오·Apple 계정 인증 시 제공된 이메일
- Name: 가입 닉네임 및 카카오·Apple이 제공한 닉네임·이름
- User ID: 내부 계정 ID와 카카오·Apple 계정 식별자
- Photos or Videos: 티켓·예약 이미지 업로드
- Other User Content: 여행 일정·장소 후보·의견·할 일·메모·업로드 문서
- Product Interaction: 저장 장소, 후보 의견, 일정 편집, 여행 성향 응답
- Search History: 장소 검색어가 서버·외부 API 요청 및 5~10분 캐시 키에 사용되고, 로그인 상태의 요청에는 계정 인증 토큰이 함께 전송된다. 운영 로그의 비식별 여부를 확인하기 전까지 보수적으로 사용자 연결로 신고한다.

현재 iOS 코드에서 광고·추적·결제·기기 GPS 위치·연락처·마이크·분석·충돌 수집 SDK는 확인되지 않았다. 기기에 생성하는 설치 식별자는 현재 서버로 전송하지 않는다. 여행 장소 좌표는 사용자의 현재 기기 위치가 아니다.

## 제출 직전 확인

- production archive에 실제 포함된 모든 SDK의 PrivacyInfo.xcprivacy와 네트워크 동작
- Render·MongoDB Atlas·Kakao 지도 WebView의 실제 로그/IP 처리 및 보유 기간
- 이동 제약 입력 기능을 iOS에 활성화하면 Sensitive Info 해당 여부 재평가
- 운영 로그에서 검색어·인증정보·IP의 기록 및 비식별 처리 여부 확인. 수집 전에 연결을 끊는 구조가 증명될 때만 “사용자 비연결”로 재분류
- App Store Connect 답변을 실제 출시 바이너리의 동작과 최종 대조
