# cave-familiale

Système d'administration de la cave à vin familiale : consultation de l'inventaire, filtrage/tri, retrait de bouteilles (panier), et journal des retraits.

This README is written for an AI assistant (or a new contributor) picking up this repo cold, so it can make correct edits fast.

## Stack & architecture

- **No build step, no framework.** Plain HTML + CSS + vanilla JS (`app.js`), loaded directly via `<script src="app.js">` on every page.
- **No backend server.** The GitHub repo itself is the database: `app.js` reads/writes JSON files under `data/` using the **GitHub Contents API** (`ghRead` / `ghWrite` in `app.js`). Every "write" (a withdrawal, a login timestamp) is a real git commit to the `main` branch of `elcomiqu321/cave-familiale`.
- **3 pages**, each a standalone HTML file that calls one `init...()` function from `app.js` on `body onload`:
  - `index.html` — login form (`personalId` + shared `cellarKey`). On success, stores the matched user object in `localStorage.currentUser` and redirects to `inventaire.html`.
  - `inventaire.html` — main screen: filterable/sortable wine table, quantity inputs, "add to basket" per row, floating basket panel, "confirm withdrawal" flow.
  - `journal.html` — read-only list of past withdrawals (`data/withdrawals.json`).
- All UI text/labels are in **French**. Keep new UI copy in French to stay consistent.
- Functions are defined globally in `app.js` and wired up via inline `onclick="..."` / `oninput="..."` attributes in the HTML — there's no event-listener-based component system. Follow this existing pattern rather than introducing one (no modules, no bundler, no framework).

## Data model (`data/*.json`)

- `data/wines.json` — array of wine objects: `id` (uuid), `appellation`, `climat` (nullable), `millesime` (year, number), `couleur` (`"Rouge"` | `"Blanc"`), `origine`, `emplacement`, `quantite` (int), `categorie`.
- `data/users.json` — array: `id`, `full_name`, `personal_id` (login username), `last_connection_at`.
- `data/withdrawals.json` — array of withdrawal events: `id`, `user_id`, `user_name`, `withdrawn_at`, `items[]` (snapshot of wine info + `quantity` withdrawn at the time).
- Only wines with `quantite > 0` are shown in the inventory table (`renderWines` filters them out otherwise).

## Key flows in `app.js`

- **Auth**: `checkLogin()` looks up `personal_id` in `data/users.json` and checks the shared key against the literal string `"pvs"`. This is not real security — anyone with the shared key and any valid personal ID can log in, and there's no server-side session. `requireLogin()` / `logout()` gate pages via `localStorage`.
- **Inventory**: `fetchWines()` → `window.allWines`. `applyFilters()` reads filter inputs and produces `window.filteredWines`, then calls `renderWines()`. `sortWines(column)` sorts whichever of `filteredWines`/`allWines` is currently active and re-renders.
- **Basket**: client-side only (`basket` array in memory) until `confirmWithdrawal()` runs — that re-reads `wines.json` + `withdrawals.json` fresh (to get current SHAs), decrements quantities, appends a withdrawal record, and writes both files back via `ghWrite`.
- **Toasts**: `showToast(message)` for transient feedback.

## Styling (`styles.css`)

- One global stylesheet, wine-themed CSS variables at the top (`--burgundy`, `--gold`, `--cream`, ...).
- **Known issue**: the entire stylesheet content is duplicated back-to-back in the file (roughly lines 1–611 and 612–1198 are near-identical copies, with a small drift — the second copy is missing the `.wines-table th.sortable` / `.sort-arrow` rules). This looks like an accidental paste rather than intentional (e.g. a light/dark variant). Because CSS cascades, the *second* copy generally wins for duplicated selectors. When editing shared selectors (`.filters`, `.top-nav`, `.basket-*`, etc.), check both locations or you may edit the half that gets overridden. Consider deduplicating this file next time it's touched, after confirming with the user.

## Known issues / things to flag before "fixing" silently

- `app.js` has a **hardcoded GitHub Personal Access Token** (`GITHUB_TOKEN`, split into `_a`/`_b` strings) committed directly in client-side JS. Anyone who opens the browser dev tools or views source can extract it and get repo write access. This should ideally move to a backend/proxy or a serverless function with a short-lived token, but that's a real architecture change — don't silently "fix" it without checking with the user first, since it may break the no-backend deploy model this project relies on.
- `.github/workflows/keep-alive.yml` pings a **Supabase** REST endpoint on a cron schedule, but nothing in `app.js` actually talks to Supabase (storage is GitHub Contents API, per above). This workflow looks vestigial/leftover from an earlier architecture — confirm with the user before removing it.
- The shared "cellar key" (`"pvs"`) is hardcoded in `app.js` as a plain string.

## Conventions to follow when editing

- Keep everything framework-free and dependency-free unless explicitly asked to add a build step.
- Keep new global functions attached the same way (defined in `app.js`, invoked via inline HTML attributes) unless asked to refactor.
- Keep UI copy in French.
- Match the existing CSS variable palette and class-naming style (`.filters`, `.wines-table`, `.basket-*`, etc.) rather than introducing a new design language.
- `data/*.json` files are the production data (fetched live from GitHub at `main`), not fixtures — be careful with scripts that read them locally vs. what runs in the browser via the API.
