import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailTemplate } from "@/hooks/useEmailTemplates";
import { cn } from "@/lib/utils";

interface EmailPreviewModalProps {
  template: EmailTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Sample data for preview
const sampleData: Record<string, string> = {
  "customer.first_name": "Max",
  "customer.last_name": "Mustermann",
  "customer.email": "max@example.com",
  "request_number": "ANF-2026-00042",
  "ticket_number": "T-2026-00123",
  "booking.date": "15. Januar 2026",
  "booking.time": "10:00 - 12:00",
  "product.name": "Privatstunde 2h",
  "instructor.name": "Hans Muster",
  "payment.amount": "CHF 240.00",
  "payment.due_date": "22. Januar 2026",
  "voucher.code": "GS-2026-0001",
  "voucher.value": "CHF 100.00",
  "voucher.expiry": "31. Dezember 2026",
};

function renderTemplate(html: string): string {
  let rendered = html;
  Object.entries(sampleData).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{\\s*${key.replace(".", "\\.")}\\s*\\}\\}`, "g");
    rendered = rendered.replace(regex, value);
  });
  // Remove any remaining unmatched variables
  rendered = rendered.replace(/\{\{[^}]+\}\}/g, "[VARIABLE]");
  return rendered;
}

export function EmailPreviewModal({ template, open, onOpenChange }: EmailPreviewModalProps) {
  const [view, setView] = useState<"desktop" | "mobile">("desktop");

  if (!template) return null;

  const renderedSubject = renderTemplate(template.subject);
  const renderedBody = renderTemplate(template.body_html);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Vorschau: {template.name}</DialogTitle>
            <Tabs value={view} onValueChange={(v) => setView(v as "desktop" | "mobile")}>
              <TabsList className="h-8">
                <TabsTrigger value="desktop" className="h-7 px-3">
                  <Monitor className="h-4 w-4 mr-1" />
                  Desktop
                </TabsTrigger>
                <TabsTrigger value="mobile" className="h-7 px-3">
                  <Smartphone className="h-4 w-4 mr-1" />
                  Mobile
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {/* Email Header */}
          <div className="bg-muted rounded-t-lg p-4 border-b border-border">
            <div className="text-sm space-y-1">
              <div className="flex">
                <span className="text-muted-foreground w-16">Von:</span>
                <span>YETY Skischule &lt;info@yety.ch&gt;</span>
              </div>
              <div className="flex">
                <span className="text-muted-foreground w-16">An:</span>
                <span>{sampleData["customer.email"]}</span>
              </div>
              <div className="flex">
                <span className="text-muted-foreground w-16">Betreff:</span>
                <span className="font-medium">{renderedSubject}</span>
              </div>
            </div>
          </div>

          {/* Email Body */}
          <div
            className={cn(
              "bg-white border border-border rounded-b-lg mx-auto transition-all",
              view === "desktop" ? "max-w-full" : "max-w-[375px]"
            )}
          >
            <iframe
              srcDoc={`
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <style>
                    body { 
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                      margin: 0;
                      padding: 24px;
                      color: #1a1a1a;
                      line-height: 1.6;
                    }
                    a { color: #2563eb; }
                    img { max-width: 100%; height: auto; }
                  </style>
                </head>
                <body>${renderedBody}</body>
                </html>
              `}
              className="w-full min-h-[400px] border-0"
              title="Email Preview"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schliessen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
