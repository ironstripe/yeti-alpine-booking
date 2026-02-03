import { InstructorLayout } from "@/components/instructor-portal/InstructorLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTransferRequests, TransferRequest } from "@/hooks/useTransferRequests";
import {
  ArrowRightLeft,
  Check,
  X,
  Clock,
  CheckCircle,
  XCircle,
  Inbox,
  Send,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

function TransferRequestCard({
  request,
  onAccept,
  onReject,
  onCancel,
  isProcessing,
}: {
  request: TransferRequest;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  isProcessing: boolean;
}) {
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
    pending: { label: "Ausstehend", variant: "secondary", icon: Clock },
    accepted: { label: "Akzeptiert", variant: "default", icon: CheckCircle },
    rejected: { label: "Abgelehnt", variant: "destructive", icon: XCircle },
    canceled: { label: "Zurückgezogen", variant: "outline", icon: XCircle },
  };

  const status = statusConfig[request.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold truncate">{request.participantName}</p>
              <Badge variant={status.variant} className="shrink-0">
                <StatusIcon className="h-3 w-3 mr-1" />
                {status.label}
              </Badge>
            </div>

            <div className="text-sm text-muted-foreground space-y-1">
              <p className="flex items-center gap-2">
                <span className="text-xs">Von:</span>
                <span className="font-medium text-foreground">
                  {request.sourceGroupName}
                </span>
                {request.sourceInstructorName && (
                  <span className="text-xs">({request.sourceInstructorName})</span>
                )}
              </p>
              <p className="flex items-center gap-2">
                <span className="text-xs">Nach:</span>
                <span className="font-medium text-foreground">
                  {request.targetGroupName}
                </span>
                {request.targetInstructorName && (
                  <span className="text-xs">({request.targetInstructorName})</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(request.createdAt), "d. MMM, HH:mm", { locale: de })}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          {request.status === "pending" && (
            <div className="flex flex-col gap-2 shrink-0">
              {request.isIncoming ? (
                <>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={onAccept}
                    disabled={isProcessing}
                    className="gap-1"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Annehmen
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onReject}
                    disabled={isProcessing}
                    className="gap-1"
                  >
                    <X className="h-4 w-4" />
                    Ablehnen
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isProcessing}
                  className="gap-1"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  Zurückziehen
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ type }: { type: "incoming" | "outgoing" }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-8 text-center">
        {type === "incoming" ? (
          <>
            <Inbox className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">Keine eingehenden Anfragen</p>
            <p className="text-sm text-muted-foreground mt-1">
              Wenn ein anderer Lehrer dir einen Teilnehmer schicken möchte, erscheint die Anfrage hier.
            </p>
          </>
        ) : (
          <>
            <Send className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">Keine ausgehenden Anfragen</p>
            <p className="text-sm text-muted-foreground mt-1">
              Verschiebe Teilnehmer auf der Live-Planung Seite, um Anfragen zu erstellen.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function InstructorTransfers() {
  const {
    incomingRequests,
    outgoingRequests,
    pendingIncomingCount,
    isLoading,
    respondToTransfer,
    isResponding,
    cancelTransfer,
    isCanceling,
  } = useTransferRequests();

  const pendingIncoming = incomingRequests.filter((r) => r.status === "pending");
  const completedIncoming = incomingRequests.filter((r) => r.status !== "pending");

  const pendingOutgoing = outgoingRequests.filter((r) => r.status === "pending");
  const completedOutgoing = outgoingRequests.filter((r) => r.status !== "pending");

  if (isLoading) {
    return (
      <InstructorLayout>
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </InstructorLayout>
    );
  }

  return (
    <InstructorLayout>
      <div className="space-y-4">
        <Tabs defaultValue="incoming" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="incoming" className="relative">
              Eingang
              {pendingIncomingCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-2 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
                >
                  {pendingIncomingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="outgoing">
              Ausgang
              {pendingOutgoing.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-2 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
                >
                  {pendingOutgoing.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Incoming Tab */}
          <TabsContent value="incoming" className="space-y-4 mt-4">
            {incomingRequests.length === 0 ? (
              <EmptyState type="incoming" />
            ) : (
              <>
                {/* Pending Incoming */}
                {pendingIncoming.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      AUSSTEHEND ({pendingIncoming.length})
                    </h3>
                    {pendingIncoming.map((request) => (
                      <TransferRequestCard
                        key={request.id}
                        request={request}
                        onAccept={() =>
                          respondToTransfer({ requestId: request.id, response: "accepted" })
                        }
                        onReject={() =>
                          respondToTransfer({ requestId: request.id, response: "rejected" })
                        }
                        isProcessing={isResponding}
                      />
                    ))}
                  </div>
                )}

                {/* Completed Incoming */}
                {completedIncoming.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      ABGESCHLOSSEN ({completedIncoming.length})
                    </h3>
                    {completedIncoming.slice(0, 10).map((request) => (
                      <TransferRequestCard
                        key={request.id}
                        request={request}
                        isProcessing={false}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Outgoing Tab */}
          <TabsContent value="outgoing" className="space-y-4 mt-4">
            {outgoingRequests.length === 0 ? (
              <EmptyState type="outgoing" />
            ) : (
              <>
                {/* Pending Outgoing */}
                {pendingOutgoing.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      AUSSTEHEND ({pendingOutgoing.length})
                    </h3>
                    {pendingOutgoing.map((request) => (
                      <TransferRequestCard
                        key={request.id}
                        request={request}
                        onCancel={() => cancelTransfer(request.id)}
                        isProcessing={isCanceling}
                      />
                    ))}
                  </div>
                )}

                {/* Completed Outgoing */}
                {completedOutgoing.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      ABGESCHLOSSEN ({completedOutgoing.length})
                    </h3>
                    {completedOutgoing.slice(0, 10).map((request) => (
                      <TransferRequestCard
                        key={request.id}
                        request={request}
                        isProcessing={false}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </InstructorLayout>
  );
}
