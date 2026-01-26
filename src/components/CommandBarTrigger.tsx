import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandBar } from "./CommandBar";

export function CommandBarTrigger() {
  const [open, setOpen] = useState(false);

  // Global keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 h-9 text-sm text-muted-foreground 
                   bg-muted/50 hover:bg-muted transition-colors w-64 justify-start"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Suchen...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {/* Mobile: Icon only */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="md:hidden h-9 w-9"
      >
        <Search className="h-5 w-5" />
      </Button>

      <CommandBar open={open} onOpenChange={setOpen} />
    </>
  );
}
