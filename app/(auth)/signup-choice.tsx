import { Redirect, useLocalSearchParams } from "expo-router";

export default function SignupChoiceRedirect() {
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;

  return <Redirect href={{ pathname: "/(auth)/signup-email", params: returnTo ? { returnTo } : {} }} />;
}
