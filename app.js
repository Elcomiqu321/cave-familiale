// ---------------- SUPABASE SETUP ----------------
const SUPABASE_URL = "https://iidougkfgzrtvrdephkp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZG91Z2tmZ3pydHZyZGVwaGtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3MjU3MzIsImV4cCI6MjA4MjMwMTczMn0.MykkbxetQW1p6gKyxgSDCny2WFT2nS7KB-XPRXDV7Jw";

if (typeof window.supabase === 'undefined') {
  console.error('Supabase library not loaded!');
}

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------- BASKET ----------------
let basket = [];

function addToBasket(wineId) {
  const input = document.getElementById('qty-' + wineId);
  const n = parseInt(input.value);
  const wine = window.allWines.find(w => w.id === wineId);

  if (!wine || isNaN(n) || n <= 0) return;

  // Check quantity available (accounting for what's already in basket)
  const alreadyInBasket = basket.filter(b => b.wineId === wineId).reduce((sum, b) => sum + b.quantity, 0);
  if (n + alreadyInBasket > wine.quantite) {
    showToast(`Stock insuffisant ! ${wine.quantite - alreadyInBasket} bouteille(s) disponible(s).`);
    return;
  }

  // Check if wine already in basket — if so, add to existing entry
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
    // 1. Create one withdrawal event
    const { data: eventData, error: eventError } = await db
      .from('withdrawal_events')
      .insert([{ user_id: currentUser.id }])
      .select()
      .single();

    if (eventError) throw eventError;

    // 2. Create all withdrawal items
    const items = basket.map(b => ({
      withdrawal_event_id: eventData.id,
      wine_id: b.wineId,
      quantity: b.quantity
    }));

    const { error: itemError } = await db
      .from('withdrawal_items')
      .insert(items);

    if (itemError) throw itemError;

    // 3. Update each wine's quantity
    for (const b of basket) {
      const wine = window.allWines.find(w => w.id === b.wineId);
      if (!wine) continue;
      const newQty = wine.quantite - b.quantity;
      const { error: updateError } = await db
        .from('wines')
        .update({ quantite: newQty })
        .eq('id', b.wineId);
      if (updateError) throw updateError;
    }

    showToast('Retrait confirmé !');
    basket = [];
    updateBasketUI();

    // Refresh inventory
    const wines = await fetchWines();
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
  // Remove existing toast
  const old = document.querySelector('.toast');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
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
    const { data, error } = await db
      .from('users')
      .select('*')
      .eq('personal_id', personalId)
      .limit(1);

    if (error) return { success: false, message: "Erreur de connexion à la base: " + error.message };
    if (data.length === 0) return { success: false, message: "Utilisateur non trouvé" };

    const user = data[0];
    if (cellarKey !== "pvs") return { success: false, message: "Clé de la cave incorrecte" };

    await db
      .from('users')
      .update({ last_connection_at: new Date().toISOString() })
      .eq('id', user.id);

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
    const { data, error } = await db
      .from('wines')
      .select('*')
      .order('appellation', { ascending: true });

    if (error) { console.error('Error fetching wines:', error); return []; }
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

  // Toggle direction if same column clicked again
  if (currentSort.column === column) {
    currentSort.ascending = !currentSort.ascending;
  } else {
    currentSort.column = column;
    currentSort.ascending = true;
  }

  const sorted = [...list].sort((a, b) => {
    let valA = a[column] ?? '';
    let valB = b[column] ?? '';

    // Numeric sort for millesime and quantite
    if (column === 'millesime' || column === 'quantite') {
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return currentSort.ascending ? valA - valB : valB - valA;
    }

    // String sort for everything else
    valA = String(valA).toLowerCase();
    valB = String(valB).toLowerCase();
    const cmp = valA.localeCompare(valB, 'fr');
    return currentSort.ascending ? cmp : -cmp;
  });

  // Update sort arrows in UI
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
    const { data, error } = await db
      .from('withdrawal_events')
      .select(`
        id,
        withdrawn_at,
        user_id,
        users (full_name),
        withdrawal_items (
          quantity,
          wine_id,
          wines (appellation, climat, millesime, couleur)
        )
      `)
      .order('withdrawn_at', { ascending: false });

    if (error) throw error;
    renderJournal(data);
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
    const userName = event.users?.full_name || 'Utilisateur inconnu';

    const div = document.createElement('div');
    div.className = 'journal-entry';

    let itemsHtml = '';
    event.withdrawal_items.forEach(item => {
      const wine = item.wines;
      itemsHtml += `
        <li>${item.quantity} × ${wine.appellation}${wine.climat ? ' – ' + wine.climat : ''} (${wine.millesime}, ${wine.couleur})</li>
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
