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
