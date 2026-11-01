// Reads your shelves from Hardcover's API and works out a genre for each book.
// Used by the `hardcover` collection in src/content.config.ts and by scripts/sync-book-genres.ts.

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

// The shelves shown on the site, by Hardcover status id. "Want to Read" is left out on purpose.
export const SHELVES = { 2: 'reading', 3: 'read' } as const;

export interface ShelfBook {
  hardcoverSlug: string;
  title: string;
  series?: string;
  author: string;
  isbn?: string;
  status: 'reading' | 'read';
  rating?: number;
  finished?: string;
  cover?: string;
  url: string;
  /** Hardcover's genre tags, e.g. "Science Fiction". Used to guess a genre. */
  tags: string[];
}

/**
 * Titles can carry the series and subtitle, e.g. "Final Orbit (The Apollo Murders (Kaz Zemeckis) Book 3)"
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

const QUERY = `{
  me {
    user_books(where: { status_id: { _in: [${Object.keys(SHELVES)}] } }) {
      status_id
      rating
      last_read_date
      user_book_reads(order_by: { finished_at: desc_nulls_last }, limit: 1) { finished_at }
      edition { isbn_13 isbn_10 image { url } }
      book {
        title
        slug
        image { url }
        contributions { contribution author { name } }
        featured_book_series { position series { name } }
        cached_tags
      }
    }
  }
}`;

interface UserBook {
  status_id: keyof typeof SHELVES;
  rating: number | null;
  last_read_date: string | null;
  user_book_reads: { finished_at: string | null }[];
  edition: { isbn_13: string | null; isbn_10: string | null; image: { url: string } | null } | null;
  book: {
    title: string;
    slug: string;
    image: { url: string } | null;
    contributions: { contribution: string | null; author: { name: string } }[];
    featured_book_series: { position: number | null; series: { name: string } } | null;
    cached_tags: { Genre?: { tag: string }[] } | null;
  };
}

/** Every book on the shelves above, for the account the token belongs to. */
export async function fetchShelves(token: string): Promise<ShelfBook[]> {
  const res = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: {
      // Hardcover shows the token with "Bearer " in front, so accept it either way.
      authorization: `Bearer ${token.replace(/^Bearer\s+/i, '')}`,
      'content-type': 'application/json',
      'user-agent': 'therealmohamed.com bookshelf',
    },
    body: JSON.stringify({ query: QUERY }),
  });
  if (!res.ok) throw new Error(`Hardcover returned ${res.status}${res.status === 401 ? ' (is HARDCOVER_TOKEN expired?)' : ''}`);
  const { data, errors } = (await res.json()) as { data?: { me: { user_books: UserBook[] }[] }; errors?: { message: string }[] };
  if (errors?.length || !data?.me[0]) throw new Error(`Hardcover query failed: ${errors?.map((e) => e.message).join('; ') ?? 'no user'}`);

  return data.me[0].user_books.map(({ status_id, rating, last_read_date, user_book_reads, edition, book }) => {
    const authors = book.contributions.filter((c) => !c.contribution || c.contribution === 'Author');
    const series = book.featured_book_series;
    return {
      hardcoverSlug: book.slug,
      title: splitTitle(book.title).title,
      series: !series ? undefined : series.position == null ? series.series.name : `${series.series.name} #${series.position}`,
      author: (authors[0] ?? book.contributions[0])?.author.name ?? 'Unknown',
      isbn: edition?.isbn_13 || edition?.isbn_10 || undefined,
      status: SHELVES[status_id],
      // Hardcover allows half stars; the site shows whole ones.
      rating: rating ? Math.round(rating) : undefined,
      finished: SHELVES[status_id] === 'read' ? (user_book_reads[0]?.finished_at ?? last_read_date ?? undefined) : undefined,
      cover: edition?.image?.url ?? book.image?.url ?? undefined,
      url: `https://hardcover.app/books/${book.slug}`,
      tags: book.cached_tags?.Genre?.map((t) => t.tag) ?? [],
    };
  });
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

/**
 * Looks a book up on Open Library (by ISBN, then title and author) and picks a genre from its subjects.
 * Newer books often have no subjects there, so fall back to Hardcover's genre tags, most-used first.
 */
export async function guessGenre(book: Pick<ShelfBook, 'title' | 'author' | 'isbn' | 'tags'>): Promise<Genre> {
  const title = book.title.split(/[:(]/)[0].trim();
  const searches = [
    ...(book.isbn ? [{ isbn: book.isbn }] : []),
    { title, author: book.author },
    // Looser search, which copes with misspelt titles.
    { q: `${title} ${book.author}` },
  ];
  for (const params of searches) {
    const subjects = await openLibrarySubjects(params);
    if (!subjects.length) continue;
    const genre = genreFromSubjects(subjects);
    if (genre !== 'other') return genre;
    break;
  }
  return book.tags.map((tag) => genreFromSubjects([tag])).find((g) => g !== 'other') ?? 'other';
}
