import { MemberOnlyRoute } from "../../src/features/auth/components/MemberOnlyRoute";
import { FriendManagementScreen } from "../../src/features/compatibility/screens/friend-management-screen";

export default function FriendManagementRoute() {
  return <MemberOnlyRoute feature="friend-management"><FriendManagementScreen /></MemberOnlyRoute>;
}
