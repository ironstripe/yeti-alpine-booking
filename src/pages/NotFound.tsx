import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { MapPin, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <MapPin className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="mb-2 text-6xl font-bold text-primary">404</h1>
        <h2 className="mb-2 text-xl font-semibold">Seite nicht gefunden</h2>
        <p className="mb-6 text-muted-foreground">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Button>
          <Button asChild>
            <Link to="/">
              <Home className="mr-2 h-4 w-4" />
              Zur Startseite
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
