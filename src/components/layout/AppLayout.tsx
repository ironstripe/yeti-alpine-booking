import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { BottomNav } from "./BottomNav";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop Sidebar */}
      <AppSidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen">
        <div className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto animate-fade-in">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  );
}