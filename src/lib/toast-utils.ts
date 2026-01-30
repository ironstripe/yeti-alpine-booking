import { toast } from "sonner";

/**
 * Standardized toast notifications for consistent user feedback.
 * 
 * All toasts appear in the top-right corner with consistent durations:
 * - Success: 3 seconds
 * - Error: 5 seconds (longer for user to read)
 * - Loading: Until dismissed
 * 
 * @example
 * showToast.success("Kunde erfolgreich erstellt");
 * showToast.error("Fehler beim Speichern. Bitte erneut versuchen.");
 * 
 * const loadingId = showToast.loading("Wird gespeichert...");
 * // Later:
 * showToast.dismiss(loadingId);
 */
export const showToast = {
  success: (message: string, description?: string) => {
    return toast.success(message, {
      description,
      duration: 3000,
    });
  },

  error: (message: string, description?: string) => {
    return toast.error(message, {
      description,
      duration: 5000,
    });
  },

  warning: (message: string, description?: string) => {
    return toast.warning(message, {
      description,
      duration: 4000,
    });
  },

  info: (message: string, description?: string) => {
    return toast.info(message, {
      description,
      duration: 3000,
    });
  },

  loading: (message: string) => {
    return toast.loading(message);
  },

  dismiss: (id?: string | number) => {
    toast.dismiss(id);
  },

  /** Promise-based toast that shows loading, then success/error */
  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string;
      error: string | ((error: Error) => string);
    }
  ) => {
    const errorHandler = messages.error;
    return toast.promise(promise, {
      loading: messages.loading,
      success: messages.success,
      error: typeof errorHandler === "function" 
        ? (err: Error) => errorHandler(err)
        : errorHandler,
    });
  },
};
