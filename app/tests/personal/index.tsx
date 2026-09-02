import { MemberOnlyRoute } from "../../../src/features/auth/components/MemberOnlyRoute";
import { PersonalTestScreen } from "../../../src/features/preferences/screens/PersonalTestScreen";

export default function PersonalTestRoute() {
  return <MemberOnlyRoute feature="preference-test"><PersonalTestScreen /></MemberOnlyRoute>;
}
