# 모바일 마이그레이션 상태

## 2026-07-15 전체 E2E·상태 무결성 감사 완료

- 실제 Expo project/Git 경계와 수정 전 lint/typecheck/Doctor/export 기준선 확인
- 전체 route inventory와 session별 권한, hydration/persist/mode 회귀 matrix 작성
- 사용자·여행방·후보·일정·저장·성향·Duri 순수 state validator 추가
- domain persist/schema version을 4로 단일화하고 빈 member ID, 비멤버 itinerary 선호 참조, active trip membership을 안전하게 보강
- 손상 persist migration, session isolation, Duri stale fixture와 `validate:state` 진단 추가
- API/hybrid와 server Duri는 계약 미확정 시 mock/local로 fallback하지 않는 정책 유지

실기기 cold launch/process kill/deep-link/keyboard/큰 글자 회귀와 실제 API E2E는 다음 단계다. 상세 결과는 `MOBILE_E2E_REGRESSION_REPORT.md`에 있다.

## 2026-07-14 두리 분석 단계 완료

- workspace 진입 카드, 독립 report와 suggestion 상세 route
- 웹 실제 동선·밀도·식사·선호 엔진과 suggestion pure apply 재사용
- immutable snapshot, full input fingerprint, algorithm compatibility version
- 기존 helper 기반 시간 충돌, 날짜 균형, 후보 활용 context report
- 그룹/좌표 coverage, before/after, stable-ID diff, 계산 가능한 expected impact
- stale 차단, 전체 validation, Zustand set 한 번의 atomic apply, ephemeral receipt
- server 계약 미확인 시 unavailable 및 local fallback 금지
- 분석 18 + 제안 13 + atomic 10 fixture

파생 session/suggestion/receipt는 비영속이라 persist version/migration 변경이 없다. 남은 범위는 실제 Duri API, atomic Schedule batch, Directions/지도 경로와 전체 undo history다.

## 완료

- Expo SDK 57 + TypeScript + Expo Router 프로젝트 기반
- 홈, 탐색, 여행, 저장, 마이 5개 탭
- 장소 상세, 여행 상세, 새 여행, workspace 기반 route
- 웹 기준 6문항 개인 여행 성향 테스트, 답변 검토와 결과 저장
- 개인 테스트 중간 draft 복구, 이어하기, 처음부터 다시 하기
- anonymous 체험 결과, guest/member 결과 영속 정책 분리
- 재테스트 확인과 기존 결과 보호
- API/hybrid Quiz 계약 대기 오류와 mock fallback 차단
- 현재 사용자 여행방의 진행 중·완료·전체 필터, 웹 기준 결정적 정렬
- 이미지·D-day·멤버·후보·일정·응답·준비율을 담은 TripRoomCard ViewModel
- 여행지→날짜→조건→동행자→확인의 5단계 여행방 생성 Wizard
- SDK 57 호환 native date picker와 date-only 검증
- 별도 versioned CreateTripDraft persist, 이어 쓰기·새 시작·저장/삭제 나가기
- 원자적 createTrip, 연속 제출 잠금, 생성 완료 후 TripHome replace
- TripHome Hero·빠른 실행·5단계 준비율·후보/일정·두리 분석 요약
- mock demo member 추가 Modal과 api/hybrid Rooms 계약 대기 차단
- 장소명·주소·지역·category·tag·summary 통합 검색
- 실제 Region/category 필터와 기본/이름/저장 우선 정렬
- 목록·지역 보드가 공유하는 비영속 탐색 상태
- PlaceCard ViewModel의 저장·후보·scheduled 관계 파생
- 장소 상세의 저장·여행방 선택·비슷한 장소·잘못된 ID 처리
- 저장 화면 검색·category 필터·누락 Place 관계 안내
- anonymous/member 저장 권한 및 guest 참여 여행방 후보 권한
- 같은 여행방 중복·일정 배치 중복을 막는 공통 후보 선택 Modal
- TripHome·Workspace의 목적지 Region 탐색 진입 연결
- 실행 가능한 장소 흐름 23개 fixture 검증
- 모바일 워크스페이스 날짜 탭과 후보 검색·전체/미배치/배치 완료 보드
- itinerary 관계 기반 후보 scheduled 상태와 누락 Place 복구 표시
- 후보 선택→날짜·시작/종료 시간·메모→일정 추가 Modal
- 08:00~24:00 15분 단위 validation, 충돌 감지와 다음 빈 시간 안내
- 일정 시간·메모 수정, 다른 날짜 이동, 위·아래 시간 재배치, 확인 삭제
- 배치 후보 제거 차단과 현재 사용자의 shared candidate 관계만 제거하는 정책
- member/guest 편집, anonymous/비멤버 차단, 완료 여행방 읽기 전용
- mock/api/hybrid Schedule 경계와 29개 워크스페이스 fixture 검증
- 여행방 멤버별 completed/pending/invalid 응답 상태와 완료 비율
- 0~1명 insufficient, 2명 이상 partial/complete 그룹 성향 진단
- 웹 기준 5개 계획 차원 spread와 common/compatible/needs-tuning 분류
- 응답자 tag 집계, 모바일 조율 지표, GroupPlanningProfile 기반
- 여행방 상세 응답 현황·그룹 진단·내 테스트/결과/재테스트 CTA
- 실행 가능한 그룹 진단 15개 fixture 및 여행 흐름 정렬·날짜·draft·준비율 fixture 검증
- React Native theme token과 공통 컴포넌트
- normalized mock data와 AsyncStorage persist
- SecureStore TokenStorage adapter 골격
- QueryClientProvider, query key, ApiClient/service 경계
- 도메인 타입과 순수 Duri 엔진 이식
- 잘못된 placeId/tripId와 not-found 오류 상태
- 로그인, 가입 방식 선택, 이메일 가입, 임시 약관 화면
- mock 초대 코드 guest 참여와 데모 여행 membership
- 프로필 설정, 프리셋 아바타, 온보딩 소개
- anonymous/guest/member 세션 분리와 hydration bootstrap
- AsyncStorage 비민감 Auth Session persist와 SecureStore clear 경계
- 장소 저장, 후보 추가, 새 여행, 저장 탭, 마이페이지 Member Gate
- mock/api/hybrid Auth 동작 분리와 현재 Backend 인증 계약 연결

## 부분 완료

- workspace 두리 분석: report·제안 preview·atomic local apply까지 완료, 실제 server API와 Directions는 대기
- auth API: 현재 Backend의 이메일 login/signup, JWT refresh/logout, Kakao token 교환, 초대 참여 계약 연결 완료
- Quiz API: 로컬 기준 로직과 adapter 경계는 완료, 실제 서버 계약은 대기
- 초대 딥링크: code를 native 초대 화면으로 전달
- 앱 아이콘·splash: 공식 템플릿 placeholder를 사용

## 미구현

- 실제 좌표 지도와 장소 기반 위치 권한 (현재 Place에 좌표 없음)
- 그룹 진단 전용 상세 route (여행방 상세 내 요약·차원 카드는 완료)
- gesture 기반 일정 reorder (현재 접근 가능한 위·아래 버튼 완료)
- 실제 사용자 검색·초대 링크·초대 권한
- 두리 분석 리포트, 제안 preview·apply UI
- guest → member 계정 병합
- 확정된 이용약관과 개인정보 처리 법률 문서
- server Quiz 결과 동기화와 guest → member 결과 병합

## 백엔드 계약 대기

- Google 로그인, guest → member 계정 업그레이드, 계정 삭제
- 여행방·장소·저장·후보·일정 API
- 초대 코드 조회와 수락
- Duri server engine 요청·응답

## 네이티브 기능 대기

- 지도 SDK와 native key 설정
- 푸시 알림과 deep-link 배포 도메인
- bottom sheet, drag-and-drop, 일정 gesture
- EAS Build와 store signing
