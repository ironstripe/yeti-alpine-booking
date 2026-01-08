import { ReactNode } from "react";
import { Phone, MapPin, Mail } from "lucide-react";

interface BookingPortalLayoutProps {
  children: ReactNode;
}

export function BookingPortalLayout({ children }: BookingPortalLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-4 px-4 shadow-md">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎿</span>
            <span className="font-bold text-lg">SKISCHULE YETY</span>
          </div>
          <a href="tel:+41811234567" className="flex items-center gap-1 text-sm hover:underline">
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">+41 81 123 45 67</span>
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-muted/50 border-t mt-auto py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">Kontakt</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <a href="tel:+41811234567" className="flex items-center gap-2 hover:text-foreground">
                  <Phone className="h-4 w-4" />
                  +41 81 123 45 67
                </a>
                <a href="mailto:info@skischule-yety.ch" className="flex items-center gap-2 hover:text-foreground">
                  <Mail className="h-4 w-4" />
                  info@skischule-yety.ch
                </a>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Talstation Malbun
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Öffnungszeiten</h3>
              <div className="text-sm text-muted-foreground">
                <p>Mo - Sa: 08:00 - 18:00</p>
                <p>So: 09:00 - 17:00</p>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t text-center text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} Skischule YETY. Alle Rechte vorbehalten.</p>
            <div className="mt-2 flex justify-center gap-4">
              <a href="#" className="hover:underline">AGB</a>
              <a href="#" className="hover:underline">Datenschutz</a>
              <a href="#" className="hover:underline">Stornierung</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
