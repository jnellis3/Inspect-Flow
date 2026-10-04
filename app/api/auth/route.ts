import {z} from "zod";
import {api,body} from "@/lib/inspection/store";
import {accountSummary,authenticate,checkPassword,createAccount,inviteWorkspace,joinWorkspace,newSession,rateLimit,registrationOpen,sessionCookie,signOut} from "@/lib/inspection/auth";

export const GET = (request:Request) => api(request,async () => {
  const account = await authenticate(request);
  return Response.json({account:account ? await accountSummary(account.id) : null,registrationOpen:await registrationOpen()});
},{public:true});

const username = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{2,39}$/, 'Use 3–40 letters, numbers, dots, underscores or hyphens for your username.');
const password = z.string().min(1).max(128);
const invite = z.string().regex(/^[a-f0-9]{64}$/, 'This invite link is incomplete. Copy the whole link and try again.');

export const POST = (request:Request) => api(request,async () => {
  const input = await body(request,z.discriminatedUnion('action',[
    z.object({action:z.literal('login'),username,password}),
    z.object({action:z.literal('signup'),username,password,company:z.string().trim().min(1,"Add your company's name.").max(120)}),
    z.object({action:z.literal('join'),username,password,invite}),
    z.object({action:z.literal('lookup'),invite}),
  ]));
  if (input.action === 'lookup') return Response.json({workspace:await inviteWorkspace(input.invite)});
  await rateLimit(input.username);
  const account = await (input.action === 'signup' ? createAccount(input.username,input.password,input.company)
    : input.action === 'join' ? joinWorkspace(input.invite,input.username,input.password)
    : checkPassword(input.username,input.password));
  const token = await newSession(request,account.id);
  return Response.json({account:await accountSummary(account.id),registrationOpen:await registrationOpen()},{headers:{'Set-Cookie':sessionCookie(request,token)}});
},{public:true});

export const DELETE = (request:Request) => api(request,async () => {
  await signOut(request);
  return Response.json({signedOut:true,registrationOpen:await registrationOpen()},{headers:{'Set-Cookie':sessionCookie(request,'',true)}});
},{public:true});
