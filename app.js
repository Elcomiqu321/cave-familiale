// ---------------- SUPABASE SETUP ----------------
const SUPABASE_URL = "https://iidougkfgzrtvrdephkp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZG91Z2tmZ3pydHZyZGVwaGtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUyMDgwMjEsImV4cCI6MjA1MDc4NDAyMX0.aW2vKeyH_AvUXq9z8FpfGAJrGM96y5FzP1yZVJMFel4";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------- LOGIN ----------------
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

async function checkLogin(personalId, cellarKey) {
  // Fetch user from Supabase
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('personal_id', personalId)
    .limit(1);

  if (error) {
    console.error(error);
    return { success: false, message: "Erreur de connexion à la base" };
  }

  if (data.length === 0) return { success: false, message: "Utilisateur non trouvé" };

  const user = data[0];
  if (cellarKey !== "pvs") return { success: false, message: "Clé de la cave incorrecte" };

  // Update last_connection_at (corrected field name)
  await supabase
    .from('users')
    .update({ last_connection_at: new Date().toISOString() })
    .eq('id', user.id);

  return { success: true, user };
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
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
  const { data, error } = await supabase
    .from('wines')
    .select('*')
    .order('appellation', { ascending: true });

  if (error) {
    console.error(error);
    return [];
  }
  return data;
}

async function initInventaire() {
  const user = requireLogin();
  if (!user) return;
  
  const wines = await fetchWines();
  window.allWines = wines; // Store for filtering
  renderWines(wines);
}

function renderWines(list) {
  const container = document.getElementById('winesList');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (list.length === 0) {
    container.innerHTML = '<p>Aucun vin trouvé.</p>';
    return;
  }
  
  list.forEach((wine) => {
    if (wine.quantite <= 0) return; // hide zero stock
    const div = document.createElement('div');
    div.className = 'wine-card';
    div.innerHTML = `
      <strong>${wine.appellation}${wine.climat ? ' - ' + wine.climat : ''} (${wine.millesime})</strong>
      <p>Couleur: ${wine.couleur}, Quantité: ${wine.quantite}, Emplacement: ${wine.emplacement || 'N/A'}</p>
      <button onclick="withdrawWine('${wine.id}', ${wine.quantite})">Retirer</button>
    `;
    container.appendChild(div);
  });
}

async function withdrawWine(wineId, currentQuantity) {
  const qty = prompt("Combien de bouteilles voulez-vous retirer ?");
  const n = parseInt(qty);
  
  if (isNaN(n) || n <= 0) {
    alert("Quantité invalide !");
    return;
  }
  
  if (n > currentQuantity) {
    alert(`Quantité insuffisante ! Il n'y a que ${currentQuantity} bouteille(s) disponible(s).`);
    return;
  }

  const currentUser = requireLogin();
  if (!currentUser) return;

  try {
    // 1. Create withdrawal event
    const { data: eventData, error: eventError } = await supabase
      .from('withdrawal_events')
      .insert([{ user_id: currentUser.id }])
      .select()
      .single();

    if (eventError) throw eventError;

    // 2. Create withdrawal item
    const { error: itemError } = await supabase
      .from('withdrawal_items')
      .insert([{
        withdrawal_event_id: eventData.id,
        wine_id: wineId,
        quantity: n
      }]);

    if (itemError) throw itemError;

    // 3. Update wine quantity
    const newQty = currentQuantity - n;
    const { error: updateError } = await supabase
      .from('wines')
      .update({ quantite: newQty })
      .eq('id', wineId);

    if (updateError) throw updateError;

    alert(`${n} bouteille(s) retirée(s) avec succès !`);
    
    // Refresh the list
    const wines = await fetchWines();
    window.allWines = wines;
    renderWines(wines);
    
  } catch (error) {
    console.error('Erreur lors du retrait:', error);
    alert("Erreur lors du retrait !");
  }
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
    (fMil ? w.millesime == fMil : true) &&
    (fCou ? w.couleur.toLowerCase().includes(fCou) : true)
  );
  
  renderWines(filtered);
}

// ---------------- JOURNAL ----------------
async function initJournal() {
  const user = requireLogin();
  if (!user) return;
  
  await loadJournal();
}

async function loadJournal() {
  try {
    const { data, error } = await supabase
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
      container.innerHTML = '<p class="error">Erreur lors du chargement du journal.</p>';
    }
  }
}

function renderJournal(events) {
  const container = document.getElementById('journalList');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (events.length === 0) {
    container.innerHTML = '<p>Aucun retrait enregistré.</p>';
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
        <li>${item.quantity} × ${wine.appellation}${wine.climat ? ' - ' + wine.climat : ''} (${wine.millesime}, ${wine.couleur})</li>
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
