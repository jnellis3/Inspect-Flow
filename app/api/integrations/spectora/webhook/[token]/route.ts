import { AppError } from "@/lib/inspection/server";
import { connectionForToken, handleWebhook } from "@/lib/inspection/spectora/store";

type Context = { params: Promise<{ token: string }> };

/**
 * Spectora posts here when an inspection changes. The URL carries a per-workspace secret, and the
 * inspection itself is re-read through the API before any project is created, so the delivery's
 * body is never trusted on its own. Spectora does not document a signature header; if one appears
 * in your dashboard, verify it here as well.
 */
export async function POST(req: Request, c: Context) {
  try {
    const connection = await connectionForToken((await c.params).token);
    if (!connection) throw new AppError(404, "Unknown webhook.");
    const text = await req.text();
    if (text.length > 512 * 1024) throw new AppError(413, "Delivery too large.");
    let payload: unknown = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { throw new AppError(400, "Expected JSON."); }
    const result = await handleWebhook(connection, payload);
    return Response.json({ received: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status });
    console.error("Spectora webhook failed", e);
    // A 5xx asks Spectora to retry later.
    return Response.json({ error: "The delivery could not be processed." }, { status: 500 });
  }
}

/** Lets the inspector check the URL they pasted into Spectora. */
export async function GET(req: Request, c: Context) {
  const connection = await connectionForToken((await c.params).token);
  if (!connection) return Response.json({ error: "Unknown webhook." }, { status: 404 });
  return Response.json({ ok: true, listening: true });
}
