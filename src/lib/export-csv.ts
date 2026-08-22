// CSV serialisation for the account export.
//
// The export is a set of tables, and CSV has no way to express that in one
// well-formed sheet, so the file is written as one section per dataset: a
// `# dataset: holdings` marker line, that dataset's header row, its rows, then
// a blank line. Spreadsheet apps import it as a single sheet with the markers
// visible, which is the honest shape - the alternative is either a lossy
// single table or a zip, and there is no zip dependency in this project.
//
// The JSON export stays the complete, faithful record; this exists because
// people put holdings in spreadsheets.

export type CsvRow = Record<string, unknown>;

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Quote when the value could otherwise break the row, and double any quotes
  // inside it - RFC 4180.
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/** One dataset as a header row plus its rows. Column order follows the first row. */
export function datasetToCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return "";
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const header = columns.map(escapeCell).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCell(row[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

/** The whole export: every non-empty dataset, in sections. */
export function exportToCsv(data: Record<string, unknown>): string {
  const sections: string[] = [];

  for (const [name, value] of Object.entries(data)) {
    const rows = Array.isArray(value) ? (value as CsvRow[]) : value && typeof value === "object" ? [value as CsvRow] : null;
    if (!rows || rows.length === 0) continue;
    sections.push(`# dataset: ${name}\n${datasetToCsv(rows)}`);
  }

  return sections.join("\n\n") + "\n";
}
