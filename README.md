# therealmohamed.com

My personal site: rabbit holes, books and thoughts. Built with [Astro](https://docs.astro.build).

## Running it

```sh
npm run dev      # preview at http://localhost:4321 (updates as you save)
npm run build    # build the final site into dist/
```

## One-time setup: strip photo locations (required)

This repo is public, and phone photos usually contain the GPS location where
they were taken. A git hook in `.githooks/pre-commit` removes that location
data from photos automatically on every commit (nothing else about the photo
changes). Git doesn't turn hooks on by itself, so **run this once on every
computer you clone the repo to:**

```sh
git config core.hooksPath .githooks
```

It needs `exiftool` (`sudo pacman -S perl-image-exiftool` on Arch/Omarchy,
`brew install exiftool` on macOS). If exiftool is missing, the hook blocks the
commit instead of letting a located photo through. Commits print
`pre-commit: removed location data from …` whenever a photo gets cleaned.

To check it's active: `git config core.hooksPath` should print `.githooks`.

## Adding things

Everything lives in `src/content/`. Each section has a `_template` to copy;
anything starting with `_` never appears on the site.

| I want to…                  | Do this                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| Start a new rabbit hole     | Copy `rabbit-holes/_template/` to `rabbit-holes/<name>/`, edit `index.md` |
| Post an update              | Add `rabbit-holes/<name>/YYYY-MM-DD-short-title.md`                      |
| Pause / finish a rabbit hole | Change `status:` to `paused` or `done` in its `index.md`                 |
| Show it on the home page    | Set `featured: true` (or `false` to remove it)                           |
| Log a book                  | Shelve it on Goodreads; the site picks it up on the next daily rebuild  |
| Add a take, summary or fix  | Copy `books/_template.md` to `books/<title>.md` and set `goodreadsId`    |
| Write a book summary        | Write below the `---` in the book's file; it gets its own page          |
| Give new books a genre      | Run `npm run books:genres`, check the guesses, commit `src/data/book-genres.json` |
| Share a thought             | Copy `thoughts/_template.md` to `thoughts/<title>.md`                   |
| Hide something for now      | Add `draft: true` (shows in `npm run dev`, hidden on the live site)     |
| Publish a draft             | Delete the `draft: true` line                                           |

**Photos:** put them in the same folder as the Markdown file and refer to them
with `./photo.jpg` (e.g. `before: ./before.jpg` on a rabbit hole, `image: ./photo.jpg`
on an update). Astro resizes and optimizes them automatically.

**Typos are caught:** if a field is wrong (say `status: actve`), the dev server
shows an error telling you which file and field to fix.

## Where things are

- `src/site.ts`: name, tagline, footer links
- `src/pages/about.md`: the About page
- `src/styles/global.css`: colors (top of file), fonts and layout
- `src/pages/`, `src/layouts/`, `src/components/`: page templates
