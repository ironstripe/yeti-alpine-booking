import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface HelpTooltipProps {
  content: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function HelpTooltip({ content, side = 'top' }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-muted-foreground hover:text-foreground transition-colors">
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs">
        <p className="text-sm">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Common help texts
export const HELP_TEXTS = {
  booking: {
    customer: 'Wählen Sie einen bestehenden Kunden oder erstellen Sie einen neuen.',
    participant: 'Teilnehmer sind die Personen, die am Kurs teilnehmen (z.B. Kinder).',
    product: 'Wählen Sie den passenden Kurs basierend auf Alter und Können.',
    instructor: 'Optional: Wählen Sie einen bevorzugten Lehrer.',
    lunch: 'Mittagsbetreuung beinhaltet Mittagessen und Betreuung von 12-14 Uhr.',
    voucher: 'Geben Sie einen Gutscheincode ein, um einen Rabatt zu erhalten.',
  },
  training: {
    schedule: 'Definieren Sie die Wochentage und Zeiten für diesen Kurs.',
    maxParticipants: 'Maximale Anzahl Teilnehmer pro Kurs (empfohlen: 6-8).',
    skillLevel: 'Das Können-Niveau bestimmt, welche Teilnehmer zugewiesen werden.',
  },
  inbox: {
    confidence: 'Zeigt an, wie sicher die KI bei der Extraktion der Daten war.',
    quickBooking: 'Erstellt eine Buchung direkt aus den extrahierten Daten.',
  },
  settings: {
    iban: 'Wird für die Erstellung von QR-Rechnungen benötigt.',
    emailTemplate: 'Verwenden Sie {{variable}} für dynamische Inhalte.',
  }
};
