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
fn linear_noise_pair(noise : Double) -> Array[@generator.ColumnSpec] {
  [
    {
      name: "x",
      kind: "sequence",
      source: "",
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
    },
    {
      name: "y",
      kind: "linear",
      source: "x",
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
      noise,
    },
  ]
}

///|
/// linear = round(slope*src + intercept + noise*(2u-1), decimals).
/// sequence x=1..3 uses no RNG; seed=1 noise=0.5 → y = 2.5, 4.63, 7.26.
test "linear with noise matches independent Park Miller closed form" {
  assert_eq(@generator.generate(linear_noise_pair(0.5), 3, 1), [
    [Json(1.0), Json(2.5), Json(true)],
    [Json(2.0), Json(4.63), Json(true)],
    [Json(3.0), Json(7.26), Json(true)],
  ])
  assert_eq(@generator.generate(linear_noise_pair(0.0), 3, 1), [
    [Json(1.0), Json(3.0), Json(true)],
    [Json(2.0), Json(5.0), Json(true)],
    [Json(3.0), Json(7.0), Json(true)],
  ])
}

///|
test "uniform integer reference uses one RNG draw per cell" {
  assert_eq(@generator.generate([column("n", "integer", "")], 3, 1), [
    [Json(0.0), Json(true)],
    [Json(1.0), Json(true)],
    [Json(8.0), Json(true)],
  ])
}

///|
fn typed_column(
  name : String,
  kind : String,
  probability : Double,
  start_day : Int32,
  step : Double,
) -> @generator.ColumnSpec {
  {
    name,
    kind,
    source: "",
    min: 0.0,
    max: 1.0,
    start: 0.0,
    step,
    decimals: 0,
    prefix: "",
    choices: ([] : Array[String]),
    probability,
    missing: 0.0,
    start_day,
    slope: 1.0,
    intercept: 0.0,
    noise: 0.0,
  }
}

///|
/// seed=1 Park–Miller u-sequence: 16807/M, 282475249/M, 1622650073/M (M=2147483647).
/// boolean = u < probability; date ignores RNG when missing=0.
test "boolean and date match independent Park Miller and day arithmetic" {
  assert_eq(
    @generator.generate([typed_column("ok", "boolean", 0.5, 0, 1.0)], 3, 1),
    [
      [Json(true), Json(true)],
      [Json(true), Json(true)],
      [Json(false), Json(true)],
    ],
  )
  assert_eq(
    @generator.generate([typed_column("day", "date", 0.5, 20454, 1.0)], 3, 1),
    [
      [Json(20454.0), Json(true)],
      [Json(20455.0), Json(true)],
      [Json(20456.0), Json(true)],
    ],
  )
  assert_eq(
    @generator.generate([typed_column("day", "date", 0.5, 20456, -1.0)], 3, 42),
    [
      [Json(20456.0), Json(true)],
      [Json(20455.0), Json(true)],
      [Json(20454.0), Json(true)],
    ],
  )
}

///|
fn category_column(choices : Array[String]) -> @generator.ColumnSpec {
  {
    name: "g",
    kind: "category",
    source: "",
    min: 0.0,
    max: 1.0,
    start: 0.0,
    step: 1.0,
    decimals: 0,
    prefix: "",
    choices,
    probability: 0.5,
    missing: 0.0,
    start_day: 0,
    slope: 1.0,
    intercept: 0.0,
    noise: 0.0,
  }
}

///|
/// category index = floor(u * |choices|); repeated labels act as weight.
/// seed=1 → A,A,B for [A,B]; X,X,Z for [X,Y,Z]; A,A,B for weighted [A,A,B].
test "category equal probability matches Park Miller index closed form" {
  assert_eq(@generator.generate([category_column(["A", "B"])], 3, 1), [
    [Json("A"), Json(true)],
    [Json("A"), Json(true)],
    [Json("B"), Json(true)],
  ])
  assert_eq(@generator.generate([category_column(["X", "Y", "Z"])], 3, 1), [
    [Json("X"), Json(true)],
    [Json("X"), Json(true)],
    [Json("Z"), Json(true)],
  ])
  assert_eq(@generator.generate([category_column(["A", "A", "B"])], 3, 1), [
    [Json("A"), Json(true)],
    [Json("A"), Json(true)],
    [Json("B"), Json(true)],
  ])
}

///|
fn bool_missing(
  probability : Double,
  missing : Double,
) -> @generator.ColumnSpec {
  {
    name: "ok",
    kind: "boolean",
    source: "",
    min: 0.0,
    max: 1.0,
    start: 0.0,
    step: 1.0,
    decimals: 0,
    prefix: "",
    choices: ([] : Array[String]),
    probability,
    missing,
    start_day: 0,
    slope: 1.0,
    intercept: 0.0,
    noise: 0.0,
  }
}

///|
fn number_column(
  min : Double,
  max : Double,
  decimals : Int32,
) -> @generator.ColumnSpec {
  {
    name: "x",
    kind: "number",
    source: "",
    min,
    max,
    start: 0.0,
    step: 1.0,
    decimals,
    prefix: "",
    choices: ([] : Array[String]),
    probability: 0.5,
    missing: 0.0,
    start_day: 0,
    slope: 1.0,
    intercept: 0.0,
    noise: 0.0,
  }
}

///|
/// number = round(min*(1-u)+max*u, decimals) then clamp to [min,max].
/// seed=1 → u-seq as above; [0,10]@2 → 0, 1.32, 7.56; [1,2]@3 → 1, 1.132, 1.756.
test "number lerp matches independent Park Miller closed form" {
  assert_eq(@generator.generate([number_column(0.0, 10.0, 2)], 3, 1), [
    [Json(0.0), Json(true)],
    [Json(1.32), Json(true)],
    [Json(7.56), Json(true)],
  ])
  assert_eq(@generator.generate([number_column(1.0, 2.0, 3)], 3, 1), [
    [Json(1.0), Json(true)],
    [Json(1.132), Json(true)],
    [Json(1.756), Json(true)],
  ])
}

///|
/// missing draw first: if u < missing → null and skip boolean draw; else boolean uses the next u.
/// seed=1, missing=0.3, p=0.5 → null,null,true,true,null
test "missing then boolean consumes RNG in documented order" {
  assert_eq(@generator.generate([bool_missing(0.5, 0.3)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json(true), Json(true)],
    [Json(true), Json(true)],
    [Json::null(), Json(true)],
  ])
  assert_eq(@generator.generate([bool_missing(0.5, 0.8)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
  ])
}
