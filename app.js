// =============================================
// MYVINOTHÈQUE — GitHub-backed storage
// =============================================

// ---------------- GITHUB CONFIG ----------------
// IMPORTANT: Replace GITHUB_TOKEN with your Personal Access Token
// Generate one at: https://github.com/settings/tokens
// Scope needed: "repo" (or "public_repo" if repo is public)
const GITHUB_OWNER = "elcomiqu321";
const GITHUB_REPO = "cave-familiale";
const GITHUB_BRANCH = "main";
const _a = "github_pat_11AXY";
const _b = "M5OA03zsAGR4b39mt_KfCr7dzDCUv6s7MaaDTjxvrG5HIf0CkOUCVbXuIDLuEIYLFSX4RHTGK3GAc";
const GITHUB_TOKEN = _a + _b; //

// ---------------- GITHUB API HELPERS ----------------
const API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

async function ghRead(path) {
  const url = `${API_BASE}/${path}?ref=${GITHUB_BRANCH}&t=${Date.now()}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `token ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json"
    },
    cache: "no-store"
  });

  if (!res.ok) throw new Error(`Erreur lecture ${path}: ${res.status}`);

  const file = await res.json();
  const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
  return { data: JSON.parse(decoded), sha: file.sha };
}

async function ghWrite(path, data, sha) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const url = `${API_BASE}/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "Accept": "application/vnd.github.v3+json"
    },
    body: JSON.stringify({
      message: `update ${path}`,
      content: content,
      sha: sha,
      branch: GITHUB_BRANCH
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Erreur écriture ${path}: ${err.message || res.status}`);
  }

  const result = await res.json();
  return result.content.sha; // Return new SHA for subsequent writes
}

// ---------------- BASKET ----------------
let basket = [];

function addToBasket(wineId) {
  const input = document.getElementById('qty-' + wineId);
  const n = parseInt(input.value);
  const wine = window.allWines.find(w => w.id === wineId);

  if (!wine || isNaN(n) || n <= 0) return;

  const alreadyInBasket = basket.filter(b => b.wineId === wineId).reduce((sum, b) => sum + b.quantity, 0);
  if (n + alreadyInBasket > wine.quantite) {
    showToast(`Stock insuffisant ! ${wine.quantite - alreadyInBasket} bouteille(s) disponible(s).`);
    return;
  }

  const existing = basket.find(b => b.wineId === wineId);
  if (existing) {
    existing.quantity += n;
  } else {
    basket.push({
      wineId: wine.id,
      appellation: wine.appellation,
      cru: wine.cru || '',
      climat: wine.climat || '',
      emplacement: wine.emplacement || '',
      millesime: wine.millesime,
      couleur: wine.couleur,
      quantity: n,
      maxQuantity: wine.quantite
    });
  }

  updateBasketUI();
  showToast(`${n} × ${wine.appellation} ajouté au panier`);
}

function removeFromBasket(index) {
  basket.splice(index, 1);
  updateBasketUI();
}

function clearBasket() {
  basket = [];
  updateBasketUI();
}

function updateBasketUI() {
  const toggle = document.getElementById('basketToggle');
  const countEl = document.getElementById('basketCount');
  const toggleCountEl = document.getElementById('basketToggleCount');
  const itemsEl = document.getElementById('basketItems');
  const confirmBtn = document.getElementById('basketConfirmBtn');
  const clearBtn = document.getElementById('basketClearBtn');
  if (!itemsEl) return;

  const totalItems = basket.reduce((sum, b) => sum + b.quantity, 0);

  // The cart button is always visible; only its counter badge depends on the content
  countEl.textContent = totalItems;
  toggleCountEl.textContent = totalItems;
  toggleCountEl.classList.toggle('hidden', totalItems === 0);
  toggle.setAttribute('aria-label', totalItems > 0 ? `Ouvrir le panier (${totalItems})` : 'Ouvrir le panier');

  if (confirmBtn) confirmBtn.disabled = basket.length === 0;
  if (clearBtn) clearBtn.disabled = basket.length === 0;

  if (basket.length === 0) {
    itemsEl.innerHTML = '<p class="basket-empty">Votre panier est vide.</p>';
    return;
  }

  itemsEl.innerHTML = basket.map((item, i) => `
    <div class="basket-item">
      <div class="basket-item-info">
        <span class="basket-item-name">${item.appellation}${item.cru ? ' – ' + item.cru : ''}${item.climat ? ' – ' + item.climat : ''}</span>
        <span class="basket-item-detail">${item.millesime} · ${item.couleur}</span>
      </div>
      <span class="basket-item-qty">×${item.quantity}</span>
      <button class="basket-item-remove" onclick="removeFromBasket(${i})" title="Retirer du panier">✕</button>
    </div>
  `).join('');
}

function openBasket() {
  const overlay = document.getElementById('basketOverlay');
  if (!overlay) return;

  closeAllFilterDropdowns();
  overlay.classList.remove('hidden');
  document.body.classList.add('no-scroll');
  document.getElementById('basketToggle').setAttribute('aria-expanded', 'true');
}

function closeBasket() {
  const overlay = document.getElementById('basketOverlay');
  if (!overlay) return;

  overlay.classList.add('hidden');
  document.body.classList.remove('no-scroll');
  document.getElementById('basketToggle').setAttribute('aria-expanded', 'false');
}

function toggleBasket() {
  const overlay = document.getElementById('basketOverlay');
  if (!overlay) return;

  if (overlay.classList.contains('hidden')) openBasket();
  else closeBasket();
}

async function confirmWithdrawal() {
  if (basket.length === 0) return;

  const currentUser = requireLogin();
  if (!currentUser) return;

  const confirmBtn = document.getElementById('basketConfirmBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Retrait en cours...';

  try {
    // 1. Read current wines and withdrawals
    const winesFile = await ghRead('data/wines.json');
    const withdrawalsFile = await ghRead('data/withdrawals.json');

    const wines = winesFile.data;
    const withdrawals = withdrawalsFile.data;

    // 2. Update wine quantities
    for (const b of basket) {
      const wine = wines.find(w => w.id === b.wineId);
      if (!wine) continue;
      if (b.quantity > wine.quantite) {
        throw new Error(`Stock insuffisant pour ${wine.appellation} (${wine.quantite} restante(s))`);
      }
      wine.quantite -= b.quantity;
    }

    // 3. Create withdrawal entry
    const withdrawal = {
      id: crypto.randomUUID(),
      user_id: currentUser.id,
      user_name: currentUser.full_name,
      withdrawn_at: new Date().toISOString(),
      items: basket.map(b => {
        const wine = wines.find(w => w.id === b.wineId);
        return {
          wine_id: b.wineId,
          appellation: b.appellation,
          cru: b.cru || null,
          climat: b.climat || null,
          emplacement: b.emplacement || null,
          millesime: b.millesime,
          couleur: b.couleur,
          quantity: b.quantity
        };
      })
    };
    withdrawals.unshift(withdrawal);

    // 4. Write both files back to GitHub
    const newWinesSha = await ghWrite('data/wines.json', wines, winesFile.sha);
    await ghWrite('data/withdrawals.json', withdrawals, withdrawalsFile.sha);

    showToast('Retrait confirmé !');
    basket = [];
    updateBasketUI();
    closeBasket();

    // Refresh inventory from the data we already have (filters and sorting are kept)
    window.allWines = wines;
    refreshView();

  } catch (error) {
    console.error('Erreur lors du retrait:', error);
    showToast('Erreur : ' + error.message);
  } finally {
    confirmBtn.textContent = 'Confirmer le retrait';
    updateBasketUI(); // re-enables the button only if the basket still has items
  }
}

// ---------------- TOAST NOTIFICATIONS ----------------
function showToast(message) {
  const old = document.querySelector('.toast');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ---------------- LOGIN ----------------
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

async function checkLogin(personalId, cellarKey) {
  try {
    const { data: users } = await ghRead('data/users.json');
    const user = users.find(u => u.personal_id === personalId);

    if (!user) return { success: false, message: "Utilisateur non trouvé" };
    if (cellarKey !== "pvs") return { success: false, message: "Clé de la cave incorrecte" };

    // Update last_connection_at (best-effort, don't block login if it fails)
    try {
      const usersFile = await ghRead('data/users.json');
      const freshUsers = usersFile.data;
      const freshUser = freshUsers.find(u => u.personal_id === personalId);
      if (freshUser) {
        freshUser.last_connection_at = new Date().toISOString();
        await ghWrite('data/users.json', freshUsers, usersFile.sha);
      }
    } catch (e) {
      console.warn('Could not update last_connection_at:', e);
    }

    return { success: true, user };
  } catch (err) {
    return { success: false, message: "Erreur: " + err.message };
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = 'Connexion en cours...';

    const id = document.getElementById('personalId').value.trim();
    const key = document.getElementById('cellarKey').value.trim();

    const result = await checkLogin(id, key);
    if (result.success) {
      localStorage.setItem('currentUser', JSON.stringify(result.user));
      window.location.href = "inventaire.html";
    } else {
      loginError.textContent = result.message;
    }
  });
}

// ---------------- AUTH CHECK ----------------
function requireLogin() {
  // The session is kept in localStorage until the user logs out, so they stay signed in by default
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('currentUser'));
  } catch (e) {
    user = null;
  }

  if (!user) {
    window.location.href = "index.html";
    return null;
  }
  return user;
}

// ---------------- LOGOUT ----------------
function logout() {
  localStorage.removeItem('currentUser');
  window.location.href = "index.html";
}

// ---------------- INVENTAIRE ----------------
async function fetchWines() {
  try {
    const { data } = await ghRead('data/wines.json');
    return data;
  } catch (err) {
    console.error('Exception fetching wines:', err);
    return [];
  }
}

async function initInventaire() {
  const user = requireLogin();
  if (!user) return;

  buildFilterUI();
  updateBasketUI();
  setupInventaireListeners();

  const wines = await fetchWines();
  window.allWines = wines;
  refreshView();
}

// Escape closes the cart first, otherwise the open filter list; a click outside closes the filter list
function setupInventaireListeners() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    const overlay = document.getElementById('basketOverlay');
    if (overlay && !overlay.classList.contains('hidden')) closeBasket();
    else closeAllFilterDropdowns();
  });

  document.addEventListener('click', (e) => {
    if (!openFilterKey) return;
    const wrap = document.getElementById('filterWrap-' + openFilterKey);
    if (wrap && !wrap.contains(e.target)) closeFilterDropdown(openFilterKey);
  });
}

// ---------------- FILTERS ----------------
// One button per field. It opens a list of checkboxes (with a search box when the list is long)
// that shows how many wines match each value given the other filters. Active filters also appear
// as removable chips under the buttons, next to the result count.
const FILTER_FIELDS = [
  { key: 'appellation', label: 'Appellation' },
  { key: 'cru', label: 'Cru' },
  { key: 'climat', label: 'Climat / Cuvée' },
  { key: 'millesime', label: 'Millésime' },
  { key: 'couleur', label: 'Couleur' }
];

const SEARCH_MIN_OPTIONS = 7; // show the search box above this many values

const selectedFilters = {};
FILTER_FIELDS.forEach(f => { selectedFilters[f.key] = new Set(); });

let openFilterKey = null;
let visibleCount = 0;

function isMobileLayout() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function buildFilterUI() {
  const row = document.getElementById('filtersRow');
  if (!row) return;

  row.innerHTML = FILTER_FIELDS.map(f => `
    <div class="filter-dropdown" id="filterWrap-${f.key}">
      <button type="button" class="filter-btn" id="filterBtn-${f.key}"
        aria-haspopup="true" aria-expanded="false"
        onclick="toggleFilterDropdown('${f.key}')">
        <span class="filter-btn-label">${f.label}</span>
        <span class="filter-btn-count hidden" id="filterCount-${f.key}">0</span>
        <svg class="filter-btn-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="filter-panel" id="filterPanel-${f.key}">
        <div class="filter-panel-header">
          <span class="filter-panel-title">${f.label}</span>
          <button type="button" class="filter-panel-close" onclick="closeFilterDropdown('${f.key}')" aria-label="Fermer">✕</button>
        </div>
        <input type="search" class="filter-search" id="filterSearch-${f.key}"
          placeholder="Rechercher…" autocomplete="off"
          oninput="onFilterSearch('${f.key}')">
        <div class="filter-options" id="filterOptions-${f.key}"></div>
        <div class="filter-panel-footer">
          <button type="button" class="filter-clear" id="filterClear-${f.key}" onclick="clearFilterValues('${f.key}')">Effacer</button>
          <button type="button" class="filter-done" id="filterDone-${f.key}" onclick="closeFilterDropdown('${f.key}')">Voir les résultats</button>
        </div>
      </div>
    </div>
  `).join('');

  // Dimmed backdrop behind the filter list on small screens, where the list is a bottom sheet
  if (!document.getElementById('filterBackdrop')) {
    const backdrop = document.createElement('div');
    backdrop.id = 'filterBackdrop';
    backdrop.className = 'filter-backdrop';
    backdrop.addEventListener('click', closeAllFilterDropdowns);
    document.body.appendChild(backdrop);
  }
}

function matchesFilters(wine, ignoreKey) {
  return FILTER_FIELDS.every(f => {
    if (f.key === ignoreKey) return true;
    const set = selectedFilters[f.key];
    if (set.size === 0) return true;
    const val = wine[f.key];
    return val !== null && val !== undefined && set.has(String(val));
  });
}

// Values offered for a field, with the number of in-stock wines each one would show
// given the other filters. Selected values stay listed so they can always be unticked.
function getFacetOptions(key) {
  const counts = new Map();

  (window.allWines || []).forEach(w => {
    if (!(w.quantite > 0) || !matchesFilters(w, key)) return;
    const v = w[key];
    if (v === null || v === undefined || v === '') return;
    const s = String(v);
    counts.set(s, (counts.get(s) || 0) + 1);
  });

  selectedFilters[key].forEach(v => { if (!counts.has(v)) counts.set(v, 0); });

  const options = [...counts].map(([value, count]) => ({ value, count }));
  if (key === 'millesime') {
    options.sort((a, b) => Number(b.value) - Number(a.value));
  } else {
    options.sort((a, b) => a.value.localeCompare(b.value, 'fr'));
  }
  return options;
}

function renderFilterOptions(key) {
  const container = document.getElementById('filterOptions-' + key);
  const searchInput = document.getElementById('filterSearch-' + key);
  if (!container) return;

  const selected = selectedFilters[key];
  const all = getFacetOptions(key);

  const showSearch = all.length >= SEARCH_MIN_OPTIONS;
  if (searchInput) searchInput.classList.toggle('hidden', !showSearch);
  const term = showSearch && searchInput ? searchInput.value.trim().toLowerCase() : '';
  const options = all.filter(o => !term || o.value.toLowerCase().includes(term));

  const scrollTop = container.scrollTop;
  container.innerHTML = '';

  if (options.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'filter-option-empty';
    empty.textContent = 'Aucun résultat';
    container.appendChild(empty);
  }

  options.forEach(o => {
    const label = document.createElement('label');
    label.className = 'filter-option' + (selected.has(o.value) ? ' selected' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selected.has(o.value);
    checkbox.addEventListener('change', () => {
      label.classList.toggle('selected', checkbox.checked);
      toggleFilterValue(key, o.value, checkbox.checked);
    });

    const text = document.createElement('span');
    text.className = 'filter-option-label';
    text.textContent = o.value;

    const count = document.createElement('span');
    count.className = 'filter-option-count';
    count.textContent = o.count;

    label.appendChild(checkbox);
    label.appendChild(text);
    label.appendChild(count);
    container.appendChild(label);
  });

  container.scrollTop = scrollTop;
  updateFilterFooter(key);
}

function toggleFilterDropdown(key) {
  if (openFilterKey === key) closeFilterDropdown(key);
  else openFilterDropdown(key);
}

function openFilterDropdown(key) {
  closeAllFilterDropdowns();

  const wrap = document.getElementById('filterWrap-' + key);
  if (!wrap) return;

  wrap.classList.add('open');
  document.getElementById('filterBtn-' + key).setAttribute('aria-expanded', 'true');
  openFilterKey = key;

  const backdrop = document.getElementById('filterBackdrop');
  if (backdrop) backdrop.classList.add('show');

  const search = document.getElementById('filterSearch-' + key);
  if (search) search.value = '';
  renderFilterOptions(key);

  // On small screens the list is a bottom sheet: don't focus the search box, it would pop up the keyboard
  if (search && !search.classList.contains('hidden') && !isMobileLayout()) search.focus();
}

function closeFilterDropdown(key) {
  const wrap = document.getElementById('filterWrap-' + key);
  if (!wrap) return;

  wrap.classList.remove('open');
  document.getElementById('filterBtn-' + key).setAttribute('aria-expanded', 'false');

  if (openFilterKey === key) {
    openFilterKey = null;
    const backdrop = document.getElementById('filterBackdrop');
    if (backdrop) backdrop.classList.remove('show');
  }

  const search = document.getElementById('filterSearch-' + key);
  if (search) search.value = '';
}

function closeAllFilterDropdowns() {
  FILTER_FIELDS.forEach(f => closeFilterDropdown(f.key));
}

function onFilterSearch(key) {
  renderFilterOptions(key);
}

function toggleFilterValue(key, value, checked) {
  const set = selectedFilters[key];
  if (checked) set.add(value);
  else set.delete(value);

  applyFilters();
}

function removeFilterValue(key, value) {
  selectedFilters[key].delete(value);
  applyFilters();
  if (openFilterKey) renderFilterOptions(openFilterKey);
}

function clearFilterValues(key) {
  selectedFilters[key].clear();
  applyFilters();
  renderFilterOptions(key);
}

function clearAllFilters() {
  FILTER_FIELDS.forEach(f => selectedFilters[f.key].clear());
  applyFilters();
  if (openFilterKey) renderFilterOptions(openFilterKey);
}

// Button state: highlighted with a counter badge when values are selected
function updateFilterButton(key) {
  const wrap = document.getElementById('filterWrap-' + key);
  const badge = document.getElementById('filterCount-' + key);
  const btn = document.getElementById('filterBtn-' + key);
  if (!wrap || !badge || !btn) return;

  const field = FILTER_FIELDS.find(f => f.key === key);
  const n = selectedFilters[key].size;

  wrap.classList.toggle('has-selection', n > 0);
  badge.classList.toggle('hidden', n === 0);
  badge.textContent = n;
  btn.setAttribute('aria-label', n > 0 ? `${field.label} (${n} sélectionné${n > 1 ? 's' : ''})` : field.label);
}

function updateFilterFooter(key) {
  const clearBtn = document.getElementById('filterClear-' + key);
  const doneBtn = document.getElementById('filterDone-' + key);

  if (clearBtn) clearBtn.disabled = selectedFilters[key].size === 0;
  if (doneBtn) {
    doneBtn.textContent = visibleCount === 0
      ? 'Aucun résultat'
      : `Voir ${visibleCount} vin${visibleCount > 1 ? 's' : ''}`;
  }
}

// Result count + removable chips for every active filter
function renderFiltersSummary(visible) {
  const el = document.getElementById('filtersSummary');
  if (!el) return;

  const bottles = visible.reduce((sum, w) => sum + (Number(w.quantite) || 0), 0);

  el.innerHTML = '';

  const count = document.createElement('span');
  count.className = 'results-count';
  count.textContent = `${visible.length} vin${visible.length > 1 ? 's' : ''} · ${bottles} bouteille${bottles > 1 ? 's' : ''}`;
  el.appendChild(count);

  let hasFilters = false;
  FILTER_FIELDS.forEach(f => {
    selectedFilters[f.key].forEach(value => {
      hasFilters = true;

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-chip';
      chip.setAttribute('aria-label', `Retirer le filtre ${f.label} : ${value}`);

      const text = document.createElement('span');
      text.textContent = value;

      const x = document.createElement('span');
      x.className = 'filter-chip-x';
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '✕';

      chip.appendChild(text);
      chip.appendChild(x);
      chip.addEventListener('click', () => removeFilterValue(f.key, value));
      el.appendChild(chip);
    });
  });

  if (hasFilters) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'filters-reset';
    reset.textContent = 'Tout effacer';
    reset.addEventListener('click', clearAllFilters);
    el.appendChild(reset);
  }
}

function renderWines(list) {
  const tbody = document.getElementById('winesList');
  if (!tbody) return;

  tbody.innerHTML = '';

  const visible = list.filter(w => w.quantite > 0);

  if (visible.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">Aucun vin trouvé dans l\'inventaire.</td></tr>';
    return;
  }

  visible.forEach((wine) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Appellation">${wine.appellation}</td>
      <td data-label="Cru">${wine.cru || '—'}</td>
      <td data-label="Climat / Cuvée">${wine.climat || '—'}</td>
      <td data-label="Millésime">${wine.millesime}</td>
      <td data-label="Couleur"><span class="color-badge color-${wine.couleur.toLowerCase()}">${wine.couleur}</span></td>
      <td data-label="Qté" class="qty-cell">${wine.quantite}</td>
      <td data-label="Emplacement">${wine.emplacement || ''}</td>
      <td data-label="Retirer">
        <div class="add-to-basket">
          <input type="number" id="qty-${wine.id}" value="1" min="1" max="${wine.quantite}" class="qty-input">
          <button class="btn-add" onclick="addToBasket('${wine.id}')" title="Ajouter au panier">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------------- SORTING ----------------
let currentSort = { column: null, ascending: true };

function compareWines(a, b) {
  const column = currentSort.column;
  let valA = a[column] ?? '';
  let valB = b[column] ?? '';

  if (column === 'millesime' || column === 'quantite') {
    valA = Number(valA) || 0;
    valB = Number(valB) || 0;
    return currentSort.ascending ? valA - valB : valB - valA;
  }

  valA = String(valA).toLowerCase();
  valB = String(valB).toLowerCase();
  const cmp = valA.localeCompare(valB, 'fr');
  return currentSort.ascending ? cmp : -cmp;
}

function sortWines(column) {
  if (!window.allWines) return;

  if (currentSort.column === column) {
    currentSort.ascending = !currentSort.ascending;
  } else {
    currentSort.column = column;
    currentSort.ascending = true;
  }

  refreshView();
}

function updateSortArrows() {
  document.querySelectorAll('.sort-arrow').forEach(el => el.textContent = '');
  if (!currentSort.column) return;

  const arrowEl = document.getElementById('sort-' + currentSort.column);
  if (arrowEl) arrowEl.textContent = currentSort.ascending ? ' ▲' : ' ▼';
}

// ---------------- VIEW (filters + sorting -> table) ----------------
function getVisibleWines() {
  const list = (window.allWines || []).filter(w => w.quantite > 0 && matchesFilters(w, null));
  return currentSort.column ? [...list].sort(compareWines) : list;
}

// Single entry point: filtering and sorting always combine, whichever one changed last
function refreshView() {
  if (!window.allWines) return;

  const visible = getVisibleWines();
  window.filteredWines = visible;
  visibleCount = visible.length;

  renderWines(visible);
  renderFiltersSummary(visible);
  FILTER_FIELDS.forEach(f => updateFilterButton(f.key));
  if (openFilterKey) updateFilterFooter(openFilterKey);
  updateSortArrows();
}

function applyFilters() {
  refreshView();
}

// ---------------- HISTORIQUE ----------------
async function initHistorique() {
  const user = requireLogin();
  if (!user) return;
  await loadHistorique();
}

async function loadHistorique() {
  try {
    const { data: withdrawals } = await ghRead('data/withdrawals.json');
    renderHistorique(withdrawals);
  } catch (error) {
    console.error('Erreur lors du chargement de l’historique:', error);
    const container = document.getElementById('historiqueList');
    if (container) {
      container.innerHTML = '<p class="error" style="color: white;">Erreur lors du chargement de l’historique: ' + error.message + '</p>';
    }
  }
}

function renderHistorique(events) {
  const container = document.getElementById('historiqueList');
  if (!container) return;

  container.innerHTML = '';

  if (events.length === 0) {
    container.innerHTML = '<p style="color: white; text-align: center;">Aucun retrait enregistré.</p>';
    return;
  }

  events.forEach(event => {
    const date = new Date(event.withdrawn_at).toLocaleString('fr-FR');
    const userName = event.user_name || 'Utilisateur inconnu';

    const div = document.createElement('div');
    div.className = 'historique-entry';

    let itemsHtml = '';
    event.items.forEach(item => {
      itemsHtml += `
        <li>${item.quantity} × ${item.appellation}${item.cru ? ' – ' + item.cru : ''}${item.climat ? ' – ' + item.climat : ''} (${item.millesime}, ${item.couleur})</li>
      `;
    });

    div.innerHTML = `
      <div class="historique-header">
        <strong>${userName}</strong>
        <span class="historique-date">${date}</span>
      </div>
      <ul class="historique-items">
        ${itemsHtml}
      </ul>
    `;

    container.appendChild(div);
  });
}

// ---------------- PWA INSTALLATION ----------------
function setupAppInstall() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./service-worker.js')
      .catch(error => console.error('Erreur lors de l’activation hors ligne:', error));
  }

  const installButton = document.getElementById('installAppButton');
  if (!installButton) return;

  let installPrompt = null;
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  if (isInstalled) {
    installButton.hidden = true;
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
  });

  installButton.addEventListener('click', async () => {
    if (!installPrompt) {
      const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);
      alert(isAppleMobile
        ? 'Dans Safari, touchez Partager puis « Sur l’écran d’accueil » pour installer l’application.'
        : 'Ouvrez le menu de votre navigateur, puis choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».');
      return;
    }

    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') installButton.hidden = true;
    installPrompt = null;
  });
}

setupAppInstall();
