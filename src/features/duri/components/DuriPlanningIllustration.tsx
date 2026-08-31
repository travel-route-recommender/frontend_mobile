import { Image, StyleSheet } from "react-native";

const planningIllustration = require("../../../../design/image/duri_analysis_planning.png");

export function DuriPlanningIllustration({ compact = false, variant = "analysis" }: { compact?: boolean; variant?: "analysis" | "suggestion" }) {
  return <Image
    accessible={false}
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    resizeMode="contain"
    source={planningIllustration}
    style={[
      variant === "analysis" ? styles.analysis : styles.suggestion,
      compact && (variant === "analysis" ? styles.analysisCompact : styles.suggestionCompact),
    ]}
  />;
}

const styles = StyleSheet.create({
  analysis: { width: "44%", minWidth: 118, maxWidth: 154, height: 142, alignSelf: "flex-end" },
  analysisCompact: { width: "39%", minWidth: 104, maxWidth: 136, height: 132 },
  suggestion: { width: "42%", minWidth: 112, maxWidth: 148, height: 156, alignSelf: "flex-end" },
  suggestionCompact: { width: "37%", minWidth: 100, maxWidth: 132, height: 146 },
});
