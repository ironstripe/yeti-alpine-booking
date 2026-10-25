import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole } from "../_shared/staffAuth.ts";
import { resendTransport } from "../_shared/courseDelivery.ts";
import { createSendInvoiceHandler } from "./handler.ts";

Deno.serve((req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return createSendInvoiceHandler(sb, {
    transport: resendTransport,
    authorize: (r) => requireRole(r, ["admin", "office"]),
  })(req);
});
