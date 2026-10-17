///|
pub(all) suberror AnalysisError {
  AnalysisError(String)
}

///|
pub(all) struct Summary {
  count : Int32
  min : Double
  max : Double
  mean : Double
  stddev : Double
  rms : Double
} derive(ToJson)

///|
fn finite(x : Double) -> Bool {
  !x.is_nan() && !x.is_inf()
}

///|
/// Population standard deviation; scaled RMS avoids squaring the input range.
pub fn summarize(values : Array[Double]) -> Summary raise AnalysisError {
  if values.is_empty() {
    raise AnalysisError("No finite numeric samples")
  }
  let mut mean = 0.0
  let mut m2 = 0.0
  let mut low = values[0]
  let mut high = values[0]
  let mut scale = 0.0
  let mut squares = 1.0
  for i = 0; i < values.length(); i = i + 1 {
    let v = values[i]
    if !finite(v) {
      raise AnalysisError("Non-finite input")
    }
    low = low.min(v)
    high = high.max(v)
    let delta = v - mean
    mean = mean + delta / (i + 1).to_double()
    m2 = m2 + delta * (v - mean)
    let a = v.abs()
    if a != 0.0 {
      if scale < a {
        squares = 1.0 + squares * (scale / a) * (scale / a)
        scale = a
      } else {
        squares = squares + a / scale * (a / scale)
      }
    }
  }
  let stddev = (m2 / values.length().to_double()).max(0.0).sqrt()
  let rms = if scale == 0.0 {
    0.0
  } else {
    scale * (squares / values.length().to_double()).sqrt()
  }
  if !finite(mean) || !finite(stddev) || !finite(rms) {
    raise AnalysisError("Numeric range exceeds stable calculation limits")
  }
  { count: values.length(), min: low, max: high, mean, stddev, rms, }
}

///|
pub(all) struct StepConfig {
  target : Double
  initial : Double
  step_time : Double
  band_percent : Double
  tail_percent : Double
} derive(ToJson, FromJson)

///|
pub(all) struct StepMetrics {
  samples : Int32
  duration : Double
  amplitude : Double
  band_absolute : Double
  overshoot_percent : Double
  peak_value : Double
  peak_time : Double
  rise_time : Double?
  settling_time : Double?
  settling_status : String
  tail_samples : Int32
  tail_start : Double
  tail_mean : Double
  steady_error : Double
  steady_error_percent : Double
  iae : Double
  warnings : Array[String]
}

///|
fn crossing(
  times : Array[Double],
  progress : Array[Double],
  threshold : Double,
  start : Double,
) -> Double? {
  if progress[0] >= threshold {
    return None
  }
  for i = 1; i < times.length(); i = i + 1 {
    if progress[i - 1] < threshold && progress[i] >= threshold {
      let t = times[i - 1] +
        (threshold - progress[i - 1]) /
        (progress[i] - progress[i - 1]) *
        (times[i] - times[i - 1])
      if t >= start {
        return Some(t)
      }
    }
  }
  None
}

///|
/// Analyze one explicitly defined step. Times are seconds and strictly increasing.
/// Settling is observed only within the provided window, with >=2 in-band samples.
pub fn step(
  times : Array[Double],
  values : Array[Double],
  config : StepConfig,
) -> StepMetrics raise AnalysisError {
  if times.length() != values.length() || times.length() < 3 {
    raise AnalysisError(
      "Step analysis requires at least 3 matching time and value samples",
    )
  }
  for
    v in [
      config.target,
      config.initial,
      config.step_time,
      config.band_percent,
      config.tail_percent,
    ] {
    if !finite(v) {
      raise AnalysisError("Non-finite step parameter")
    }
  }
  if config.band_percent <= 0.0 || config.band_percent > 50.0 {
    raise AnalysisError(
      "Settling band must be >0 and <=50 percent of step amplitude",
    )
  }
  if config.tail_percent <= 0.0 || config.tail_percent > 50.0 {
    raise AnalysisError(
      "Tail window must be >0 and <=50 percent of post-step duration",
    )
  }
  let amplitude = config.target - config.initial
  if amplitude == 0.0 || !finite(amplitude) {
    raise AnalysisError("Step amplitude must be finite and nonzero")
  }
  for i = 0; i < times.length(); i = i + 1 {
    if !finite(times[i]) || !finite(values[i]) {
      raise AnalysisError("Missing or invalid time/response samples")
    }
    if i > 0 && times[i] <= times[i - 1] {
      raise AnalysisError(
        "Time must be strictly increasing; duplicate timestamps are not merged",
      )
    }
  }
  if config.step_time < times[0] ||
    config.step_time >= times[times.length() - 1] {
    raise AnalysisError(
      "Step time must lie in the observation window before its final sample",
    )
  }
  let post_times : Array[Double] = []
  let post_values : Array[Double] = []
  // Interpolate the value at the step boundary when the timestamp lies between samples.
  for i = 0; i < times.length(); i = i + 1 {
    if times[i] >= config.step_time {
      if post_times.is_empty() && times[i] > config.step_time && i > 0 {
        let alpha = (config.step_time - times[i - 1]) /
          (times[i] - times[i - 1])
        post_times.push(config.step_time)
        post_values.push(values[i - 1] * (1.0 - alpha) + values[i] * alpha)
      }
      post_times.push(times[i])
      post_values.push(values[i])
    }
  }
  if post_times.length() < 3 {
    raise AnalysisError("Need at least 3 post-step samples")
  }
  let progress = post_values.map(fn(v) { (v - config.initial) / amplitude })
  let mut peak_index = 0
  for i = 0; i < progress.length(); i = i + 1 {
    if !finite(progress[i]) {
      raise AnalysisError("Step normalization overflow")
    }
    if progress[i] > progress[peak_index] {
      peak_index = i
    }
  }
  let warnings : Array[String] = []
  let t10 = crossing(post_times, progress, 0.1, config.step_time)
  let t90 = crossing(post_times, progress, 0.9, config.step_time)
  let rise_time = match (t10, t90) {
    (Some(a), Some(b)) => if b >= a { Some(b - a) } else { None }
    _ => None
  }
  if rise_time is None {
    warnings.push(
      "10–90% rise time unavailable: crossings were not fully observed",
    )
  }
  let band = amplitude.abs() * config.band_percent / 100.0
  let mut last_out = -1
  for i = 0; i < post_values.length(); i = i + 1 {
    if (post_values[i] - config.target).abs() > band {
      last_out = i
    }
  }
  let settle_index = last_out + 1
  let settling_time = if settle_index + 1 < post_times.length() {
    Some(post_times[settle_index] - config.step_time)
  } else {
    None
  }
  let settling_status = if settling_time is Some(_) {
    "observed_in_window"
  } else {
    "not_observed"
  }
  if settling_time is None {
    warnings.push(
      "Settling not observed with at least two final in-band samples",
    )
  }
  let duration = post_times[post_times.length() - 1] - config.step_time
  let tail_start = post_times[post_times.length() - 1] -
    duration * config.tail_percent / 100.0
  let tail : Array[Double] = []
  for i = 0; i < post_times.length(); i = i + 1 {
    if post_times[i] >= tail_start {
      tail.push(post_values[i])
    }
  }
  let tail_mean = summarize(tail).mean
  if tail.length() < 3 {
    warnings.push("Tail mean uses fewer than three samples")
  }
  let steady_error = config.target - tail_mean
  let mut iae = 0.0
  for i = 1; i < post_times.length(); i = i + 1 {
    let dt = post_times[i] - post_times[i - 1]
    let a = config.target - post_values[i - 1]
    let b = config.target - post_values[i]
    // Integrate |error| for the piecewise linear interpolant, including zero crossings.
    if (a < 0.0 && b > 0.0) || (a > 0.0 && b < 0.0) {
      let total = a.abs() + b.abs()
      iae = iae +
        dt * 0.5 * (a.abs() * (a.abs() / total) + b.abs() * (b.abs() / total))
    } else {
      iae = iae + dt * (a.abs() * 0.5 + b.abs() * 0.5)
    }
  }
  let overshoot_percent = ((progress[peak_index] - 1.0) * 100.0).max(0.0)
  let steady_error_percent = steady_error / amplitude.abs() * 100.0
  if !finite(duration) ||
    !finite(band) ||
    !finite(iae) ||
    !finite(overshoot_percent) ||
    !finite(steady_error_percent) {
    raise AnalysisError("Calculated metric overflow")
  }
  {
    samples: post_times.length(),
    duration,
    amplitude,
    band_absolute: band,
    overshoot_percent,
    peak_value: post_values[peak_index],
    peak_time: post_times[peak_index] - config.step_time,
    rise_time,
    settling_time,
    settling_status,
    tail_samples: tail.length(),
    tail_start,
    tail_mean,
    steady_error,
    steady_error_percent,
    iae,
    warnings,
  }
}

///|
pub fn AnalysisError::to_string(self : AnalysisError) -> String {
  let AnalysisError(message) = self
  message
}

///|
pub extend Summary with ToJson::{to_json}

///|
pub extend StepConfig with ToJson::{to_json}

///|
pub extend StepConfig with @json.FromJson::{from_json}

///|
pub extend StepMetrics with ToJson::{to_json}

///|
/// JSON boundary uses numeric values or null, rather than Option's array encoding.
pub impl ToJson for StepMetrics with fn to_json(self : StepMetrics) -> Json {
  {
    "samples": self.samples,
    "duration": self.duration,
    "amplitude": self.amplitude,
    "band_absolute": self.band_absolute,
    "overshoot_percent": self.overshoot_percent,
    "peak_value": self.peak_value,
    "peak_time": self.peak_time,
    "rise_time": match self.rise_time {
      Some(v) => Json(v)
      None => Json::null()
    },
    "settling_time": match self.settling_time {
      Some(v) => Json(v)
      None => Json::null()
    },
    "settling_status": self.settling_status,
    "tail_samples": self.tail_samples,
    "tail_start": self.tail_start,
    "tail_mean": self.tail_mean,
    "steady_error": self.steady_error,
    "steady_error_percent": self.steady_error_percent,
    "iae": self.iae,
    "warnings": Json(self.warnings),
  }
}
