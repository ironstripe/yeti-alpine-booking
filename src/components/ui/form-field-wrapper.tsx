import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

interface FormFieldWrapperProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  helpText?: string;
  children?: React.ReactNode;
  className?: string;
}

export function FormFieldWrapper({
  id,
  label,
  required = false,
  error,
  helpText,
  children,
  className,
}: FormFieldWrapperProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {/* Label ABOVE the field */}
      <Label htmlFor={id} className={cn(error && "text-destructive")}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      {/* Field */}
      {children}

      {/* Error BELOW the field (red) */}
      {error && (
        <p className="text-sm text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}

      {/* Help text BELOW the field (gray) */}
      {!error && helpText && (
        <p className="text-sm text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}

/** Convenience wrapper for text inputs */
interface FormInputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helpText?: string;
}

export function FormInputField({
  id,
  label,
  required,
  error,
  helpText,
  className,
  ...props
}: FormInputFieldProps) {
  const inputId = id || label.toLowerCase().replace(/\s/g, "-");

  return (
    <FormFieldWrapper
      id={inputId}
      label={label}
      required={required}
      error={error}
      helpText={helpText}
      className={className}
    >
      <Input
        id={inputId}
        required={required}
        aria-invalid={!!error}
        className={cn(error && "border-destructive focus-visible:ring-destructive")}
        {...props}
      />
    </FormFieldWrapper>
  );
}
