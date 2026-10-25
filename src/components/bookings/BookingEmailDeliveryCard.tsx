import { Mail, RefreshCw } from "lucide-react";
import { useBookingConfirmation } from "@/hooks/useBookingConfirmation";
import { confirmationLabel } from "@/lib/bookingConfirmationApi";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
/** Saved-ticket confirmation only. No silent retry or test sender fallback. */
export function BookingEmailDeliveryCard({ticketId}:{ticketId:string}){
 const {status,send}=useBookingConfirmation(ticketId);
 return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5"/>E-Mail-Versand</CardTitle></CardHeader>
  <CardContent className="flex items-center justify-between gap-3 text-sm"><p role="status">{confirmationLabel(send.data??status.data)}</p>
   <Button size="icon" variant="outline" aria-label="Versandstatus aktualisieren" disabled={status.isFetching||send.isPending} onClick={()=>void status.refetch()}><RefreshCw className="h-4 w-4"/></Button>
  </CardContent></Card>;
}
