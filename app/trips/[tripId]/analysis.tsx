import { DuriAnalysisScreen } from "../../../src/features/duri/screens/DuriAnalysisScreen";
import { MemberOnlyRoute } from "../../../src/features/auth/components/MemberOnlyRoute";

export default function DuriAnalysisRoute() {
  return <MemberOnlyRoute feature="duri"><DuriAnalysisScreen /></MemberOnlyRoute>;
}
