import { TextField } from "../../../components/common";
import type { TripDatePickerProps } from "./TripDatePicker.types";

export function TripDatePicker({ label, value, onChange }: TripDatePickerProps) {
  return <TextField label={label} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" helperText="YYYY-MM-DD 형식" />;
}

