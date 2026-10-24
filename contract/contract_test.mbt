///|
test "canonical plan ignores JSON key insertion order" {
  let a : Json = {
    "seed": 42,
    "rows": 3,
    "columns": [{ "kind": "number", "name": "x", "min": 0, "max": 1 }],
  }
  let b : Json = {
    "columns": [{ "max": 1, "min": 0, "name": "x", "kind": "number" }],
    "rows": 3,
    "seed": 42,
  }
  assert_eq(@contract.canonical_plan(a), @contract.canonical_plan(b))
  assert_eq(
    @contract.canonical_plan(a),
    "moondata.generate/1|rows=3|seed=42|columns=[{name=x,kind=number,min=0,max=1}]",
  )
}

///|
test "tool allowlist rejects shell and accepts propose_generation" {
  assert_true(@contract.is_allowed_tool("propose_generation"))
  assert_true(!@contract.is_allowed_tool("run_shell"))
  let ok = try {
    @contract.validate_tool_call("propose_generation", {
      "rows": 2,
      "seed": 1,
      "columns": [{ "name": "id", "kind": "sequence", "start": 1, "step": 1 }],
    })
    true
  } catch {
    _ => false
  }
  assert_true(ok)
  let blocked = try {
    @contract.validate_tool_call("run_shell", { "cmd": "ls" })
    false
  } catch {
    _ => true
  }
  assert_true(blocked)
}
