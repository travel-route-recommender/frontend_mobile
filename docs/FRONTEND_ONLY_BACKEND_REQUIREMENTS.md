# 프런트엔드 구현 이후 필요한 Backend 계약

이 문서는 현재 모바일 프런트엔드가 로컬에서 제공하는 기능과, 동행자 간 실제 공유·동기화·신뢰 가능한 이동시간 계산을 위해 서버에 추가로 필요한 계약을 구분한다. Backend 소스는 이번 변경 범위에서 수정하지 않는다.

## 현재 프런트엔드만으로 동작하는 범위

- Web Share에 custom scheme을 URL 필드로 전달하지 않는 OS 공유와 링크 복사
- 여행 생성 시 자차/대중교통·도보, 선택 숙소 위치, 선택 종료 지점·시각·예상 이동 및 준비시간 저장
- 사용자 입력 예상 시간을 기준으로 한 종료 조건 검증과 두리의 보수적 일정 조정
- 15분 단위 일정표, 기존 화면 하단 Candidate Board와 연속 높이 조절
- 앱 전용 로컬 저장소의 PDF·이미지 문서함과 일정 연결

로컬 문서는 다른 기기나 동행자와 동기화되지 않는다. Web에서 고른 파일은 현재 브라우저 탭에서만 사용할 수 있다. 실제 도로·대중교통 이동시간이나 운영기관의 반납 규칙도 자동 조회하지 않는다.

## 현재 Backend 감사 결과

읽기 전용으로 확인한 기존 Backend에는 초대 code 미리보기·기존 사용자 수락·guest 참여, Kakao access token의 서비스 JWT 교환, 일정 CRUD와 version 기반 batch 저장이 있다. 그러나 모바일의 `ApiClient`는 아직 인터페이스뿐이고 api/hybrid 모드는 인증·여행방·워크스페이스를 unavailable로 차단한다. 서버에는 링크 중지·만료·revision/HTTPS Universal Link, 아래 여행 사실 필드, 실제 route ETA, 문서 업로드가 없으며 Duri 경로 계산도 실제 길찾기가 아닌 stub이다. 따라서 일부 endpoint만 local Zustand 여행방에 섞으면 사용자·room·schedule ID와 권한/version이 갈라질 수 있어 이번 변경에서는 연결하지 않았다. Backend 코드는 수정하지 않았다.

## 1. 초대 링크와 참여

기존 초대 코드 생성·조회·수락 기능을 모바일에서 완전히 연결하려면 다음이 필요하다.

- HTTPS Universal Link/App Link와 초대 code의 안정적인 매핑
- 발급자 권한, 만료 시각, 폐기·재발급 revision, 최대 사용 횟수
- 로그인 전 초대 보관과 로그인 후 guest/member 병합 정책
- 중복 수락의 idempotency와 이미 참여한 사용자 응답
- 수락 직후 최신 Room/member snapshot 또는 revision 반환
- 프런트엔드 사용자 ID와 서버 인증 주체의 명시적 매핑

custom scheme만으로 만든 현재 mock 링크는 Web Share의 URL 계약과 외부 앱 복귀를 보장하는 배포용 링크가 아니다.

## 2. 여행 사실 정보

Room 생성·수정 DTO와 응답에 다음 필드가 필요하다.

- `transport`: `car` 또는 `public`
- 선택 숙소: 표시명, 주소, 좌표, 공급자 place ID
- 종료 조건: 유형, 지점, timezone이 포함된 ISO datetime, 이동시간, 승차·반납 준비시간, 메모
- 종료 지점과 이동시간을 산정한 기준 일정/장소 ID, 교통수단, 산정 시각, provider/version
- Room revision 또는 ETag와 동시 수정 충돌 응답

여행 마지막 날짜가 바뀌면 예약 사실의 날짜를 자동 이동할지, 재확인을 요구할지 서버 정책도 필요하다.

## 3. 경로시간과 두리 조정

plausible한 자동 조정을 위해서는 지도 또는 교통 공급자를 사용하는 서버 경계가 필요하다.

- 장소 간 및 마지막 장소→종료 지점 route matrix/ETA
- 출발 예정 시각, 교통수단, timezone, 실시간/예측 교통 여부
- 렌터카 영업시간·반납 처리시간처럼 공급자별 추가 buffer
- 결과의 산정 시각, 유효기간, stale 여부와 provider 오류 표현
- 분석 snapshot version을 받는 두리 분석/제안 API
- 전체 변경을 한 transaction으로 적용하는 Schedule batch API
- ETag/version conflict(예: 409), idempotency key, 적용 receipt

마지막 장소나 순서가 바뀌면 이전 ETA를 stale로 처리하고 다시 계산해야 한다. 서버 계약 전에는 모바일이 사용자 입력 예상 분을 보존하면서 일정 간격을 유지하는 보수적 조정만 수행한다.

## 4. 예약·티켓 파일

동행자 간 문서 공유와 안전한 보관에는 다음이 필요하다.

- multipart upload 또는 presigned upload/download URL
- 문서 metadata CRUD와 Room/itinerary item 연결 CRUD
- 방장·업로더·멤버별 read/update/delete 권한 검사
- MIME magic-byte 검사, 파일 크기 제한, 악성코드 검사, 허용 확장자 정책
- 저장 시 암호화, 짧은 만료 signed URL, 접근 audit, 보존·삭제 정책
- upload 성공과 일정 연결의 transaction 또는 실패 시 고아 파일 정리
- Room revision/realtime event를 통한 다른 기기·동행자 동기화

## 연동 완료 조건

Swagger 또는 동등한 계약에 DTO, 권한, 오류 코드, version/idempotency가 확정되고 실제 기기에서 초대 수락·동시 편집·오프라인 복구·파일 접근 권한을 검증한 뒤 local Store adapter를 API adapter로 교체한다. 그전에는 mock/local과 API 데이터를 한 여행방 안에서 섞지 않는다.
