# 모바일 마이그레이션 상태

## 완료

- Expo SDK 57 + TypeScript + Expo Router 프로젝트 기반
- 홈, 탐색, 여행, 저장, 마이 5개 탭
- 장소 상세, 여행 상세, 새 여행, workspace 기반 route
- 개인 여행 성향 테스트와 결과 저장
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

- workspace: 후보·일정·참여자 수와 로컬 분석 요약만 제공
- auth API: UI와 adapter 경계는 완료, 실제 서버 계약은 대기
- 초대 딥링크: code를 native 초대 화면으로 전달
- 앱 아이콘·splash: 공식 템플릿 placeholder를 사용

## 미구현

- 지도, 장소 기반 위치 권한
- 그룹 성향 진단 상세 화면
- 후보 보드와 일정 편집 gesture
- 두리 분석 리포트, 제안 preview·apply UI
- guest → member 계정 병합
- 확정된 이용약관과 개인정보 처리 법률 문서

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
