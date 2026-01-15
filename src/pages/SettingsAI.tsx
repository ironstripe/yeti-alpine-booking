import { useState, useCallback, useEffect } from "react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, FileText, FileType, Trash2, Save, Loader2 } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";
import {
  useAIConfiguration,
  useUpdateAIConfiguration,
  useAIKnowledgeDocuments,
  useUploadKnowledgeDocument,
  useDeleteKnowledgeDocument,
  AIKnowledgeDocument,
} from "@/hooks/useAIConfiguration";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function SettingsAI() {
  const { isAdmin, loading: roleLoading } = useUserRole();

  // Redirect non-admins
  if (!roleLoading && !isAdmin) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <SettingsLayout
      title="KI-Einstellungen"
      description="Verwalten Sie die Wissensdatenbank und das Antwortverhalten der KI."
    >
      <Tabs defaultValue="knowledge" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="knowledge">Wissensdatenbank</TabsTrigger>
          <TabsTrigger value="config">Antwort-Konfiguration</TabsTrigger>
        </TabsList>

        <TabsContent value="knowledge">
          <KnowledgeBaseTab />
        </TabsContent>

        <TabsContent value="config">
          <ResponseConfigTab />
        </TabsContent>
      </Tabs>
    </SettingsLayout>
  );
}

function KnowledgeBaseTab() {
  const { data: documents, isLoading } = useAIKnowledgeDocuments();
  const uploadMutation = useUploadKnowledgeDocument();
  const deleteMutation = useDeleteKnowledgeDocument();
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      const validFiles = files.filter(
        (file) =>
          file.type === "application/pdf" ||
          file.type === "text/plain" ||
          file.type === "text/markdown" ||
          file.name.endsWith(".md")
      );

      validFiles.forEach((file) => uploadMutation.mutate(file));
    },
    [uploadMutation]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => uploadMutation.mutate(file));
    e.target.value = "";
  };

  const handleDelete = (doc: AIKnowledgeDocument) => {
    if (confirm(`Möchten Sie "${doc.file_name}" wirklich löschen?`)) {
      deleteMutation.mutate(doc);
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType === "application/pdf") {
      return <FileType className="h-5 w-5 text-red-500" />;
    }
    return <FileText className="h-5 w-5 text-blue-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle>Wissensdokumente hochladen</CardTitle>
          <CardDescription>
            Laden Sie hier Dokumente (PDF, TXT, MD) hoch, die der KI als
            Wissensgrundlage dienen, z.B. AGBs, Kursbeschreibungen oder
            Preislisten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
          >
            <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              Dateien hierher ziehen oder
            </p>
            <label>
              <input
                type="file"
                multiple
                accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploadMutation.isPending}
              />
              <Button
                variant="outline"
                disabled={uploadMutation.isPending}
                asChild
              >
                <span className="cursor-pointer">
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Hochladen...
                    </>
                  ) : (
                    "Dateien auswählen"
                  )}
                </span>
              </Button>
            </label>
            <p className="text-xs text-muted-foreground mt-2">
              Unterstützte Formate: PDF, TXT, MD
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Documents List Card */}
      <Card>
        <CardHeader>
          <CardTitle>Hochgeladene Dokumente</CardTitle>
          <CardDescription>
            {documents?.length || 0} Dokument(e) in der Wissensdatenbank
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              ))}
            </div>
          ) : documents?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Noch keine Dokumente hochgeladen</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents?.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  {getFileIcon(doc.file_type)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {doc.file_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Hochgeladen am{" "}
                      {format(new Date(doc.created_at), "dd.MM.yyyy", {
                        locale: de,
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(doc)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResponseConfigTab() {
  const { data: config, isLoading } = useAIConfiguration();
  const updateMutation = useUpdateAIConfiguration();

  const [tonality, setTonality] = useState("");
  const [signature, setSignature] = useState("");

  // Initialize values from fetched config
  useEffect(() => {
    if (config) {
      const tonalityConfig = config.find((c) => c.key === "tonality_prompt");
      const signatureConfig = config.find((c) => c.key === "signature_prompt");

      if (tonalityConfig) setTonality(tonalityConfig.value);
      if (signatureConfig) setSignature(signatureConfig.value);
    }
  }, [config]);

  const handleSave = () => {
    updateMutation.mutate([
      { key: "tonality_prompt", value: tonality },
      { key: "signature_prompt", value: signature },
    ]);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-64 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tonality Card */}
      <Card>
        <CardHeader>
          <CardTitle>Tonalität & Stil</CardTitle>
          <CardDescription>
            Beschreiben Sie hier den gewünschten Schreibstil der KI. Seien Sie
            so spezifisch wie möglich.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={tonality}
            onChange={(e) => setTonality(e.target.value)}
            placeholder={`Beispiel:
- Immer professionell, aber herzlich und nahbar.
- Kunden immer mit 'Sie' ansprechen.
- Positive und lösungsorientierte Sprache verwenden.
- Antworten kurz und prägnant halten.`}
            className="min-h-[150px]"
          />
        </CardContent>
      </Card>

      {/* Signature Card */}
      <Card>
        <CardHeader>
          <CardTitle>Signatur & Grussformel</CardTitle>
          <CardDescription>
            Definieren Sie die Standard-Grussformel am Ende jeder Nachricht.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={`Beispiel:
Freundliche Grüsse aus dem verschneiten Malbun,
Ihr Yeti Team`}
            className="min-h-[100px]"
          />
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Speichern...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Speichern
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
