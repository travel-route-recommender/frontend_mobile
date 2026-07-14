import { useRouter } from "expo-router";
import { Screen } from "../../../components/common";
import { ErrorState } from "../../../components/feedback";

export function NotFoundScreen() { const router = useRouter(); return <Screen><ErrorState message="요청한 화면을 찾을 수 없어요." onRetry={() => router.replace("/")} /></Screen>; }
