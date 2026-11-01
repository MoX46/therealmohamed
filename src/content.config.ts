import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import savedGenres from './data/book-genres.json';
import { fetchShelves, GENRE_KEYS, GENRES, guessGenre, type Genre } from './lib/books';

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
      icon: z.enum(['cube', 'briefcase', 'chess', 'roller', 'book', 'spark', 'controller']).default('spark'),
      // Show this one under "Currently into" on the home page.
      featured: z.boolean().default(false),
      started: z.coerce.date().optional(),
      finished: z.coerce.date().optional(),
      timeSpent: z.string().optional(),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      before: image().optional(),
      after: image().optional(),
      // Optional: what you're measuring, e.g. "Rapid rating". Updates with a `metric`
      // number are plotted on a progress chart under this name.
      metric: z.string().optional(),
      // Optional: what you're working on right now. Hidden once the status is done.
      now: z.string().optional(),
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
      // Optional: the rabbit hole's `metric` at this point, e.g. a rating of 1180.
      metric: z.number().optional(),
    }),
});

// Books come from Hardcover (the "Read" and "Currently Reading" shelves) every time the site builds.
// Set HARDCOVER_TOKEN in .env (and as a GitHub Actions secret) to the API token from hardcover.app/account/api.
// Genres are saved in src/data/book-genres.json; run `npm run books:genres` to add new books to it.
const hardcover = defineCollection({
  loader: {
    name: 'hardcover',
    load: async ({ store, logger, parseData }) => {
      const token = import.meta.env.HARDCOVER_TOKEN ?? process.env.HARDCOVER_TOKEN;
      if (!token) {
        // Previewing without a token still works, just without the Hardcover books.
        if (import.meta.env.DEV) return logger.warn('HARDCOVER_TOKEN is not set, so the bookshelf only shows your own notes');
        throw new Error('HARDCOVER_TOKEN is not set');
      }
      const shelf = await fetchShelves(token);
      const cache = savedGenres as Record<string, { genre: Genre }>;
      const missing: string[] = [];
      store.clear();
      for (const book of shelf) {
        if (store.has(book.hardcoverSlug)) continue;
        let genre = cache[book.hardcoverSlug]?.genre;
        if (!genre) {
          genre = await guessGenre(book);
          missing.push(`${book.title} (${GENRES[genre]})`);
        }
        const data = await parseData({ id: book.hardcoverSlug, data: { ...book, genre } });
        store.set({ id: book.hardcoverSlug, data });
      }
      logger.info(`Loaded ${store.keys().length} books from Hardcover`);
      if (missing.length) {
        logger.warn(`Guessed genres for books not in book-genres.json: ${missing.join(', ')}. Run "npm run books:genres" to save them.`);
      }
    },
  },
  schema: z.object({
    hardcoverSlug: z.string(),
    title: z.string(),
    series: z.string().optional(),
    author: z.string(),
    genre: z.enum(GENRE_KEYS),
    status: z.enum(['reading', 'read']),
    rating: z.number().int().min(1).max(5).optional(),
    finished: z.coerce.date().optional(),
    cover: z.string().url().optional(),
    url: z.string().url(),
  }),
});

// Your own notes on a book: a one-line take, a summary, or a fix for something Hardcover gets wrong.
// Link a note to a Hardcover book with `hardcoverSlug` (the end of its URL, hardcover.app/books/<slug>).
// A note without one is a book that isn't on Hardcover, and needs a title, author and genre.
const books = defineCollection({
  loader: glob({ base: './src/content/books', pattern: '[^_]*.md' }),
  schema: ({ image }) =>
    z
      .object({
        hardcoverSlug: z.coerce.string().optional(),
        title: z.string().optional(),
        author: z.string().optional(),
        genre: z.enum(GENRE_KEYS).optional(),
        status: z.enum(['reading', 'read', 'want']).optional(),
        rating: z.number().int().min(1).max(5).optional(),
        take: z.string().optional(),
        finished: z.coerce.date().optional(),
        cover: image().optional(),
        draft: z.boolean().default(false),
      })
      .refine((d) => d.hardcoverSlug || (d.title && d.author && d.genre), {
        message: 'A book without a hardcoverSlug needs a title, author and genre',
      }),
});

// Each thought is a folder: src/content/thoughts/<name>/index.md, with its images and data files next to it.
const thoughts = defineCollection({
  loader: glob({
    base: './src/content/thoughts',
    pattern: '[^_]*/index.md',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { rabbitHoles, updates, hardcover, books, thoughts };
