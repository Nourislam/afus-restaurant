# Phase 7 — Boutique shell parity: one-screen layout, collapsible menu, no page scroll

**Goal.** The program looks and behaves like Afus Boutique: same window shell, same
collapsible menu, same page frame, same tabs — and **nothing scrolls except the one
region that owns the data**. Verified with the `ui-ux-pro-max` rule set (layout,
navigation, animation, accessibility priorities 1–9).

## What Boutique does (the reference)

| Piece | Boutique |
|---|---|
| Shell | `h-screen w-screen flex flex-col overflow-hidden` → TitleBar (full width) → `flex-1 flex overflow-hidden` → Sidebar + `main overflow-hidden` |
| Page scroll | `html, body, #root { overflow: hidden }`; `.page` = `h-full flex flex-col overflow-hidden`; `.page-body` = `flex-1 overflow-y-auto p-6` |
| Menu | `w-16` ↔ `w-56`, toggled **by clicking the shop header itself** (no separate button), remembered in `localStorage`, tooltips via portal while collapsed, groups split by hairlines, Settings + Logout pinned at the bottom |
| Menu fit | `.sidebar-item` shrinks at `max-height: 820px` and `760px` so every entry fits without scrolling on a 1024×720 screen |
| Page title | **Not repeated** — the page's name is the highlighted menu item. The top row carries tabs/tools + actions on one 40 px line. `hero` only on the dashboard |
| Tabs | `.segmented` pills (32 px inside a 40 px rail); tabs that do not fit fold into a "More" menu, never a second line |
| Controls | one height per size: `.btn`/`.input` = 40 px |
| Grids | `repeat(auto-fill, minmax(min(100%, Xrem), 1fr))` so a grid follows the room it really has, not the window |

## Decisions for the restaurant

1. **Same shell, same CSS contract.** `.page`, `.page-body`, `.sidebar-item`, `.segmented`,
   `.fit-grid*`, `.thin-scroll` are added with Boutique's exact behaviour, on top of the
   restaurant's existing `ink-*` / `dark:` token classes (no page rewrite needed).
2. **No window scroll anywhere.** `overflow: hidden` on the document; every screen is a
   `.page` whose `.page-body` is the only scroller. Tables scroll inside their own box with
   a sticky header, so the toolbar and totals never leave the screen.
3. **Collapsible menu, Boutique gesture.** The restaurant card at the top of the menu is the
   toggle. Collapsed = 64 px icon rail with portal tooltips (`aria-label` + `role="tooltip"`),
   open = 240 px. Remembered per machine. Group labels are dropped in favour of hairlines —
   that alone frees ~90 px of vertical space, which is what makes the 18-entry menu fit.
4. **Compact page toolbar.** `PageHeader` becomes a single 40 px row: small title, then the
   page's own tabs/filters, then its actions at the end. The old two-line title + subtitle
   block is kept only behind `hero` (dashboard). ~80 px back on every screen.
5. **Settings becomes tabbed.** The four blocks (restaurant, receipt & printing, fiscal
   compliance, backups) were one long scroll; they become four tabs, each fitting one screen.
6. **Window bar carries the global switches.** Simple/full mode, language and theme move to
   the title bar as 28 px icon buttons, with the clock centred like Boutique. The menu keeps
   only navigation, Settings and Logout.

## Accessibility and motion (from the rule set)

- Every icon-only control has an `aria-label`; the collapsed menu also exposes the name as a
  tooltip on hover **and on keyboard focus**.
- `aria-expanded` on the menu toggle, `role="tablist"` / `aria-selected` on tabs,
  `aria-current` from `NavLink`.
- Transitions are 150–200 ms on `width`, `transform` and `opacity` only; the existing
  `prefers-reduced-motion` block disables them.
- Active menu entry is marked by colour **and** a 3 px indigo rail, never colour alone.

## Website

The storefront gets the same treatment it earns as a public page: a sticky one-line order
bar so the basket is always reachable, in-page category jumps, and a fixed-height cart sheet
instead of a growing page.
