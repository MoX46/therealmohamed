// Reads Goodreads shelves from their public RSS feeds and works out a genre for each book.
// Used by the `goodreads` collection in src/content.config.ts and by scripts/sync-book-genres.ts.

export const GENRES = {
  'sci-fi': 'Sci-fi',
  fiction: 'Fiction',
  philosophy: 'Philosophy',
  'self-help': 'Self-help',
  science: 'Science',
  business: 'Business',
  finance: 'Finance',
  other: 'Other',
} as const;

export type Genre = keyof typeof GENRES;
export const GENRE_KEYS = Object.keys(GENRES) as [Genre, ...Genre[]];

// The shelves shown on the site. "to-read" is left out on purpose.
export const SHELVES = { 'currently-reading': 'reading', read: 'read' } as const;

export interface FeedBook {
  goodreadsId: string;
  title: string;
  series?: string;
  author: string;
  isbn?: string;
  status: 'reading' | 'read';
  rating?: number;
  finished?: string;
  cover?: string;
  url: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(e[1] === 'x' ? 2 : 1), e[1] === 'x' ? 16 : 10)) : (ENTITIES[e] ?? m),
    )
    .trim();

const field = (item: string, tag: string) => {
  const m = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1]) : '';
};

const toDate = (s: string) => (s ? new Date(s).toISOString().slice(0, 10) : undefined);

/**
 * Goodreads titles carry the series and subtitle, e.g. "Final Orbit (The Apollo Murders (Kaz Zemeckis) Book 3)"
 * or "Radical Candor: Be a Kickass Boss Without Losing Your Humanity". Split those into a short title and a series.
 */
export function splitTitle(full: string): { title: string; series?: string } {
  let title = full;
  let series: string | undefined;
  const m = title.match(/^(.*?)\s*\(((?:[^()]|\([^()]*\))*)\)$/);
  if (m && /#\s*[\d.]+|Book\s+\d/i.test(m[2])) {
    title = m[1];
    series = m[2]
      .replace(/\s*\([^()]*\)/g, '')
      .replace(/,?\s*(?:#|Book\s+)\s*([\d.]+)/i, ' #$1')
      .trim();
  }
  // Drop the subtitle on long titles, but keep short ones like "2001: A Space Odyssey" whole.
  if (title.length > 30 && title.includes(': ')) title = title.split(': ')[0];
  return { title, series };
}

/** Every book on one shelf. Goodreads pages the feed, so keep going until a page comes back empty. */
export async function fetchShelf(userId: string, shelf: keyof typeof SHELVES): Promise<FeedBook[]> {
  const books: FeedBook[] = [];
  for (let page = 1; page < 20; page++) {
    const url = `https://www.goodreads.com/review/list_rss/${userId}?shelf=${shelf}&per_page=100&page=${page}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (therealmohamed.com bookshelf)' } });
    if (!res.ok) throw new Error(`Goodreads ${shelf} feed returned ${res.status}`);
    const items = (await res.text()).match(/<item>[\s\S]*?<\/item>/g) ?? [];
    if (items.length === 0) break;
    for (const item of items) {
      const rating = Number(field(item, 'user_rating'));
      const cover = field(item, 'book_large_image_url');
      books.push({
        goodreadsId: field(item, 'book_id'),
        ...splitTitle(field(item, 'title')),
        author: field(item, 'author_name').replace(/\s+/g, ' '),
        isbn: field(item, 'isbn') || undefined,
        status: SHELVES[shelf],
        rating: rating > 0 ? rating : undefined,
        finished: toDate(field(item, 'user_read_at')),
        // Books without a cover get a "nophoto" placeholder, which looks worse than no cover.
        cover: cover && !cover.includes('nophoto') ? cover : undefined,
        url: `https://www.goodreads.com/book/show/${field(item, 'book_id')}`,
      });
    }
  }
  return books;
}

// First match wins, so the more specific genres come first.
const RULES: [Genre, string[]][] = [
  ['sci-fi', ['science fiction', 'space opera', 'dystopia', 'time travel', 'extraterrestrial', 'cyberpunk', 'space warfare', 'interplanetary']],
  ['finance', ['bitcoin', 'cryptocurrenc', 'money', 'finance', 'investment', 'economics']],
  ['business', ['business', 'management', 'leadership', 'entrepreneur', 'marketing', 'corporate', 'negotiation', 'careers']],
  ['self-help', ['self-help', 'self-actualization', 'self-realization', 'habit', 'conduct of life', 'happiness', 'personal development', 'motivation', 'time management']],
  ['philosophy', ['philosophy', 'meaning of life', 'existential', 'buddhism', 'stoic', 'ethics']],
  ['science', ['science', 'physics', 'biology', 'evolution', 'artificial intelligence', 'genetics', 'climate', 'mathematics', 'cosmology', 'neuroscience', 'astronomy', 'computer']],
  ['fiction', ['fiction', 'novel', 'thriller', 'mystery', 'fantasy', 'literature']],
];

export function genreFromSubjects(subjects: string[]): Genre {
  const text = subjects.join(' | ').toLowerCase();
  return RULES.find(([, words]) => words.some((w) => text.includes(w)))?.[0] ?? 'other';
}

async function openLibrarySubjects(params: Record<string, string>): Promise<string[]> {
  const url = `https://openlibrary.org/search.json?${new URLSearchParams({ ...params, fields: 'subject', limit: '3' })}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'therealmohamed.com bookshelf' } });
    if (!res.ok) return [];
    const { docs = [] } = (await res.json()) as { docs?: { subject?: string[] }[] };
    return docs.find((d) => d.subject?.length)?.subject ?? [];
  } catch {
    return [];
  }
}

/** Looks a book up on Open Library (by ISBN, then title and author) and picks a genre from its subjects. */
export async function guessGenre(book: Pick<FeedBook, 'title' | 'author' | 'isbn'>): Promise<Genre> {
  const title = book.title.split(/[:(]/)[0].trim();
  const searches = [
    ...(book.isbn ? [{ isbn: book.isbn }] : []),
    { title, author: book.author },
    // Looser search, which copes with misspelt titles.
    { q: `${title} ${book.author}` },
  ];
  for (const params of searches) {
    const subjects = await openLibrarySubjects(params);
    if (subjects.length) return genreFromSubjects(subjects);
  }
  return 'other';
}
