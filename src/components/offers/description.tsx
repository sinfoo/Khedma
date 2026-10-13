// Plain-text posting -> headings, bullet lists and paragraphs. Server-safe.
type Block = { kind: "h"; text: string } | { kind: "ul" | "ol"; items: string[] } | { kind: "p"; text: string };

const BULLET = /^\s*(?:[-–—•·*●▪◦►▸✓✔➢➤→]|\d{1,2}[.)])\s+/;
const KNOWN =
  /^(missions?|vos missions|responsabilit[ée]s|responsibilities|what you('ll| will) do|profil( recherch[ée])?|profile|requirements|qualifications|comp[ée]tences( requises)?|skills|about( us)?|[àa] propos|qui sommes-nous|avantages|benefits|what we offer|nous offrons|ce que nous offrons|nice to have|bonus|description( du poste)?|job description|le poste|the role|conditions|candidature|how to apply|pour postuler|dur[ée]e|lieu|technologies|stack)\b/i;

export function parseDescription(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const md = line.match(/^#{1,6}\s+(.+)$/);
    const bullet = BULLET.test(line);
    const short = line.length <= 60 && !/[.!?]$/.test(line);
    const caps = short && line.length >= 4 && /\p{L}/u.test(line) && line === line.toUpperCase();
    if (md || (!bullet && short && (/:\s*$/.test(line) || caps || KNOWN.test(line)))) {
      blocks.push({ kind: "h", text: (md?.[1] ?? line).replace(/\s*:\s*$/, "") });
    } else if (bullet) {
      const kind = /^\s*\d/.test(line) ? "ol" : "ul";
      const item = line.replace(BULLET, "");
      const last = blocks[blocks.length - 1];
      if (last?.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else {
      blocks.push({ kind: "p", text: line });
    }
  }
  return blocks;
}

export function FormattedDescription({ text }: { text: string }) {
  const blocks = parseDescription(text);
  return (
    <div className="prose-doc max-w-none text-[0.95rem]">
      {blocks.map((b, i) =>
        b.kind === "h" ? (
          <h3 key={i} className={i === 0 ? "!mt-0" : ""}>{b.text}</h3>
        ) : b.kind === "p" ? (
          <p key={i}>{b.text}</p>
        ) : b.kind === "ul" ? (
          <ul key={i}>{b.items.map((x, k) => <li key={k}>{x}</li>)}</ul>
        ) : (
          <ol key={i}>{b.items.map((x, k) => <li key={k}>{x}</li>)}</ol>
        ),
      )}
    </div>
  );
}
