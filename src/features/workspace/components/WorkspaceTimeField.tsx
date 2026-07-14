import { TextField } from "../../../components/common";
import type { WorkspaceTimeFieldProps } from "./WorkspaceTimeField.types";

export function WorkspaceTimeField({ label, value, onChange, error }: WorkspaceTimeFieldProps) {
  return <TextField
    label={label}
    value={value}
    onChangeText={onChange}
    placeholder="HH:mm"
    keyboardType="numbers-and-punctuation"
    maxLength={5}
    error={error}
    helperText="08:00~24:00 · 30분 단위"
  />;
}

