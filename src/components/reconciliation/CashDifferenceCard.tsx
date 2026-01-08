import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface CashDifferenceCardProps {
  expected: number;
  actual: number;
  difference: number;
  differenceReason: string;
  differenceAcknowledged: boolean;
  onDifferenceReasonChange: (value: string) => void;
  onDifferenceAcknowledgedChange: (value: boolean) => void;
  isLocked: boolean;
}

export function CashDifferenceCard({
  expected,
  actual,
  difference,
  differenceReason,
  differenceAcknowledged,
  onDifferenceReasonChange,
  onDifferenceAcknowledgedChange,
  isLocked,
}: CashDifferenceCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const absDifference = Math.abs(difference);
  const getDifferenceColor = () => {
    if (difference === 0) return "text-green-600";
    if (absDifference < 5) return "text-amber-600";
    return "text-destructive";
  };

  const getDifferenceIndicator = () => {
    if (difference === 0) return "🟢";
    if (absDifference < 5) return "🟡";
    return "🔴";
  };

  const needsReason = difference !== 0;
  const isReasonValid = !needsReason || differenceReason.trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kassendifferenz</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Soll (System):</span>
            <span className="font-medium">{formatCurrency(expected)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ist (gezählt):</span>
            <span className="font-medium">{formatCurrency(actual)}</span>
          </div>
          <div className="border-t pt-2 flex justify-between">
            <span className="font-medium">Differenz:</span>
            <span className={cn("font-bold flex items-center gap-2", getDifferenceColor())}>
              {formatCurrency(difference)}
              <span>{getDifferenceIndicator()}</span>
            </span>
          </div>
        </div>

        {needsReason && (
          <div className="space-y-2">
            <Label htmlFor="difference-reason">
              Begründung (bei Differenz) <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="difference-reason"
              value={differenceReason}
              onChange={(e) => onDifferenceReasonChange(e.target.value)}
              disabled={isLocked}
              placeholder="z.B. Wechselgeld-Fehler bei Buchung YETY-2025-38"
              className={cn(!isReasonValid && "border-destructive")}
            />
            {!isReasonValid && (
              <p className="text-sm text-destructive">Begründung erforderlich</p>
            )}
          </div>
        )}

        {needsReason && !isLocked && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="acknowledge"
              checked={differenceAcknowledged}
              onCheckedChange={(checked) => onDifferenceAcknowledgedChange(checked === true)}
            />
            <Label htmlFor="acknowledge" className="text-sm">
              Differenz akzeptieren und fortfahren
            </Label>
          </div>
        )}

        {absDifference >= 50 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
            ⚠️ Bei einer Differenz von mehr als CHF 50 wird eine Genehmigung benötigt.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
