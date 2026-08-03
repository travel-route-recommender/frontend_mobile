import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../../../theme/tokens";
import type { PreferenceMessageOption } from "../config/itinerary-message-questions";

type Props<OptionId extends string | number> = {
  senderName: string;
  senderStatus: string;
  message: string;
  options: readonly PreferenceMessageOption<OptionId>[];
  categoryIcon: string;
  categoryLabel: string;
  current: number;
  total: number;
  selectedOptionId?: OptionId;
  onSelect: (optionId: OptionId) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  completionMessage?: string;
};

export function PreferenceMessageQuestion<OptionId extends string | number>({
  senderName,
  senderStatus,
  message,
  options,
  categoryIcon,
  categoryLabel,
  current,
  total,
  selectedOptionId,
  onSelect,
  onPrevious,
  onNext,
  completionMessage,
}: Props<OptionId>) {
  const selectedOption = options.find((option) => option.id === selectedOptionId);
  const senderInitial = senderName.trim().slice(0, 1) || "?";

  return (
    <View style={styles.chat}>
      <View style={styles.chatHeader}>
        <View accessibilityLabel={`${senderName} 프로필`} style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{senderInitial}</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.senderName}>{senderName}</Text>
          <Text style={styles.senderStatus}>{senderStatus} · {current}/{total}</Text>
        </View>
        <View accessibilityLabel="온라인" style={styles.onlineDot} />
      </View>

      <View style={styles.conversation}>
        <View
          accessibilityLabel={`메시지 질문 ${total}개 중 ${current}번째`}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: total, now: current }}
          style={styles.messageProgress}
        >
          {Array.from({ length: total }, (_, index) => (
            <View key={index} style={[styles.messageProgressSegment, index < current && styles.messageProgressSegmentActive]} />
          ))}
        </View>
        <View style={styles.dateDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dateLabel}>오늘</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{categoryIcon} {categoryLabel}</Text>
        </View>

        <View style={styles.incomingRow}>
          <View accessibilityElementsHidden style={styles.messageAvatar}>
            <Text style={styles.messageAvatarText}>{senderInitial}</Text>
          </View>
          <View style={styles.incomingCopy}>
            <Text style={styles.messageSender}>{senderName}</Text>
            <View style={styles.incomingMessageLine}>
              <View style={styles.incomingBubble}>
                <Text selectable style={styles.incomingText}>{message}</Text>
              </View>
              <Text style={styles.time}>오후 8:08</Text>
            </View>
          </View>
        </View>

        {selectedOption ? (
          <View accessibilityLiveRegion="polite" style={styles.outgoingRow}>
            <View style={styles.outgoingMeta}>
              <Text style={styles.readState}>읽음</Text>
              <Text style={styles.time}>오후 8:09</Text>
            </View>
            <View style={styles.outgoingBubble}>
              <Text selectable style={styles.outgoingText}>{selectedOption.label}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.replyPanel}>
        <Text style={styles.replyLabel}>{categoryLabel}에 대해 답장하기</Text>
        <View accessibilityLabel="답장 선택지" accessibilityRole="radiogroup" style={styles.optionList}>
          {options.map((option) => {
            const selected = option.id === selectedOptionId;
            return (
              <Pressable
                key={option.id}
                accessibilityLabel={`${option.meaning}. ${option.label}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => onSelect(option.id)}
                style={({ pressed }) => [
                  styles.option,
                  selected && styles.optionSelected,
                  pressed && styles.optionPressed,
                ]}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.messageNavigation}>
          {onPrevious ? (
            <Pressable
              accessibilityRole="button"
              onPress={onPrevious}
              style={({ pressed }) => [styles.messageNavigationButton, pressed && styles.optionPressed]}
            >
              <Text style={styles.messageNavigationButtonText}>‹ 이전 질문</Text>
            </Pressable>
          ) : <View />}
          {selectedOption && onNext ? (
            <Pressable
              accessibilityRole="button"
              onPress={onNext}
              style={({ pressed }) => [styles.nextMessageButton, pressed && styles.optionPressed]}
            >
              <Text style={styles.nextMessageButtonText}>다음 메시지 ›</Text>
            </Pressable>
          ) : null}
        </View>
        {selectedOption && !onNext ? (
          <Text accessibilityLiveRegion="polite" style={styles.completedHelper}>
            {completionMessage ?? `${total}개의 대화에 모두 답했어요. 아래의 ‘다음’을 눌러 계속해 주세요.`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chat: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  chatHeader: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  headerAvatarText: { ...typography.subtitle, color: colors.primary },
  headerCopy: { flex: 1, gap: 1 },
  senderName: { ...typography.bodyStrong, color: colors.text },
  senderStatus: { ...typography.caption, color: colors.textMuted },
  onlineDot: {
    width: 10,
    height: 10,
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
  conversation: {
    minHeight: 290,
    gap: spacing.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  messageProgress: { flexDirection: "row", gap: spacing.xxs },
  messageProgressSegment: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  messageProgressSegmentActive: { backgroundColor: colors.primary },
  dateDivider: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  dateLabel: { ...typography.caption, color: colors.textMuted },
  categoryBadge: {
    alignSelf: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  categoryBadgeText: { ...typography.caption, color: colors.textSecondary },
  incomingRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  messageAvatar: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  messageAvatarText: { ...typography.caption, color: colors.primary },
  incomingCopy: { flex: 1, gap: spacing.xxs },
  messageSender: { ...typography.caption, color: colors.textSecondary },
  incomingMessageLine: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  incomingBubble: {
    maxWidth: "78%",
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  incomingText: { ...typography.body, color: colors.text },
  time: { fontSize: 10, lineHeight: 14, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  outgoingRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "flex-end", gap: spacing.xs },
  outgoingMeta: { alignItems: "flex-end" },
  readState: { fontSize: 10, lineHeight: 14, color: colors.primary },
  outgoingBubble: {
    maxWidth: "78%",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.sm,
    borderBottomRightRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  outgoingText: { ...typography.body, color: colors.white },
  replyPanel: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  replyLabel: { ...typography.caption, color: colors.textSecondary },
  optionList: { gap: spacing.xs },
  option: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionPressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  optionText: { ...typography.body, flex: 1, color: colors.textSecondary },
  optionTextSelected: { ...typography.bodyStrong, color: colors.primary },
  radio: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.primary },
  messageNavigation: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  messageNavigationButton: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  messageNavigationButtonText: { ...typography.caption, color: colors.textSecondary },
  nextMessageButton: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  nextMessageButtonText: { ...typography.bodyStrong, color: colors.white },
  completedHelper: { ...typography.caption, color: colors.success, textAlign: "center" },
});
