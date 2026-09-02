# Backend 요구사항 문서 안내

이 문서의 기존 내용은 현재 구현과 맞지 않아 더 이상 유지하지 않습니다.

두리 워크스페이스에서 Frontend로 대신할 수 없는 Backend 책임은 [API_WORKSPACE_BACKEND_REQUIREMENTS.md](./API_WORKSPACE_BACKEND_REQUIREMENTS.md)를 기준으로 확인합니다.

Frontend의 일정 분석, 참여자 조율 계산, 일정 탐색, OCR 결과 검토, TODO 작성 UI와 자동 TODO 후보 계산은 Frontend가 담당합니다.

TODO는 모든 여행방 참여자에게 공유되어야 하므로 저장·조회·권한·동시 수정·일정 및 문서 연결·중복 방지·알림은 위 문서의 Backend 필수 구현 범위에 포함합니다.
