import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "office" | "teacher";

interface ActiveRoleContextType {
  activeRole: AppRole | null;
  setActiveRole: (role: AppRole) => void;
  clearActiveRole: () => void;
}

const ActiveRoleContext = createContext<ActiveRoleContextType | undefined>(undefined);

const STORAGE_KEY = "yety_active_role";

export function ActiveRoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeRole, setActiveRoleState] = useState<AppRole | null>(() => {
    // Initialize from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ["admin", "office", "teacher"].includes(stored)) {
      return stored as AppRole;
    }
    return null;
  });

  // Clear active role when user logs out
  useEffect(() => {
    if (!user) {
      setActiveRoleState(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  const setActiveRole = useCallback((role: AppRole) => {
    setActiveRoleState(role);
    localStorage.setItem(STORAGE_KEY, role);
  }, []);

  const clearActiveRole = useCallback(() => {
    setActiveRoleState(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <ActiveRoleContext.Provider value={{ activeRole, setActiveRole, clearActiveRole }}>
      {children}
    </ActiveRoleContext.Provider>
  );
}

export function useActiveRole() {
  const context = useContext(ActiveRoleContext);
  if (context === undefined) {
    throw new Error("useActiveRole must be used within an ActiveRoleProvider");
  }
  return context;
}
