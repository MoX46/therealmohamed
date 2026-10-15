import { getCollection, type CollectionEntry } from 'astro:content';

export type Hole = CollectionEntry<'rabbitHoles'>;
export type Update = CollectionEntry<'updates'>;
export type Book = CollectionEntry<'books'>;
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

export async function getBooks() {
  const books = await getCollection('books', isLive);
  return books.sort(
    (a, b) =>
      BOOK_ORDER[a.data.status] - BOOK_ORDER[b.data.status] ||
      (b.data.finished?.valueOf() ?? 0) - (a.data.finished?.valueOf() ?? 0) ||
      a.data.title.localeCompare(b.data.title),
  );
}

export const hasSummary = (book: Book) => Boolean(book.body?.trim());
export const bookHref = (book: Book) => (hasSummary(book) ? `/bookshelf/${book.id}/` : '/bookshelf/');

export const GENRES = {
  'sci-fi': 'Sci-fi',
  politics: 'Politics',
  philosophy: 'Philosophy',
  other: 'Other',
} as const;

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
