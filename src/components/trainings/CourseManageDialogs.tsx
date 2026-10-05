import { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { GroupCourseWithSchedules } from '@/types/group-courses';
import {
  useCourseAction, useCourseDependencies, useCourseManagementCapability, useRenameGroupCourse,
} from '@/hooks/useGroupCourses';
import { describeBlockingDependencies, outcomeMessage, validateCourseName } from '@/lib/courseManagement';

export const ARCHIVE_COPY = 'Aus der Kursliste entfernen. Bestehende Buchungen und Importverknüpfungen bleiben erhalten.';
const NOT_INSTALLED = 'Archivieren und sicheres Löschen sind auf dem Server noch nicht installiert. Bis dahin bleibt der Kurs unverändert; es wird nichts gelöscht.';

export function RenameCourseDialog({ course, onClose }: { course: GroupCourseWithSchedules | null; onClose: () => void }) {
  const rename = useRenameGroupCourse();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (course) { setName(course.name); setError(null); rename.reset(); } }, [course?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!course || rename.isPending) return;
    const invalid = validateCourseName(name, course.name);
    if (invalid) { setError(invalid); return; }
    setError(null);
    rename.mutate({ id: course.id, name }, {
      onSuccess: () => { toast({ title: 'Kurs umbenannt', description: `Neuer Name: „${name.trim()}“` }); onClose(); },
      onError: (err) => setError(`Umbenennen fehlgeschlagen: ${err instanceof Error ? err.message : 'Serverfehler'}. Es wurde nichts geändert.`),
    });
  };

  return (
    <Dialog open={!!course} onOpenChange={(open) => { if (!open && !rename.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Kurs umbenennen</DialogTitle>
            <DialogDescription>
              Ändert nur den angezeigten Namen. Niveau, Produkt, Preise, Zeiten, Buchungen und Importverknüpfungen bleiben unverändert.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="course-rename">Kursname</Label>
            <Input id="course-rename" value={name} autoFocus maxLength={120}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              aria-invalid={!!error} aria-describedby={error ? 'course-rename-error' : undefined} />
            {error && <p id="course-rename-error" role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={rename.isPending}>Abbrechen</Button>
            <Button type="submit" disabled={rename.isPending}>
              {rename.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Umbenennen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type CourseRemovalMode = 'delete' | 'archive' | 'restore';

export function CourseRemovalDialog({
  course, mode, onClose, onSwitchToArchive,
}: {
  course: GroupCourseWithSchedules | null;
  mode: CourseRemovalMode;
  onClose: () => void;
  onSwitchToArchive: () => void;
}) {
  const open = !!course;
  const capability = useCourseManagementCapability();
  const installed = capability.data === true;
  const deps = useCourseDependencies(course?.id, open && mode === 'delete' && installed);
  const action = useCourseAction();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  useEffect(() => { setError(null); action.reset(); busy.current = false; }, [course?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!course) return null;
  const blocking = deps.data ? describeBlockingDependencies(deps.data) : [];
  const pending = action.isPending;

  const run = (kind: CourseRemovalMode) => {
    if (busy.current) return; // repeated clicks
    busy.current = true;
    setError(null);
    action.mutate({ id: course.id, action: kind }, {
      onSuccess: (outcome) => {
        busy.current = false;
        if (outcome.kind === 'ok') {
          const title = kind === 'delete' ? 'Kurs gelöscht' : kind === 'archive' ? 'Kurs archiviert' : 'Kurs wiederhergestellt';
          const description = kind === 'restore' ? `„${course.name}“ ist wieder in der Liste (inaktiv).` : `„${course.name}“`;
          toast({ title, description });
          onClose();
        } else {
          setError(outcomeMessage(outcome));
        }
      },
      onError: () => { busy.current = false; setError(outcomeMessage({ kind: 'server' })); },
    });
  };

  const title = mode === 'delete' ? `„${course.name}“ löschen?` : mode === 'archive' ? `„${course.name}“ archivieren?` : `„${course.name}“ wiederherstellen?`;

  let body: React.ReactNode;
  let primary: React.ReactNode = null;
  if (capability.isLoading) {
    body = <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Prüfe Serverfunktion…</p>;
  } else if (!installed) {
    body = <Alert><AlertDescription>{NOT_INSTALLED}</AlertDescription></Alert>;
  } else if (mode === 'restore') {
    body = <p className="text-sm text-muted-foreground">Der Kurs erscheint wieder in der Kursliste, bleibt aber inaktiv und ist nicht buchbar, bis du ihn bewusst aktivierst.</p>;
    primary = <Button onClick={() => run('restore')} disabled={pending}>{pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Wiederherstellen</Button>;
  } else if (mode === 'archive') {
    body = <p className="text-sm text-muted-foreground">{ARCHIVE_COPY} Der Kurs bleibt im Filter „Archiviert“ sichtbar und kann wiederhergestellt werden.</p>;
    primary = <Button onClick={() => run('archive')} disabled={pending}>{pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Archivieren</Button>;
  } else if (deps.isLoading) {
    body = <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Prüfe abhängige Daten…</p>;
  } else if (deps.isError) {
    body = <Alert variant="destructive"><AlertDescription>Abhängige Daten konnten nicht geprüft werden. Es wird nichts gelöscht; bitte erneut versuchen.</AlertDescription></Alert>;
  } else if (blocking.length > 0) {
    body = (
      <div className="space-y-2 text-sm">
        <p>Dieser Kurs kann nicht gelöscht werden, weil noch Daten darauf verweisen:</p>
        <ul className="list-disc pl-5">{blocking.map((b) => <li key={b}>{b}</li>)}</ul>
        <p className="text-muted-foreground">Archivieren: {ARCHIVE_COPY}</p>
      </div>
    );
    primary = <Button variant="secondary" onClick={onSwitchToArchive} disabled={pending}>Stattdessen archivieren…</Button>;
  } else {
    const inst = deps.data?.instances ?? 0, dates = deps.data?.dates ?? 0;
    body = (
      <p className="text-sm text-muted-foreground">
        Keine Buchungen, Importverknüpfungen oder Zuweisungen. Endgültig gelöscht werden der Kurs
        {inst || dates ? ` sowie ${inst} leere generierte Einheiten und ${dates} Kurstage` : ''}. Dies kann nicht rückgängig gemacht werden.
      </p>
    );
    primary = <Button variant="destructive" onClick={() => run('delete')} disabled={pending}>{pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Endgültig löschen</Button>;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Kurs verwalten</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {body}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>Abbrechen</Button>
          {primary}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
