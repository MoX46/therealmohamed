// Adds any new Hardcover books to src/data/book-genres.json, guessing a genre for each one.
// Run with `npm run books:genres`, check the guesses, fix any that are wrong, and commit the file.
import { readFile, writeFile } from 'node:fs/promises';
import { fetchShelves, GENRES, guessGenre, type Genre } from '../src/lib/books.ts';

const file = new URL('../src/data/book-genres.json', import.meta.url);
const saved: Record<string, { title: string; genre: Genre }> = JSON.parse(await readFile(file, 'utf8'));

if (!process.env.HARDCOVER_TOKEN) throw new Error('Set HARDCOVER_TOKEN in .env first');
const shelf = await fetchShelves(process.env.HARDCOVER_TOKEN);
const added = [];
for (const book of shelf) {
  if (saved[book.hardcoverSlug]) continue;
  const genre = await guessGenre(book);
  saved[book.hardcoverSlug] = { title: book.title.split(':')[0].trim(), genre };
  added.push(`  ${GENRES[genre].padEnd(11)} ${book.title}`);
}

if (added.length === 0) {
  console.log('Every book already has a genre.');
} else {
  // One book per line, sorted by title, so it's easy to scan and edit.
  const rows = Object.entries(saved)
    .sort(([, a], [, b]) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }))
    .map(([id, entry]) => `  ${JSON.stringify(id)}: ${JSON.stringify(entry)}`);
  await writeFile(file, `{\n${rows.join(',\n')}\n}\n`);
  console.log(`Added ${added.length} book(s) to src/data/book-genres.json. Check these guesses:\n${added.join('\n')}`);
}
