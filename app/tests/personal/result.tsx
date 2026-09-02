import { MemberOnlyRoute } from "../../../src/features/auth/components/MemberOnlyRoute";
import { PersonalResultScreen } from "../../../src/features/preferences/screens/PersonalResultScreen";

export default function PersonalResultRoute() {
  return <MemberOnlyRoute feature="preference-test"><PersonalResultScreen /></MemberOnlyRoute>;
}
