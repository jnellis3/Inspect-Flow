import {z} from "zod";
import {api,body,getJob} from "@/lib/inspection/store";
import {advance,cancelJob,retryJob} from "@/lib/inspection/agents";
type C={params:Promise<{id:string}>};
export const GET=(req:Request,c:C)=>api(req,async()=>Response.json({job:await getJob((await c.params).id)}));
export const POST=(req:Request,c:C)=>api(req,async()=>{const v=await body(req,z.object({action:z.enum(["poll","retry","cancel"])}));const {id}=await c.params;return Response.json({job:await(v.action==="retry"?retryJob(id):v.action==="cancel"?cancelJob(id):advance(id))})});
