import { parse_csv, summarize_json, step_json, generate_json, distribution_json, aggregate_json, correlation_json, canonical_plan_json, validate_tool_json } from '../web/engine.js';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function decode(text) {
  const result = JSON.parse(text);
  if (!result.ok) throw new AppError(result.error);
  return result;
}
export const parseCsv = text => decode(parse_csv(text));
export const summarize = values => decode(summarize_json(JSON.stringify({ values }))).summary;
export const step = (times, values, config) => decode(step_json(JSON.stringify({ times, values, config }))).metrics;
export const generateRows = spec => decode(generate_json(JSON.stringify(spec)));
export const distribution = (values, bins = 10) => decode(distribution_json(JSON.stringify({ values, bins }))).result;
export const aggregate = (groups, values, reducer) => decode(aggregate_json(JSON.stringify({ groups, values, reducer }))).result;
export const correlation = (x, y) => decode(correlation_json(JSON.stringify({ x, y }))).result;
export const canonicalPlan = plan => decode(canonical_plan_json(JSON.stringify(plan))).canonical;
export const validateToolCall = (name, args) => decode(validate_tool_json(JSON.stringify({ name, args })));

/** Stable id for jury/evidence: MoonBit allowlist gate, not a model claim. */
export const TOOL_ALLOWLIST_VALIDATOR = 'moondata.contract/validate_tool_call';

export function toolContractEvidence(name, { allowed = true } = {}) {
  return {
    allowlisted: allowed === true,
    validator: TOOL_ALLOWLIST_VALIDATOR,
    tool: name,
  };
}

export function finite(value, name, fallback) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new AppError(`${name} 必须是有限数值`);
  return result;
}
export function text(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AppError(`${name} 不能为空且长度不能超过 ${max}`);
  return value;
}
