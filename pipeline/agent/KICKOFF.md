You are working in a job directory. Your instructions are in CLAUDE.md (the director playbook);
the domain rules are in profile.md; the job details are in brief.json. Read all three first.

Make the highlight reel and the written report for this job, following the playbook's process
from start to finish: understand the footage, write findings.json, storyboard edit.json, produce,
review your own snapshots and fix what's wrong, then render (`render`) and build the report
(`report`). Finish with summary.md.

Work efficiently: batch commands, read images in parallel, and hand per-candidate visual checks to
`verifier` subagents running in parallel. Work autonomously. There is no one to answer questions; make the best editorial call and note it
in summary.md. The tools (`frames`, `voice`, `build`, `music`, `snap`, `render`, `report`) are on
your PATH. Do not stop until out/highlight-reel.mp4, out/report.pdf and summary.md exist.

If findings.json, edit.json or reel/ already exist, an earlier attempt was interrupted: read
what's there, check it, and build on it rather than starting over. The scratch/frames/ images
from that attempt are still on disk.
