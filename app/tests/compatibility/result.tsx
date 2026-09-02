import { MemberOnlyRoute } from "../../../src/features/auth/components/MemberOnlyRoute";
import { CompatibilityResultScreen } from "../../../src/features/compatibility/screens/compatibility-result-screen";

export default function CompatibilityResultRoute() {
  return <MemberOnlyRoute feature="friend-management"><CompatibilityResultScreen /></MemberOnlyRoute>;
}
