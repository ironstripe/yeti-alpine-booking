import { useNavigate } from "react-router-dom";
import { Mail, Eye, Send, ToggleLeft, ToggleRight, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmailTemplate, useToggleEmailTemplate } from "@/hooks/useEmailTemplates";

interface EmailTemplateCardProps {
  template: EmailTemplate;
  onPreview: (template: EmailTemplate) => void;
  onTestSend: (template: EmailTemplate) => void;
}

const triggerLabels: Record<string, string> = {
  "booking.request.received": "Buchungsanfrage eingegangen",
  "booking.confirmed": "Buchung bestätigt",
  "booking.cancelled": "Buchung storniert",
  "booking.reminder": "Buchungserinnerung",
  "payment.received": "Zahlung erhalten",
  "payment.reminder": "Zahlungserinnerung",
  "instructor.absence.approved": "Abwesenheit genehmigt",
  "instructor.absence.rejected": "Abwesenheit abgelehnt",
  "voucher.created": "Gutschein erstellt",
};

const categoryColors: Record<string, string> = {
  booking: "bg-blue-500/10 text-blue-600",
  payment: "bg-green-500/10 text-green-600",
  instructor: "bg-purple-500/10 text-purple-600",
  voucher: "bg-amber-500/10 text-amber-600",
  system: "bg-gray-500/10 text-gray-600",
};

function getCategoryFromTrigger(trigger: string): string {
  if (trigger.startsWith("booking")) return "booking";
  if (trigger.startsWith("payment")) return "payment";
  if (trigger.startsWith("instructor")) return "instructor";
  if (trigger.startsWith("voucher")) return "voucher";
  return "system";
}

export function EmailTemplateCard({ template, onPreview, onTestSend }: EmailTemplateCardProps) {
  const navigate = useNavigate();
  const toggleMutation = useToggleEmailTemplate();
  const category = getCategoryFromTrigger(template.trigger);

  const handleToggle = (checked: boolean) => {
    toggleMutation.mutate({ id: template.id, isActive: checked });
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium truncate">{template.name}</h3>
                <Badge variant="secondary" className={categoryColors[category]}>
                  {category}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {triggerLabels[template.trigger] || template.trigger}
              </p>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                Betreff: {template.subject}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={template.is_active}
              onCheckedChange={handleToggle}
              disabled={toggleMutation.isPending}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/settings/emails/${template.id}`)}
          >
            <Pencil className="h-4 w-4 mr-1" />
            Bearbeiten
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPreview(template)}
          >
            <Eye className="h-4 w-4 mr-1" />
            Vorschau
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTestSend(template)}
          >
            <Send className="h-4 w-4 mr-1" />
            Testen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
