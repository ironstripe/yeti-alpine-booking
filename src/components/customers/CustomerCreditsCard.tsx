import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet } from "lucide-react";

interface CustomerCreditsCardProps {
  customerId: string;
  onViewDetails?: () => void;
}

export function CustomerCreditsCard({ customerId, onViewDetails }: CustomerCreditsCardProps) {
  const { data: credits } = useQuery({
    queryKey: ["customer-credits", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_credits")
        .select("*")
        .eq("customer_id", customerId)
        .eq("status", "active");

      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });

  const totalCredit = credits?.reduce((sum, c) => sum + Number(c.remaining_amount), 0) || 0;

  if (totalCredit === 0) return null;

  return (
    <Card className="border-green-200 bg-green-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-green-800 flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          Verfügbares Guthaben
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <p className="text-2xl font-bold text-green-700">
          CHF {totalCredit.toFixed(2)}
        </p>
        {onViewDetails && (
          <Button variant="outline" size="sm" onClick={onViewDetails}>
            Details
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
