import { Redirect, useLocalSearchParams } from "expo-router";

export default function InviteCodeRoute() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    tripId?: string | string[];
    revision?: string | string[];
  }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const revision = Array.isArray(params.revision) ? params.revision[0] : params.revision;
  return <Redirect href={{ pathname: "/(auth)/invite", params: { code: code ?? "", tripId, revision } }} />;
}
