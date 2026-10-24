import { customerEmailRecipient } from "@/lib/customerEmail";
import type { BookingWizardState } from "@/contexts/BookingWizardContext";

/** Effective confirmation flags sent on create: a customer without email can never be e-mailed. */
export function checkoutSubmitFlags(state: Pick<BookingWizardState, "customer" | "sendCustomerEmail" | "sendCustomerWhatsApp" | "notifyInstructor">) {
  return {
    sendCustomerEmail: state.sendCustomerEmail && !!customerEmailRecipient(state.customer),
    sendCustomerWhatsApp: state.sendCustomerWhatsApp,
    notifyInstructor: state.notifyInstructor,
  };
}
