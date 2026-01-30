import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface DialogFooterActionsProps {
  onCancel: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  isDisabled?: boolean;
  variant?: "default" | "destructive";
  /** Optional: Additional button on the left (e.g., Delete) */
  leftAction?: {
    label: string;
    onClick: () => void;
    variant: "destructive" | "outline";
    isLoading?: boolean;
  };
}

export function DialogFooterActions({
  onCancel,
  onSubmit,
  submitLabel = "Speichern",
  cancelLabel = "Abbrechen",
  isLoading = false,
  isDisabled = false,
  variant = "default",
  leftAction,
}: DialogFooterActionsProps) {
  return (
    <>
      {/* Left-aligned destructive action (e.g., Delete) */}
      {leftAction && (
        <Button
          type="button"
          variant={leftAction.variant}
          onClick={leftAction.onClick}
          disabled={leftAction.isLoading}
          className="mr-auto"
        >
          {leftAction.isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {leftAction.label}
            </>
          ) : (
            leftAction.label
          )}
        </Button>
      )}

      {/* Right-aligned: Cancel + Submit */}
      <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
        {cancelLabel}
      </Button>
      {onSubmit && (
        <Button
          type="submit"
          variant={variant === "destructive" ? "destructive" : "default"}
          onClick={onSubmit}
          disabled={isLoading || isDisabled}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Speichern...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      )}
    </>
  );
}
