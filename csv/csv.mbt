///|
pub(all) suberror CsvError {
  CsvError(String)
}

///|
pub(all) struct Table {
  headers : Array[String]
  rows : Array[Array[String]]
} derive(ToJson)

///|
pub(all) struct Column {
  name : String
  numeric : Int32
  missing : Int32
  invalid : Int32
} derive(ToJson)

///|
/// Parse quoted CSV, including escaped quotes and multiline fields. Blank physical
/// lines are ignored; quoted empty records are not. Headers must be unique.
pub fn parse(text : String) -> Table raise CsvError {
  if text.length() > 10485760 {
    raise CsvError("CSV exceeds 10 Mi UTF-16 code units")
  }
  let records : Array[Array[String]] = []
  let mut row : Array[String] = []
  let field = StringBuilder()
  let mut state = 0 // 0: unquoted; 1: quoted; 2: closing quote
  let mut started = false
  let chars = text.to_array()
  let mut i = if chars.get(0) == Some('\uFEFF') { 1 } else { 0 }
  while i < chars.length() {
    let c = chars[i]
    if state == 1 {
      if c == '"' {
        if i + 1 < chars.length() && chars[i + 1] == '"' {
          field.write_char('"')
          i = i + 1
        } else {
          state = 2
        }
      } else {
        field.write_char(c)
      }
      started = true
    } else if c == ',' {
      row.push(field.to_string())
      field.reset()
      state = 0
      started = true
      if row.length() >= 128 {
        raise CsvError("CSV supports at most 128 columns")
      }
    } else if c == '\n' || c == '\r' {
      if started || row.length() > 0 || !field.is_empty() {
        row.push(field.to_string())
        records.push(row)
        if records.length() > 100001 {
          raise CsvError("CSV supports at most 100000 data rows")
        }
      }
      row = []
      field.reset()
      state = 0
      started = false
      if c == '\r' && i + 1 < chars.length() && chars[i + 1] == '\n' {
        i = i + 1
      }
    } else if state == 2 {
      raise CsvError("Unexpected character after closing quote at offset \{i}")
    } else if c == '"' {
      if !field.is_empty() {
        raise CsvError("Quote inside unquoted field at offset \{i}")
      }
      state = 1
      started = true
    } else {
      field.write_char(c)
      started = true
    }
    i = i + 1
  }
  if state == 1 {
    raise CsvError("Unclosed quoted CSV field")
  }
  if started || row.length() > 0 || !field.is_empty() {
    row.push(field.to_string())
    records.push(row)
  }
  if records.length() < 2 {
    raise CsvError("CSV requires a header and at least one data row")
  }
  if records.length() > 100001 {
    raise CsvError("CSV supports at most 100000 data rows")
  }
  let headers = records[0].map(fn(s) { s.trim().to_owned() })
  let names : Map[String, Bool] = Map([])
  for h in headers {
    if h.is_empty() {
      raise CsvError("CSV header cannot be empty")
    }
    if h.length() > 200 {
      raise CsvError("CSV header exceeds 200 code units")
    }
    if names.contains(h) {
      raise CsvError("Duplicate CSV header: \{h}")
    }
    names[h] = true
  }
  let rows : Array[Array[String]] = []
  for index = 1; index < records.length(); index = index + 1 {
    if records[index].length() != headers.length() {
      raise CsvError(
        "Record \{index + 1}: expected \{headers.length()} fields, got \{records[index].length()}",
      )
    }
    rows.push(records[index])
  }
  { headers, rows, }
}

///|
/// Empty fields are missing; non-numeric or non-finite fields are invalid.
pub fn number(cell : String) -> Double? {
  let text = cell.trim()
  if text.is_empty() {
    return None
  }
  try {
    let n = @string.parse_double(text)
    if n.is_nan() || n.is_inf() {
      None
    } else {
      Some(n)
    }
  } catch {
    _ => None
  }
}

///|
pub fn describe(table : Table) -> Array[Column] {
  let columns : Array[Column] = []
  for c = 0; c < table.headers.length(); c = c + 1 {
    let mut numeric = 0
    let mut missing = 0
    let mut invalid = 0
    for row in table.rows {
      if row[c].trim().is_empty() {
        missing = missing + 1
      } else if number(row[c]) is Some(_) {
        numeric = numeric + 1
      } else {
        invalid = invalid + 1
      }
    }
    columns.push({ name: table.headers[c], numeric, missing, invalid, })
  }
  columns
}

///|
/// Deterministic dirty-data notes from MoonBit column counts.
/// Text columns with only non-numeric values are not treated as errors.
pub fn quality_notes(column : Column, row_count : Int) -> Array[String] {
  let notes : Array[String] = []
  let rows = row_count
  let numeric = column.numeric.to_int()
  let missing = column.missing.to_int()
  let invalid = column.invalid.to_int()
  if rows <= 0 || column.name == "_synthetic" {
    return notes
  }
  if numeric > 0 && invalid > 0 {
    notes.push(
      "字段「\{column.name}」为混合列：\{numeric} 个可解析数值、\{invalid} 个非数值；数值分析只使用有效值。",
    )
  }
  if missing * 10 >= rows * 3 {
    let percent = missing * 100 / rows
    notes.push(
      "字段「\{column.name}」缺失约 \{percent}%（空白视为缺失，0 不算缺失）。",
    )
  }
  notes
}

///|
pub fn table_quality_notes(
  columns : Array[Column],
  row_count : Int,
) -> Array[String] {
  let notes : Array[String] = []
  for column in columns {
    for note in quality_notes(column, row_count) {
      notes.push(note)
    }
  }
  notes
}

///|
pub fn CsvError::to_string(self : CsvError) -> String {
  let CsvError(message) = self
  message
}

///|
pub extend Table with ToJson::{to_json}

///|
pub extend Column with ToJson::{to_json}
