import { DuriSuggestionPreviewScreen } from "../../../../src/features/duri/screens/DuriSuggestionPreviewScreen";
import { MemberOnlyRoute } from "../../../../src/features/auth/components/MemberOnlyRoute";

export default function DuriSuggestionPreviewRoute() {
  return <MemberOnlyRoute feature="duri"><DuriSuggestionPreviewScreen /></MemberOnlyRoute>;
}
