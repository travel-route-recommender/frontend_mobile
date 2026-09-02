import { MemberOnlyRoute } from "../../src/features/auth/components/MemberOnlyRoute";
import { OnboardingPreferenceTestScreen } from "../../src/features/onboarding/screens/onboarding-preference-test-screen";

export default function OnboardingPreferenceTestRoute() {
  return <MemberOnlyRoute feature="preference-test"><OnboardingPreferenceTestScreen /></MemberOnlyRoute>;
}
