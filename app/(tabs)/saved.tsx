import { MemberOnlyRoute } from "../../src/features/auth/components/MemberOnlyRoute";
import { SavedScreen } from "../../src/features/saved/screens/SavedScreen";

export default function SavedRoute() {
  return <MemberOnlyRoute feature="save-place"><SavedScreen /></MemberOnlyRoute>;
}
