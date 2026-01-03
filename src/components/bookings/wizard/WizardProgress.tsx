import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardStep } from "@/contexts/BookingWizardContext";

interface WizardProgressProps {
  currentStep: WizardStep;
  onStepClick: (step: WizardStep) => void;
}

const steps = [
  { step: 1 as WizardStep, label: "Kunde" },
  { step: 2 as WizardStep, label: "Produkt & Zuweisung" },
  { step: 3 as WizardStep, label: "Abschluss" },
];

export function WizardProgress({ currentStep, onStepClick }: WizardProgressProps) {
  return (
    <div className="flex items-center justify-center py-3">
      <div className="flex items-center gap-0">
        {steps.map((step, index) => {
          const isCompleted = step.step < currentStep;
          const isCurrent = step.step === currentStep;
          const isFuture = step.step > currentStep;

          return (
            <div key={step.step} className="flex items-center">
              {/* Step dot */}
              <button
                onClick={() => {
                  // Only allow clicking on completed steps or current step
                  if (step.step <= currentStep) {
                    onStepClick(step.step);
                  }
                }}
                disabled={isFuture}
                className={cn(
                  "flex flex-col items-center gap-1.5 transition-all",
                  isFuture ? "cursor-not-allowed" : "cursor-pointer"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                    isCompleted && "border-primary bg-primary text-primary-foreground",
                    isCurrent && "border-primary bg-primary text-primary-foreground ring-2 ring-primary/20",
                    isFuture && "border-muted-foreground/30 bg-background text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-medium">{step.step}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    isCurrent && "text-primary",
                    isCompleted && "text-foreground",
                    isFuture && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </button>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "mx-1.5 mt-[-16px] h-0.5 w-8 md:w-16",
                    step.step < currentStep ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
