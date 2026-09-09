import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { radius } from "../../../theme/tokens";

export function AppleSignInButton({ onPress, disabled = false, testID }: {
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  testID?: string;
}) {
  const lock = useRef(false);
  const [available, setAvailable] = useState(false);
  const [pending, setPending] = useState(false);
  const blocked = disabled || pending;

  useEffect(() => {
    let mounted = true;
    void AppleAuthentication.isAvailableAsync().then((value) => {
      if (mounted) setAvailable(value);
    });
    return () => { mounted = false; };
  }, []);

  if (!available) return null;

  const handlePress = async () => {
    if (blocked || lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      await onPress();
    } finally {
      setPending(false);
      lock.current = false;
    }
  };

  return (
    <View pointerEvents={blocked ? "none" : "auto"} style={blocked ? styles.disabled : undefined}>
      <AppleAuthentication.AppleAuthenticationButton
        testID={testID}
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={radius.md}
        style={styles.button}
        onPress={handlePress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: { width: "100%", height: 54 },
  disabled: { opacity: 0.5 },
});
