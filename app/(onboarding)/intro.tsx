import { MemberOnlyRoute } from "../../src/features/auth/components/MemberOnlyRoute";
import { OnboardingIntroScreen } from "../../src/features/onboarding/screens/OnboardingScreens";

export default function OnboardingIntroRoute() {
  return <MemberOnlyRoute feature="preference-test"><OnboardingIntroScreen /></MemberOnlyRoute>;
}
