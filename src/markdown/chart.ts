// Draws a chart from a ```chart block in a post. The chart is built when the site builds,
// as HTML and SVG in the site's own style, so pages don't need any JavaScript for it.
// How to write one: see src/content/thoughts/_template/index.md.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Element, ElementContent } from 'hast';
import { parse as parseYaml } from 'yaml';
import { parseFormula } from './formula';

type ChartType = 'line' | 'bar' | 'scatter';
type Point = { x: number | string; y: number };
type Series = { name: string; points: Point[] };

const TYPES: ChartType[] = ['line', 'bar', 'scatter'];
// Each series gets its own line style or marker, not just its own color, so they can be told apart
// without seeing color.
const MAX_SERIES = 4;
// Points sampled along a formula.
const SAMPLES = 120;

export class ChartError extends Error {}
const fail = (why: string): never => {
  throw new ChartError(why);
};

// ---------- Tiny hast builder ----------

type Props = Record<string, string | number | boolean | string[] | undefined>;
function h(tag: string, props: Props = {}, children: (ElementContent | string | false | undefined)[] = []): Element {
  const properties: Element['properties'] = {};
  for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== false) properties[k] = v;
  return {
    type: 'element',
    tagName: tag,
    properties,
    children: children
      .filter((c): c is ElementContent | string => c !== false && c !== undefined)
      .map((c) => (typeof c === 'string' ? { type: 'text', value: c } : c)),
  };
}

// ---------- Reading the block ----------

interface Axis {
  label?: string;
  min?: number;
  max?: number;
}

interface Spec {
  type: ChartType;
  title?: string;
  caption?: string;
  x: Axis;
  y: Axis;
  series: Series[];
  isTime: boolean;
}

const asNumber = (v: unknown, what: string): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fail(`${what} should be a number, not ${JSON.stringify(v)}`);

function readAxis(raw: unknown, name: string): Axis {
  if (raw === undefined) return {};
  if (typeof raw === 'string') return { label: raw };
  if (typeof raw !== 'object' || raw === null) return fail(`"${name}" should look like { label: Year }`);
  const a = raw as Record<string, unknown>;
  return {
    label: a.label === undefined ? undefined : String(a.label),
    min: a.min === undefined ? undefined : asNumber(a.min, `${name}.min`),
    max: a.max === undefined ? undefined : asNumber(a.max, `${name}.max`),
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') (cell += '"'), i++;
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') cells.push(cell.trim()), (cell = '');
      else cell += c;
    }
    cells.push(cell.trim());
    rows.push(cells);
  }
  return rows;
}

const toNumber = (s: string) => (s === '' ? NaN : Number(s.replace(/,/g, '')));

// A CSV file next to the post: the first column is x, every other column is a series named by its header.
function readCsv(path: string, postPath: string): Series[] {
  const full = resolve(dirname(postPath), path);
  let text: string;
  try {
    text = readFileSync(full, 'utf8');
  } catch {
    return fail(`can't find the data file "${path}" (looked for ${full})`);
  }
  const [header, ...rows] = parseCsv(text);
  if (!header || header.length < 2 || rows.length === 0) {
    return fail(`"${path}" needs a header row and at least one row of data, with x in the first column`);
  }
  return header.slice(1).map((name, col) => ({
    name,
    points: rows
      .map((row) => ({ x: row[0], y: toNumber(row[col + 1] ?? '') }))
      .filter((p) => Number.isFinite(p.y))
      .map((p) => ({ x: Number.isFinite(toNumber(p.x)) ? toNumber(p.x) : p.x, y: p.y })),
  }));
}

function readSeries(raw: unknown, index: number, xAxis: Axis): Series {
  if (typeof raw !== 'object' || raw === null) return fail(`series ${index + 1} should have a name and either fn or data`);
  const s = raw as Record<string, unknown>;
  const name = s.name === undefined ? `Series ${index + 1}` : String(s.name);
  if (s.fn !== undefined) {
    let f: (x: number) => number;
    try {
      f = parseFormula(String(s.fn));
    } catch (e) {
      return fail((e as Error).message);
    }
    const from = s.from ?? xAxis.min;
    const to = s.to ?? xAxis.max;
    if (from === undefined || to === undefined) {
      return fail(`"${name}" uses a formula, so it needs from and to (or set x: { min, max })`);
    }
    const a = asNumber(from, `"${name}" from`);
    const b = asNumber(to, `"${name}" to`);
    const points = Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const x = a + ((b - a) * i) / SAMPLES;
      return { x, y: f(x) };
    }).filter((p) => Number.isFinite(p.y));
    if (points.length < 2) return fail(`the formula for "${name}" doesn't give any numbers between ${a} and ${b}`);
    return { name, points };
  }
  if (Array.isArray(s.data)) {
    const points = s.data.map((pair, i) => {
      if (!Array.isArray(pair) || pair.length !== 2) {
        return fail(`point ${i + 1} of "${name}" should look like [x, y], not ${JSON.stringify(pair)}`);
      }
      const x = pair[0] instanceof Date ? pair[0].toISOString() : pair[0];
      if (typeof x !== 'number' && typeof x !== 'string') return fail(`point ${i + 1} of "${name}" has an x that isn't a number or text`);
      return { x, y: asNumber(pair[1], `the y of point ${i + 1} of "${name}"`) };
    });
    if (points.length === 0) return fail(`"${name}" has no points`);
    return { name, points };
  }
  return fail(`"${name}" needs either fn (a formula) or data (a list of [x, y] points)`);
}

const DATE = /^\d{4}-\d{2}(-\d{2})?([T ][\d:.]+Z?)?$/;

function readSpec(source: string, postPath: string): Spec {
  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (e) {
    return fail(`the YAML doesn't parse: ${(e as Error).message.split('\n')[0]}`);
  }
  if (typeof raw !== 'object' || raw === null) return fail('the block should start with type: line, bar or scatter');
  const r = raw as Record<string, unknown>;
  const allowed = new Set(['type', 'title', 'caption', 'x', 'y', 'series', 'data']);
  for (const key of Object.keys(r)) if (!allowed.has(key)) fail(`unknown setting "${key}" (expected one of ${[...allowed].join(', ')})`);

  const type = (r.type ?? 'line') as ChartType;
  if (!TYPES.includes(type)) fail(`type should be one of ${TYPES.join(', ')}, not "${r.type}"`);
  const x = readAxis(r.x, 'x');
  const y = readAxis(r.y, 'y');

  const series: Series[] = [];
  if (r.data !== undefined) {
    if (typeof r.data !== 'string') fail('data at the top should be the path to a CSV file, like ./data.csv');
    series.push(...readCsv(r.data as string, postPath));
  }
  if (r.series !== undefined) {
    if (!Array.isArray(r.series)) fail('series should be a list, each item starting with "- name:"');
    (r.series as unknown[]).forEach((s, i) => series.push(readSeries(s, i, x)));
  }
  if (series.length === 0) fail('there are no series. Add series: or data: ./file.csv');
  if (series.length > MAX_SERIES) fail(`a chart can have up to ${MAX_SERIES} series, this one has ${series.length}`);

  // x is either all numbers, all dates (line and scatter), or categories (bar).
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  let isTime = false;
  if (type === 'bar') {
    for (const s of series) for (const p of s.points) p.x = String(p.x);
  } else if (xs.every((v) => typeof v === 'number')) {
    // numbers: nothing to do
  } else if (xs.every((v) => typeof v === 'string' && DATE.test(v))) {
    isTime = true;
    for (const s of series) for (const p of s.points) p.x = Date.parse(String(p.x));
  } else {
    fail(`every x in a ${type} chart should be a number or a date like 2025-03-01. For labels like "Jan" use type: bar`);
  }
  if (type === 'line') for (const s of series) s.points.sort((a, b) => (a.x as number) - (b.x as number));

  return {
    type,
    title: r.title === undefined ? undefined : String(r.title),
    caption: r.caption === undefined ? undefined : String(r.caption),
    x,
    y,
    series,
    isTime,
  };
}

// ---------- Scales ----------

function niceTicks(min: number, max: number, target = 4) {
  const rough = (max - min || Math.abs(max) || 1) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.max(Math.ceil(max / step - 1e-9) * step, lo + step);
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  return { lo, hi, ticks };
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
const formatNumber = (v: number) => (Math.abs(v) >= 10000 ? compact.format(v) : plain.format(Number(v.toFixed(6))));

const MONTH_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const YEAR = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'UTC' });

function timeTicks(min: number, max: number) {
  const years = (max - min) / (365.25 * 86400000);
  const format = years > 3 ? YEAR : MONTH_YEAR;
  const count = max > min ? 4 : 0;
  const ticks = Array.from({ length: count + 1 }, (_, i) => min + ((max - min) * i) / Math.max(count, 1));
  return { lo: min, hi: max > min ? max : min + 1, ticks, format: (v: number) => format.format(new Date(v)) };
}

const pct = (n: number) => `${Number(n.toFixed(3))}%`;

// ---------- Drawing ----------

function summary(spec: Spec) {
  const names = spec.series.map((s) => s.name).join(', ');
  const kind = { line: 'Line chart', bar: 'Bar chart', scatter: 'Scatter plot' }[spec.type];
  const axes = [spec.x.label && `x is ${spec.x.label}`, spec.y.label && `y is ${spec.y.label}`].filter(Boolean).join(', ');
  return `${kind}${spec.title ? `: ${spec.title}` : ''}. ${spec.series.length === 1 ? 'Shows' : 'Series'}: ${names}.${axes ? ` ${axes[0].toUpperCase()}${axes.slice(1)}.` : ''}`;
}

/** Whether a chart block has a caption (only captioned figures are numbered). Never throws. */
export function chartHasCaption(source: string): boolean {
  try {
    const raw = parseYaml(source) as Record<string, unknown> | null;
    return typeof raw === 'object' && raw !== null && raw.caption !== undefined;
  } catch {
    return false;
  }
}

// `number` is the chart's figure number, shown before its caption.
export function renderChart(source: string, postPath: string, number?: number): Element {
  const spec = readSpec(source, postPath);
  const all = spec.series.flatMap((s) => s.points);

  // Vertical scale. Bars always start from zero.
  const ys = all.map((p) => p.y);
  let yMin = spec.y.min ?? Math.min(...ys);
  let yMax = spec.y.max ?? Math.max(...ys);
  if (spec.type === 'bar') (yMin = Math.min(0, yMin)), (yMax = Math.max(0, yMax));
  const yScale = niceTicks(yMin, yMax);
  const yLo = spec.y.min ?? yScale.lo;
  const yHi = spec.y.max ?? yScale.hi;
  const yTicks = yScale.ticks.filter((t) => t >= yLo - 1e-9 && t <= yHi + 1e-9);
  const y = (v: number) => 100 - ((v - yLo) / (yHi - yLo)) * 100;

  const plot: ElementContent[] = [];
  const marks: ElementContent[] = [];
  let xLabels: ElementContent[] = [];

  for (const t of yTicks) {
    plot.push(h('div', { className: ['chart-grid'], style: `top: ${pct(y(t))}` }, [h('span', {}, [formatNumber(t)])]));
  }

  if (spec.type === 'bar') {
    const categories = [...new Set(all.map((p) => p.x as string))];
    const band = 100 / categories.length;
    const inner = band * 0.7;
    const barWidth = inner / spec.series.length;
    spec.series.forEach((s, si) => {
      for (const p of s.points) {
        const ci = categories.indexOf(p.x as string);
        const top = Math.min(y(p.y), y(0));
        const height = Math.abs(y(p.y) - y(0));
        marks.push(
          h('rect', {
            className: ['chart-bar', `chart-s${si}`],
            x: Number((ci * band + (band - inner) / 2 + si * barWidth).toFixed(3)),
            y: Number(top.toFixed(3)),
            width: Number((barWidth * 0.92).toFixed(3)),
            height: Number(Math.max(height, 0.0001).toFixed(3)),
          }),
        );
      }
    });
    xLabels = categories.map((c, i) => h('span', { style: `left: ${pct((i + 0.5) * band)}` }, [c]));
  } else {
    const xsNum = all.map((p) => p.x as number);
    const xMin = spec.x.min ?? Math.min(...xsNum);
    const xMax = spec.x.max ?? Math.max(...xsNum);
    const xScale = spec.isTime ? timeTicks(xMin, xMax) : { ...niceTicks(xMin, xMax, 5), format: formatNumber };
    // Formulas and line data use the range as given; scatter points get tidy room around them.
    const xLo = spec.type === 'scatter' && spec.x.min === undefined && !spec.isTime ? xScale.lo : xMin;
    const xHi = spec.type === 'scatter' && spec.x.max === undefined && !spec.isTime ? xScale.hi : xMax > xMin ? xMax : xMin + 1;
    const x = (v: number) => ((v - xLo) / (xHi - xLo)) * 100;
    xLabels = xScale.ticks
      .filter((t) => t >= xLo - 1e-9 && t <= xHi + 1e-9)
      // Labels at the very edges line up with the edge instead of hanging over it.
      .map((t) => {
        const at = x(t);
        const edge = at <= 1 ? ['is-start'] : at >= 99 ? ['is-end'] : undefined;
        return h('span', { className: edge, style: `left: ${pct(at)}` }, [xScale.format(t)]);
      });

    if (spec.type === 'line') {
      const ends: { si: number; name: string; left: number; top: number }[] = [];
      spec.series.forEach((s, si) => {
        const coords = s.points.map((p) => `${x(p.x as number).toFixed(3)},${y(p.y).toFixed(3)}`).join(' ');
        marks.push(h('polyline', { className: ['chart-line', `chart-s${si}`], points: coords, vectorEffect: 'non-scaling-stroke' }));
        const last = s.points[s.points.length - 1];
        ends.push({ si, name: s.name, left: x(last.x as number), top: y(last.y) });
        // A line with only a few points shows them as dots.
        if (s.points.length <= 12) {
          for (const p of s.points) {
            plot.push(h('span', { className: ['chart-dot', `chart-s${si}`], style: `left: ${pct(x(p.x as number))}; top: ${pct(y(p.y))}` }));
          }
        }
      });
      // Name each line at its end, nudging labels apart when lines finish close together.
      if (spec.series.length > 1) {
        ends.sort((a, b) => a.top - b.top);
        for (let i = 1; i < ends.length; i++) ends[i].top = Math.max(ends[i].top, ends[i - 1].top + 10);
        for (const e of ends) {
          plot.push(h('span', { className: ['chart-end', `chart-s${e.si}`], style: `left: ${pct(e.left)}; top: ${pct(e.top)}` }, [e.name]));
        }
      }
    } else {
      spec.series.forEach((s, si) => {
        for (const p of s.points) {
          plot.push(h('span', { className: ['chart-pt', `chart-s${si}`], style: `left: ${pct(x(p.x as number))}; top: ${pct(y(p.y))}` }));
        }
      });
    }
  }

  const svg = h('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', role: 'img', ariaLabel: summary(spec) }, marks);

  // Bars and scatter plots get a key when there's more than one series; lines are named at their ends.
  const legend =
    spec.series.length > 1 && spec.type !== 'line'
      ? h(
          'ul',
          { className: ['chart-legend'] },
          spec.series.map((s, si) =>
            h('li', {}, [h('span', { className: ['chart-key', `chart-key--${spec.type}`, `chart-s${si}`], ariaHidden: 'true' }), s.name]),
          ),
        )
      : undefined;

  return h('figure', { className: ['figure', 'chart', `chart--${spec.type}`], id: number ? `figure-${number}` : undefined }, [
    h('div', { className: ['chart-frame'] }, [
      spec.title ? h('p', { className: ['chart-title'] }, [spec.title]) : undefined,
      legend,
      spec.y.label ? h('p', { className: ['chart-axis', 'chart-axis--y'] }, [spec.y.label]) : undefined,
      h('div', { className: ['chart-plot'] }, [...plot, svg]),
      h('div', { className: ['chart-ticks'], ariaHidden: 'true' }, xLabels),
      spec.x.label ? h('p', { className: ['chart-axis', 'chart-axis--x'] }, [spec.x.label]) : undefined,
    ]),
    spec.caption
      ? h('figcaption', {}, [number ? h('span', { className: ['figure-num'] }, [`Figure ${number}`]) : undefined, number ? ' ' : undefined, spec.caption])
      : undefined,
  ]);
}
