export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function formatMoney(n: number | null): string {
  if (n == null) return "-";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

export function table(rows: Array<Record<string, string | number | boolean | null | undefined>>): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0] ?? {});
  const widths = columns.map((column) =>
    Math.max(
      column.length,
      ...rows.map((row) => {
        const value = row[column];
        return value == null ? 1 : String(value).length;
      }),
    ),
  );

  const render = (values: string[]) => values.map((value, i) => value.padEnd(widths[i] ?? value.length)).join("  ");
  const header = render(columns);
  const rule = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows.map((row) => render(columns.map((column) => String(row[column] ?? "-"))));
  return [header, rule, ...body].join("\n");
}
