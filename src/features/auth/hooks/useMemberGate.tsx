import { useCallback, useState } from "react";
import { router } from "expo-router";
import { GuestPromptModal } from "../components/GuestPromptModal";
import { useAuthSessionStore } from "../store/useAuthSessionStore";

export function useMemberGate() {
  const sessionKind = useAuthSessionStore((state) => state.sessionKind);
  const [prompt, setPrompt] = useState<{ visible: boolean; actionLabel?: string }>({ visible: false });

  const requireMember = useCallback((action: () => void, actionLabel?: string) => {
    if (sessionKind === "member") { action(); return; }
    setPrompt({ visible: true, actionLabel });
  }, [sessionKind]);

  const closePrompt = useCallback(() => setPrompt({ visible: false }), []);
  const go = useCallback((route: "/(auth)/login" | "/(auth)/signup-choice") => { closePrompt(); router.push(route); }, [closePrompt]);
  const memberGatePrompt = <GuestPromptModal visible={prompt.visible} sessionKind={sessionKind} actionLabel={prompt.actionLabel} onClose={closePrompt} onLogin={() => go("/(auth)/login")} onSignup={() => go("/(auth)/signup-choice")} />;

  return { isMember: sessionKind === "member", sessionKind, requireMember, memberGatePrompt, closePrompt };
}
