import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RefreshCw, Copy, CheckCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface SuggestedReply {
  to: string;
  subject: string;
  body: string;
}

interface AIReplyAssistantProps {
  suggestedReply: SuggestedReply;
  onMarkAsDone?: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export function AIReplyAssistant({
  suggestedReply,
  onMarkAsDone,
  onRegenerate,
  isRegenerating = false,
}: AIReplyAssistantProps) {
  const [replyBody, setReplyBody] = useState(suggestedReply.body);

  const handleCopyReply = async () => {
    try {
      await navigator.clipboard.writeText(replyBody);
      toast.success("Antwort in Zwischenablage kopiert");
    } catch (error) {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  const handleMarkAsDone = () => {
    if (onMarkAsDone) {
      onMarkAsDone();
    }
    toast.success("Nachricht als erledigt markiert");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">KI-Antwortassistent</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* To Field */}
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">An</Label>
          <Input 
            value={suggestedReply.to} 
            readOnly 
            className="bg-muted/50"
          />
        </div>

        {/* Subject Field */}
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Betreff</Label>
          <Input 
            value={suggestedReply.subject} 
            readOnly 
            className="bg-muted/50"
          />
        </div>

        {/* Reply Editor */}
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Antwort</Label>
          <Textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            className="min-h-[200px] resize-none"
            placeholder="KI-generierte Antwort..."
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={isRegenerating || !onRegenerate}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? "animate-spin" : ""}`} />
            Neu generieren
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyReply}
          >
            <Copy className="h-4 w-4 mr-2" />
            Antwort kopieren
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleMarkAsDone}
            className="ml-auto"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Als erledigt markieren
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
