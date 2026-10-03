import {api,getProject} from "@/lib/inspection/store";
import {narrationFor,narrationHash} from "@/lib/inspection/narration";
export const GET=(req:Request,c:{params:Promise<{id:string}>})=>api(req,async()=>{const p=await getProject((await c.params).id);const scenes=narrationFor(p);return Response.json({revision:p.revision,scenes,hash:await narrationHash(scenes),voice:"Cedar",disclosure:"AI-generated narration"})});
