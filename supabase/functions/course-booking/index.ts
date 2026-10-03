// Public website API for 26/27 course bookings (#36). NOT deployed.
// Actions: options | reserve | complete | cancel (contract: _shared/courseBookingContract.ts).
// Group courses have no sales cap ("Wir buchen ohne Limite"); private lessons keep instructor locks.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";
import { resendTransport } from "../_shared/courseDelivery.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
Deno.serve(createHandler(sb, { transport: resendTransport }));
