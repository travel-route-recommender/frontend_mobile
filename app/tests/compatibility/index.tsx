import { MemberOnlyRoute } from "../../../src/features/auth/components/MemberOnlyRoute";
import { CompatibilityTestScreen } from "../../../src/features/compatibility/screens/compatibility-test-screen";

export default function CompatibilityTestRoute() {
  return <MemberOnlyRoute feature="friend-management"><CompatibilityTestScreen /></MemberOnlyRoute>;
}
