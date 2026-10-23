---
# TEMPLATE: copy this whole _template folder, rename it (e.g. "on-starting-things"),
# and fill it in. Folders starting with "_" never appear on the site.
# Images and data files for the post go in the same folder.
title: "Title of the thought"
date: 2026-10-14
description: "An opening line that makes someone want to read the rest."
draft: false                      # true = hidden from the site
---

Write here. Everything below is a cheat sheet: keep what you need, delete the rest.

## Math

Inline math goes between single dollar signs: $A = P(1 + r)^t$.

An equation on its own line goes between double dollar signs. Add `\tag{1}` to number it:

$$
A = P\left(1 + \frac{r}{n}\right)^{nt} \tag{1}
$$

## Links

A [link to another thought](/thoughts/example-thought/) or a
[link to another site](https://en.wikipedia.org/wiki/Compound_interest).
Links to other sites get a small arrow on their own.

## Images

An image on its own line, with a caption in quotes, becomes a numbered figure:

![Describe the image for people who can't see it](./photo.jpg "The caption shown under the image.")

## Charts

A chart block is drawn by the site. Charts are numbered along with images.

```chart
type: line                        # line, bar or scatter
caption: 1,000 growing by 7% a year, against adding 70 a year.
x: { label: Year }                # optional: label, min, max
y: { label: Value }
series:                           # up to 4
  - name: 7% compounded
    fn: 1000 * 1.07^x             # a formula in x…
    from: 0
    to: 30
  - name: +70 a year
    data: [[0, 1000], [30, 3100]] # …or points as [x, y]
```

Formulas understand + - * / ^, brackets, pi, e and
sin cos tan asin acos atan sqrt abs exp ln log floor ceil round. `2x` means 2 * x.

For a bar chart, x is a label:

```chart
type: bar
caption: Books read each year.
series:
  - name: Books
    data: [["2024", 9], ["2025", 14], ["2026", 11]]
```

For more data, use a CSV file in the post's folder. The first column is x (numbers, or dates like
2025-03-01), and every other column becomes a series named by its header:

```text
data: ./savings.csv
```

While previewing with `npm run dev`, editing a CSV restarts the preview server and redraws the
chart, which takes a few seconds.

## Notes and references

Put a marker in the text where a note belongs.[^why] The note itself can go anywhere in the file,
and they're numbered in order and collected at the bottom under "Notes & references", which
starts closed. Clicking a note's number in the text opens it.

Use notes for sources too.[^book]

[^why]: A note with more context. It can hold math like $r_t$, and [links](https://example.com).
[^book]: Author, *Title*, Publisher, Year, p. 00.
