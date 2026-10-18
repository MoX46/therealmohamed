import type { ImageMetadata } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import type { Genre } from './goodreads';

export { GENRES } from './goodreads';

export type Hole = CollectionEntry<'rabbitHoles'>;
export type Update = CollectionEntry<'updates'>;
export type BookNote = CollectionEntry<'books'>;
export type Thought = CollectionEntry<'thoughts'>;

const STATUS_ORDER = { active: 0, paused: 1, done: 2 } as const;

/** Drafts are visible while previewing (npm run dev) but left out of the live site. */
export const SHOW_DRAFTS = import.meta.env.DEV;
const isLive = (entry: { data: { draft: boolean } }) => SHOW_DRAFTS || !entry.data.draft;

export const holeIdOf = (update: Update) => update.id.split('/')[0];
export const anchorOf = (update: Update) => update.id.split('/')[1];

export async function getUpdates() {
  const updates = await getCollection('updates');
  return updates.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** Rabbit holes with their updates (newest first), active ones first. */
export async function getHoles() {
  const [holes, updates] = await Promise.all([getCollection('rabbitHoles', isLive), getUpdates()]);
  return holes
    .map((hole) => {
      const own = updates.filter((u) => holeIdOf(u) === hole.id);
      return { hole, updates: own, latest: own[0]?.data.date };
    })
    .sort(
      (a, b) =>
        STATUS_ORDER[a.hole.data.status] - STATUS_ORDER[b.hole.data.status] ||
        (b.latest?.valueOf() ?? 0) - (a.latest?.valueOf() ?? 0),
    );
}

export async function getThoughts() {
  const thoughts = await getCollection('thoughts', isLive);
  return thoughts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

const BOOK_ORDER = { reading: 0, read: 1, want: 2 } as const;

export interface Book {
  id: string;
  data: {
    title: string;
    series?: string;
    author: string;
    genre: Genre;
    status: keyof typeof BOOK_ORDER;
    rating?: number;
    take?: string;
    finished?: Date;
    cover?: ImageMetadata | string;
    /** The book's Goodreads page. */
    url?: string;
  };
  /** Your own Markdown file for this book, if there is one. */
  note?: BookNote;
}

/** Books from Goodreads, with your notes in src/content/books laid over the top. */
export async function getBooks(): Promise<Book[]> {
  const [shelf, notes] = await Promise.all([getCollection('goodreads'), getCollection('books', isLive)]);
  const noteFor = new Map(notes.filter((n) => n.data.goodreadsId).map((n) => [n.data.goodreadsId, n]));
  const shelfIds = new Set(shelf.map((b) => b.id));

  // Anything set in your note wins over what Goodreads says.
  const merge = (id: string, base: Partial<Book['data']>, note?: BookNote): Book => {
    const own = Object.fromEntries(Object.entries(note?.data ?? {}).filter(([, v]) => v !== undefined));
    return { id, data: { status: 'read', ...base, ...own } as Book['data'], note };
  };

  const books = [
    ...shelf.map(({ data: { goodreadsId, ...data } }) => merge(goodreadsId, data, noteFor.get(goodreadsId))),
    // Books that aren't on Goodreads (or are on the to-read shelf, which isn't pulled in).
    ...notes
      .filter((n) => !n.data.goodreadsId || !shelfIds.has(n.data.goodreadsId))
      .filter((n) => n.data.title && n.data.author && n.data.genre)
      .map((n) => merge(n.id, {}, n)),
  ];

  return books.sort(
    (a, b) =>
      BOOK_ORDER[a.data.status] - BOOK_ORDER[b.data.status] ||
      (b.data.finished?.valueOf() ?? 0) - (a.data.finished?.valueOf() ?? 0) ||
      a.data.title.localeCompare(b.data.title),
  );
}

export const hasSummary = (book: Book) => Boolean(book.note?.body?.trim());
export const bookHref = (book: Book) => (hasSummary(book) ? `/bookshelf/${book.note!.id}/` : '/bookshelf/');

/** Everything that happened recently, across the whole site. */
export async function getFeed(limit = 6) {
  const [holes, thoughts, books] = await Promise.all([getHoles(), getThoughts(), getBooks()]);
  // Only updates that belong to a live rabbit hole.
  const updates = holes.flatMap((h) => h.updates);
  const holeTitle = new Map(holes.map(({ hole }) => [hole.id, hole.data.title]));

  const items = [
    ...updates.map((u) => ({
      date: u.data.date,
      where: holeTitle.get(holeIdOf(u)) ?? 'Rabbit holes',
      text: u.data.title,
      href: `/rabbit-holes/${holeIdOf(u)}/#${anchorOf(u)}`,
    })),
    ...thoughts.map((t) => ({
      date: t.data.date,
      where: 'Thoughts',
      text: t.data.title,
      href: `/thoughts/${t.id}/`,
    })),
    ...books
      .filter((b) => b.data.finished)
      .map((b) => ({
        date: b.data.finished!,
        where: 'Bookshelf',
        text: `Finished ${b.data.title}`,
        href: bookHref(b),
      })),
  ];

  return items.sort((a, b) => b.date.valueOf() - a.date.valueOf()).slice(0, limit);
}

export function formatDate(date: Date, style: 'short' | 'month' = 'short') {
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    year: 'numeric',
    ...(style === 'short' ? { day: 'numeric' } : {}),
  });
}

export function readingTime(body = '') {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 220))} min read`;
}
