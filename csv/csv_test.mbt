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
  let mixed = { name: "金额", numeric: 2, missing: 0, invalid: 2 }
  let sparse = { name: "备注", numeric: 0, missing: 3, invalid: 1 }
  let clean = { name: "id", numeric: 4, missing: 0, invalid: 0 }
  let synthetic = { name: "_synthetic", numeric: 0, missing: 0, invalid: 4 }
  assert_eq(
    @csv.quality_notes(mixed, 4),
    [
      "字段「金额」为混合列：2 个可解析数值、2 个非数值；数值分析只使用有效值。",
    ],
  )
  assert_eq(
    @csv.quality_notes(sparse, 4),
    ["字段「备注」缺失约 75%（空白视为缺失，0 不算缺失）。"],
  )
  assert_eq(@csv.quality_notes(clean, 4), [])
  assert_eq(@csv.quality_notes(synthetic, 4), [])
  assert_eq(
    @csv.table_quality_notes([mixed, sparse, clean, synthetic], 4).length(),
    2,
  )
}
