import {runtime} from "@/lib/inspection/store";
import {MODEL} from "@/lib/inspection/types";
export const GET=()=>Response.json({configured:!!runtime.OPENAI_API_KEY,model:runtime.OPENAI_MODEL||MODEL,limits:{videoMiB:1024,durationMinutes:90},background:"Hosted turns continue when this page closes. Staged processing and artifact import resume when this workspace is open."},{headers:{"Cache-Control":"no-store"}});
