import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { getWhatsAppUrl, type WhatsAppTemplate } from "@/lib/whatsapp-templates";

interface WhatsAppButtonProps {
  template: WhatsAppTemplate;
  customerName?: string;
  phone?: string;
  className?: string;
}

export function WhatsAppButton({ template, customerName, phone, className }: WhatsAppButtonProps) {
  const handleClick = () => {
    const url = getWhatsAppUrl(template, customerName, phone);
    window.open(url, "_blank");
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      className={className}
    >
      <MessageCircle className="h-3.5 w-3.5 mr-1.5 text-green-600" />
      WhatsApp
    </Button>
  );
}
