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
/// date / boolean / missing appear in the fixed key order of canonical_column.
test "date boolean missing fingerprint surface" {
  let plan : Json = {
    "rows": 4,
    "seed": 11,
    "columns": [
      { "step": 1, "start_day": 20454, "kind": "date", "name": "day" },
      { "probability": 0.25, "name": "ok", "kind": "boolean" },
      { "missing": 0.1, "max": 5, "min": 1, "name": "n", "kind": "integer" },
    ],
  }
  let expected = "moondata.generate/1|rows=4|seed=11|columns=[{name=day,kind=date,step=1,start_day=20454},{name=ok,kind=boolean,probability=0.25},{name=n,kind=integer,min=1,max=5,missing=0.1}]"
  assert_eq(@contract.canonical_plan(plan), expected)
  let no_missing : Json = {
    "rows": 4,
    "seed": 11,
    "columns": [
      { "name": "day", "kind": "date", "start_day": 20454, "step": 1 },
      { "name": "ok", "kind": "boolean", "probability": 0.25 },
      { "name": "n", "kind": "integer", "min": 1, "max": 5 },
    ],
  }
  let other = @contract.canonical_plan(no_missing)
  assert_true(other != expected)
  assert_true(!other.contains("missing="))
}

///|
test "explore queryCanonical is order-stable with independent expected wire form" {
  let expected_group = "moondata.explore/1|mode=group|group=地区|reducer=sum|value=金额"
  let a = @contract.canonical_explore_query({
    "mode": "group",
    "group": "地区",
    "reducer": "sum",
    "value": "金额",
    "datasetId": "ignored-session-id",
  })
  let b = @contract.canonical_explore_query({
    "value": "金额",
    "reducer": "sum",
    "group": "地区",
    "mode": "group",
  })
  assert_eq(a, expected_group)
  assert_eq(b, expected_group)
  assert_eq(
    @contract.canonical_explore_query({ "mode": "overview" }),
    "moondata.explore/1|mode=overview",
  )
  let expected_plot = "moondata.explore/1|mode=plot|x=地区|yColumns=[金额]|kind=bar|reducer=sum"
  assert_eq(
    @contract.canonical_explore_query({
      "reducer": "sum",
      "kind": "bar",
      "yColumns": ["金额"],
      "x": "地区",
      "mode": "plot",
    }),
    expected_plot,
  )
}

///|
/// distribution / scatter / line have independent expected wire forms; key order ignored.
test "explore distribution scatter line queryCanonical closed forms" {
  let expected_dist = "moondata.explore/1|mode=distribution|value=金额|bins=10"
  assert_eq(
    @contract.canonical_explore_query({
      "bins": 10.0,
      "value": "金额",
      "mode": "distribution",
      "datasetId": "sess",
    }),
    expected_dist,
  )
  assert_eq(
    @contract.canonical_explore_query({
      "mode": "distribution",
      "value": "金额",
      "bins": 10.0,
    }),
    expected_dist,
  )
  let expected_scatter = "moondata.explore/1|mode=scatter|x=数量|y=金额"
  assert_eq(
    @contract.canonical_explore_query({
      "y": "金额",
      "x": "数量",
      "mode": "scatter",
    }),
    expected_scatter,
  )
  assert_eq(
    @contract.canonical_explore_query({
      "mode": "line",
      "x": "日期",
      "y": "金额",
    }),
    "moondata.explore/1|mode=line|x=日期|y=金额",
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

///|
test "plan_chart and plot_dataset require datasetId" {
  let missing = try {
    @contract.validate_tool_call("plan_chart", { "action": "plot" })
    false
  } catch {
    _ => true
  }
  assert_true(missing)
  let ok = try {
    @contract.validate_tool_call("plan_chart", {
      "datasetId": "d1",
      "action": "plot",
    })
    true
  } catch {
    _ => false
  }
  assert_true(ok)
  let plot_missing = try {
    @contract.validate_tool_call("plot_dataset", { "x": "a", "yColumns": [] })
    false
  } catch {
    _ => true
  }
  assert_true(plot_missing)
}
