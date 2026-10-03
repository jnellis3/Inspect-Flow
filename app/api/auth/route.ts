import {z} from "zod";
import {api,body} from "@/lib/inspection/store";
import {authenticate,checkPassword,createAccount,newSession,rateLimit,registrationOpen,sessionCookie,signOut} from "@/lib/inspection/auth";

export const GET = (request:Request) => api(request,async () => {
  const account = await authenticate(request);
  return Response.json({account:account ? {id:account.id,username:account.username} : null,registrationOpen:await registrationOpen()});
},{public:true});

export const POST = (request:Request) => api(request,async () => {
  const input = await body(request,z.object({
    action:z.enum(['login','signup']),
    username:z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{2,39}$/, 'Use 3–40 letters, numbers, dots, underscores or hyphens for your username.'),
    password:z.string().min(1).max(128)
  }));
  await rateLimit(input.username);
  const account = await (input.action === 'signup' ? createAccount(input.username,input.password) : checkPassword(input.username,input.password));
  const token = await newSession(request,account.id);
  return Response.json({account,registrationOpen:await registrationOpen()},{headers:{'Set-Cookie':sessionCookie(request,token)}});
},{public:true});

export const DELETE = (request:Request) => api(request,async () => {
  await signOut(request);
  return Response.json({signedOut:true,registrationOpen:await registrationOpen()},{headers:{'Set-Cookie':sessionCookie(request,'',true)}});
},{public:true});
