---
name: gustav-design-rules
description: Gustav Arnetz's design rules for web interfaces (grid, type scale, colour, motion, copy). Use when building or reviewing any page or component that should look and behave like arnetz.design, or when asked to check work against these rules.
---

# Design rules

These are the rules arnetz.design is built to. Follow them when you build, and check against them before you call anything done. If a rule and a request conflict, follow the request and say which rule it breaks.

## Grid

- Everything sits on a 4-column grid. Margins and gaps are 40px from 1200px wide, 24px from 810px, and 16px below that. The maximum width is 1440px.
- Widths come from column spans, never from ad-hoc pixel widths or max-widths. Text runs across columns 2–3, quotes across 3–4, and images span 3 or 4 columns. On phones everything takes the full width.
- Vertical space comes from four steps only: 200, 120, 80 and 40px on desktop, which become 160/96/64/40 on tablets and 120/64/48/24 on phones.
- Rows that list things (Lab, Writing, services) put the label in column 1, the title across 2–4, and the text in 2–3.

## Type

- One family. There are five styles and no other sizes or weights:

  | Style | Size (desktop / tablet / phone) | Weight | Use |
  | --- | --- | --- | --- |
  | h1 | 72 / 64 / 44px | 400 | Page and section titles |
  | h3 | 48 / 40 / 32px | 400 | Case, row and stat titles |
  | big | 24px | 200 | Lead text, intros, captions |
  | label | 16px | 400 | Small headings, dates, meta |
  | body | 16px | 200 | Everything else |

- Emphasis comes from colour (full ink against grey), never from weight. Bold is 400.
- Headings get `text-wrap: balance` and paragraphs get `text-wrap: pretty`.

## Colour

- There are five tokens: background, surface, ink (90% opacity), muted (60%) and accent `#f1441d`. Dark mode swaps the same tokens and respects an explicit light or dark choice.
- The accent is only for links, the current menu item, focus rings, text selection and the one primary action. Secondary things are grey, never orange.
- Radius is 4px.

## Motion

- Use one easing curve: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Things appear with a 32px rise over about a second, staggered when they enter together. Hovers take 0.2–0.4s. Links draw their underline in from the left.
- Under `prefers-reduced-motion`, everything that moves on its own stops. Content must be visible without JavaScript.

## Details

- Small live touches are welcome, like a clock, a grid overlay on G, or a player. Each one must be finished: every state, loading, keyboard and screen-reader access, reduced motion, phones, and dark mode.
- Focus is always visible: a 2px accent outline.
- Tap targets are at least 44px on touch screens.

## Copy

- Be plain, short and active. Cut any sentence that doesn't change what the reader does next.
- No clutter. Don't add labels, badges or footer lines nobody asked for.
- No made-up numbers. Only show figures that were measured, and say what was measured.
- When a fact is missing, leave a visible placeholder. Never invent one.

## Make it more Scandinavian

When asked to make something "more Scandinavian" (or calmer, or more Nordic), make one pass with these moves, then run the checks below:

- **Lagom.** Remove one thing from every group: a button, a line of copy, an icon, a border. Stop when nothing else can go without losing meaning.
- **Light and air.** Step spacing up one level (40 becomes 80, 80 becomes 120). Let one element have a whole row to itself.
- **Function first.** Every element earns its place by doing something. Decoration that does nothing goes.
- **Honest materials.** Use real photos, real data and real words. No fake depth, glows, glass or gradients unless they say something about state.
- **Quiet colour.** Warm the neutrals slightly (paper, not pure white; soft black, not pure black). The accent appears once per screen at most.
- **Plain, warm words.** Use short sentences in the second person, with no exclamation marks and no hype. Say what happens, then stop.
- **Slow, soft motion.** Make transitions a little longer and gentler. Nothing bounces.

Say which moves you applied, and what you removed.

## Before you call it done

1. Search the styles for any `font-size` or `font-weight` outside the scale, any colour that isn't a token, and any fixed pixel width.
2. Look at 390, 834 and 1440px wide, in light and dark, with reduced motion on.
3. Press G and check that edges land on column lines.
4. Read every line of copy out loud once, and cut what you can.
