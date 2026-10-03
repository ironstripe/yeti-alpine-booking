// Office/admin-only resend/recovery of 26/27 website booking e-mails. NOT deployed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireRole } from "../_shared/staffAuth.ts";
import { resendTransport } from "../_shared/courseDelivery.ts";
import { cors, createRetryHandler } from "./handler.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
Deno.serve(createRetryHandler(sb, {
  transport: resendTransport,
  authorize: (req) => requireRole(req, ["office", "admin"], cors),
}));
