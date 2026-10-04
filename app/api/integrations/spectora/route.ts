import { z } from "zod";
import { account, api, body } from "@/lib/inspection/store";
import { connect, disconnect, getConnection, updateConnection, view } from "@/lib/inspection/spectora/store";

/** Connection status for the settings page (never the key). The webhook URL is a secret, so only
 *  the workspace owner, who manages the connection, sees the details. */
export const GET = (req: Request) => api(req, async () => {
  const connection = await getConnection();
  const canManage = account().role === "owner";
  return Response.json({ spectora: canManage ? view(connection) : { connected: !!connection }, canManage });
});

/** Connect (or replace the key). Verifies the key against Spectora before saving it sealed. */
export const POST = (req: Request) => api(req, async () => {
  const { apiKey } = await body(req, z.object({ apiKey: z.string().min(1).max(400) }));
  return Response.json({ spectora: view(await connect(apiKey)) }, { status: 201 });
});

export const PATCH = (req: Request) => api(req, async () => {
  const patch = await body(req, z.object({ autoCreate: z.boolean().optional(), autoPush: z.boolean().optional() }));
  await updateConnection(patch);
  return Response.json({ spectora: view(await getConnection()) });
});

export const DELETE = (req: Request) => api(req, async () => {
  await disconnect();
  return Response.json({ spectora: view(null) });
});
