import { satteri } from '@astrojs/markdown-satteri';
import { defineConfig } from 'astro/config';
import { figuresAndCharts, markdownDevReload, markdownErrors, siteMarkdown } from './src/markdown/plugins.ts';

// https://astro.build/config
export default defineConfig({
  site: 'https://therealmohamed.com',
  trailingSlash: 'always',
  integrations: [markdownErrors, markdownDevReload],
  markdown: {
    // Math, charts, numbered figures, link arrows and notes: see src/markdown/plugins.ts.
    processor: satteri({
      features: {
        math: true,
        gfm: { footnotes: { label: 'Notes & references', backLabel: 'Back to note {reference} in the text' } },
      },
      mdastPlugins: [figuresAndCharts],
      hastPlugins: [siteMarkdown],
    }),
  },
});
