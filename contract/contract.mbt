///|
/// Evidence and agent-boundary contracts. Not a DataFrame layer (see MoonFrame).
/// Validates generation-plan fingerprints and the allowlisted tool surface.
pub(all) suberror ContractError {
  ContractError(String)
}

///|
pub fn ContractError::to_string(self : ContractError) -> String {
  let ContractError(message) = self
  message
}

///|
fn join_parts(parts : Array[String], sep : String) -> String {
  if parts.is_empty() {
    return ""
  }
  let out = StringBuilder()
  out.write_string(parts[0])
  for i = 1; i < parts.length(); i = i + 1 {
    out.write_string(sep)
    out.write_string(parts[i])
  }
  out.to_string()
}

///|
fn assert_token(text : String, label : String) -> String raise ContractError {
  for ch in text.to_array() {
    guard ch != '|' && ch != ',' && ch != '{' && ch != '}' else {
      raise ContractError("\{label} contains reserved fingerprint characters")
    }
  }
  text
}

///|
/// Stable encoding of one generation column. Key order is fixed here.
pub fn canonical_column(spec : Json) -> String raise ContractError {
  guard spec is Object(map) else {
    raise ContractError("Column spec must be a JSON object")
  }
  let name = assert_token(required_string(map, "name"), "name")
  let kind = assert_token(required_string(map, "kind"), "kind")
  let parts : Array[String] = ["name=\{name}", "kind=\{kind}"]
  push_num(parts, map, "min")
  push_num(parts, map, "max")
  push_num(parts, map, "start")
  push_num(parts, map, "step")
  push_num(parts, map, "decimals")
  push_str(parts, map, "prefix")
  push_num(parts, map, "probability")
  push_num(parts, map, "missing")
  push_num(parts, map, "start_day")
  push_str(parts, map, "source")
  push_num(parts, map, "slope")
  push_num(parts, map, "intercept")
  push_num(parts, map, "noise")
  match map.get("choices") {
    Some(Array(items)) => {
      let rendered : Array[String] = []
      for item in items {
        match item {
          String(s) => rendered.push(assert_token(s, "choice"))
          _ => raise ContractError("Category choices must be strings")
        }
      }
      parts.push("choices=[\{join_parts(rendered, ",")}]")
    }
    Some(_) => raise ContractError("choices must be an array")
    None => ()
  }
  "{" + join_parts(parts, ",") + "}"
}

///|
/// Canonical plan body for reproducibility evidence (not a cryptographic hash).
pub fn canonical_plan(plan : Json) -> String raise ContractError {
  guard plan is Object(map) else {
    raise ContractError("Plan must be a JSON object")
  }
  let rows = required_int(map, "rows")
  let seed = required_int(map, "seed")
  guard rows >= 1 && rows <= 10000 && seed >= 1 && seed < 2147483647 else {
    raise ContractError("Plan rows/seed out of generation contract range")
  }
  guard map.get("columns") is Some(Array(columns)) else {
    raise ContractError("Plan requires columns array")
  }
  guard columns.length() >= 1 && columns.length() <= 32 else {
    raise ContractError("Plan requires 1..32 columns")
  }
  let encoded = columns.map(canonical_column)
  "moondata.generate/1|rows=\{rows}|seed=\{seed}|columns=[\{join_parts(encoded, ",")}]"
}

///|
pub fn is_allowed_tool(name : String) -> Bool {
  match name {
    "profile_dataset"
    | "explore_dataset"
    | "plot_dataset"
    | "propose_generation"
    | "plan_chart" => true
    _ => false
  }
}

///|
pub fn validate_tool_call(
  name : String,
  args : Json,
) -> Unit raise ContractError {
  guard is_allowed_tool(name) else {
    raise ContractError("Tool not allowlisted: \{name}")
  }
  guard args is Object(map) else {
    raise ContractError("Tool args must be a JSON object")
  }
  match name {
    "propose_generation" => {
      let _ = canonical_plan(args)
    }
    "plot_dataset" | "explore_dataset" => {
      guard map.get("datasetId") is Some(String(id)) && !id.is_empty() else {
        raise ContractError("\{name} requires non-empty datasetId")
      }
    }
    "profile_dataset" | "plan_chart" => ()
    _ => raise ContractError("Tool not allowlisted: \{name}")
  }
}

///|
fn required_string(
  map : Map[String, Json],
  key : String,
) -> String raise ContractError {
  match map.get(key) {
    Some(String(value)) => {
      guard !value.is_empty() else { raise ContractError("Missing \{key}") }
      value
    }
    _ => raise ContractError("Missing string field \{key}")
  }
}

///|
fn required_int(
  map : Map[String, Json],
  key : String,
) -> Int32 raise ContractError {
  match map.get(key) {
    Some(Number(value, ..)) => {
      guard value == value.floor() else {
        raise ContractError("\{key} must be an integer")
      }
      value.to_int()
    }
    _ => raise ContractError("Missing integer field \{key}")
  }
}

///|
fn push_num(
  parts : Array[String],
  map : Map[String, Json],
  key : String,
) -> Unit {
  match map.get(key) {
    Some(Number(value, ..)) => parts.push("\{key}=\{value}")
    _ => ()
  }
}

///|
fn push_str(
  parts : Array[String],
  map : Map[String, Json],
  key : String,
) -> Unit raise ContractError {
  match map.get(key) {
    Some(String(value)) => {
      let safe = assert_token(value, key)
      parts.push("\{key}=\{safe}")
    }
    _ => ()
  }
}
