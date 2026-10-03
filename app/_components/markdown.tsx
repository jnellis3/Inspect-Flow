import { Fragment } from "react";

/** Inline **bold** and `code`; everything else is plain text (no HTML is ever injected). */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part.startsWith("`") && part.endsWith("`") ? <code key={i} className="rounded bg-muted px-1 text-[0.9em]">{part.slice(1, -1)}</code>
        : <Fragment key={i}>{part}</Fragment>);
}

/** Just enough Markdown for the editor's notes: headings, lists, tables, paragraphs. */
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<p key={i} className={`mt-4 font-semibold first:mt-0 ${heading[1].length <= 2 ? "text-base" : ""}`}>{inline(heading[2])}</p>);
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      for (; i < lines.length && /^\s*[-*]\s+/.test(lines[i]); i++) items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
      i--;
      blocks.push(<ul key={i} className="mt-2 list-disc space-y-1 pl-5">{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>);
    } else if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].trim().startsWith("|"); i++) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) continue;
        rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
      }
      i--;
      const [head, ...body] = rows;
      blocks.push(
        <div key={i} className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr>{head.map((c, k) => <th key={k} className="border-b px-2 py-1 font-semibold">{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, m) => <td key={m} className="border-b px-2 py-1 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else {
      blocks.push(<p key={i} className="mt-2 first:mt-0">{inline(line)}</p>);
    }
  }
  return <div className="text-muted-foreground [&_strong]:text-foreground">{blocks}</div>;
}
