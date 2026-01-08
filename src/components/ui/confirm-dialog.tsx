import { useState, useCallback, ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive' | 'warning';
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  variant = 'default',
  onConfirm,
  isLoading = false
}: ConfirmDialogProps) {
  const Icon = variant === 'destructive' ? Trash2 : 
               variant === 'warning' ? AlertTriangle : null;
  
  const iconContainerClass = variant === 'destructive' ? 'text-destructive bg-destructive/10' :
                             variant === 'warning' ? 'text-amber-600 bg-amber-100' : '';

  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            {Icon && (
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', iconContainerClass)}>
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div className="space-y-2">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>{description}</div>
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            )}
          >
            {isLoading ? 'Wird ausgeführt...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface UseConfirmDialogOptions {
  title: string;
  description: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive' | 'warning';
  onConfirm: () => void | Promise<void>;
}

export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean;
    props: UseConfirmDialogOptions | null;
    isLoading: boolean;
  }>({ open: false, props: null, isLoading: false });

  const confirm = useCallback((props: UseConfirmDialogOptions) => {
    setState({ open: true, props, isLoading: false });
  }, []);

  const handleConfirm = async () => {
    if (!state.props) return;
    setState(s => ({ ...s, isLoading: true }));
    try {
      await state.props.onConfirm();
    } finally {
      setState({ open: false, props: null, isLoading: false });
    }
  };

  const dialog = state.props ? (
    <ConfirmDialog
      open={state.open}
      onOpenChange={(open) => !open && setState({ open: false, props: null, isLoading: false })}
      title={state.props.title}
      description={state.props.description}
      confirmLabel={state.props.confirmLabel}
      cancelLabel={state.props.cancelLabel}
      variant={state.props.variant}
      onConfirm={handleConfirm}
      isLoading={state.isLoading}
    />
  ) : null;

  return { confirm, dialog };
}
