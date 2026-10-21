/**
 * Dirty-data notes mirrored from MoonBit `@csv.quality_notes`.
 * Uses MoonBit column counts (numeric/missing/invalid); does not re-parse cells.
 */
export function qualityNotesFromColumns(columns, rowCount) {
  const notes = [];
  const rows = Number(rowCount) || 0;
  for (const column of columns ?? []) {
    if (!column || column.name === '_synthetic' || rows <= 0) continue;
    const numeric = Number(column.numeric) || 0;
    const missing = Number(column.missing) || 0;
    const invalid = Number(column.invalid) || 0;
    if (numeric > 0 && invalid > 0) {
      notes.push(
        `字段「${column.name}」为混合列：${numeric} 个可解析数值、${invalid} 个非数值；数值分析只使用有效值。`,
      );
    }
    if (missing * 10 >= rows * 3) {
      const percent = Math.floor((missing * 100) / rows);
      notes.push(
        `字段「${column.name}」缺失约 ${percent}%（空白视为缺失，0 不算缺失）。`,
      );
    }
  }
  return notes;
}
