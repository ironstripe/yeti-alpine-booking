import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { EmailTemplateCard } from "@/components/settings/EmailTemplateCard";
import { EmailPreviewModal } from "@/components/settings/EmailPreviewModal";
import { EmailTestDialog } from "@/components/settings/EmailTestDialog";
import { useEmailTemplates, EmailTemplate } from "@/hooks/useEmailTemplates";

export default function SettingsEmailTemplates() {
  const { data: templates, isLoading, error } = useEmailTemplates();
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [testTemplate, setTestTemplate] = useState<EmailTemplate | null>(null);

  // Group templates by category
  const groupedTemplates = templates?.reduce((acc, template) => {
    let category = "System";
    if (template.trigger.startsWith("booking")) category = "Buchungen";
    else if (template.trigger.startsWith("payment")) category = "Zahlungen";
    else if (template.trigger.startsWith("instructor")) category = "Skilehrer";
    else if (template.trigger.startsWith("voucher")) category = "Gutscheine";

    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {} as Record<string, EmailTemplate[]>);

  return (
    <SettingsLayout
      title="E-Mail Vorlagen"
      description="Verwalten Sie die E-Mail-Vorlagen für automatische Benachrichtigungen."
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Fehler beim Laden der Vorlagen</p>
        </div>
      ) : !templates?.length ? (
        <div className="text-center py-12">
          <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Keine E-Mail-Vorlagen vorhanden</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedTemplates || {}).map(([category, categoryTemplates]) => (
            <div key={category}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {category}
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {categoryTemplates.map((template) => (
                  <EmailTemplateCard
                    key={template.id}
                    template={template}
                    onPreview={setPreviewTemplate}
                    onTestSend={setTestTemplate}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <EmailPreviewModal
        template={previewTemplate}
        open={!!previewTemplate}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
      />

      <EmailTestDialog
        template={testTemplate}
        open={!!testTemplate}
        onOpenChange={(open) => !open && setTestTemplate(null)}
      />
    </SettingsLayout>
  );
}
