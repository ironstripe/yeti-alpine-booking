import { useState } from "react";
import { BaseDialog } from "@/components/ui/base-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  Loader2,
  User,
  Users,
  Calendar,
  AlertCircle,
  CheckCircle,
  Sparkles,
} from "lucide-react";
import {
  useTestConversation,
  SAMPLE_MESSAGES,
  type SampleKey,
} from "@/hooks/useTestConversation";
import { ConfidenceIndicator } from "./ConfidenceIndicator";
import { toast } from "@/hooks/use-toast";
import type { ExtractedData } from "@/hooks/useAIExtraction";

interface AITestPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AITestPanel({ open, onOpenChange }: AITestPanelProps) {
  const [tab, setTab] = useState<"samples" | "custom">("samples");
  const [selectedSample, setSelectedSample] = useState<SampleKey>("complete");
  const [customSubject, setCustomSubject] = useState("");
  const [customContent, setCustomContent] = useState("");
  const [extractionResult, setExtractionResult] = useState<{
    success: boolean;
    isBookingRequest: boolean;
    confidence?: number;
    extractedData?: ExtractedData;
  } | null>(null);

  const { createConversation, triggerExtraction, isCreating, isExtracting } =
    useTestConversation();

  const isLoading = isCreating || isExtracting;

  const handleRunTest = async () => {
    setExtractionResult(null);

    const sample = tab === "samples" ? SAMPLE_MESSAGES[selectedSample] : null;
    const content = tab === "samples" ? sample!.content : customContent;
    const subject = tab === "samples" ? sample!.subject : customSubject || undefined;

    if (!content.trim()) return;

    try {
      // Create conversation
      const conversation = await createConversation({ content, subject });

      // Trigger AI extraction
      const result = await triggerExtraction(conversation.id);
      setExtractionResult(result);
    } catch (error) {
      console.error("Test failed:", error);
      toast({
        title: "Fehler bei der Extraktion",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    setExtractionResult(null);
    setCustomContent("");
    setCustomSubject("");
    setTab("samples");
  };

  const isDisabled = isLoading || (tab === "custom" && !customContent.trim());

  // Footer buttons - always visible at bottom of dialog
  const footer = (
    <div className="flex gap-2 w-full">
      <Button
        onClick={handleRunTest}
        disabled={isDisabled}
        className="flex-1"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {isCreating ? "Erstelle..." : "Extrahiere..."}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Extraktion starten
          </>
        )}
      </Button>
      {extractionResult && (
        <Button variant="outline" onClick={handleReset}>
          Zurücksetzen
        </Button>
      )}
    </div>
  );

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="KI-Extraktion testen"
      description="Testen Sie die KI-gestützte Buchungsextraktion mit Beispiel- oder eigenen Nachrichten."
      size="xl"
      footer={footer}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "samples" | "custom")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="samples">Beispiele</TabsTrigger>
              <TabsTrigger value="custom">Eigener Text</TabsTrigger>
            </TabsList>

            <TabsContent value="samples" className="mt-4">
              <div className="space-y-3">
                {(Object.keys(SAMPLE_MESSAGES) as SampleKey[]).map((key) => (
                  <Card
                    key={key}
                    className={`cursor-pointer transition-all ${
                      selectedSample === key
                        ? "ring-2 ring-primary"
                        : "hover:border-primary/50"
                    }`}
                    onClick={() => setSelectedSample(key)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {SAMPLE_MESSAGES[key].label}
                        </span>
                        {selectedSample === key && (
                          <CheckCircle className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {SAMPLE_MESSAGES[key].content.slice(0, 100)}...
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="custom" className="mt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Betreff (optional)</Label>
                  <Input
                    id="subject"
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    placeholder="z.B. Anfrage Skikurs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">Nachrichteninhalt</Label>
                  <Textarea
                    id="content"
                    value={customContent}
                    onChange={(e) => setCustomContent(e.target.value)}
                    placeholder="Fügen Sie hier den Text einer E-Mail oder WhatsApp-Nachricht ein..."
                    className="min-h-[180px]"
                  />
                  {tab === "custom" && !customContent.trim() && (
                    <p className="text-xs text-muted-foreground">
                      Bitte Text eingeben, um die Extraktion zu starten.
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Results Section */}
        <div className="border rounded-lg p-4 max-h-[60vh] overflow-auto">
          {!extractionResult ? (
            <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-muted-foreground">
              <Brain className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-center text-sm">
                Wählen Sie ein Beispiel oder geben Sie eigenen Text ein und starten Sie die
                Extraktion.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status Header */}
              <div className="flex items-center justify-between">
                <Badge
                  variant={extractionResult.isBookingRequest ? "default" : "secondary"}
                  className="text-sm"
                >
                  {extractionResult.isBookingRequest
                    ? "Buchungsanfrage erkannt"
                    : "Keine Buchungsanfrage"}
                </Badge>
                {extractionResult.confidence !== undefined && (
                  <ConfidenceIndicator completeness={extractionResult.confidence} />
                )}
              </div>

              <Separator />

              {extractionResult.extractedData && (
                <>
                  {/* Customer Info */}
                  {extractionResult.extractedData.customer && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Kunde
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 text-sm space-y-1">
                        {extractionResult.extractedData.customer.name && (
                          <div>
                            <span className="text-muted-foreground">Name:</span>{" "}
                            {extractionResult.extractedData.customer.name}
                          </div>
                        )}
                        {extractionResult.extractedData.customer.email && (
                          <div>
                            <span className="text-muted-foreground">E-Mail:</span>{" "}
                            {extractionResult.extractedData.customer.email}
                          </div>
                        )}
                        {extractionResult.extractedData.customer.phone && (
                          <div>
                            <span className="text-muted-foreground">Telefon:</span>{" "}
                            {extractionResult.extractedData.customer.phone}
                          </div>
                        )}
                        {extractionResult.extractedData.customer.hotel && (
                          <div>
                            <span className="text-muted-foreground">Hotel:</span>{" "}
                            {extractionResult.extractedData.customer.hotel}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Participants */}
                  {extractionResult.extractedData.participants &&
                    extractionResult.extractedData.participants.length > 0 && (
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Teilnehmer ({extractionResult.extractedData.participants.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-2 text-sm space-y-3">
                          {extractionResult.extractedData.participants.map((p, i) => (
                            <div key={i} className="border-l-2 border-primary/30 pl-3">
                              <div className="font-medium">{p.name}</div>
                              <div className="text-muted-foreground text-xs space-x-2">
                                {p.age && <span>Alter: {p.age}</span>}
                                {p.skill_level && (
                                  <Badge variant="outline" className="text-xs">
                                    {p.skill_level}
                                  </Badge>
                                )}
                                {p.discipline && (
                                  <Badge variant="outline" className="text-xs">
                                    {p.discipline}
                                  </Badge>
                                )}
                              </div>
                              {p.notes && (
                                <p className="text-xs text-muted-foreground mt-1">{p.notes}</p>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}

                  {/* Booking Info */}
                  {extractionResult.extractedData.booking && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Buchungsdetails
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 text-sm space-y-1">
                        {extractionResult.extractedData.booking.product_type && (
                          <div>
                            <span className="text-muted-foreground">Typ:</span>{" "}
                            <Badge variant="outline">
                              {extractionResult.extractedData.booking.product_type === "private"
                                ? "Privatunterricht"
                                : extractionResult.extractedData.booking.product_type === "group"
                                ? "Gruppenkurs"
                                : "Unbekannt"}
                            </Badge>
                          </div>
                        )}
                        {extractionResult.extractedData.booking.dates &&
                          extractionResult.extractedData.booking.dates.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Daten:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {extractionResult.extractedData.booking.dates.map((d, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {d.date}
                                    {d.time_preference && ` (${d.time_preference})`}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        {extractionResult.extractedData.booking.date_range?.start && (
                          <div>
                            <span className="text-muted-foreground">Zeitraum:</span>{" "}
                            {extractionResult.extractedData.booking.date_range.start}
                            {extractionResult.extractedData.booking.date_range.end &&
                              ` - ${extractionResult.extractedData.booking.date_range.end}`}
                          </div>
                        )}
                        {extractionResult.extractedData.booking.lunch_supervision && (
                          <Badge variant="secondary" className="text-xs">
                            Mittagsbetreuung
                          </Badge>
                        )}
                        {extractionResult.extractedData.booking.special_requests && (
                          <div className="mt-2">
                            <span className="text-muted-foreground">Sonderwünsche:</span>
                            <p className="text-xs mt-1">
                              {extractionResult.extractedData.booking.special_requests}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Notes */}
                  {extractionResult.extractedData.notes && (
                    <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                      <CardContent className="py-3 flex gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          {extractionResult.extractedData.notes}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </BaseDialog>
  );
}
