# Afus Restaurant

**Afus Restaurant** is the [Afus](https://github.com/Nourislam) application for restaurants, cafés
and fast-foods in Algeria: an offline front-of-house and kitchen manager for Windows and macOS
(Electron + React + TypeScript + SQLite). The live table plan, the point of sale, the kitchen
display, delivery, reservations, menu and recipes, stock and reports all live in a local database
on the restaurant's computer. It works without an account and without internet.

> **بالعربية:** Afus Restaurant برنامج من شركة Afus للمطاعم والمقاهي والفاست فود في الجزائر: مخطط
> الطاولات الحيّ، نقطة البيع، شاشة المطبخ، التوصيل، الحجوزات، القائمة والوصفات، المخزون والتقارير.
> يعمل بدون إنترنت وبدون حساب، وكل البيانات تبقى على حاسوب المطعم. بالعربية والفرنسية.

It shares the **Afus design language** with Afus Boutique and Afus Hanout — the dark-first neutral
surfaces, the indigo accent, bundled Inter + Cairo fonts, and the same component and layout
conventions — so the three programs feel like one family.

## Features

- **Live table plan** – dining areas and tables with their colour and status (free, occupied,
  reserved, cleaning). Occupied tables pulse; open the order with one click. Cards animate in.
- **Fast point of sale** – most-ordered dishes first, portions and modifiers in a click, split the
  bill between guests, cash / card / transfer.
- **Kitchen display** – every order reaches the kitchen sorted by station (grill, pizza, dessert)
  with a timer and a colour for late tickets, and a mark saying whether it is already paid for; the
  cook marks what is ready.
- **Both orders of business** – a guest at a table settles at the end, and a guest at the counter
  pays before the grill is lit. Each kind of order (dine-in, takeaway, delivery, pre-order) has its
  own setting, a prepaid order fires itself to the kitchen the moment the money is in, and it closes
  when the last dish is served.
- **Delivery & reservations** – delivery orders with address, phone and driver; table reservations
  by name, time and party size.
- **Menu & recipes** – dishes by category with photos and prices; a recipe with its ingredients so
  stock is deducted automatically with every dish.
- **Stock, staff & cash** – raw materials and what runs low, per-employee codes and permissions
  (waiter, cook, cashier), and a daily cash close.
- **Reports** – real profit after food cost, best and worst dishes, average ticket, rush hours.
- **Bilingual, offline, verified** – Arabic (RTL) and French, works offline, and the program
  re-checks every ticket and stock figure and warns only you if something is off.

## Stack

Electron + Vite (electron-vite), React 18 + TypeScript, Tailwind CSS, SQLite via **sql.js** with a
versioned SQL schema, Zod for validation, Zustand for state, Recharts for charts. Fonts (Inter and
Cairo variable) are bundled, so the app looks the same on Windows and macOS without internet.

## Develop

```bash
npm install
npm run dev          # electron-vite dev (hot reload)
npm run typecheck    # tsc --noEmit
npm run test         # vitest
npm run build        # typecheck + production build
npm run dist:mac     # package a macOS build
npm run dist:win     # package a Windows build
npm run build:demo   # the web demo -> dist-demo/ (see below)
```

## Website and the web demo

The marketing page for Afus Restaurant lives in the Afus company website, alongside the other
programs: [`afus-boutique/site`](../afus-boutique/site) (the `restaurant` page, built to
`/restaurant` and `/fr/restaurant`). Run `npm run build:site` in `afus-boutique` to regenerate it.

That page offers the program to try, and the trial is this program: `demo-web/` builds the real
main process, the real bridge and the real screens into one browser page, with Electron and Node
played by small shims and SQLite compiled to WebAssembly. It opens on a demo restaurant in the
middle of a service — tables occupied, tickets on the kitchen board, weeks of sealed sales —
built by the program's own services in [`src/main/services/demo.ts`](src/main/services/demo.ts).
Nothing leaves the page and nothing is kept: a reload gives the same restaurant, new.

```bash
npm run build:demo                       # here  -> dist-demo/
cd ../afus-boutique && npm run build:site  # copies it to dist-site/demo-restaurant/
```

## License

MIT — see [LICENSE.txt](LICENSE.txt).
