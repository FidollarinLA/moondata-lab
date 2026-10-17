import { parse_csv, summarize_json, step_json } from '../web/engine.js';

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

export function finite(value, name, fallback) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new AppError(`${name} 必须是有限数值`);
  return result;
}
export function text(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AppError(`${name} 不能为空且长度不能超过 ${max}`);
  return value;
}
