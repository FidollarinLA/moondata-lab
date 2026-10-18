///|
test "Park Miller independent reference values" {
  let values = @generator.random_sequence(1, 3)
  assert_true(values[0].is_close(16807.0 / 2147483647.0))
  assert_true(values[1].is_close(282475249.0 / 2147483647.0))
  assert_true(values[2].is_close(1622650073.0 / 2147483647.0))
  assert_eq(values, @generator.random_sequence(1, 3))
}

///|
fn column(
  name : String,
  kind : String,
  source : String,
) -> @generator.ColumnSpec {
  {
    name,
    kind,
    source,
    min: 0.0,
    max: 10.0,
    start: 1.0,
    step: 1.0,
    decimals: 2,
    prefix: "",
    choices: ["A", "B"],
    probability: 0.5,
    missing: 0.0,
    start_day: 0,
    slope: 2.0,
    intercept: 1.0,
    noise: 0.0,
  }
}

///|
test "sequence linear relation and marker independent expected rows" {
  assert_eq(
    @generator.generate(
      [column("x", "sequence", ""), column("y", "linear", "x")],
      3,
      1,
    ),
    [
      [Json(1.0), Json(3.0), Json(true)],
      [Json(2.0), Json(5.0), Json(true)],
      [Json(3.0), Json(7.0), Json(true)],
    ],
  )
}

///|
test "uniform integer reference uses one RNG draw per cell" {
  assert_eq(@generator.generate([column("n", "integer", "")], 3, 1), [
    [Json(0.0), Json(true)],
    [Json(1.0), Json(true)],
    [Json(8.0), Json(true)],
  ])
}
