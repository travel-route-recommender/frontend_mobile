import { useTripDocumentStore } from "../../trip-documents/store/useTripDocumentStore";
import { useTripTodoStore } from "../../trip-todos/store/useTripTodoStore";

export function activateLocalPrivateDataForUser(userId: string) {
  // hydration보다 먼저 호출돼도 requested owner가 persist merge에 적용되므로
  // 문서/TODO 로딩을 로그인 또는 Workspace의 전역 gate로 만들지 않는다.
  useTripDocumentStore.getState().activatePrivateDataScope(userId);
  useTripTodoStore.getState().activatePrivateDataScope(userId);
}

export function deactivateLocalPrivateData() {
  useTripDocumentStore.getState().deactivatePrivateDataScope();
  useTripTodoStore.getState().deactivatePrivateDataScope();
}

export function transferLocalPrivateDataForVerifiedUpgrade(previousUserId: string, nextUserId: string) {
  useTripDocumentStore.getState().transferPrivateDataScope(previousUserId, nextUserId);
  useTripTodoStore.getState().transferPrivateDataScope(previousUserId, nextUserId);
}
