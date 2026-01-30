import { useEffect, useCallback } from "react";

interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  action: () => void;
  preventDefault?: boolean;
  /** Description for accessibility/documentation */
  description?: string;
}

/**
 * Hook for registering global keyboard shortcuts.
 * 
 * @example
 * useKeyboardShortcuts([
 *   { key: "k", ctrlKey: true, action: () => setSearchOpen(true), description: "Open search" },
 *   { key: "n", ctrlKey: true, action: () => navigate("/bookings/new"), description: "New booking" },
 *   { key: "Escape", action: () => closeModal(), description: "Close modal" },
 * ]);
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields (unless it's Escape)
      const target = e.target as HTMLElement;
      const isInputField = 
        target.tagName === "INPUT" || 
        target.tagName === "TEXTAREA" || 
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        const ctrlOrMeta = shortcut.ctrlKey || shortcut.metaKey;
        const isCtrlOrMetaPressed = e.ctrlKey || e.metaKey;

        // For input fields, only allow Escape key
        if (isInputField && e.key !== "Escape" && !ctrlOrMeta) {
          continue;
        }

        if (
          e.key.toLowerCase() === shortcut.key.toLowerCase() &&
          (!ctrlOrMeta || isCtrlOrMetaPressed) &&
          (!shortcut.shiftKey || e.shiftKey)
        ) {
          if (shortcut.preventDefault !== false) {
            e.preventDefault();
          }
          shortcut.action();
          break;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Hook for a single escape key handler (common pattern for modals).
 */
export function useEscapeKey(onEscape: () => void, enabled: boolean = true) {
  useKeyboardShortcuts(
    enabled
      ? [{ key: "Escape", action: onEscape, description: "Close" }]
      : []
  );
}
