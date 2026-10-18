///|
fn quantile(sorted : Array[Double], p : Double) -> Double {
  let index = (sorted.length() - 1).to_double() * p
  let low = index.floor().to_int()
  let high = index.ceil().to_int()
  sorted[low] * (1.0 - (index - low.to_double())) +
  sorted[high] * (index - low.to_double())
}

///|
pub fn distribution(values : Array[Double], bins : Int32) -> Json raise {
  guard !values.is_empty() &&
    values.length() <= 100000 &&
    bins >= 1 &&
    bins <= 50 else {
    fail("Invalid histogram input")
  }
  let s = @analysis.summarize(values)
  let sorted = values.copy()
  sorted.sort()
  let count = if s.min == s.max { 1 } else { bins }
  let counts = Array::make(count, 0)
  for value in values {
    let index = if count == 1 {
      0
    } else {
      ((value - s.min) / (s.max - s.min) * count.to_double())
      .to_int()
      .min(count - 1)
      .max(0)
    }
    counts[index] = counts[index] + 1
  }
  let buckets : Array[Json] = []
  for i = 0; i < count; i = i + 1 {
    buckets.push({
      "lower": s.min + (s.max - s.min) * i.to_double() / count.to_double(),
      "upper": s.min + (s.max - s.min) * (i + 1).to_double() / count.to_double(),
      "count": counts[i],
    })
  }
  {
    "summary": s.to_json(),
    "q1": quantile(sorted, 0.25),
    "median": quantile(sorted, 0.5),
    "q3": quantile(sorted, 0.75),
    "buckets": Json(buckets),
  }
}

///|
priv struct Group {
  label : String
  mut count : Int32
  values : Array[Double]
}

///|
pub fn aggregate(
  groups : Array[String],
  values : Array[Json],
  reducer : String,
) -> Json raise {
  guard groups.length() == values.length() && groups.length() <= 100000 else {
    fail("Invalid aggregation lengths")
  }
  guard ["count", "sum", "mean", "min", "max"].contains(reducer) else {
    fail("Unknown reducer")
  }
  let mapping : Map[String, Int32] = Map([])
  let entries : Array[Group] = []
  for i = 0; i < groups.length(); i = i + 1 {
    let label = groups[i]
    let index = match mapping.get(label) {
      Some(index) => index
      None => {
        guard entries.length() < 1000 else {
          fail("Too many groups: select a field with <=1000 distinct values")
        }
        let index = entries.length()
        entries.push({ label, count: 0, values: [], })
        mapping[label] = index
        index
      }
    }
    let entry = entries[index]
    entry.count = entry.count + 1
    if values[i] is Number(v, ..) {
      guard !v.is_nan() && !v.is_inf() else { fail("Non-finite value") }
      entry.values.push(v)
    }
  }
  let output : Array[Json] = []
  for entry in entries {
    let result : Json = if reducer == "count" {
      Json(entry.count)
    } else if entry.values.is_empty() {
      Json::null()
    } else {
      let s = @analysis.summarize(entry.values)
      let v = match reducer {
        "sum" => s.mean * s.count.to_double()
        "mean" => s.mean
        "min" => s.min
        _ => s.max
      }
      guard !v.is_nan() && !v.is_inf() else { fail("Aggregate overflow") }
      Json(v)
    }
    output.push({
      "group": entry.label,
      "rows": entry.count,
      "valid": entry.values.length(),
      "value": result,
    })
  }
  Json(output)
}

///|
pub fn correlation(x : Array[Double], y : Array[Double]) -> Json raise {
  guard x.length() == y.length() && x.length() >= 2 && x.length() <= 100000 else {
    fail("Need at least 2 numeric pairs")
  }
  let sx = @analysis.summarize(x)
  let sy = @analysis.summarize(y)
  let mut mx = 0.0
  let mut my = 0.0
  let mut xx = 0.0
  let mut yy = 0.0
  let mut xy = 0.0
  for i = 0; i < x.length(); i = i + 1 {
    let dx = x[i] - mx
    let dy = y[i] - my
    mx = mx + dx / (i + 1).to_double()
    my = my + dy / (i + 1).to_double()
    xx = xx + dx * (x[i] - mx)
    yy = yy + dy * (y[i] - my)
    xy = xy + dx * (y[i] - my)
  }
  let r : Json = if xx == 0.0 || yy == 0.0 {
    Json::null()
  } else {
    let value = xy / xx.sqrt() / yy.sqrt()
    guard !value.is_nan() && !value.is_inf() else {
      fail("Correlation overflow")
    }
    Json(value.max(-1.0).min(1.0))
  }
  { "count": x.length(), "pearson": r, "x": sx.to_json(), "y": sy.to_json() }
}
