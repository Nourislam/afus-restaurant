# "A website for every owner, with branches" — multi-tenant patterns (researched 2026-11-11)

## How vendors give each merchant their own site
- Tenant storefronts are served on a **subdomain per tenant** (e.g. `name.platform.tld`) and optionally on the **tenant's own custom domain** (CNAME to the platform, platform-issued SSL) — "their URL, their SSL cert, their brand, zero infrastructure on the customer's side". — https://www.yeshbe.com/blog/designing-multi-tenant-white-labeling-themes-domains-branding ; https://help.deliverect.com/en/articles/8765287-online-ordering-configure-a-custom-domain
- White-label = the whole ordering experience (web, iOS/Android apps, custom domain) carries the restaurant's brand, not the vendor's. — https://partner.foodemp.com/what-is-a-white-label-ordering-system.html ; https://www.mypreorder.com.au/white-label-online-ordering-apps
- Commercial tiering example (PlateForm): Starter = 1 branch + subdomain storefront; Pro = up to 5 branches + custom domain; Scale = unlimited branches + white-label apps. — https://plateform.me/en
- Open-source reference architecture: multi-tenant white-label ordering & delivery (Next.js + Supabase + Stripe Connect). — https://github.com/Chalmers007/ordering-platform

## Branch (multi-location) model that the leaders converge on (from global_leaders.md KQ4)
- Central brand/account owns identity and the **core menu**; each **branch** has its own hours, delivery zones, local settings, **price overrides** and availability, inheriting everything else; corporate vs store roles; cross-branch inventory transfers; **consolidated + per-branch reporting**. Per-location pricing is a universal 2026 expectation.
- Real-time menu sync from one merchant portal to all branches.

## Implications for Afus Restaurant
- Model: Owner account → Restaurant (tenant, slug) → Branches (1..n). Site URL = `https://<slug>.afus-sites.tld` (or `/r/<slug>`), custom domain optional. Site renders the tenant's brand/theme and a branch picker (hours/zone/open state per branch); menu = tenant core menu + branch overrides.
- Publish from the desktop program (one click): generate static site from local data + push to the central host; orders via WhatsApp now (universal, no backend), API/Yassir later.
- Closed state must be **per branch** (each branch has its own hours/toggle).
