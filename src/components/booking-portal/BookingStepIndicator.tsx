import { cn } from "@/lib/utils";

interface BookingStepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  labels: string[];
}

export function BookingStepIndicator({ currentStep, totalSteps, labels }: BookingStepIndicatorProps) {
  return (
    <div className="mb-6">
      <p className="text-sm text-muted-foreground mb-2">
        Schritt {currentStep} von {totalSteps} · {labels[currentStep - 1]}
      </p>
      <div className="flex items-center gap-1">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div key={index} className="flex items-center flex-1">
            <div
              className={cn(
                "h-2 rounded-full flex-1 transition-colors",
                index + 1 <= currentStep ? "bg-primary" : "bg-muted"
              )}
            />
            {index < totalSteps - 1 && (
              <div className="w-2" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
