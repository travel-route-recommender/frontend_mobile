import { MemberOnlyRoute } from "../../../src/features/auth/components/MemberOnlyRoute";
import { PersonalReviewScreen } from "../../../src/features/preferences/screens/PersonalReviewScreen";

export default function PersonalReviewRoute() {
  return <MemberOnlyRoute feature="preference-test"><PersonalReviewScreen /></MemberOnlyRoute>;
}
