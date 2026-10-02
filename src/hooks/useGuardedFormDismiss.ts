import { useState } from "react";

/** X, Escape, overlay and Cancel share one pending/dirty policy. */
export function useGuardedFormDismiss({
  dirty,
  pending,
  onDiscard,
  onOpenChange,
}: {
  dirty: boolean;
  pending: boolean;
  onDiscard: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [discardOpen, setDiscardOpen] = useState(false);

  const closeSaved = () => {
    setDiscardOpen(false);
    onDiscard();
    onOpenChange(false);
  };
  const requestClose = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
    } else if (pending) {
      // Never dismiss while an already submitted save or photo upload is in flight.
      return;
    } else if (dirty) {
      setDiscardOpen(true);
    } else {
      closeSaved();
    }
  };
  const confirmDiscard = () => {
    setDiscardOpen(false);
    onDiscard();
    onOpenChange(false);
  };

  return { requestClose, closeSaved, discardOpen, setDiscardOpen, confirmDiscard };
}
