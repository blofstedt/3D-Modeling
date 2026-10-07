// Writes docs/agent-tools.md from the tool specs, so the reference can never drift from the code.
import { writeFileSync, mkdirSync } from 'node:fs';
import { TOOL_SPECS } from '../src/core';

const typeOf = (s: any): string => {
  if (!s) return 'any';
  if (s.enum) return s.enum.map((v: string) => `\`${v}\``).join(' \\| ');
  if (s.oneOf) return s.oneOf.map(typeOf).join(' \\| ');
  if (s.const) return `\`${s.const}\``;
  if (s.type === 'array') return `list of ${typeOf(s.items)}`;
  if (s.type === 'object' && s.properties) return `{ ${Object.entries(s.properties).map(([k, v]) => `${k}: ${typeOf(v)}`).join(', ')} }`;
  return s.type ?? 'any';
};

const lines: string[] = [
  '# Craft3D tools',
  '',
  '_Generated from `src/core/tools.ts` by `npm run agent:docs`. Do not edit by hand._',
  '',
  'Axes: **x** to the right, **y** away from the front, **z** up. Everything is in millimetres. Every call answers `{ ok, result, shapes, changed, revision }` or `{ ok: false, error, hint }`.',
  '',
];
for (const t of TOOL_SPECS) {
  const props = ((t.inputSchema as any).properties ?? {}) as Record<string, any>;
  const required = new Set<string>((t.inputSchema as any).required ?? []);
  lines.push(`## \`${t.name}\``, '', t.description, '');
  const tags = [t.readOnly ? 'read-only' : 'changes the model', t.uiOnly ? 'live app only' : 'headless and live'];
  lines.push(`_${tags.join(' · ')}_`, '');
  const keys = Object.keys(props);
  if (keys.length) {
    lines.push('| argument | type | |', '| --- | --- | --- |');
    for (const k of keys) lines.push(`| \`${k}\` | ${typeOf(props[k])} | ${required.has(k) ? 'required' : ''}${props[k].description ? `${required.has(k) ? ' · ' : ''}${String(props[k].description).replace(/\|/g, '\\|')}` : ''} |`);
    lines.push('');
  }
}
mkdirSync('docs', { recursive: true });
writeFileSync('docs/agent-tools.md', lines.join('\n'));
console.log(`wrote docs/agent-tools.md (${TOOL_SPECS.length} tools)`);
