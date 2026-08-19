import { TextField } from "../../../components/common";
import type { WorkspaceTimeFieldProps } from "./WorkspaceTimeField.types";

export function WorkspaceTimeField({ label, value, onChange, error, allowEndOfDay = false, minuteInterval = 1 }: WorkspaceTimeFieldProps) {
  const maximum = allowEndOfDay ? "24:00" : "23:59";
  return <TextField
    label={label}
    value={value}
    onChangeText={onChange}
    placeholder="HH:mm"
    keyboardType="numbers-and-punctuation"
    maxLength={5}
    error={error}
    helperText={`00:00~${maximum} · ${minuteInterval}분 단위 직접 설정`}
  />;
}
