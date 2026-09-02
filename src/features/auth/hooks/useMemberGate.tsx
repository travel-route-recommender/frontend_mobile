import { useCallback, useState } from "react";
import { router } from "expo-router";
import { GuestPromptModal } from "../components/GuestPromptModal";
import { authCapabilities } from "../services/authService";
import { useAuthSessionStore } from "../store/useAuthSessionStore";

export function useMemberGate() {
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const [prompt, setPrompt] = useState<{ visible: boolean; actionLabel?: string }>({ visible: false });

  const requireMember = useCallback((action: () => void, actionLabel?: string) => {
    if (sessionKind === "member") { action(); return; }
    setPrompt({ visible: true, actionLabel });
  }, [sessionKind]);

  const closePrompt = useCallback(() => setPrompt({ visible: false }), []);
  const go = useCallback((route: "/(auth)/login" | "/(auth)/signup-choice" | "/(auth)/guest-upgrade") => { closePrompt(); router.push(route as never); }, [closePrompt]);
  const canUpgradeGuest = sessionKind === "guest" && authCapabilities.guestUpgrade;
  const memberGatePrompt = <GuestPromptModal visible={prompt.visible} sessionKind={sessionKind} actionLabel={prompt.actionLabel} guestUpgradeAvailable={authCapabilities.guestUpgrade} onClose={closePrompt} onLogin={() => go("/(auth)/login")} onSignup={() => go(canUpgradeGuest ? "/(auth)/guest-upgrade" : "/(auth)/signup-choice")} />;

  return { isMember: sessionKind === "member", sessionKind, requireMember, memberGatePrompt, closePrompt };
}
