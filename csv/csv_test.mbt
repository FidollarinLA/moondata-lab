///|
test "quotes BOM CRLF multiline unicode and whitespace" {
  let t = @csv.parse(
    "\uFEFFtime,\"speed,rpm\",note\r\n0,1,\"a\"\"b\"\r\n1,2,\"电机\n🙂\"\r\n\r\n",
  )
  assert_eq(t.headers[1], "speed,rpm")
  assert_eq(t.rows.length(), 2)
  assert_eq(t.rows[0][2], "a\"b")
  assert_eq(t.rows[1][2], "电机\n🙂")
}

///|
test "reject malformed structures" {
  for
    text in [
      "a,a\n1,2", "a,b\n1", "a\n\"x", "a\n\"x\"z", "a\nx\"y", ",b\n1,2", "a",
    ] {
    let failed = try {
      @csv.parse(text) |> ignore
      false
    } catch {
      _ => true
    }
    assert_true(failed)
  }
}

///|
test "missing values do not become zero" {
  let t = @csv.parse("x,y\n,2\nNaN,3\nInfinity,4\n-1.25e2,5")
  let c = @csv.describe(t)[0]
  assert_eq(c.missing, 1)
  assert_eq(c.invalid, 2)
  assert_eq(c.numeric, 1)
  assert_eq(@csv.number(" -1.25e2 "), Some(-125.0))
  assert_eq(@csv.number(" "), None)
}

///|
test "quality notes flag mixed and sparse columns with independent percents" {
  let mixed_table = @csv.parse("金额\n1\n2\nbad\nNaN")
  let mixed = @csv.describe(mixed_table)[0]
  assert_eq(mixed.numeric, 2)
  assert_eq(mixed.invalid, 2)
  assert_eq(
    @csv.quality_notes(mixed, mixed_table.rows.length()),
    [
      "字段「金额」为混合列：2 个可解析数值、2 个非数值；数值分析只使用有效值。",
    ],
  )
  // Blank physical lines are ignored; empty fields need a real record (pad column).
  let sparse_table = @csv.parse("备注,pad\n,1\n,2\n,3\nx,4")
  let sparse = @csv.describe(sparse_table)[0]
  assert_eq(sparse.missing, 3)
  assert_eq(sparse.invalid, 1)
  assert_eq(
    @csv.quality_notes(sparse, sparse_table.rows.length()),
    ["字段「备注」缺失约 75%（空白视为缺失，0 不算缺失）。"],
  )
  let clean_table = @csv.parse("id\n1\n2\n3\n4")
  assert_eq(
    @csv.quality_notes(@csv.describe(clean_table)[0], clean_table.rows.length()),
    [],
  )
  let syn_table = @csv.parse("_synthetic\ntrue\ntrue\ntrue\ntrue")
  assert_eq(
    @csv.quality_notes(@csv.describe(syn_table)[0], syn_table.rows.length()),
    [],
  )
  let both = @csv.parse("金额,备注\n1,\n2,\nbad,\nNaN,")
  assert_eq(
    @csv.table_quality_notes(@csv.describe(both), both.rows.length()).length(),
    2,
  )
}
