"""Summarize a job's progress from logs/stage.json and the agent's stream-json log.

  progress.py <job> [--last N]

Prints the current stage, the agent's recent actions (one line each), and spend so far.
The web app can use the same parsing to show live progress.
"""
import json
import pathlib
import sys


def describe(block):
    name, inp = block.get("name"), block.get("input") or {}
    if name == "Bash":
        return "$ " + " ".join(str(inp.get("command", "")).split())[:150]
    if name in ("Read", "Write", "Edit"):
        return f"{name.lower()} {pathlib.Path(inp.get('file_path', '')).name}"
    if name == "TodoWrite":
        todos = inp.get("todos") or []
        active = next((t.get("content") for t in todos if t.get("status") == "in_progress"), None)
        return f"plan: {active or f'{len(todos)} items'}"
    return name or "?"


def main():
    job = pathlib.Path(sys.argv[1])
    last = int(sys.argv[sys.argv.index("--last") + 1]) if "--last" in sys.argv else 25
    stage = json.loads((job / "logs" / "stage.json").read_text())["stage"] if (job / "logs" / "stage.json").exists() else "queued"
    print(f"stage: {stage}")
    log = job / "logs" / "agent.jsonl"
    if not log.exists():
        return
    actions, texts, cost, usage = [], [], 0.0, {"in": 0, "cached": 0, "out": 0}
    for line in log.read_text().splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("type") == "assistant":
            msg = e.get("message") or {}
            u = msg.get("usage") or {}
            usage["in"] += u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
            usage["cached"] += u.get("cache_read_input_tokens", 0)
            usage["out"] += u.get("output_tokens", 0)
            for b in msg.get("content") or []:
                if b.get("type") == "tool_use":
                    actions.append(describe(b))
                elif b.get("type") == "text" and b.get("text", "").strip():
                    texts.append(b["text"].strip().replace("\n", " ")[:200])
        elif e.get("type") == "result":
            cost = e.get("total_cost_usd", 0)
    for a in actions[-last:]:
        print("  ", a)
    if texts:
        print("latest note:", texts[-1])
    est = (usage["in"] * 4 + usage["cached"] * 0.4 + usage["out"] * 20) / 1e6  # Opus 5.5 list prices
    print(f"actions: {len(actions)}  tokens in/cached/out: {usage['in']:,}/{usage['cached']:,}/{usage['out']:,}  ≈${cost or est:.2f}{'' if cost else ' (est.)'}")


if __name__ == "__main__":
    main()
