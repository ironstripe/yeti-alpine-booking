import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  Calendar, Users, Inbox, Settings, LayoutDashboard,
  ChevronRight, ChevronLeft, Check 
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ONBOARDING_STEPS = [
  {
    title: 'Willkommen bei YETY',
    description: 'Ihr neues Buchungssystem für die Skischule. Lassen Sie uns die wichtigsten Funktionen durchgehen.',
    icon: LayoutDashboard,
  },
  {
    title: 'Buchungen erstellen',
    description: 'Erstellen Sie Buchungen für Privat- und Gruppenkurse. Der Wizard führt Sie Schritt für Schritt durch den Prozess.',
    icon: Calendar,
  },
  {
    title: 'KI-Posteingang',
    description: 'E-Mails und WhatsApp-Anfragen werden automatisch analysiert. Prüfen Sie die extrahierten Daten und erstellen Sie Buchungen mit einem Klick.',
    icon: Inbox,
  },
  {
    title: 'Kurse & Lehrer',
    description: 'Verwalten Sie Gruppenkurse, weisen Sie Lehrer zu und behalten Sie den Überblick über alle Trainings.',
    icon: Users,
  },
  {
    title: 'Einstellungen',
    description: 'Passen Sie Produkte, Preise, E-Mail-Vorlagen und mehr an Ihre Bedürfnisse an.',
    icon: Settings,
  }
];

const STORAGE_KEY = 'yety_onboarding_complete';

export function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem(STORAGE_KEY);
    if (!hasSeenOnboarding) {
      // Small delay to let the app load first
      const timer = setTimeout(() => setOpen(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);
  
  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
  };
  
  const currentStep = ONBOARDING_STEPS[step];
  const Icon = currentStep.icon;
  const isLastStep = step === ONBOARDING_STEPS.length - 1;
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <div className="flex flex-col items-center text-center py-4">
          {/* Progress dots */}
          <div className="flex gap-1.5 mb-6">
            {ONBOARDING_STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted'
                )}
              />
            ))}
          </div>
          
          {/* Icon */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Icon className="h-8 w-8 text-primary" />
          </div>
          
          {/* Content */}
          <h2 className="text-xl font-semibold mb-2">{currentStep.title}</h2>
          <p className="text-muted-foreground mb-8 max-w-sm">{currentStep.description}</p>
          
          {/* Navigation */}
          <div className="flex items-center justify-between w-full gap-3">
            <Button
              variant="ghost"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className="w-24"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Zurück
            </Button>
            
            <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
              Überspringen
            </Button>
            
            {isLastStep ? (
              <Button onClick={handleComplete} className="w-24">
                <Check className="h-4 w-4 mr-1" />
                Start
              </Button>
            ) : (
              <Button onClick={() => setStep(s => s + 1)} className="w-24">
                Weiter
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
