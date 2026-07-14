import { Stack } from "expo-router";

export default function TestsLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false, animation: "slide_from_right" }} />;
}
