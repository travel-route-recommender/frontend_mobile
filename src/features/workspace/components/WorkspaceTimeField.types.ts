export type WorkspaceTimeFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  allowEndOfDay?: boolean;
  minuteInterval?: 1 | 15;
};
