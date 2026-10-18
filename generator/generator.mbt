///|
pub(all) struct ColumnSpec {
  name : String
  kind : String
  min : Double
  max : Double
  start : Double
  step : Double
  decimals : Int32
  prefix : String
  choices : Array[String]
  probability : Double
  missing : Double
  start_day : Int32
  source : String
  slope : Double
  intercept : Double
  noise : Double
} derive(FromJson)

///|
pub extend ColumnSpec with @json.FromJson::{from_json}

///|
priv struct Rng {
  mut state : Int32
}

///|
/// Park–Miller with Schrage reduction: all intermediates fit signed 32-bit.
fn Rng::next(self : Rng) -> Double {
  let value = 16807 * (self.state % 127773) - 2836 * (self.state / 127773)
  self.state = if value > 0 { value } else { value + 2147483647 }
  self.state.to_double() / 2147483647.0
}

///|
pub fn random_sequence(seed : Int32, length : Int32) -> Array[Double] raise {
  guard seed >= 1 && seed < 2147483647 && length >= 0 && length <= 100000 else {
    fail("Invalid seed or length")
  }
  let rng = Rng::{ state: seed, }
  Array::makei(length, _ => rng.next())
}

///|
pub fn generate(
  columns : Array[ColumnSpec],
  rows : Int32,
  seed : Int32,
) -> Array[Array[Json]] raise {
  guard rows >= 1 &&
    rows <= 10000 &&
    columns.length() >= 1 &&
    columns.length() <= 32 &&
    rows * (columns.length() + 1) <= 300000 else {
    fail("Generation size limit exceeded")
  }
  guard seed >= 1 && seed < 2147483647 else {
    fail("Seed must be in 1..2147483646")
  }
  let names : Map[String, Int32] = Map([])
  for i = 0; i < columns.length(); i = i + 1 {
    let c = columns[i]
    guard !c.name.is_empty() &&
      c.name.length() <= 100 &&
      c.name != "_synthetic" &&
      !names.contains(c.name) else {
      fail("Invalid or duplicate column name")
    }
    for
      v in [
        c.min,
        c.max,
        c.start,
        c.step,
        c.probability,
        c.missing,
        c.slope,
        c.intercept,
        c.noise,
      ] {
      guard !v.is_nan() && !v.is_inf() && v.abs() <= 1000000000000.0 else {
        fail("Invalid numeric generator parameter")
      }
    }
    guard c.decimals >= 0 &&
      c.decimals <= 8 &&
      c.missing >= 0.0 &&
      c.missing <= 0.8 &&
      c.probability >= 0.0 &&
      c.probability <= 1.0 &&
      c.noise >= 0.0 else {
      fail("Invalid precision or probability")
    }
    match c.kind {
      "integer" | "number" => {
        guard c.max >= c.min else { fail("Minimum exceeds maximum") }
        if c.kind == "integer" {
          guard c.min == c.min.floor() && c.max == c.max.floor() else {
            fail("Integer bounds must be integral")
          }
        }
      }
      "category" => {
        guard !c.choices.is_empty() && c.choices.length() <= 100 else {
          fail("Category requires 1..100 choices")
        }
        for choice in c.choices {
          guard choice.length() <= 200 else { fail("Category text too long") }
        }
      }
      "sequence" | "text" => {
        guard c.step != 0.0 else { fail("Sequence step must be nonzero") }
        guard (c.start + c.step * (rows - 1).to_double()).abs() <=
          1000000000000.0 else {
          fail("Sequence range exceeded")
        }
      }
      "date" => {
        guard c.start_day >= -25567 &&
          c.start_day <= 84005 &&
          c.step == c.step.floor() &&
          c.step.abs() <= 366.0 else {
          fail("Invalid date generation range")
        }
        let end_day = c.start_day.to_double() + c.step * (rows - 1).to_double()
        guard end_day >= -25567.0 && end_day <= 84005.0 else {
          fail("Date end out of range")
        }
      }
      "boolean" => ()
      "linear" => {
        guard names.get(c.source) is Some(source_index) else {
          fail("Linear source must name an earlier column")
        }
        let source = columns[source_index]
        guard source.kind == "integer" ||
          source.kind == "number" ||
          source.kind == "linear" ||
          (source.kind == "sequence" && source.prefix.is_empty()) else {
          fail("Linear source must be numeric")
        }
      }
      _ => fail("Unsupported generation kind")
    }
    guard c.prefix.length() <= 100 else { fail("Prefix too long") }
    names[c.name] = i
  }
  let rng = Rng::{ state: seed, }
  let output : Array[Array[Json]] = []
  for i = 0; i < rows; i = i + 1 {
    let row : Array[Json] = []
    for c in columns {
      if c.missing > 0.0 && rng.next() < c.missing {
        row.push(Json::null())
        continue
      }
      let value : Json = match c.kind {
        "integer" => Json(c.min + (rng.next() * (c.max - c.min + 1.0)).floor())
        "number" => {
          let scale = @math.pow(10.0, c.decimals.to_double())
          let draw = rng.next()
          let raw = c.min * (1.0 - draw) + c.max * draw
          Json(((raw * scale).round() / scale).max(c.min).min(c.max))
        }
        "sequence" => {
          let value = c.start + c.step * i.to_double()
          if c.prefix.is_empty() {
            Json(value)
          } else {
            Json("\{c.prefix}\{value}")
          }
        }
        "text" => Json("\{c.prefix}\{c.start + c.step * i.to_double()}")
        "date" => Json(c.start_day.to_double() + c.step * i.to_double())
        "boolean" => Json(rng.next() < c.probability)
        "category" =>
          Json(
            c.choices[(rng.next() * c.choices.length().to_double()).to_int()],
          )
        "linear" =>
          match row[names[c.source]] {
            Number(v, ..) => {
              let raw = c.slope * v +
                c.intercept +
                c.noise * (rng.next() * 2.0 - 1.0)
              guard !raw.is_nan() &&
                !raw.is_inf() &&
                raw.abs() <= 1000000000000000.0 else {
                fail("Generated numeric range exceeded")
              }
              let scale = @math.pow(10.0, c.decimals.to_double())
              Json((raw * scale).round() / scale)
            }
            _ => Json::null()
          }
        _ => Json::null()
      }
      row.push(value)
    }
    row.push(Json(true))
    output.push(row)
  }
  output
}
