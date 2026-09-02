import { MemberOnlyRoute } from "../../src/features/auth/components/MemberOnlyRoute";
import { ProfileSetupScreen } from "../../src/features/onboarding/screens/OnboardingScreens";

export default function ProfileSetupRoute() {
  return <MemberOnlyRoute feature="preference-test"><ProfileSetupScreen /></MemberOnlyRoute>;
}
