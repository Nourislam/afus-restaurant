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
  with a timer and a colour for late tickets; the cook marks what is ready.
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
```

## Website

The marketing page for Afus Restaurant lives in the Afus company website, alongside the other
programs: [`afus-boutique/site`](../afus-boutique/site) (the `restaurant` page, built to
`/restaurant` and `/fr/restaurant`). Run `npm run build:site` in `afus-boutique` to regenerate it.

## License

MIT — see [LICENSE.txt](LICENSE.txt).
