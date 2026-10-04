import { z } from "zod";
import { account, api, body } from "@/lib/inspection/store";
import { CompanyFields } from "@/lib/inspection/fields";
import { createInvite, getWorkspace, listInvites, listMembers, removeMember, revokeInvite, updateCompany } from "@/lib/inspection/workspaces";

/** The company profile, the team, the video allowance and (for the owner) pending invites. */
export const GET = (req: Request) => api(req, async () => {
  const { id, role } = account();
  return Response.json({
    workspace: await getWorkspace(), members: await listMembers(), me: { id, role },
    invites: role === "owner" ? await listInvites() : [],
  });
});

/** Edit the company profile. Changes reach each video on its next run or revision. */
export const PATCH = (req: Request) => api(req, async () => {
  await updateCompany(await body(req, CompanyFields));
  return Response.json({ workspace: await getWorkspace() });
});

/** Invite a teammate (the link is shown once), revoke an invite, or remove a teammate. */
export const POST = (req: Request) => api(req, async () => {
  const input = await body(req, z.discriminatedUnion("action", [
    z.object({ action: z.literal("invite") }),
    z.object({ action: z.literal("revoke"), id: z.string().uuid() }),
    z.object({ action: z.literal("remove"), userId: z.string().uuid() }),
  ]));
  if (input.action === "invite") return Response.json({ url: await createInvite(), invites: await listInvites() });
  if (input.action === "revoke") await revokeInvite(input.id);
  else await removeMember(input.userId);
  return Response.json({ members: await listMembers(), invites: await listInvites() });
});
