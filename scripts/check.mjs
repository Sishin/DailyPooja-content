#!/usr/bin/env node
/**
 * Validates v1/content.json and cross-checks the app's festival dates against
 * Google's public "Holidays in India" calendar.
 *
 *   node scripts/check.mjs             validate + report differences
 *   node scripts/check.mjs --propose   also write proposed festivalOverrides into content.json
 *   node scripts/check.mjs --validate  validate only (no network)
 *
 * Writes a Markdown report to report.md (and the GitHub job summary when running in Actions).
 * Proposals are only suggestions: a person reviews the pull request before anything ships.
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const CONTENT = 'v1/content.json';
const FESTIVALS = 'v1/festivals.json';
const ICS_URL = 'https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics';
const args = new Set(process.argv.slice(2));

// Calendar names → app festival ids. Only festivals the app already has.
const MAP = [
  ['makar_sankranti', /^Makar Sankranti$/],
  ['vasant_panchami', /^Vasant Panchami$/],
  ['maha_shivaratri', /^Maha Shivaratri/],
  ['holi', /^Holi$/],
  ['chaitra_navratri', /^(Gudi Padwa|Ugadi|Chaitra Sukhladi)$/],
  ['ram_navami', /^Rama Navami$/],
  ['raksha_bandhan', /^Raksha Bandhan$/],
  ['janmashtami', /^Janmashtami/],
  ['ganesh_chaturthi', /^(Ganesh Chaturthi|Vinayaka Chathurthi)$/],
  ['sharad_navratri', /^First Day of Sharad Navratri$/],
  ['dussehra', /^Dussehra$/],
  ['diwali', /^Diwali/],
  ['govardhan_puja', /^Govardhan Puja$/],
  ['bhai_dooj', /^Bhai Duj$/],
  ['chhath', /^Chhat Puja/],
];
// Festivals in the calendar the app doesn't have yet; listed as ideas for extraFestivals.
const CANDIDATES = /^(Onam|Pongal|Lohri|Vishu|Rath Yatra|Karaka Chaturthi|Maha (Saptami|Ashtami|Navami)|Buddha Purnima|Mahavir Jayanti|Naraka Chaturdasi|Holika Dahana|Maharishi Valmiki Jayanti|Bahag Bihu.*|Vaisakhi|Cheti Chand|First Day of Durga Puja Festivities)$/;

const errors = [];
const report = [];
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isId = v => typeof v === 'string' && /^[a-z0-9_]{1,40}$/.test(v);
const isText = v => v && typeof v.en === 'string' && v.en && typeof v.hi === 'string' && v.hi;

function validate(c) {
  if (c.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (typeof c.updated !== 'string' || !c.updated) errors.push('updated must be a non-empty string');
  const arr = (k) => { if (!Array.isArray(c[k])) { errors.push(`${k} must be an array`); return []; } return c[k]; };
  arr('festivalOverrides').forEach((o, i) => {
    if (!isId(o.id) || !Number.isInteger(o.year) || !(isDate(o.date) || o.hide === true))
      errors.push(`festivalOverrides[${i}] needs id, year and a date (YYYY-MM-DD) or "hide": true`);
  });
  arr('extraFestivals').forEach((f, i) => {
    if (!isId(f.id) || !isDate(f.date) || !isId(f.icon) || !isText(f.name) || !isText(f.tip) || (f.deityId !== undefined && !isId(f.deityId)))
      errors.push(`extraFestivals[${i}] needs id, date, icon, name {en, hi}, tip {en, hi}`);
  });
  arr('verses').forEach((v, i) => {
    if (typeof v.verse !== 'string' || !v.verse || !isText(v.meaning) || typeof v.source !== 'string' || !v.source)
      errors.push(`verses[${i}] needs verse, meaning {en, hi} and source`);
  });
  arr('banners').forEach((b, i) => {
    if (!isId(b.id) || !isDate(b.from) || !isDate(b.to) || !isId(b.icon) || !isText(b.text) || (b.link !== undefined && !['festivals', 'premium'].includes(b.link)))
      errors.push(`banners[${i}] needs id, from, to, icon, text {en, hi} and optional link "festivals" | "premium"`);
    else if (b.from > b.to) errors.push(`banners[${i}]: from is after to`);
  });
  arr('disabled').forEach((d, i) => { if (!isId(d)) errors.push(`disabled[${i}] must be a feature id like "greeting_card"`); });
  if (c.checkIgnore !== undefined) arr('checkIgnore').forEach((x, i) => {
    if (!isId(x.id) || !Number.isInteger(x.year)) errors.push(`checkIgnore[${i}] needs id and year`);
  });
}

function parseIcs(text) {
  const events = [];
  for (const block of text.replace(/\r?\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1)) {
    const d = block.match(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/);
    const s = block.match(/SUMMARY:(.*)/);
    if (d && s) events.push({ date: `${d[1]}-${d[2]}-${d[3]}`, name: s[1].trim() });
  }
  return events;
}

const content = JSON.parse(readFileSync(CONTENT, 'utf8'));
validate(content);
if (errors.length) {
  report.push('## ❌ content.json is invalid', '', ...errors.map(e => `- ${e}`));
  finish(1);
}
report.push('## ✅ content.json is valid', '');
if (args.has('--validate')) finish(0);

const app = JSON.parse(readFileSync(FESTIVALS, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const lastDate = app.festivals.at(-1)?.date ?? '';
if (lastDate < new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10)) {
  report.push(`⚠️ festivals.json only runs to ${lastDate}. Regenerate it from the app repo: \`npm run content:festivals -- <path>\`.`, '');
}

let events;
try {
  const res = await fetch(ICS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  events = parseIcs(await res.text());
} catch (e) {
  report.push(`⚠️ Could not download the holiday calendar (${e.message}); skipped the date check.`);
  finish(0);
}

const ignored = new Set((content.checkIgnore ?? []).map(x => `${x.id}|${x.year}`));
const overrides = content.festivalOverrides;
const differences = [];
for (const f of app.festivals) {
  if (f.date < today) continue;
  const year = +f.date.slice(0, 4);
  const rule = MAP.find(([id]) => id === f.id);
  if (!rule) continue;
  const external = [...new Set(events.filter(e => rule[1].test(e.name) && e.date.startsWith(String(year))).map(e => e.date))];
  if (!external.length) continue;
  const override = overrides.find(o => o.id === f.id && o.year === year);
  if (override?.hide) continue;
  const shown = override?.date ?? f.date;
  if (external.includes(shown) || ignored.has(`${f.id}|${year}`)) continue;
  differences.push({ id: f.id, name: f.name, year, calculated: f.date, shown, external: external[0] });
}

if (differences.length) {
  report.push(`### ${differences.length} date difference(s) with Google's Holidays in India calendar`, '',
    '| Festival | App shows | Calendar says | Calculated |', '|---|---|---|---|',
    ...differences.map(d => `| ${d.name} (${d.year}) | ${d.shown} | **${d.external}** | ${d.calculated} |`), '',
    'Check each against a printed panchang before merging. Traditions can differ by a day (e.g. Smarta vs Vaishnava Janmashtami).',
    'To keep the app’s date instead, remove that override from this PR and add `{ "id": "…", "year": …}` to `checkIgnore`.', '');
} else {
  report.push('No date differences with the holiday calendar. 🙏', '');
}

const known = new Set([...app.festivals.map(f => f.id), ...content.extraFestivals.map(f => f.name.en)]);
const ideas = [...new Map(events
  .filter(e => e.date >= today && e.date <= new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10))
  .filter(e => CANDIDATES.test(e.name) && !known.has(e.name))
  .map(e => [e.name, e])).values()].sort((a, b) => a.date.localeCompare(b.date));
if (ideas.length) {
  report.push('<details><summary>Festivals in the calendar the app doesn’t have (ideas for extraFestivals)</summary>', '',
    ...ideas.map(e => `- ${e.date} — ${e.name}`), '', '</details>', '');
}

if (args.has('--propose') && differences.length) {
  for (const d of differences) {
    const i = overrides.findIndex(o => o.id === d.id && o.year === d.year);
    const entry = { id: d.id, year: d.year, date: d.external, note: `Holidays in India calendar; app calculated ${d.calculated}` };
    if (i >= 0) overrides[i] = entry; else overrides.push(entry);
  }
  overrides.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  content.updated = today;
  writeFileSync(CONTENT, JSON.stringify(content, null, 2) + '\n');
  writeFileSync('.proposal-count', String(differences.length));
}
finish(0);

function finish(code) {
  const md = report.join('\n') + '\n';
  writeFileSync('report.md', md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(md);
  process.exit(code);
}
