import {z} from "zod";
import {api,body} from "@/lib/inspection/store";
import {startJob} from "@/lib/inspection/agents";
export const POST=(req:Request,c:{params:Promise<{id:string}>})=>api(req,async()=>{const v=await body(req,z.object({kind:z.enum(["analysis","chat","export"]),message:z.string().trim().max(8000).optional(),requestId:z.string().uuid(),narrationHash:z.string().regex(/^[a-f0-9]{64}$/).optional()}));return Response.json({job:await startJob((await c.params).id,v.kind,v.requestId,v.message,v.narrationHash)},{status:202})});
