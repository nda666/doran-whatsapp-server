export function parseCsv(text: string): string[][] {
  if (text.length > 3_000_000) throw new Error("CSV maksimal 3 MB.");
  const rows: string[][] = []; let row: string[] = [], value = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else if (!value || quoted) quoted = !quoted; else throw new Error("CSV tidak valid."); }
    else if (c === "," && !quoted) { row.push(value); value = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = "";
      if (rows.length > 10001) throw new Error("Maksimal 10.000 kontak.");
    } else value += c;
  }
  if (quoted) throw new Error("Kutip CSV belum ditutup.");
  row.push(value); if (row.some(Boolean)) rows.push(row); return rows;
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^(\s*[=+@\-]|[\t\r\n])/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export const csv = (rows: unknown[][]) => "\uFEFF" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");
