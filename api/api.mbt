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
    let columns = @csv.describe(table)
    let result : Json = {
      "ok": true,
      "headers": Json(table.headers),
      "rows": Json(table.rows),
      "columns": Json(columns),
      "numeric_columns": Json(numeric_columns),
      "quality_notes": Json(
        @csv.table_quality_notes(columns, table.rows.length()),
      ),
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

///|
priv struct GenerateRequest {
  columns : Array[@generator.ColumnSpec]
  rows : Int32
  seed : Int32
} derive(FromJson)

///|
#export_name("generate_json")
pub fn generate_json(text : String) -> String {
  try {
    let request : GenerateRequest = @json.from_json(@json.parse(text))
    let rows = @generator.generate(request.columns, request.rows, request.seed)
    let headers = request.columns.map(c => c.name)
    headers.push("_synthetic")
    let result : Json = {
      "ok": true,
      "headers": Json(headers),
      "rows": Json(rows),
    }
    result.stringify()
  } catch {
    e => failure(e.to_string())
  }
}

///|
priv struct DistributionRequest {
  values : Array[Double]
  bins : Int32
} derive(FromJson)

///|
#export_name("distribution_json")
pub fn distribution_json(text : String) -> String {
  try {
    let r : DistributionRequest = @json.from_json(@json.parse(text))
    let result : Json = {
      "ok": true,
      "result": @explore.distribution(r.values, r.bins),
    }
    result.stringify()
  } catch {
    e => failure(e.to_string())
  }
}

///|
priv struct AggregateRequest {
  groups : Array[String]
  values : Array[Json]
  reducer : String
} derive(FromJson)

///|
#export_name("aggregate_json")
pub fn aggregate_json(text : String) -> String {
  try {
    let r : AggregateRequest = @json.from_json(@json.parse(text))
    let result : Json = {
      "ok": true,
      "result": @explore.aggregate(r.groups, r.values, r.reducer),
    }
    result.stringify()
  } catch {
    e => failure(e.to_string())
  }
}

///|
priv struct CorrelationRequest {
  x : Array[Double]
  y : Array[Double]
} derive(FromJson)

///|
#export_name("correlation_json")
pub fn correlation_json(text : String) -> String {
  try {
    let r : CorrelationRequest = @json.from_json(@json.parse(text))
    let result : Json = { "ok": true, "result": @explore.correlation(r.x, r.y) }
    result.stringify()
  } catch {
    e => failure(e.to_string())
  }
}

///|
priv struct ToolCallRequest {
  name : String
  args : Json
} derive(FromJson)

///|
#export_name("canonical_plan_json")
pub fn canonical_plan_json(text : String) -> String {
  try {
    let plan : Json = @json.parse(text)
    let canonical = try {
      @contract.canonical_plan(plan)
    } catch {
      e => return failure(@contract.ContractError::to_string(e))
    }
    let result : Json = { "ok": true, "canonical": canonical }
    result.stringify()
  } catch {
    e => failure(e.to_string())
  }
}

///|
#export_name("validate_tool_json")
pub fn validate_tool_json(text : String) -> String {
  try {
    let request : ToolCallRequest = @json.from_json(@json.parse(text))
    try {
      @contract.validate_tool_call(request.name, request.args)
    } catch {
      e => return failure(@contract.ContractError::to_string(e))
    }
    let result : Json = { "ok": true, "allowed": true, "name": request.name }
    result.stringify()
  } catch {
    e => failure(e.to_string())
  }
}
