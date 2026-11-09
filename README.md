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
- **Basket**: the `basket` array is saved per user in `localStorage` (`basket:<user id>`, dropped on logout and after 24 h), so it survives page changes and reloads. The floating cart button and the cart overlay exist on both `inventaire.html` and `historique.html` (`openBasket()` / `closeBasket()`).
- **Withdrawal** (`confirmWithdrawal()` → `ghCommitFiles()`): stock (`wines.json`) and history (`withdrawals.json`) are written in **one atomic commit** through the Git Data API (read branch head → read both files at that commit → build tree + commit → `PATCH` the branch ref with `force: false`). If someone else committed meanwhile, GitHub refuses the ref update and the whole thing is redone on fresh data (4 attempts). Each withdrawal has an id kept with the saved cart (`pendingId`), so retrying after a lost connection can never record it twice (`resolvePendingWithdrawal()` checks on the next page load). **Do not go back to writing the two files one after the other**: that is what once removed stock without any history entry. The token needs *Contents: read & write*, which covers these endpoints.
- **Toasts**: `showToast(message)` for transient feedback.

## Mobile installation

- The site is a Progressive Web App. The install button exists only on the login page (`index.html`); the other pages have none. `manifest.webmanifest`, the icons, and `service-worker.js` provide install metadata and cache the app shell; wine/user data is still fetched from GitHub and is not cached offline.
- GitHub Pages serves the site over HTTPS, which is required for installation and service workers. Android/desktop browsers can use **Installer l’application**. On iPhone/iPad, open the site in Safari and choose **Partager → Sur l’écran d’accueil**.
- The Pages workflow copies the manifest, service worker, and icons into the deploy artifact.
- Fields the user types in must stay at **16px or more on touch screens** (see the `@media (max-width: 768px), (pointer: coarse)` block in `styles.css`), otherwise iPhone Safari zooms the page on focus and stays zoomed.
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
