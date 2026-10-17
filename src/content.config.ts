import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Folders and files starting with "_" (like _template) are ignored,
// so they're safe places to keep templates.
// Entries with `draft: true` show up in `npm run dev` but not on the live site.

// Each rabbit hole is a folder: src/content/rabbit-holes/<name>/index.md
const rabbitHoles = defineCollection({
  loader: glob({
    base: './src/content/rabbit-holes',
    pattern: '[^_]*/index.md',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      // Optional: the part of the title that gets the highlighter treatment.
      highlight: z.string().optional(),
      blurb: z.string(),
      status: z.enum(['active', 'paused', 'done']),
      // Optional: replaces the badge text, e.g. "Starting Nov".
      statusLabel: z.string().optional(),
      icon: z.enum(['cube', 'briefcase', 'chess', 'roller', 'book', 'spark']).default('spark'),
      // Show this one under "Currently into" on the home page.
      featured: z.boolean().default(false),
      started: z.coerce.date().optional(),
      finished: z.coerce.date().optional(),
      timeSpent: z.string().optional(),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      before: image().optional(),
      after: image().optional(),
      learned: z.array(z.string()).default([]),
      kit: z.array(z.string()).default([]),
      verdict: z.string().optional(),
      draft: z.boolean().default(false),
    }),
});

// Updates live inside a rabbit hole's folder and start with a date:
// src/content/rabbit-holes/<name>/2026-10-14-short-title.md
const updates = defineCollection({
  loader: glob({
    base: './src/content/rabbit-holes',
    pattern: '[^_]*/[0-9]*.md',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      // Photos shown in a sideways-scrolling strip under the update.
      // Each one is a path, or { src, alt } when you want to describe it.
      images: z
        .array(z.union([image(), z.object({ src: image(), alt: z.string().default('') })]))
        .default([]),
      // How tall the photo strip is.
      gallerySize: z.enum(['small', 'medium', 'large']).default('medium'),
    }),
});

const books = defineCollection({
  loader: glob({ base: './src/content/books', pattern: '[^_]*.md' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      author: z.string(),
      genre: z.enum(['sci-fi', 'politics', 'philosophy', 'other']),
      status: z.enum(['reading', 'read', 'want']).default('read'),
      rating: z.number().int().min(1).max(5).optional(),
      take: z.string().optional(),
      finished: z.coerce.date().optional(),
      cover: image().optional(),
      draft: z.boolean().default(false),
    }),
});

const thoughts = defineCollection({
  loader: glob({ base: './src/content/thoughts', pattern: '[^_]*.md' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { rabbitHoles, updates, books, thoughts };
