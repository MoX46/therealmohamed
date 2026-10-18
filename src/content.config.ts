import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import savedGenres from './data/book-genres.json';
import { fetchShelf, GENRE_KEYS, GENRES, guessGenre, SHELVES, type Genre } from './lib/goodreads';
import { SITE } from './site';

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

// Books come from Goodreads (the "read" and "currently reading" shelves) every time the site builds.
// Genres are saved in src/data/book-genres.json; run `npm run books:genres` to add new books to it.
const goodreads = defineCollection({
  loader: {
    name: 'goodreads',
    load: async ({ store, logger, parseData }) => {
      const shelves = await Promise.all(
        (Object.keys(SHELVES) as (keyof typeof SHELVES)[]).map((shelf) => fetchShelf(SITE.goodreadsUserId, shelf)),
      );
      const cache = savedGenres as Record<string, { genre: Genre }>;
      const missing: string[] = [];
      store.clear();
      for (const book of shelves.flat()) {
        if (store.has(book.goodreadsId)) continue;
        let genre = cache[book.goodreadsId]?.genre;
        if (!genre) {
          genre = await guessGenre(book);
          missing.push(`${book.title} (${GENRES[genre]})`);
        }
        const data = await parseData({ id: book.goodreadsId, data: { ...book, genre } });
        store.set({ id: book.goodreadsId, data });
      }
      logger.info(`Loaded ${store.keys().length} books from Goodreads`);
      if (missing.length) {
        logger.warn(`Guessed genres for books not in book-genres.json: ${missing.join(', ')}. Run "npm run books:genres" to save them.`);
      }
    },
  },
  schema: z.object({
    goodreadsId: z.string(),
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

// Your own notes on a book: a one-line take, a summary, or a fix for something Goodreads gets wrong.
// Link a note to a Goodreads book with `goodreadsId` (the number in the book's Goodreads URL).
// A note without one is a book that isn't on Goodreads, and needs a title, author and genre.
const books = defineCollection({
  loader: glob({ base: './src/content/books', pattern: '[^_]*.md' }),
  schema: ({ image }) =>
    z
      .object({
        goodreadsId: z.coerce.string().optional(),
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
      .refine((d) => d.goodreadsId || (d.title && d.author && d.genre), {
        message: 'A book without a goodreadsId needs a title, author and genre',
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

export const collections = { rabbitHoles, updates, goodreads, books, thoughts };
