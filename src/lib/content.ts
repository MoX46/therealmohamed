import type { ImageMetadata } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import type { Genre } from './books';

export { GENRES } from './books';

export type Hole = CollectionEntry<'rabbitHoles'>;
export type Update = CollectionEntry<'updates'>;
export type Project = CollectionEntry<'projects'>;
export type ProjectUpdate = CollectionEntry<'projectUpdates'>;
export type BookNote = CollectionEntry<'books'>;
export type Thought = CollectionEntry<'thoughts'>;

const STATUS_ORDER = { active: 0, paused: 1, done: 2 } as const;

/** Drafts are visible while previewing (npm run dev) but left out of the live site. */
export const SHOW_DRAFTS = import.meta.env.DEV;
const isLive = (entry: { data: { draft: boolean } }) => SHOW_DRAFTS || !entry.data.draft;

const PROJECT_ORDER = { active: 0, waiting: 1, done: 2 } as const;

/** The folder an update lives in, i.e. the id of its rabbit hole or project. */
export const holeIdOf = (update: Update | ProjectUpdate) => update.id.split('/')[0];
export const anchorOf = (update: Update | ProjectUpdate) => update.id.split('/')[1];

const newestFirst = <T extends { data: { date: Date } }>(items: T[]) =>
  items.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

/** Each entry with its updates (newest first), sorted by status, then by the latest update. */
function withUpdates<E extends Hole | Project, U extends Update | ProjectUpdate>(
  entries: E[],
  updates: U[],
  order: Record<string, number>,
) {
  return entries
    .map((entry) => {
      const own = updates.filter((u) => holeIdOf(u) === entry.id);
      return { entry, updates: own, latest: own[0]?.data.date };
    })
    .sort(
      (a, b) =>
        order[a.entry.data.status] - order[b.entry.data.status] ||
        (b.latest?.valueOf() ?? 0) - (a.latest?.valueOf() ?? 0),
    );
}

/** Rabbit holes with their updates (newest first), active ones first. */
export async function getHoles() {
  const [holes, updates] = await Promise.all([getCollection('rabbitHoles', isLive), getCollection('updates')]);
  return withUpdates(holes, newestFirst(updates), STATUS_ORDER).map(({ entry, ...rest }) => ({ hole: entry, ...rest }));
}

/** Projects with their updates (newest first), active ones first, then waiting, then done. */
export async function getProjects() {
  const [projects, updates] = await Promise.all([getCollection('projects', isLive), getCollection('projectUpdates')]);
  return withUpdates(projects, newestFirst(updates), PROJECT_ORDER).map(({ entry, ...rest }) => ({ project: entry, ...rest }));
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
    /** The book's Hardcover page. */
    url?: string;
  };
  /** Your own Markdown file for this book, if there is one. */
  note?: BookNote;
}

/** Books from Hardcover, with your notes in src/content/books laid over the top. */
export async function getBooks(): Promise<Book[]> {
  const [shelf, notes] = await Promise.all([getCollection('hardcover'), getCollection('books', isLive)]);
  const noteFor = new Map(notes.filter((n) => n.data.hardcoverSlug).map((n) => [n.data.hardcoverSlug, n]));
  const shelfIds = new Set(shelf.map((b) => b.id));

  // Anything set in your note wins over what Hardcover says.
  const merge = (id: string, base: Partial<Book['data']>, note?: BookNote): Book => {
    const own = Object.fromEntries(Object.entries(note?.data ?? {}).filter(([, v]) => v !== undefined));
    return { id, data: { status: 'read', ...base, ...own } as Book['data'], note };
  };

  const books = [
    ...shelf.map(({ data: { hardcoverSlug, ...data } }) => merge(hardcoverSlug, data, noteFor.get(hardcoverSlug))),
    // Books that aren't on Hardcover (or are on the Want to Read shelf, which isn't pulled in).
    ...notes
      .filter((n) => !n.data.hardcoverSlug || !shelfIds.has(n.data.hardcoverSlug))
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
  const [holes, projects, thoughts, books] = await Promise.all([getHoles(), getProjects(), getThoughts(), getBooks()]);
  // Only updates that belong to a live rabbit hole or project.
  const updates = holes.flatMap((h) => h.updates);
  const holeTitle = new Map(holes.map(({ hole }) => [hole.id, hole.data.title]));
  const projectTitle = new Map(projects.map(({ project }) => [project.id, project.data.title]));

  const items = [
    ...updates.map((u) => ({
      date: u.data.date,
      where: holeTitle.get(holeIdOf(u)) ?? 'Rabbit holes',
      text: u.data.title,
      href: `/rabbit-holes/${holeIdOf(u)}/#${anchorOf(u)}`,
    })),
    ...projects
      .flatMap((p) => p.updates)
      .map((u) => ({
        date: u.data.date,
        where: projectTitle.get(holeIdOf(u)) ?? 'Projects',
        text: u.data.title,
        href: `/projects/${holeIdOf(u)}/#${anchorOf(u)}`,
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
