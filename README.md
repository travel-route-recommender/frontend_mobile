# 두리 모바일

TripMatch의 협업 여행 서비스 **두리**를 위한 React Native + Expo 앱 기반이다. 현재는 mock data로 5개 탭, 장소·여행 상세, 여행방 생성, 개인 성향 테스트와 일정 분석 기반을 제공한다.

## 실행

```bash
npm install
npm start
```

별도 터미널에서 Expo 안내에 따라 Android 또는 iOS Expo Go를 연다. iOS native simulator 실행은 macOS가 필요하다.

## 검증

```bash
npm run lint
npm run typecheck
npm run build
npx expo-doctor
```

환경 변수는 `.env.example`을 참고한다. 기본 data source는 `mock`이며 API endpoint는 아직 구현하지 않았다. 자세한 구조와 이행 상태는 `docs/`를 확인한다.

## message 응답형 테스트

일정표형 테스트는 지우고 기존에 있던 8종류 블럭에 대한 선호도 + 일정 밀도에 대한 질문 총 9개를 추가하였습니다.
질문 내용은 나중에 바꾸거나 추가될 수 있습니다.

## 일정표 esset 관리

일정표·드래그 기능 본체: [DraggableItineraryEditor.tsx (line 35)](/home/soohyun/trip_frontend_mobile/frontend_mobile/src/features/preferences/components/DraggableItineraryEditor.tsx:35)

재사용 에셋 진입점: [itinerary-schedule-builder.tsx (line 1)](/home/soohyun/trip_frontend_mobile/frontend_mobile/src/features/preferences/assets/itinerary-schedule-builder.tsx:1)

8종류 블록의 이름·아이콘·색상: [travel-preference-test-config.ts (line 30)](/home/soohyun/trip_frontend_mobile/frontend_mobile/src/features/preferences/config/travel-preference-test-config.ts:30)

08:00~24:00 시간 슬롯·일정표 행 설정: [travel-preference-test-config.ts (line 41)](/home/soohyun/trip_frontend_mobile/frontend_mobile/src/features/preferences/config/travel-preference-test-config.ts:41)
