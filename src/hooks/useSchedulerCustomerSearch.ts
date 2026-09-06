import { useCustomerSearch, type CustomerSearchHit } from "@/hooks/useCustomerSearch";

export type SchedulerCustomer = CustomerSearchHit;

/** Nutzt den gemeinsamen Such-Vertrag (RPC `search_customers`). */
export function useSchedulerCustomerSearch(query: string) {
  return useCustomerSearch(query, 10);
}
