import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  price: string;
  buttonText: string;
  onClick: () => void;
  variant?: "default" | "muted";
}

export function ProductCard({
  icon,
  title,
  description,
  price,
  buttonText,
  onClick,
  variant = "default",
}: ProductCardProps) {
  return (
    <Card 
      className={cn(
        "overflow-hidden transition-all hover:shadow-lg cursor-pointer group",
        variant === "muted" && "bg-muted/50"
      )}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="text-4xl">{icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground mb-3">{description}</p>
            <p className="text-sm font-medium text-primary">{price}</p>
          </div>
        </div>
        <Button 
          className="w-full mt-4 group-hover:bg-primary/90"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {buttonText}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
