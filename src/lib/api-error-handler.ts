import { toast } from 'sonner';

const ERROR_MESSAGES: Record<string, string> = {
  // Auth errors
  'auth/invalid-credentials': 'E-Mail oder Passwort ist falsch.',
  'auth/session-expired': 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
  'auth/unauthorized': 'Sie haben keine Berechtigung für diese Aktion.',
  'PGRST301': 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
  
  // Booking errors
  'booking/slot-unavailable': 'Dieser Termin ist leider nicht mehr verfügbar.',
  'booking/instructor-busy': 'Der gewählte Lehrer ist zu dieser Zeit nicht verfügbar.',
  'booking/max-participants': 'Die maximale Teilnehmerzahl ist erreicht.',
  'booking/invalid-dates': 'Die gewählten Daten sind ungültig.',
  
  // Payment errors
  'payment/insufficient-voucher': 'Das Gutscheinguthaben reicht nicht aus.',
  'payment/voucher-expired': 'Dieser Gutschein ist abgelaufen.',
  'payment/voucher-invalid': 'Dieser Gutscheincode ist ungültig.',
  
  // Database errors
  '23505': 'Dieser Eintrag existiert bereits.',
  '23503': 'Der verknüpfte Eintrag existiert nicht.',
  '42501': 'Sie haben keine Berechtigung für diese Aktion.',
  
  // Network errors
  'network/offline': 'Keine Internetverbindung. Bitte prüfen Sie Ihre Verbindung.',
  'network/timeout': 'Die Anfrage hat zu lange gedauert. Bitte versuchen Sie es erneut.',
  'FetchError': 'Netzwerkfehler. Bitte prüfen Sie Ihre Verbindung.',
  
  // General errors
  'server/internal': 'Ein Serverfehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
  'validation/required': 'Bitte füllen Sie alle Pflichtfelder aus.',
  
  // Default
  'unknown': 'Ein unbekannter Fehler ist aufgetreten.'
};

export function getErrorMessage(error: unknown): string {
  if (!error) return ERROR_MESSAGES['unknown'];
  
  // Check for network errors
  if (!navigator.onLine) {
    return ERROR_MESSAGES['network/offline'];
  }
  
  const err = error as Record<string, unknown>;
  
  // Supabase error with code
  if (err.code && typeof err.code === 'string' && ERROR_MESSAGES[err.code]) {
    return ERROR_MESSAGES[err.code];
  }
  
  // Custom error code
  if (err.errorCode && typeof err.errorCode === 'string' && ERROR_MESSAGES[err.errorCode]) {
    return ERROR_MESSAGES[err.errorCode];
  }
  
  // Error message
  if (err.message && typeof err.message === 'string') {
    // Check if message matches a known error
    for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
      if (err.message.includes(key)) {
        return value;
      }
    }
    // Return message if it looks user-friendly (not technical)
    if (!err.message.includes('Error:') && err.message.length < 200) {
      return err.message;
    }
  }
  
  return ERROR_MESSAGES['unknown'];
}

export function handleApiError(error: unknown): void {
  console.error('API Error:', error);
  
  const message = getErrorMessage(error);
  const err = error as Record<string, unknown>;
  
  toast.error(message, {
    description: process.env.NODE_ENV === 'development' && err.code 
      ? `Code: ${err.code}` 
      : undefined,
  });
}

export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  options?: {
    successMessage?: string;
    errorMessage?: string;
    showSuccess?: boolean;
  }
): Promise<T | null> {
  try {
    const result = await operation();
    
    if (options?.showSuccess && options?.successMessage) {
      toast.success(options.successMessage);
    }
    
    return result;
  } catch (error) {
    if (options?.errorMessage) {
      toast.error(options.errorMessage);
    } else {
      handleApiError(error);
    }
    return null;
  }
}
