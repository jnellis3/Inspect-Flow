// Runs once when the server starts. In RunPod mode, start the dispatcher that launches and
// retires cloud video engines as jobs come and go.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.WORKER_MODE === "runpod") {
    const { startDispatcher } = await import("./lib/inspection/runpod");
    startDispatcher();
  }
}
