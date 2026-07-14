export interface TripDatePickerProps {
  label: string;
  value: string;
  minimumDate?: string;
  onChange(value: string): void;
}

