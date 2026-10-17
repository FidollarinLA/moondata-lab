///|
test "independent population statistics" {
  let s = @analysis.summarize([1.0, 2.0, 3.0, 4.0])
  assert_true(s.mean.is_close(2.5))
  assert_true(s.stddev.is_close(1.25.sqrt()))
  assert_true(s.rms.is_close(7.5.sqrt()))
  assert_eq(s.min, 1.0)
  assert_eq(s.max, 4.0)
}

///|
test "rising ramp exact rise settling and integral" {
  let m = @analysis.step([0.0, 1.0, 2.0, 3.0], [0.0, 5.0, 10.0, 10.0], {
    target: 10.0,
    initial: 0.0,
    step_time: 0.0,
    band_percent: 2.0,
    tail_percent: 20.0,
  })
  assert_true(m.rise_time.unwrap().is_close(1.6))
  assert_eq(m.settling_time, Some(2.0))
  assert_eq(m.overshoot_percent, 0.0)
  assert_eq(m.steady_error, 0.0)
  assert_eq(m.iae, 10.0)
}

///|
test "falling step uses direction and step amplitude" {
  let m = @analysis.step(
    [0.0, 1.0, 2.0, 3.0, 4.0],
    [10.0, 5.0, -1.0, 0.0, 0.0],
    {
      target: 0.0,
      initial: 10.0,
      step_time: 0.0,
      band_percent: 2.0,
      tail_percent: 25.0,
    },
  )
  assert_true(m.overshoot_percent.is_close(10.0))
  assert_eq(m.peak_value, -1.0)
  assert_eq(m.settling_time, Some(3.0))
}

///|
test "single final in-band sample is insufficient" {
  let m = @analysis.step([0.0, 1.0, 2.0], [0.0, 5.0, 10.0], {
    target: 10.0,
    initial: 0.0,
    step_time: 0.0,
    band_percent: 2.0,
    tail_percent: 20.0,
  })
  assert_eq(m.settling_time, None)
  assert_eq(m.settling_status, "not_observed")
}

///|
test "IAE interpolates error zero crossing" {
  let m = @analysis.step([0.0, 1.0, 2.0], [0.0, 20.0, 10.0], {
    target: 10.0,
    initial: 0.0,
    step_time: 0.0,
    band_percent: 2.0,
    tail_percent: 20.0,
  })
  assert_true(m.iae.is_close(10.0))
}

///|
test "reject duplicate time zero amplitude and non-finite samples" {
  let config : @analysis.StepConfig = {
    target: 10.0,
    initial: 0.0,
    step_time: 0.0,
    band_percent: 2.0,
    tail_percent: 20.0,
  }
  let duplicate = try {
    @analysis.step([0.0, 0.0, 1.0], [0.0, 1.0, 2.0], config) |> ignore
    false
  } catch {
    _ => true
  }
  assert_true(duplicate)
  let zero = try {
    @analysis.step([0.0, 1.0, 2.0], [0.0, 1.0, 2.0], { ..config, target: 0.0, })
    |> ignore
    false
  } catch {
    _ => true
  }
  assert_true(zero)
  let nonfinite = try {
    @analysis.summarize([1.0, 1.0 / 0.0]) |> ignore
    false
  } catch {
    _ => true
  }
  assert_true(nonfinite)
}
