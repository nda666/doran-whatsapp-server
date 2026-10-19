/** Wrap at word boundaries, counting spaces toward the requested line length. */
export function wrapPhoneText(value: string | null | undefined, maxLength = 20): string {
  if (!value) return "";
  const lines: string[] = [];
  let line = "";
  for (const word of value.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && Array.from(next).length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/** Keep the token unchanged except for a visual line break after its third hyphen. */
export function wrapPhoneToken(value: string | null | undefined): string {
  return (value || "").replace(/^((?:[^-]*-){3})(?=.)/, "$1\n");
}
