import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireRole } from "../_shared/staffAuth.ts";
import { resendTransport } from "../_shared/courseDelivery.ts";
import { createConfirmationHandler } from "./handler.ts";
Deno.serve(createConfirmationHandler(createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
 {transport:resendTransport,authorize:req=>requireRole(req,["office","admin"],corsHeaders)}));
