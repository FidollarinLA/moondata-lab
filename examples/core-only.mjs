// Build first. No HTTP server, UI or model is involved.
import assert from 'node:assert/strict';
import { parse_csv, summarize_json, aggregate_json } from '../web/engine.js';
function decode(text) { const value = JSON.parse(text); if (!value.ok) throw new Error(value.error); return value; }
const table = decode(parse_csv('地区,金额\n东,10\n西,20\n东,30\n西,\n'));
const values = table.numeric_columns[1];
const summary = decode(summarize_json(JSON.stringify({ values: values.filter(v => v !== null) }))).summary;
const groups = decode(aggregate_json(JSON.stringify({ groups: table.rows.map(r => r[0]), values, reducer: 'sum' }))).result;
assert.equal(summary.mean, 20); assert.equal(summary.count, 3); assert.deepEqual(groups.map(g => g.value), [40, 20]);
console.log(JSON.stringify({ summary, groups }, null, 2));
