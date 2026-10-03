import { z } from "zod";
import { api,body,detail,getProject,saveProject } from "@/lib/inspection/store";
type C={params:Promise<{id:string}>};
export const GET=(req:Request,c:C)=>api(req,async()=>Response.json(await detail((await c.params).id)));
export const PATCH=(req:Request,c:C)=>api(req,async()=>{const v=await body(req,z.object({revision:z.number().int(),address:z.string().trim().min(1).max(200).optional(),inspector:z.string().max(100).optional(),date:z.string().max(30).optional(),notes:z.string().max(15000).optional(),narration:z.boolean().optional()}));const p=await getProject((await c.params).id);return Response.json({project:await saveProject({...p,...v},v.revision)})});
