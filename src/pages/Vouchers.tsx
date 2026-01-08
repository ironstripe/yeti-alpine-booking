import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search } from "lucide-react";
import { useVouchers, useVoucherStats } from "@/hooks/useVouchers";
import { VoucherKPICards } from "@/components/vouchers/VoucherKPICards";
import { VouchersTable } from "@/components/vouchers/VouchersTable";

export default function Vouchers() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: vouchers, isLoading } = useVouchers(statusFilter, search);
  const { data: stats, isLoading: statsLoading } = useVoucherStats();

  return (
    <>
      <PageHeader
        title="Gutscheine"
        description="Gutscheine verwalten und einlösen"
        actions={
          <Button onClick={() => navigate("/vouchers/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Neuer Gutschein
          </Button>
        }
      />

      <div className="space-y-6">
        <VoucherKPICards stats={stats} isLoading={statsLoading} />

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Code oder Käufer suchen..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="active">🟢 Aktiv</SelectItem>
                  <SelectItem value="partial">🟡 Teilweise</SelectItem>
                  <SelectItem value="redeemed">⚪ Eingelöst</SelectItem>
                  <SelectItem value="expired">🔴 Abgelaufen</SelectItem>
                  <SelectItem value="cancelled">❌ Storniert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <VouchersTable vouchers={vouchers} isLoading={isLoading} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
