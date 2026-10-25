import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { bookingConfirmation } from "@/lib/bookingConfirmationApi";
export function useBookingConfirmation(ticketId?:string){
 const qc=useQueryClient();const key=["booking-email-delivery",ticketId];
 const status=useQuery({queryKey:key,enabled:!!ticketId,queryFn:()=>ticketId?bookingConfirmation(ticketId,"status"):null,retry:false});
 const send=useMutation({mutationFn:()=>ticketId?bookingConfirmation(ticketId,"send"):Promise.resolve(null),
 onSuccess:r=>{qc.setQueryData(key,r);qc.invalidateQueries({queryKey:["email-logs",ticketId]});}});
 return {status,send};
}
