# MyVinothèque (repo: cave-familiale)

Système d'administration de la cave à vin familiale : consultation de l'inventaire, filtrage/tri, retrait de bouteilles (panier), et historique des retraits. The app is called **MyVinothèque** in the UI; the repo and GitHub Pages path keep the name `cave-familiale`.

This README is written for an AI assistant (or a new contributor) picking up this repo cold, so it can make correct edits fast.

## Stack & architecture

- **No build step, no framework.** Plain HTML + CSS + vanilla JS (`app.js`), loaded directly via `<script src="app.js">` on every page.
- **No backend server.** The GitHub repo itself is the database: `app.js` reads/writes JSON files under `data/` using the **GitHub Contents API** (`ghRead` / `ghWrite` in `app.js`). Every "write" (a withdrawal, a login timestamp) is a real git commit to the `main` branch of `elcomiqu321/cave-familiale`.
- **3 pages**, each a standalone HTML file that calls one `init...()` function from `app.js` on `body onload`:
  - `index.html` — login form (`personalId` + shared `cellarKey`) and the only place with the **Installer l’application** button. On success, stores the matched user object in `localStorage.currentUser` and redirects to `inventaire.html`. If `currentUser` is already stored, an inline script in `<head>` redirects straight to `inventaire.html` (users stay logged in until they press *Déconnexion*).
  - `inventaire.html` — main screen: filterable/sortable wine table, quantity inputs, "add to basket" per row, an always-visible floating cart button, the cart panel (an overlay above the page, with the checkout buttons always on screen) and the "confirm withdrawal" flow.
  - `historique.html` — read-only list of past withdrawals (`data/withdrawals.json`).
- All UI text/labels are in **French**. Keep new UI copy in French to stay consistent.
- Functions are defined globally in `app.js` and wired up via inline `onclick="..."` / `oninput="..."` attributes in the HTML — there's no event-listener-based component system. Follow this existing pattern rather than introducing one (no modules, no bundler, no framework).

## Data model (`data/*.json`)

- `data/wines.json` — array of wine objects: `id` (uuid), `appellation`, `cru` (nullable), `climat` (nullable, the workbook's Climat/Cuvée), `millesime` (year, number), `couleur` (`"Rouge"` | `"Blanc"`), `origine`, `emplacement` (cellar location code — currently an empty string on every wine; the field and the Emplacement column are kept, and the table shows it blank), and `quantite` (int).
- `data/users.json` — array: `id`, `full_name`, `personal_id` (login username), `last_connection_at`.
- `data/withdrawals.json` — array of withdrawal events: `id`, `user_id`, `user_name`, `withdrawn_at`, `items[]` (snapshot of wine info + `quantity` withdrawn at the time).
- Only wines with `quantite > 0` are shown in the inventory table (`renderWines` filters them out otherwise).

## Key flows in `app.js`

- **Auth**: `checkLogin()` looks up `personal_id` in `data/users.json` and checks the shared key against the literal string `"pvs"`. This is not real security — anyone with the shared key and any valid personal ID can log in, and there's no server-side session. `requireLogin()` / `logout()` gate pages via `localStorage`; the session has no expiry, so users stay signed in until they log out.
- **Inventory**: `fetchWines()` → `window.allWines`. `refreshView()` is the single render entry point: it applies the selected filters (`selectedFilters`) and the current sort (`currentSort`), then updates the table, the result count / filter chips and the filter buttons. `applyFilters()` and `sortWines(column)` just update their state and call it. Each filter is a button opening a checkbox list (search box when long; counts reflect the other active filters; bottom sheet on small screens).
- **Basket**: client-side only (`basket` array in memory; the floating cart button is always shown, `openBasket()` / `closeBasket()` toggle the overlay) until `confirmWithdrawal()` runs — that re-reads `wines.json` + `withdrawals.json` fresh (to get current SHAs), decrements quantities, appends a withdrawal record, and writes both files back via `ghWrite`.
- **Toasts**: `showToast(message)` for transient feedback.

## Mobile installation

- The site is a Progressive Web App. The install button exists only on the login page (`index.html`); the other pages have none. `manifest.webmanifest`, the icons, and `service-worker.js` provide install metadata and cache the app shell; wine/user data is still fetched from GitHub and is not cached offline.
- GitHub Pages serves the site over HTTPS, which is required for installation and service workers. Android/desktop browsers can use **Installer l’application**. On iPhone/iPad, open the site in Safari and choose **Partager → Sur l’écran d’accueil**.
- The Pages workflow copies the manifest, service worker, and icons into the deploy artifact.
- `service-worker.js` serves `app.js` / `styles.css` cache-first, so **bump `CACHE_NAME` whenever those files change**, otherwise installed copies keep running the old version.

## Styling (`styles.css`)

- One global stylesheet, wine-themed CSS variables at the top (`--burgundy`, `--gold`, `--cream`, ...).
- The stylesheet used to be pasted twice back-to-back; it is now a single copy, so each selector lives in one place.

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
