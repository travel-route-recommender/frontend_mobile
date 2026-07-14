# 모바일 마이그레이션 상태

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
- mock/api/hybrid Auth 동작 분리와 API 계약 대기 오류

## 부분 완료

- workspace: TripHome 진입과 후보·일정·참여자 수 및 로컬 분석 요약만 제공
- auth API: UI와 adapter 경계는 완료, 실제 서버 계약은 대기
- Quiz API: 로컬 기준 로직과 adapter 경계는 완료, 실제 서버 계약은 대기
- 초대 딥링크: code를 native 초대 화면으로 전달
- 앱 아이콘·splash: 공식 템플릿 placeholder를 사용

## 미구현

- 실제 좌표 지도와 장소 기반 위치 권한 (현재 Place에 좌표 없음)
- 그룹 진단 전용 상세 route (여행방 상세 내 요약·차원 카드는 완료)
- 후보 보드와 일정 편집 gesture
- 실제 사용자 검색·초대 링크·초대 권한
- 후보 제거 권한과 일정 배치 후보 보존 정책
- 두리 분석 리포트, 제안 preview·apply UI
- guest → member 계정 병합
- 확정된 이용약관과 개인정보 처리 법률 문서
- server Quiz 결과 동기화와 guest → member 결과 병합

## 백엔드 계약 대기

- 로그인, 회원가입, OAuth, JWT refresh
- 여행방·장소·저장·후보·일정 API
- 초대 코드 조회와 수락
- Duri server engine 요청·응답

## 네이티브 기능 대기

- 지도 SDK와 native key 설정
- 푸시 알림과 deep-link 배포 도메인
- bottom sheet, drag-and-drop, 일정 gesture
- EAS Build와 store signing
