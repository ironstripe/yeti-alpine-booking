import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Clock, Calendar, Repeat } from "lucide-react";
import { useRecurringBlocks, useDeleteRecurringBlock, type RecurringBlock } from "@/hooks/useRecurringBlocks";
import { RecurringBlockDialog } from "./RecurringBlockDialog";
import { Skeleton } from "@/components/ui/skeleton";

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const PRESETS = [
  { 
    type: "lunch", 
    label: "Mittagspause", 
    icon: "🍽️",
  },
  { 
    type: "morning_only", 
    label: "Nur Vormittage", 
    icon: "🌅",
  },
  { 
    type: "afternoon_only", 
    label: "Nur Nachmittage", 
    icon: "🌇",
  },
  { 
    type: "group_reserve", 
    label: "Gruppenkurs Reserve", 
    icon: "👥",
  },
];

interface RecurringBlocksTabProps {
  instructorId: string;
}

export function RecurringBlocksTab({ instructorId }: RecurringBlocksTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<RecurringBlock | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const { data: blocks, isLoading } = useRecurringBlocks(instructorId);
  const deleteMutation = useDeleteRecurringBlock();

  const formatWeekdays = (weekdays: number[]) => {
    return [...weekdays].sort((a, b) => a - b).map(d => WEEKDAY_LABELS[d]).join(", ");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500">🟢 Genehmigt</Badge>;
      case "pending":
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700">🟡 Beantragt</Badge>;
      case "rejected":
        return <Badge variant="destructive">🔴 Abgelehnt</Badge>;
      default:
        return null;
    }
  };

  const handlePresetClick = (presetType: string) => {
    setSelectedPreset(presetType);
    setEditingBlock(null);
    setDialogOpen(true);
  };

  const handleNewCustom = () => {
    setSelectedPreset(null);
    setEditingBlock(null);
    setDialogOpen(true);
  };

  const handleEdit = (block: RecurringBlock) => {
    setSelectedPreset(block.preset_type);
    setEditingBlock(block);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingBlock(null);
    setSelectedPreset(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Presets Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Repeat className="h-4 w-4" />
            Schnellauswahl
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.type}
                variant="outline"
                onClick={() => handlePresetClick(preset.type)}
                className="flex items-center gap-2"
              >
                <span>{preset.icon}</span>
                <span>{preset.label}</span>
              </Button>
            ))}
            <Button variant="outline" onClick={handleNewCustom}>
              <Plus className="h-4 w-4 mr-1" />
              Benutzerdefiniert
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Blocks */}
      <div className="space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          MEINE WIEDERKEHRENDEN BLÖCKE
        </h2>

        {(blocks || []).length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <Repeat className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-muted-foreground">Keine wiederkehrenden Blöcke vorhanden</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(blocks || []).map((block) => (
              <Card key={block.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {block.preset_type === "group_reserve"
                            ? "Gruppenkurs Reserve"
                            : block.reason || "Nicht verfügbar"}
                        </span>
                        {block.preset_type === "group_reserve" && (
                          <Badge variant="outline" className="border-indigo-500 text-indigo-700">
                            👥 Reserve
                          </Badge>
                        )}
                        {getStatusBadge(block.status)}
                      </div>

                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatWeekdays(block.weekdays)}
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {block.valid_until 
                          ? `Bis ${new Date(block.valid_until).toLocaleDateString("de-CH")}`
                          : "Bis Saisonende"}
                      </p>

                      {block.rejection_reason && (
                        <p className="text-sm text-destructive">
                          Ablehnungsgrund: {block.rejection_reason}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-1">
                      {block.status === "pending" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(block)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(block.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {block.status === "approved" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(block.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <RecurringBlockDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        instructorId={instructorId}
        editingBlock={editingBlock}
        presetType={selectedPreset}
      />
    </div>
  );
}
