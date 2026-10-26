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
/// Multi-kind fingerprint: key order must not change the wire form; seed must.
test "multi-kind fingerprint is order-stable and seed-sensitive" {
  let base : Json = {
    "rows": 5,
    "seed": 7,
    "columns": [
      { "name": "id", "kind": "text", "prefix": "R-", "start": 1, "step": 1 },
      { "kind": "category", "choices": ["A", "B"], "name": "g" },
      { "max": 10, "min": 0, "name": "x", "kind": "integer" },
      {
        "noise": 0.5,
        "source": "x",
        "slope": 2,
        "name": "y",
        "kind": "linear",
        "intercept": 1,
        "decimals": 2,
      },
    ],
  }
  let shuffled : Json = {
    "columns": [
      { "step": 1, "start": 1, "prefix": "R-", "kind": "text", "name": "id" },
      { "name": "g", "choices": ["A", "B"], "kind": "category" },
      { "kind": "integer", "name": "x", "min": 0, "max": 10 },
      {
        "kind": "linear",
        "name": "y",
        "source": "x",
        "slope": 2,
        "intercept": 1,
        "noise": 0.5,
        "decimals": 2,
      },
    ],
    "seed": 7,
    "rows": 5,
  }
  let expected = "moondata.generate/1|rows=5|seed=7|columns=[{name=id,kind=text,start=1,step=1,prefix=R-},{name=g,kind=category,choices=[A,B]},{name=x,kind=integer,min=0,max=10},{name=y,kind=linear,decimals=2,source=x,slope=2,intercept=1,noise=0.5}]"
  assert_eq(@contract.canonical_plan(base), expected)
  assert_eq(@contract.canonical_plan(shuffled), expected)
  let other_seed : Json = {
    "rows": 5,
    "seed": 8,
    "columns": [
      { "name": "id", "kind": "text", "prefix": "R-", "start": 1, "step": 1 },
      { "kind": "category", "choices": ["A", "B"], "name": "g" },
      { "max": 10, "min": 0, "name": "x", "kind": "integer" },
      {
        "noise": 0.5,
        "source": "x",
        "slope": 2,
        "name": "y",
        "kind": "linear",
        "intercept": 1,
        "decimals": 2,
      },
    ],
  }
  let other = @contract.canonical_plan(other_seed)
  assert_true(other != expected)
  assert_true(other.contains("seed=8"))
  assert_true(!other.contains("seed=7"))
}

///|
test "fingerprint rejects reserved characters in names" {
  let bad = try {
    let _ = @contract.canonical_plan({
      "rows": 1,
      "seed": 1,
      "columns": [{ "name": "a|b", "kind": "number", "min": 0, "max": 1 }],
    })
    false
  } catch {
    _ => true
  }
  assert_true(bad)
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
