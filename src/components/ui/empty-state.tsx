import { ReactNode } from "react";
import { LucideIcon, Plus, Inbox, Calendar, Users, FileText, ShoppingCart, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action, 
  secondaryAction,
  children 
}: EmptyStateProps) {
  const ActionIcon = action?.icon || Plus;
  
  return (
    <Card className="bg-card">
      <CardContent className="py-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold font-display mb-2">
            {title}
          </h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
            {description}
          </p>
          {(action || secondaryAction) && (
            <div className="flex items-center justify-center gap-3">
              {secondaryAction && (
                <Button variant="outline" onClick={secondaryAction.onClick}>
                  {secondaryAction.label}
                </Button>
              )}
              {action && (
                <Button onClick={action.onClick}>
                  <ActionIcon className="h-4 w-4 mr-2" />
                  {action.label}
                </Button>
              )}
            </div>
          )}
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

// Pre-configured empty states for common scenarios
export const EMPTY_STATES = {
  bookings: {
    icon: Calendar,
    title: 'Keine Buchungen',
    description: 'Es wurden noch keine Buchungen erstellt. Erstellen Sie Ihre erste Buchung.',
  },
  customers: {
    icon: Users,
    title: 'Keine Kunden',
    description: 'Es wurden noch keine Kunden erfasst. Kunden werden automatisch bei der ersten Buchung erstellt.',
  },
  inbox: {
    icon: Inbox,
    title: 'Posteingang leer',
    description: 'Keine neuen Anfragen. Sobald E-Mails oder WhatsApp-Nachrichten eingehen, erscheinen sie hier.',
  },
  trainings: {
    icon: Calendar,
    title: 'Keine Trainings',
    description: 'Es wurden noch keine Gruppenkurse definiert. Erstellen Sie Ihr erstes Training.',
  },
  invoices: {
    icon: FileText,
    title: 'Keine Rechnungen',
    description: 'Es wurden noch keine Rechnungen erstellt. Rechnungen werden bei Buchungen generiert.',
  },
  shop: {
    icon: ShoppingCart,
    title: 'Keine Produkte',
    description: 'Es wurden noch keine Shop-Artikel erfasst. Fügen Sie Ihr erstes Produkt hinzu.',
  },
  search: {
    icon: Search,
    title: 'Keine Ergebnisse',
    description: 'Für Ihre Suche wurden keine Ergebnisse gefunden. Versuchen Sie andere Suchbegriffe.',
  }
};
