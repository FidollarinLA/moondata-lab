import { mkdir, writeFile } from 'node:fs/promises';
const directory = new URL('../examples/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, damping, frequency] of [['a', 0.38, 11], ['b', 0.78, 13]]) {
  const rows = ['time_s,target_rpm,speed_rpm,current_a,temperature_c'];
  for (let i = 0; i <= 1200; i++) {
    const t = i * 0.005;
    const tau = Math.max(0, t - 0.5);
    const wd = frequency * Math.sqrt(1 - damping ** 2);
    const response = t < 0.5 ? 0 : 1000 * (1 - Math.exp(-damping * frequency * tau) * (Math.cos(wd * tau) + damping / Math.sqrt(1 - damping ** 2) * Math.sin(wd * tau)));
    const current = t < 0.5 ? 0 : 1.2 + 3.8 * Math.exp(-2 * tau) + 0.1 * Math.sin(tau * 14);
    rows.push([t.toFixed(3), t < 0.5 ? 0 : 1000, response.toFixed(6), current.toFixed(6), (25 + 0.3 * tau).toFixed(6)].join(','));
  }
  await writeFile(new URL(`motor-${name}.csv`, directory), rows.join('\n') + '\n', 'utf8');
}
console.log('Generated two deterministic synthetic motor responses. Not measured data.');
