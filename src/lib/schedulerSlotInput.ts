export type DesktopSlotIntent = "drag" | "toggle" | "none";

interface DesktopSlotIntentInput {
  isMobile: boolean;
  isEligible: boolean;
  button: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  multiSelectMode?: boolean;
}

export function getDesktopSlotIntent({
  isMobile,
  isEligible,
  button,
  ctrlKey = false,
  metaKey = false,
  multiSelectMode = false,
}: DesktopSlotIntentInput): DesktopSlotIntent {
  if (isMobile || !isEligible) return "none";
  if (button === 2) return "toggle";
  if (button !== 0) return "none";
  if (ctrlKey || metaKey || multiSelectMode) return "toggle";
  return "drag";
}