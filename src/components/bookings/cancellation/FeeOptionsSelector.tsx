import { UseFormReturn } from "react-hook-form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type FeeOption = "agb" | "waived" | "custom";

interface FeeOptionsSelectorProps {
  feeOption: FeeOption;
  onFeeOptionChange: (value: FeeOption) => void;
  form: UseFormReturn<any>;
  feeAccordingToAgb: number;
  isWithin24h: boolean;
}

export function FeeOptionsSelector({
  feeOption,
  onFeeOptionChange,
  form,
  feeAccordingToAgb,
  isWithin24h,
}: FeeOptionsSelectorProps) {
  return (
    <div className="space-y-3">
      <Label>Stornogebühr</Label>
      <RadioGroup
        value={feeOption}
        onValueChange={(v) => onFeeOptionChange(v as FeeOption)}
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="agb" id="fee-agb" />
          <Label htmlFor="fee-agb">
            Gemäss AGB: CHF {feeAccordingToAgb.toFixed(2)}
            {!isWithin24h && " (keine Gebühr)"}
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="waived" id="fee-waived" />
          <Label htmlFor="fee-waived">Kulanz: Keine Gebühr</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="custom" id="fee-custom" />
          <Label htmlFor="fee-custom">Angepasst:</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            className="w-32"
            {...form.register("customFee", { valueAsNumber: true })}
            disabled={feeOption !== "custom"}
          />
          <span>CHF</span>
        </div>
      </RadioGroup>

      {isWithin24h && feeOption !== "agb" && (
        <div className="space-y-2">
          <Label htmlFor="waiver">Kulanz-Begründung *</Label>
          <Textarea
            id="waiver"
            {...form.register("waiverReason")}
            placeholder="Warum wird die Gebühr erlassen/reduziert?"
            rows={2}
          />
          {form.formState.errors.waiverReason && (
            <p className="text-sm text-destructive">
              {String(form.formState.errors.waiverReason.message)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
