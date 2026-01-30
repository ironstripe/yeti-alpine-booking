import { useRef, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

interface ColumnResizeHandleProps {
  onResize: (deltaX: number) => void;
  onResizeEnd: () => void;
}

export function ColumnResizeHandle({ onResize, onResizeEnd }: ColumnResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startXRef.current;
      startXRef.current = moveEvent.clientX;
      onResize(deltaX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onResizeEnd();
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [onResize, onResizeEnd]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        "absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-50",
        "group flex items-center justify-center",
        "hover:bg-primary/20 transition-colors",
        isDragging && "bg-primary/40"
      )}
    >
      <GripVertical 
        className={cn(
          "h-4 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity",
          isDragging && "opacity-100 text-primary"
        )} 
      />
    </div>
  );
}
