// Markdown add-ons used across the site (set up in astro.config.ts):
// - $math$ and $$math$$ are drawn with KaTeX when the site builds
// - ```chart blocks become charts (see ./chart.ts)
// - an image on its own line becomes a figure, captioned by its title: ![alt](./a.jpg "Caption")
// - captioned figures and charts are numbered together: Figure 1, Figure 2…
// - links to other sites get a small arrow
// - notes ([^1]) are collected under a "Notes & references" section that starts closed
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Element, ElementContent } from 'hast';
import { toHtml } from 'hast-util-to-html';
import katex from 'katex';
import type { Code, Image, Paragraph, Root, RootContent } from 'mdast';
import { defineHastPlugin, defineMdastPlugin } from 'satteri';
import { ChartError, chartHasCaption, renderChart } from './chart';

const SITE_HOST = 'therealmohamed.com';

// Astro logs a post that fails to render and carries on with an empty page, so every chart and math
// error is also kept here, and `markdownErrors` (in astro.config.ts) fails the build if there are any.
const errors: string[] = [];
const report = (message: string): never => {
  errors.push(message);
  throw new Error(message);
};

export const markdownErrors = {
  name: 'markdown-errors',
  hooks: {
    'astro:build:done': () => {
      if (errors.length) throw new Error(`Some posts didn't render:\n${[...new Set(errors)].map((e) => `  - ${e}`).join('\n')}`);
    },
  },
};

// The dev server only rebuilds a post when the post's own text changes. It doesn't notice changes
// to this Markdown code or to a chart's CSV file. Watching them restarts the server, and putting their
// fingerprint in the settings (as a dev-only header) makes Astro see new settings and rebuild every post.
// The restart only loads this code afresh because the config is astro.config.ts, not .mjs.
type ConfigSetup = {
  command: string;
  config: { root: URL };
  addWatchFile: (path: string) => void;
  updateConfig: (config: { server: { headers: Record<string, string> } }) => void;
};

export const markdownDevReload = {
  name: 'markdown-dev-reload',
  hooks: {
    'astro:config:setup': ({ command, config, addWatchFile, updateConfig }: ConfigSetup) => {
      if (command !== 'dev') return;
      const root = fileURLToPath(config.root);
      const files = [
        ...readdirSync(join(root, 'src/markdown')).map((f) => join(root, 'src/markdown', f)),
        ...readdirSync(join(root, 'src/content'), { recursive: true, encoding: 'utf8' })
          .filter((f) => f.endsWith('.csv'))
          .map((f) => join(root, 'src/content', f)),
      ].sort();
      const hash = createHash('sha1');
      for (const file of files) {
        addWatchFile(file);
        hash.update(file).update(readFileSync(file));
      }
      updateConfig({ server: { headers: { 'x-markdown-fingerprint': hash.digest('hex') } } });
    },
    // A CSV added after the server started isn't watched yet. Touch the config so the server
    // restarts and starts watching it.
    'astro:server:setup': ({ server }: { server: { config: { root: string; configFile?: string | false }; watcher: { on: (event: string, cb: (path: string) => void) => void } } }) => {
      const contentDir = join(server.config.root, 'src/content');
      server.watcher.on('add', (path) => {
        if (!path.endsWith('.csv') || !path.startsWith(contentDir)) return;
        const configFile = join(server.config.root, 'astro.config.ts');
        const now = new Date();
        utimesSync(configFile, now, now);
      });
    },
  },
};

const el = (tagName: string, properties: Element['properties'], children: ElementContent[] = []): Element => ({
  type: 'element',
  tagName,
  properties,
  children,
});
const text = (value: string): ElementContent => ({ type: 'text', value });
const classes = (node: Element) => (node.properties?.className as string[] | undefined) ?? [];
const pathOf = (url: URL | undefined) => (url ? fileURLToPath(url) : 'a Markdown file');

/** The image in a paragraph that holds nothing but one image with a title (its caption). */
function captionedImage(node: Paragraph): Image | undefined {
  const kids = node.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
  const img = kids[0];
  return kids.length === 1 && img.type === 'image' && img.title ? img : undefined;
}

interface FigureData {
  // Figure numbers for charts, by where the chart block starts in the file.
  charts: Map<number, number>;
  // Which chart block it is (1st, 2nd…), for error messages.
  chartOrder: Map<number, number>;
  // Figure numbers for captioned images, in the order they appear.
  images: number[];
}

export const figuresAndCharts = defineMdastPlugin({
  name: 'figures-and-charts',
  options: { position: true },
  // Number captioned images and charts in reading order, before anything changes.
  before(root, ctx) {
    const figures: FigureData = { charts: new Map(), chartOrder: new Map(), images: [] };
    let n = 0;
    const walk = (nodes: readonly RootContent[]) => {
      for (const node of nodes) {
        if (node.type === 'code' && node.lang === 'chart') {
          const at = node.position?.start.offset ?? -1;
          figures.chartOrder.set(at, figures.chartOrder.size + 1);
          if (chartHasCaption(node.value)) figures.charts.set(at, ++n);
        } else if (node.type === 'paragraph' && captionedImage(node)) {
          figures.images.push(++n);
        } else if ('children' in node) {
          walk(node.children as RootContent[]);
        }
      }
    };
    walk((root as Root).children);
    ctx.data.figures = figures;
  },
  code(node: Readonly<Code>, ctx) {
    if (node.lang !== 'chart') return;
    const figures = ctx.data.figures as FigureData;
    const number = figures.charts.get(node.position?.start.offset ?? -1);
    const path = pathOf(ctx.fileURL);
    try {
      return { type: 'html', value: toHtml(renderChart(node.value, path, number)) };
    } catch (e) {
      if (!(e instanceof ChartError)) throw e;
      const which = figures.chartOrder.get(node.position?.start.offset ?? -1);
      report(`${which ? `Chart ${which}` : 'A chart'} in ${path}: ${e.message}`);
    }
  },
});

function renderMath(tex: string, displayMode: boolean, path: string) {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: true });
  } catch (e) {
    return report(`Math in ${path}: ${(e as Error).message}`);
  }
}

export const siteMarkdown = defineHastPlugin({
  name: 'site-markdown',
  element: [
    {
      // $$…$$ comes through as <pre><code class="math-display">.
      filter: ['pre'],
      visit(node, ctx) {
        const code = node.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code');
        if (!code || !classes(code).includes('math-display')) return;
        ctx.replaceNode(node, { type: 'raw', value: renderMath(ctx.textContent(code), true, pathOf(ctx.fileURL)) });
      },
    },
    {
      // $…$ comes through as <code class="math-inline">.
      filter: ['code'],
      visit(node, ctx) {
        if (!classes(node).includes('math-inline')) return;
        ctx.replaceNode(node, { type: 'raw', value: renderMath(ctx.textContent(node), false, pathOf(ctx.fileURL)) });
      },
    },
    {
      // A paragraph holding just one image with a title becomes a numbered figure with a caption.
      filter: ['p'],
      visit(node, ctx) {
        const kids = node.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
        const img = kids[0];
        if (kids.length !== 1 || img.type !== 'element' || img.tagName !== 'img') return;
        const caption = img.properties?.title;
        if (typeof caption !== 'string' || !caption) return;
        const number = (ctx.data.figures as FigureData | undefined)?.images.shift();
        const { title: _title, ...props } = img.properties;
        ctx.replaceNode(
          node,
          el('figure', { className: ['figure'], id: number ? `figure-${number}` : undefined }, [
            el('img', props),
            el('figcaption', {}, number ? [el('span', { className: ['figure-num'] }, [text(`Figure ${number}`)]), text(' '), text(caption)] : [text(caption)]),
          ]),
        );
      },
    },
    {
      // Links to other sites get a small arrow after them.
      filter: ['a'],
      visit(node, ctx) {
        let url: URL;
        try {
          url = new URL(String(node.properties?.href ?? ''));
        } catch {
          return; // a link within the site
        }
        if (!/^https?:$/.test(url.protocol) || url.hostname.endsWith(SITE_HOST)) return;
        ctx.setProperty(node, 'className', [...classes(node), 'ext']);
        ctx.appendChild(
          node,
          el('svg', { className: ['ext-icon'], width: 11, height: 11, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', ariaHidden: 'true' }, [
            el('path', { d: 'M4.5 2.5h5v5M9.5 2.5 3 9' }),
          ]),
        );
      },
    },
    {
      // Notes are collected in <section data-footnotes>, with a hidden heading and the list.
      // Show the heading as a toggle with the number of notes, and start the list closed.
      // A script in Base.astro opens it when a note number in the text is clicked.
      filter: ['section'],
      visit(node, ctx) {
        if (!classes(node).includes('footnotes')) return;
        const kids = node.children.filter((c): c is Element => c.type === 'element');
        const heading = kids.find((c) => c.tagName === 'h2');
        const list = kids.find((c) => c.tagName === 'ol');
        if (!heading || !list) return;
        const count = list.children.filter((c) => c.type === 'element' && c.tagName === 'li').length;
        ctx.replaceNode(
          node,
          el('section', { ...node.properties }, [
            el('details', { className: ['notes'] }, [
              el('summary', {}, [
                el('h2', { id: heading.properties?.id, className: ['notes-title'] }, [text(ctx.textContent(heading))]),
                el('span', { className: ['notes-count'] }, [text(String(count))]),
              ]),
              list,
            ]),
          ]),
        );
      },
    },
  ],
});
