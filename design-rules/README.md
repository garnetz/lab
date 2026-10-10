# Design rules, as a Claude skill

These are the rules my portfolio is built to, written so Claude can follow them: a strict 4-column grid, five type styles and nothing else, one accent used sparingly, one easing curve, and copy without clutter or made-up numbers. Taste is easier to share once it's a spec.

## Use it

Copy `SKILL.md` to `~/.claude/skills/gustav-design-rules/SKILL.md` (or into `.claude/skills/` in a project). Claude Code then picks it up whenever you build or review a page, or you can ask for it directly: "check this page against my design rules".

It also has a mode for one request I make a lot: "make it more Scandinavian". Claude makes one pass of lagom (remove one thing from every group), more air, honest materials, warmer neutrals and plainer words, then says what it removed.

## Before and after

On 2026-10-10 I asked Claude to check the [Voice orbs](../voice-orbs) page against the skill. That page was built quickly the same morning, without the rules. Claude found these breaks and fixed each one:

| Rule | What the page did | Fix |
| --- | --- | --- |
| Five type styles, no other sizes | Notes and card captions at 14px | Body size, 16px |
| Type scale per breakpoint | Title sized with `clamp(32px, 6vw, 48px)` | 48 / 40 / 32px at the grid's breakpoints |
| Emphasis by colour, never weight | Selected chips turned bold, and the "big" style was 400 | Same weight; selection shown by fill. Big is 200 |
| Widths from column spans | 1200px max width, 720px intro, 220px canvases | 1440px max; intro in columns 2–3, stage in 1–2, controls in 3–4, one look per column |
| Spacing from four steps | Gaps of 4, 12, 32 and 64px | 8 and 16px inside components, 40/80/120 between sections |
| Margins 40 / 24 / 16px | A fixed 16px margin at every width | Margins follow the breakpoints |
| Radius 4px | 16px cards and pill-shaped chips | 4px |
| Tap targets at least 44px | Chips about 40px tall | 44px minimum |

The fixed page is what's in `voice-orbs/` now.
