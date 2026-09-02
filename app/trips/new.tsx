import { MemberOnlyRoute } from "../../src/features/auth/components/MemberOnlyRoute";
import { CreateTripWizardScreen } from "../../src/features/trip-creation/screens/CreateTripWizardScreen";

export default function CreateTripRoute() {
  return <MemberOnlyRoute feature="trip-create"><CreateTripWizardScreen /></MemberOnlyRoute>;
}
