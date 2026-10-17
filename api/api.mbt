///|
fn failure(message : String) -> String {
  let result : Json = { "ok": false, "error": message }
  result.stringify()
}

///|
#export_name("parse_csv")
pub fn parse_csv(text : String) -> String {
  try {
    let table = @csv.parse(text)
    let numeric_columns : Array[Array[Json]] = []
    for c = 0; c < table.headers.length(); c = c + 1 {
      numeric_columns.push(
        table.rows.map(fn(row) {
          match @csv.number(row[c]) {
            Some(value) => Json(value)
            None => Json::null()
          }
        }),
      )
    }
    let result : Json = {
      "ok": true,
      "headers": Json(table.headers),
      "rows": Json(table.rows),
      "columns": Json(@csv.describe(table)),
      "numeric_columns": Json(numeric_columns),
    }
    result.stringify()
  } catch {
    e => failure(e.to_string())
  }
}

///|
priv struct SummaryRequest {
  values : Array[Double]
} derive(FromJson)

///|
#export_name("summarize_json")
pub fn summarize_json(text : String) -> String {
  try {
    let request : SummaryRequest = @json.from_json(@json.parse(text))
    if request.values.length() > 100000 {
      return failure("At most 100000 values")
    }
    let result : Json = {
      "ok": true,
      "summary": @analysis.summarize(request.values).to_json(),
    }
    result.stringify()
  } catch {
    e => failure(e.to_string())
  }
}

///|
priv struct StepRequest {
  times : Array[Double]
  values : Array[Double]
  config : @analysis.StepConfig
} derive(FromJson)

///|
#export_name("step_json")
pub fn step_json(text : String) -> String {
  try {
    let request : StepRequest = @json.from_json(@json.parse(text))
    if request.times.length() > 100000 {
      return failure("At most 100000 samples")
    }
    let result : Json = {
      "ok": true,
      "metrics": @analysis.step(request.times, request.values, request.config).to_json(),
    }
    result.stringify()
  } catch {
    e => failure(e.to_string())
  }
}
