import { apiHandler } from "../../../shared/http.ts";
import { adminClient, origin } from "../_shared/client.ts";
Deno.serve(apiHandler(adminClient(), origin()));
