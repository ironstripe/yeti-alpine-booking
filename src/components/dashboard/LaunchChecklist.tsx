import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Circle, AlertCircle, ExternalLink, Rocket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  check: () => Promise<boolean>;
  link: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'school_settings',
    label: 'Skischul-Profil eingerichtet',
    description: 'Name, Adresse, Kontaktdaten und Bankverbindung',
    check: async () => {
      const { data } = await supabase.from('school_settings').select('name, iban, email').limit(1).single();
      return !!(data?.name && data?.iban && data?.email);
    },
    link: '/settings/school'
  },
  {
    id: 'products',
    label: 'Produkte & Preise definiert',
    description: 'Mindestens ein aktives Produkt',
    check: async () => {
      const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true);
      return (count || 0) > 0;
    },
    link: '/settings/products'
  },
  {
    id: 'trainings',
    label: 'Gruppenkurse erstellt',
    description: 'Mindestens ein Training definiert',
    check: async () => {
      const { count } = await supabase.from('group_courses').select('*', { count: 'exact', head: true }).eq('is_active', true);
      return (count || 0) > 0;
    },
    link: '/trainings'
  },
  {
    id: 'instructors',
    label: 'Skilehrer erfasst',
    description: 'Mindestens ein aktiver Lehrer',
    check: async () => {
      const { count } = await supabase.from('instructors').select('*', { count: 'exact', head: true }).eq('status', 'active');
      return (count || 0) > 0;
    },
    link: '/instructors'
  },
  {
    id: 'email_templates',
    label: 'E-Mail-Vorlagen konfiguriert',
    description: 'Buchungsbestätigung aktiv',
    check: async () => {
      const { data } = await supabase.from('email_templates').select('trigger').eq('is_active', true);
      const triggers = data?.map(t => t.trigger) || [];
      return triggers.includes('booking_confirmation');
    },
    link: '/settings/emails'
  },
  {
    id: 'seasons',
    label: 'Saison definiert',
    description: 'Aktuelle Saison mit Start- und Enddatum',
    check: async () => {
      const { data } = await supabase.from('seasons').select('*').eq('is_current', true).limit(1);
      return (data?.length || 0) > 0;
    },
    link: '/settings/seasons'
  }
];

export function LaunchChecklist() {
  const navigate = useNavigate();
  const [results, setResults] = useState<Record<string, boolean | null>>({});
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function runChecks() {
      const newResults: Record<string, boolean | null> = {};
      
      for (const item of CHECKLIST_ITEMS) {
        try {
          newResults[item.id] = await item.check();
        } catch {
          newResults[item.id] = null;
        }
      }
      
      setResults(newResults);
      setLoading(false);
    }
    
    runChecks();
  }, []);
  
  const completedCount = Object.values(results).filter(r => r === true).length;
  const totalCount = CHECKLIST_ITEMS.length;
  const isReady = completedCount === totalCount;
  
  // Don't show if already complete
  if (!loading && isReady) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-4 w-4" />
            Launch-Checkliste
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {completedCount}/{totalCount} erledigt
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {CHECKLIST_ITEMS.map((item) => {
          const status = results[item.id];
          
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.link)}
              className={cn(
                "w-full flex items-start gap-3 p-2 rounded-lg text-left transition-colors",
                "hover:bg-muted/50",
                status === false && "bg-amber-50 dark:bg-amber-950/20"
              )}
            >
              {loading ? (
                <Circle className="h-5 w-5 mt-0.5 text-muted-foreground animate-pulse" />
              ) : status === true ? (
                <CheckCircle2 className="h-5 w-5 mt-0.5 text-green-600" />
              ) : status === false ? (
                <AlertCircle className="h-5 w-5 mt-0.5 text-amber-600" />
              ) : (
                <Circle className="h-5 w-5 mt-0.5 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm font-medium",
                    status === true && "text-muted-foreground line-through"
                  )}>
                    {item.label}
                  </span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
