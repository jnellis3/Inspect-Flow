import {db} from "@/lib/inspection/server";
export const dynamic="force-dynamic";
export async function GET(){try{await db().prepare("SELECT 1 AS ok").first();return Response.json({status:"ok"},{headers:{"Cache-Control":"no-store"}})}catch{return Response.json({status:"unavailable"},{status:503,headers:{"Cache-Control":"no-store"}})}}
