///|
test "quantile interpolation and closed last bucket" {
  let r = @explore.distribution([1.0, 2.0, 3.0, 4.0], 2)
  guard r is Object(fields) else { fail("Expected object") }
  assert_eq(fields.get("median"), Some(Json(2.5)))
  assert_eq(fields.get("q1"), Some(Json(1.75)))
  assert_eq(fields.get("q3"), Some(Json(3.25)))
  assert_eq(
    fields.get("buckets"),
    Some([
      { "lower": 1.0, "upper": 2.5, "count": 2 },
      { "lower": 2.5, "upper": 4.0, "count": 2 },
    ]),
  )
}

///|
test "aggregation distinguishes missing from zero and counts all rows" {
  let groups = ["A", "A", "B", "B"]
  let values : Array[Json] = [Json(1.0), Json(3.0), Json::null(), Json(0.0)]
  assert_eq(@explore.aggregate(groups, values, "sum"), [
    { "group": "A", "rows": 2, "valid": 2, "value": 4.0 },
    { "group": "B", "rows": 2, "valid": 1, "value": 0.0 },
  ])
  assert_eq(@explore.aggregate(["A"], [Json::null()], "mean"), [
    { "group": "A", "rows": 1, "valid": 0, "value": Json::null() },
  ])
}

///|
test "negative perfect correlation and constant unavailable" {
  guard @explore.correlation([1.0, 2.0, 3.0], [7.0, 5.0, 3.0]) is Object(fields) else {
    fail("Expected object")
  }
  guard fields.get("pearson") is Some(Number(value, ..)) else {
    fail("Expected number")
  }
  assert_true(value.is_close(-1.0))
  guard @explore.correlation([1.0, 1.0], [2.0, 3.0]) is Object(constant) else {
    fail("Expected object")
  }
  assert_eq(constant.get("pearson"), Some(Json::null()))
}
