import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter as ShadcnDialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface BaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[90vw]",
};

export function BaseDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: BaseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(sizeClasses[size], "max-h-[90vh] flex flex-col")}>
        {/* Header - X button handled by DialogContent */}
        <DialogHeader className="pr-8">
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto py-4">
          {children}
        </div>

        {/* Footer - Buttons ALWAYS bottom right */}
        {footer && (
          <ShadcnDialogFooter className="pt-4 border-t border-border">
            {footer}
          </ShadcnDialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
