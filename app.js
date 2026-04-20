// =============================================
// CAVE FAMILIALE — GitHub-backed storage
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
      climat: wine.climat || '',
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
  const panel = document.getElementById('basketPanel');
  const toggle = document.getElementById('basketToggle');
  const countEl = document.getElementById('basketCount');
  const toggleCountEl = document.getElementById('basketToggleCount');
  const itemsEl = document.getElementById('basketItems');

  const totalItems = basket.reduce((sum, b) => sum + b.quantity, 0);

  if (basket.length === 0) {
    panel.classList.add('hidden');
    toggle.classList.add('hidden');
    return;
  }

  toggle.classList.remove('hidden');
  countEl.textContent = totalItems;
  toggleCountEl.textContent = totalItems;

  itemsEl.innerHTML = basket.map((item, i) => `
    <div class="basket-item">
      <div class="basket-item-info">
        <span class="basket-item-name">${item.appellation}${item.climat ? ' – ' + item.climat : ''}</span>
        <span class="basket-item-detail">${item.millesime} · ${item.couleur}</span>
      </div>
      <span class="basket-item-qty">×${item.quantity}</span>
      <button class="basket-item-remove" onclick="removeFromBasket(${i})" title="Retirer du panier">✕</button>
    </div>
  `).join('');
}

function toggleBasket() {
  const panel = document.getElementById('basketPanel');
  panel.classList.toggle('hidden');
}

async function confirmWithdrawal() {
  if (basket.length === 0) return;

  const currentUser = requireLogin();
  if (!currentUser) return;

  const confirmBtn = document.querySelector('.btn-confirm');
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
          climat: b.climat || null,
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

    // Refresh inventory from the data we already have
    window.allWines = wines;
    renderWines(wines);

  } catch (error) {
    console.error('Erreur lors du retrait:', error);
    showToast('Erreur : ' + error.message);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirmer le retrait';
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
  const user = localStorage.getItem('currentUser');
  if (!user) {
    window.location.href = "index.html";
    return null;
  }
  return JSON.parse(user);
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

  const wines = await fetchWines();
  window.allWines = wines;
  renderWines(wines);
}

function renderWines(list) {
  const tbody = document.getElementById('winesList');
  if (!tbody) return;

  tbody.innerHTML = '';

  const visible = list.filter(w => w.quantite > 0);

  if (visible.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">Aucun vin trouvé dans l\'inventaire.</td></tr>';
    return;
  }

  visible.forEach((wine) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Appellation">${wine.appellation}</td>
      <td data-label="Climat">${wine.climat || '—'}</td>
      <td data-label="Millésime">${wine.millesime}</td>
      <td data-label="Couleur"><span class="color-badge color-${wine.couleur.toLowerCase()}">${wine.couleur}</span></td>
      <td data-label="Qté" class="qty-cell">${wine.quantite}</td>
      <td data-label="Emplacement">${wine.emplacement || '—'}</td>
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

function applyFilters() {
  if (!window.allWines) return;

  const fApp = document.getElementById('filterAppellation')?.value.toLowerCase() || '';
  const fClim = document.getElementById('filterClimat')?.value.toLowerCase() || '';
  const fMil = document.getElementById('filterMillesime')?.value || '';
  const fCou = document.getElementById('filterCouleur')?.value.toLowerCase() || '';

  const filtered = window.allWines.filter(w =>
    (fApp ? w.appellation.toLowerCase().includes(fApp) : true) &&
    (fClim ? (w.climat || "").toLowerCase().includes(fClim) : true) &&
    (fMil ? String(w.millesime).includes(fMil) : true) &&
    (fCou ? w.couleur.toLowerCase().includes(fCou) : true)
  );

  window.filteredWines = filtered;
  renderWines(filtered);
}

// ---------------- SORTING ----------------
let currentSort = { column: null, ascending: true };

function sortWines(column) {
  const list = window.filteredWines || window.allWines;
  if (!list) return;

  if (currentSort.column === column) {
    currentSort.ascending = !currentSort.ascending;
  } else {
    currentSort.column = column;
    currentSort.ascending = true;
  }

  const sorted = [...list].sort((a, b) => {
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
  });

  document.querySelectorAll('.sort-arrow').forEach(el => el.textContent = '');
  const arrowEl = document.getElementById('sort-' + column);
  if (arrowEl) arrowEl.textContent = currentSort.ascending ? ' ▲' : ' ▼';

  renderWines(sorted);
}

// ---------------- JOURNAL ----------------
async function initJournal() {
  const user = requireLogin();
  if (!user) return;
  await loadJournal();
}

async function loadJournal() {
  try {
    const { data: withdrawals } = await ghRead('data/withdrawals.json');
    renderJournal(withdrawals);
  } catch (error) {
    console.error('Erreur lors du chargement du journal:', error);
    const container = document.getElementById('journalList');
    if (container) {
      container.innerHTML = '<p class="error" style="color: white;">Erreur lors du chargement du journal: ' + error.message + '</p>';
    }
  }
}

function renderJournal(events) {
  const container = document.getElementById('journalList');
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
    div.className = 'journal-entry';

    let itemsHtml = '';
    event.items.forEach(item => {
      itemsHtml += `
        <li>${item.quantity} × ${item.appellation}${item.climat ? ' – ' + item.climat : ''} (${item.millesime}, ${item.couleur})</li>
      `;
    });

    div.innerHTML = `
      <div class="journal-header">
        <strong>${userName}</strong>
        <span class="journal-date">${date}</span>
      </div>
      <ul class="journal-items">
        ${itemsHtml}
      </ul>
    `;

    container.appendChild(div);
  });
}
