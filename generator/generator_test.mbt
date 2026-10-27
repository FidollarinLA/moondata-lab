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
fn seq_column(start : Double, step : Double) -> @generator.ColumnSpec {
  {
    name: "id",
    kind: "sequence",
    source: "",
    min: 0.0,
    max: 1.0,
    start,
    step,
    decimals: 0,
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
fn text_column(
  prefix : String,
  start : Double,
  step : Double,
) -> @generator.ColumnSpec {
  {
    name: "t",
    kind: "text",
    source: "",
    min: 0.0,
    max: 1.0,
    start,
    step,
    decimals: 0,
    prefix,
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
/// sequence/text = start + i*step (prefix for text); no RNG — seed must not change rows.
/// Negative step is allowed (unlike step=0): start=10,step=-3 → 10,7,4; text N+5,-1 → N5,N4,N3.
test "sequence and text are seed-independent closed forms" {
  assert_eq(@generator.generate([seq_column(10.0, 5.0)], 3, 99), [
    [Json(10.0), Json(true)],
    [Json(15.0), Json(true)],
    [Json(20.0), Json(true)],
  ])
  assert_eq(@generator.generate([seq_column(10.0, 5.0)], 3, 1), [
    [Json(10.0), Json(true)],
    [Json(15.0), Json(true)],
    [Json(20.0), Json(true)],
  ])
  assert_eq(@generator.generate([text_column("R-", 1.0, 1.0)], 3, 1), [
    [Json("R-1"), Json(true)],
    [Json("R-2"), Json(true)],
    [Json("R-3"), Json(true)],
  ])
  assert_eq(@generator.generate([text_column("R-", 1.0, 1.0)], 3, 42), [
    [Json("R-1"), Json(true)],
    [Json("R-2"), Json(true)],
    [Json("R-3"), Json(true)],
  ])
  assert_eq(@generator.generate([seq_column(10.0, -3.0)], 3, 1), [
    [Json(10.0), Json(true)],
    [Json(7.0), Json(true)],
    [Json(4.0), Json(true)],
  ])
  assert_eq(@generator.generate([seq_column(10.0, -3.0)], 3, 99), [
    [Json(10.0), Json(true)],
    [Json(7.0), Json(true)],
    [Json(4.0), Json(true)],
  ])
  assert_eq(@generator.generate([text_column("N", 5.0, -1.0)], 3, 1), [
    [Json("N5"), Json(true)],
    [Json("N4"), Json(true)],
    [Json("N3"), Json(true)],
  ])
  // Empty prefix → digit string only; still seed-independent.
  assert_eq(@generator.generate([text_column("", 1.0, 1.0)], 3, 1), [
    [Json("1"), Json(true)],
    [Json("2"), Json(true)],
    [Json("3"), Json(true)],
  ])
  assert_eq(@generator.generate([text_column("", 1.0, 1.0)], 3, 99), [
    [Json("1"), Json(true)],
    [Json("2"), Json(true)],
    [Json("3"), Json(true)],
  ])
}

///|
fn seq_missing(
  start : Double,
  step : Double,
  missing : Double,
) -> @generator.ColumnSpec {
  {
    name: "id",
    kind: "sequence",
    source: "",
    min: 0.0,
    max: 1.0,
    start,
    step,
    decimals: 0,
    prefix: "",
    choices: ([] : Array[String]),
    probability: 0.5,
    missing,
    start_day: 0,
    slope: 1.0,
    intercept: 0.0,
    noise: 0.0,
  }
}

///|
fn text_missing(
  prefix : String,
  start : Double,
  step : Double,
  missing : Double,
) -> @generator.ColumnSpec {
  {
    name: "t",
    kind: "text",
    source: "",
    min: 0.0,
    max: 1.0,
    start,
    step,
    decimals: 0,
    prefix,
    choices: ([] : Array[String]),
    probability: 0.5,
    missing,
    start_day: 0,
    slope: 1.0,
    intercept: 0.0,
    noise: 0.0,
  }
}

///|
/// missing draw first; kept cells use start+i*step (row index) with no further RNG.
/// seed=1, missing=0.3 → sequence 10+5i: null,null,20,25,30; text R-: null,null,R-3,R-4,R-5.
test "missing then sequence or text consumes RNG in documented order" {
  assert_eq(@generator.generate([seq_missing(10.0, 5.0, 0.3)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json(20.0), Json(true)],
    [Json(25.0), Json(true)],
    [Json(30.0), Json(true)],
  ])
  assert_eq(@generator.generate([text_missing("R-", 1.0, 1.0, 0.3)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json("R-3"), Json(true)],
    [Json("R-4"), Json(true)],
    [Json("R-5"), Json(true)],
  ])
}

///|
fn linear_noise_pair(
  noise : Double,
  decimals : Int32,
) -> Array[@generator.ColumnSpec] {
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
      decimals,
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
/// decimals=0: noise=0 → 3,5,7; noise=0.5 rounds 2.5/4.63/7.26 → 3,5,7.
test "linear with noise matches independent Park Miller closed form" {
  assert_eq(@generator.generate(linear_noise_pair(0.5, 2), 3, 1), [
    [Json(1.0), Json(2.5), Json(true)],
    [Json(2.0), Json(4.63), Json(true)],
    [Json(3.0), Json(7.26), Json(true)],
  ])
  assert_eq(@generator.generate(linear_noise_pair(0.0, 2), 3, 1), [
    [Json(1.0), Json(3.0), Json(true)],
    [Json(2.0), Json(5.0), Json(true)],
    [Json(3.0), Json(7.0), Json(true)],
  ])
  assert_eq(@generator.generate(linear_noise_pair(0.0, 0), 3, 1), [
    [Json(1.0), Json(3.0), Json(true)],
    [Json(2.0), Json(5.0), Json(true)],
    [Json(3.0), Json(7.0), Json(true)],
  ])
  assert_eq(@generator.generate(linear_noise_pair(0.5, 0), 3, 1), [
    [Json(1.0), Json(3.0), Json(true)],
    [Json(2.0), Json(5.0), Json(true)],
    [Json(3.0), Json(7.0), Json(true)],
  ])
}

///|
fn linear_missing_pair(missing : Double) -> Array[@generator.ColumnSpec] {
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
      missing,
      start_day: 0,
      slope: 2.0,
      intercept: 1.0,
      noise: 0.0,
    },
  ]
}

///|
/// linear column missing draw first; null skips the noise draw (noise=0 still consumes when kept).
/// seed=1, y=2x+1, missing=0.3, five rows → (1,null),(2,null),(3,7),(4,9),(5,null).
test "missing then linear consumes RNG in documented order" {
  assert_eq(@generator.generate(linear_missing_pair(0.3), 5, 1), [
    [Json(1.0), Json::null(), Json(true)],
    [Json(2.0), Json::null(), Json(true)],
    [Json(3.0), Json(7.0), Json(true)],
    [Json(4.0), Json(9.0), Json(true)],
    [Json(5.0), Json::null(), Json(true)],
  ])
  assert_eq(@generator.generate(linear_missing_pair(0.8), 5, 1), [
    [Json(1.0), Json::null(), Json(true)],
    [Json(2.0), Json::null(), Json(true)],
    [Json(3.0), Json::null(), Json(true)],
    [Json(4.0), Json::null(), Json(true)],
    [Json(5.0), Json::null(), Json(true)],
  ])
}

///|
fn integer_column(min : Double, max : Double) -> @generator.ColumnSpec {
  {
    name: "n",
    kind: "integer",
    source: "",
    min,
    max,
    start: 0.0,
    step: 1.0,
    decimals: 0,
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
/// integer = min + floor(u * (max-min+1)) on the closed interval.
/// seed=1 → [0,10] = 0,1,8; [3,5] = 3,3,5; [7,7] = 7,7,7.
test "integer closed interval matches independent Park Miller floor form" {
  assert_eq(@generator.generate([integer_column(0.0, 10.0)], 3, 1), [
    [Json(0.0), Json(true)],
    [Json(1.0), Json(true)],
    [Json(8.0), Json(true)],
  ])
  assert_eq(@generator.generate([integer_column(3.0, 5.0)], 3, 1), [
    [Json(3.0), Json(true)],
    [Json(3.0), Json(true)],
    [Json(5.0), Json(true)],
  ])
  assert_eq(@generator.generate([integer_column(7.0, 7.0)], 3, 1), [
    [Json(7.0), Json(true)],
    [Json(7.0), Json(true)],
    [Json(7.0), Json(true)],
  ])
}

///|
fn integer_missing(
  min : Double,
  max : Double,
  missing : Double,
) -> @generator.ColumnSpec {
  {
    name: "n",
    kind: "integer",
    source: "",
    min,
    max,
    start: 0.0,
    step: 1.0,
    decimals: 0,
    prefix: "",
    choices: ([] : Array[String]),
    probability: 0.5,
    missing,
    start_day: 0,
    slope: 1.0,
    intercept: 0.0,
    noise: 0.0,
  }
}

///|
/// linear with noise=0 still draws one RNG when source is present; null source → null, no draw.
/// seed=1, x missing=0.3 [0,10], y=2x+1 → (null,null),(null,null),(5,11),(null,null),(null,null).
test "linear null source skips noise draw; noise zero still consumes RNG" {
  assert_eq(
    @generator.generate(
      [
        {
          name: "x",
          kind: "integer",
          source: "",
          min: 0.0,
          max: 10.0,
          start: 0.0,
          step: 1.0,
          decimals: 0,
          prefix: "",
          choices: ([] : Array[String]),
          probability: 0.5,
          missing: 0.3,
          start_day: 0,
          slope: 1.0,
          intercept: 0.0,
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
          noise: 0.0,
        },
      ],
      5,
      1,
    ),
    [
      [Json::null(), Json::null(), Json(true)],
      [Json::null(), Json::null(), Json(true)],
      [Json(5.0), Json(11.0), Json(true)],
      [Json::null(), Json::null(), Json(true)],
      [Json::null(), Json::null(), Json(true)],
    ],
  )
}

///|
/// missing draw first: null skips the integer floor draw.
/// seed=1, missing=0.3, [0,10], five rows → null,null,5,2,null.
test "missing then integer consumes RNG in documented order" {
  assert_eq(@generator.generate([integer_missing(0.0, 10.0, 0.3)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json(5.0), Json(true)],
    [Json(2.0), Json(true)],
    [Json::null(), Json(true)],
  ])
  assert_eq(@generator.generate([integer_missing(0.0, 10.0, 0.8)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
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
/// boolean = u < probability; Park–Miller u ∈ (0,1) so p=0 → all false, p=1 → all true.
test "boolean probability edges match independent closed form" {
  assert_eq(
    @generator.generate([typed_column("ok", "boolean", 0.0, 0, 1.0)], 3, 1),
    [
      [Json(false), Json(true)],
      [Json(false), Json(true)],
      [Json(false), Json(true)],
    ],
  )
  assert_eq(
    @generator.generate([typed_column("ok", "boolean", 1.0, 0, 1.0)], 3, 1),
    [
      [Json(true), Json(true)],
      [Json(true), Json(true)],
      [Json(true), Json(true)],
    ],
  )
}

///|
/// date step=0 repeats start_day; still no RNG when missing=0 (seed-independent).
test "date zero step repeats start day closed form" {
  assert_eq(
    @generator.generate([typed_column("day", "date", 0.5, 20454, 0.0)], 3, 1),
    [
      [Json(20454.0), Json(true)],
      [Json(20454.0), Json(true)],
      [Json(20454.0), Json(true)],
    ],
  )
  assert_eq(
    @generator.generate([typed_column("day", "date", 0.5, 20454, 0.0)], 3, 99),
    [
      [Json(20454.0), Json(true)],
      [Json(20454.0), Json(true)],
      [Json(20454.0), Json(true)],
    ],
  )
}

///|
/// date negative step: start_day + i*step; no RNG when missing=0 (seed-independent).
/// 2026-01-10 → start_day=20463, step=-2 → 20463,20461,20459.
test "date negative step matches day arithmetic closed form" {
  assert_eq(
    @generator.generate([typed_column("day", "date", 0.5, 20463, -2.0)], 3, 1),
    [
      [Json(20463.0), Json(true)],
      [Json(20461.0), Json(true)],
      [Json(20459.0), Json(true)],
    ],
  )
  assert_eq(
    @generator.generate([typed_column("day", "date", 0.5, 20463, -2.0)], 3, 99),
    [
      [Json(20463.0), Json(true)],
      [Json(20461.0), Json(true)],
      [Json(20459.0), Json(true)],
    ],
  )
}

///|
fn date_missing(
  start_day : Int32,
  step : Double,
  missing : Double,
) -> @generator.ColumnSpec {
  {
    name: "day",
    kind: "date",
    source: "",
    min: 0.0,
    max: 1.0,
    start: 0.0,
    step,
    decimals: 0,
    prefix: "",
    choices: ([] : Array[String]),
    probability: 0.5,
    missing,
    start_day,
    slope: 1.0,
    intercept: 0.0,
    noise: 0.0,
  }
}

///|
/// missing draw first; kept cells use start_day+i*step (row index, not present-count) and skip further RNG.
/// seed=1, missing=0.3, start=20454, step=1 → null,null,20456,20457,20458.
test "missing then date consumes RNG in documented order" {
  assert_eq(@generator.generate([date_missing(20454, 1.0, 0.3)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json(20456.0), Json(true)],
    [Json(20457.0), Json(true)],
    [Json(20458.0), Json(true)],
  ])
  assert_eq(@generator.generate([date_missing(20454, 1.0, 0.8)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
  ])
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
/// Singleton |choices|=1 → floor(u*1)=0 always → constant label (still consumes RNG).
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
  assert_eq(@generator.generate([category_column(["Only"])], 3, 1), [
    [Json("Only"), Json(true)],
    [Json("Only"), Json(true)],
    [Json("Only"), Json(true)],
  ])
  assert_eq(@generator.generate([category_column(["Only"])], 3, 99), [
    [Json("Only"), Json(true)],
    [Json("Only"), Json(true)],
    [Json("Only"), Json(true)],
  ])
}

///|
fn category_missing(
  choices : Array[String],
  missing : Double,
) -> @generator.ColumnSpec {
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
    missing,
    start_day: 0,
    slope: 1.0,
    intercept: 0.0,
    noise: 0.0,
  }
}

///|
/// missing draw first: null skips the category index draw.
/// seed=1, missing=0.3, [A,B] → null,null,A,A,null; [X,Y,Z] → null,null,Y,X,null.
test "missing then category consumes RNG in documented order" {
  assert_eq(@generator.generate([category_missing(["A", "B"], 0.3)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json("A"), Json(true)],
    [Json("A"), Json(true)],
    [Json::null(), Json(true)],
  ])
  assert_eq(
    @generator.generate([category_missing(["X", "Y", "Z"], 0.3)], 5, 1),
    [
      [Json::null(), Json(true)],
      [Json::null(), Json(true)],
      [Json("Y"), Json(true)],
      [Json("X"), Json(true)],
      [Json::null(), Json(true)],
    ],
  )
  assert_eq(@generator.generate([category_missing(["A", "B"], 0.8)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
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
/// seed=1 → u-seq as above; [0,10]@2 → 0, 1.32, 7.56; [1,2]@3 → 1, 1.132, 1.756; [0,10]@0 → 0, 1, 8.
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
  assert_eq(@generator.generate([number_column(0.0, 10.0, 0)], 3, 1), [
    [Json(0.0), Json(true)],
    [Json(1.0), Json(true)],
    [Json(8.0), Json(true)],
  ])
  // min=max collapses lerp to that constant (still consumes RNG per row).
  assert_eq(@generator.generate([number_column(5.0, 5.0, 2)], 3, 1), [
    [Json(5.0), Json(true)],
    [Json(5.0), Json(true)],
    [Json(5.0), Json(true)],
  ])
  assert_eq(@generator.generate([number_column(5.0, 5.0, 2)], 3, 99), [
    [Json(5.0), Json(true)],
    [Json(5.0), Json(true)],
    [Json(5.0), Json(true)],
  ])
}

///|
fn number_missing(
  min : Double,
  max : Double,
  decimals : Int32,
  missing : Double,
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
    missing,
    start_day: 0,
    slope: 1.0,
    intercept: 0.0,
    noise: 0.0,
  }
}

///|
/// missing draw first: null skips the number lerp draw.
/// seed=1, missing=0.3, [0,10]@2, five rows → null,null,4.59,2.19,null.
test "missing then number consumes RNG in documented order" {
  assert_eq(@generator.generate([number_missing(0.0, 10.0, 2, 0.3)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json(4.59), Json(true)],
    [Json(2.19), Json(true)],
    [Json::null(), Json(true)],
  ])
}

///|
/// missing draw first: if u < missing → null and skip boolean draw; else boolean uses the next u.
/// seed=1, missing=0.3, p=0.5 → null,null,true,true,null
/// Kept cells with p=0 → false; p=1 → true (Park–Miller u ∈ (0,1)).
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
  assert_eq(@generator.generate([bool_missing(0.0, 0.3)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json(false), Json(true)],
    [Json(false), Json(true)],
    [Json::null(), Json(true)],
  ])
  assert_eq(@generator.generate([bool_missing(1.0, 0.3)], 5, 1), [
    [Json::null(), Json(true)],
    [Json::null(), Json(true)],
    [Json(true), Json(true)],
    [Json(true), Json(true)],
    [Json::null(), Json(true)],
  ])
}
