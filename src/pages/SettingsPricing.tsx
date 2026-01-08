import { useState } from "react";
import { Loader2, DollarSign, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import {
  usePricingRules,
  useCancellationPolicy,
  useUpdateCancellationPolicy,
  useUpdatePricingRule,
  useDeletePricingRule,
} from "@/hooks/usePricingRules";

const typeLabels: Record<string, string> = {
  volume: "Mengenrabatt",
  duration: "Mehrtagesrabatt",
  promo: "Aktionscode",
  partner: "Partnerrabatt",
};

const typeIcons: Record<string, string> = {
  volume: "👥",
  duration: "📅",
  promo: "🎟️",
  partner: "🏨",
};

export default function SettingsPricing() {
  const { data: pricingRules, isLoading: rulesLoading } = usePricingRules();
  const { data: cancellationPolicy, isLoading: policyLoading } = useCancellationPolicy();
  const updatePolicy = useUpdateCancellationPolicy();
  const updateRule = useUpdatePricingRule();
  const deleteRule = useDeletePricingRule();

  const [localPolicy, setLocalPolicy] = useState<{
    free_cancellation_hours: number;
    late_cancellation_percent: number;
    no_show_percent: number;
  } | null>(null);

  const policy = localPolicy || cancellationPolicy;
  const isLoading = rulesLoading || policyLoading;

  const handlePolicyChange = (field: string, value: number) => {
    setLocalPolicy(prev => ({
      free_cancellation_hours: prev?.free_cancellation_hours ?? cancellationPolicy?.free_cancellation_hours ?? 24,
      late_cancellation_percent: prev?.late_cancellation_percent ?? cancellationPolicy?.late_cancellation_percent ?? 50,
      no_show_percent: prev?.no_show_percent ?? cancellationPolicy?.no_show_percent ?? 100,
      [field]: value,
    }));
  };

  const handleSavePolicy = () => {
    if (localPolicy) {
      updatePolicy.mutate(localPolicy, {
        onSuccess: () => setLocalPolicy(null),
      });
    }
  };

  const handleToggleRule = (id: string, isActive: boolean) => {
    updateRule.mutate({ id, is_active: !isActive });
  };

  if (isLoading) {
    return (
      <SettingsLayout title="Preise" description="Rabatte, Zuschläge und Sonderkonditionen">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout title="Preise" description="Rabatte, Zuschläge und Sonderkonditionen">
      <div className="space-y-6">
        {/* Pricing Rules */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Sonderpreise & Rabatte</CardTitle>
                <CardDescription>Rabattregeln für verschiedene Situationen</CardDescription>
              </div>
              <Button size="sm" disabled>
                <Plus className="h-4 w-4 mr-2" />
                Neue Regel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!pricingRules?.length ? (
              <EmptyState
                icon={DollarSign}
                title="Keine Preisregeln"
                description="Erstelle Rabattregeln für Mengen, Partner oder Aktionen."
              />
            ) : (
              <div className="space-y-3">
                {pricingRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{typeIcons[rule.type] || "💰"}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{rule.name}</p>
                          <Badge variant="outline" className="text-xs">
                            {typeLabels[rule.type] || rule.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {rule.discount_type === "percent" && `${rule.discount_value}% Rabatt`}
                          {rule.discount_type === "fixed" && `CHF ${rule.discount_value} Rabatt`}
                          {rule.promo_code && ` • Code: ${rule.promo_code}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={() => handleToggleRule(rule.id, rule.is_active)}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem disabled>
                            <Pencil className="h-4 w-4 mr-2" />
                            Bearbeiten
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteRule.mutate(rule.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Löschen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cancellation Policy */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stornierungsbedingungen</CardTitle>
            <CardDescription>Gebühren bei Stornierung oder Nichterscheinen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Kostenlose Stornierung bis</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    value={policy?.free_cancellation_hours ?? 24}
                    onChange={(e) => handlePolicyChange("free_cancellation_hours", parseInt(e.target.value) || 0)}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">Stunden vorher</span>
                </div>
              </div>
              <div>
                <Label>Späte Stornierung</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    value={policy?.late_cancellation_percent ?? 50}
                    onChange={(e) => handlePolicyChange("late_cancellation_percent", parseInt(e.target.value) || 0)}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">% des Buchungswerts</span>
                </div>
              </div>
              <div>
                <Label>Bei Nichterscheinen</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    value={policy?.no_show_percent ?? 100}
                    onChange={(e) => handlePolicyChange("no_show_percent", parseInt(e.target.value) || 0)}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">% des Buchungswerts</span>
                </div>
              </div>
            </div>
            {localPolicy && (
              <div className="flex justify-end">
                <Button onClick={handleSavePolicy} disabled={updatePolicy.isPending}>
                  {updatePolicy.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Speichern
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}
