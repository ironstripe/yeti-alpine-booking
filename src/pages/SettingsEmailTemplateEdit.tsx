import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Save, Eye, Loader2, ArrowLeft } from "lucide-react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { VariableHelper } from "@/components/settings/VariableHelper";
import { EmailPreviewModal } from "@/components/settings/EmailPreviewModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEmailTemplate, useUpdateEmailTemplate, EmailTemplate } from "@/hooks/useEmailTemplates";

export default function SettingsEmailTemplateEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: template, isLoading } = useEmailTemplate(id);
  const updateMutation = useUpdateEmailTemplate();

  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState("html");

  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (template) {
      setSubject(template.subject);
      setBodyHtml(template.body_html);
      setBodyText(template.body_text || "");
    }
  }, [template]);

  const handleSave = () => {
    if (!id) return;
    updateMutation.mutate({
      id,
      updates: {
        subject,
        body_html: bodyHtml,
        body_text: bodyText || null,
      },
    });
  };

  const handleInsertVariable = (variable: string) => {
    if (activeTab === "html" && htmlTextareaRef.current) {
      const textarea = htmlTextareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = bodyHtml.substring(0, start) + variable + bodyHtml.substring(end);
      setBodyHtml(newValue);
      // Set cursor position after inserted variable
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    }
  };

  const previewTemplate: EmailTemplate | null = template
    ? { ...template, subject, body_html: bodyHtml, body_text: bodyText }
    : null;

  const hasChanges =
    template &&
    (subject !== template.subject ||
      bodyHtml !== template.body_html ||
      bodyText !== (template.body_text || ""));

  if (isLoading) {
    return (
      <SettingsLayout title="E-Mail Vorlage bearbeiten">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </SettingsLayout>
    );
  }

  if (!template) {
    return (
      <SettingsLayout title="E-Mail Vorlage bearbeiten">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Vorlage nicht gefunden</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/settings/emails")}>
            Zurück zur Übersicht
          </Button>
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout title={template.name} description={`Trigger: ${template.trigger}`}>
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Editor Area */}
        <div className="flex-1 space-y-6">
          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => navigate("/settings/emails")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Zurück
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
                <Eye className="h-4 w-4 mr-1" />
                Vorschau
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Speichern
              </Button>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Betreff</Label>
            <Input
              id="subject"
              ref={subjectInputRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="E-Mail Betreff..."
            />
          </div>

          {/* Body Editor */}
          <div className="space-y-2">
            <Label>Inhalt</Label>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-2">
                <TabsTrigger value="html">HTML</TabsTrigger>
                <TabsTrigger value="text">Nur-Text</TabsTrigger>
              </TabsList>
              <TabsContent value="html" className="mt-0">
                <Textarea
                  ref={htmlTextareaRef}
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  placeholder="HTML-Inhalt der E-Mail..."
                  className="font-mono text-sm min-h-[400px]"
                />
              </TabsContent>
              <TabsContent value="text" className="mt-0">
                <Textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder="Nur-Text-Version (optional)..."
                  className="font-mono text-sm min-h-[400px]"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Die Nur-Text-Version wird als Fallback verwendet, wenn HTML nicht angezeigt werden kann.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Variable Helper Sidebar */}
        <div className="lg:w-72 shrink-0">
          <div className="sticky top-4">
            <VariableHelper onInsert={handleInsertVariable} />
          </div>
        </div>
      </div>

      <EmailPreviewModal
        template={previewTemplate}
        open={showPreview}
        onOpenChange={setShowPreview}
      />
    </SettingsLayout>
  );
}
