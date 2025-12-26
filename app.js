// ---------------- SUPABASE SETUP ----------------
const SUPABASE_URL = "https://iidougkfgzrtvrdephkp.supabase.co";
const SUPABASE_KEY = "sb_publishable_q5zrjLAmfmtFjBsA6D6muw_xBIKKjNX";

// Check if Supabase is loaded
if (typeof window.supabase === 'undefined') {
  console.error('Supabase library not loaded!');
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------- LOGIN ----------------
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

async function checkLogin(personalId, cellarKey) {
  console.log('Attempting login for:', personalId);
  
  try {
    // Fetch user from Supabase
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('personal_id', personalId)
      .limit(1);

    if (error) {
      console.error('Supabase error:', error);
      return { success: false, message: "Erreur de connexion à la base: " + error.message };
    }

    console.log('Query result:', data);

    if (data.length === 0) {
      return { success: false, message: "Utilisateur non trouvé" };
    }

    const user = data[0];
    if (cellarKey !== "pvs") {
      return { success: false, message: "Clé de la cave incorrecte" };
    }

    // Update last_connection_at
    await supabase
      .from('users')
      .update({ last_connection_at: new Date().toISOString() })
      .eq('id', user.id);

    return { success: true, user };
  } catch (err) {
    console.error('Login error:', err);
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
    const { data, error } = await supabase
      .from('wines')
      .select('*')
      .order('appellation', { ascending: true });

    if (error) {
      console.error('Error fetching wines:', error);
      return [];
    }
    console.log('Fetched wines:', data);
    return data;
  } catch (err) {
    console.error('Exception fetching wines:', err);
    return [];
  }
}

async function initInventaire() {
  const user = requireLogin();
  if (!user) return;
  
  console.log('Initializing inventory for user:', user.full_name);
  const wines = await fetchWines();
  window.allWines = wines;
  renderWines(wines);
}

function renderWines(list) {
  const container = document.getElementById('winesList');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (list.length === 0) {
    container.innerHTML = '<p style="color: white; text-align: center;">Aucun vin trouvé dans l\'inventaire.</p>';
    return;
  }
  
  list.forEach((wine) => {
    if (wine.quantite <= 0) return;
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
    console.log('Creating withdrawal event...');
    
    // 1. Create withdrawal event
    const { data: eventData, error: eventError } = await supabase
      .from('withdrawal_events')
      .insert([{ user_id: currentUser.id }])
      .select()
      .single();

    if (eventError) throw eventError;
    console.log('Event created:', eventData);

    // 2. Create withdrawal item
    const { error: itemError } = await supabase
      .from('withdrawal_items')
      .insert([{
        withdrawal_event_id: eventData.id,
        wine_id: wineId,
        quantity: n
      }]);

    if (itemError) throw itemError;
    console.log('Item recorded');

    // 3. Update wine quantity
    const newQty = currentQuantity - n;
    const { error: updateError } = await supabase
      .from('wines')
      .update({ quantite: newQty })
      .eq('id', wineId);

    if (updateError) throw updateError;
    console.log('Quantity updated');

    alert(`${n} bouteille(s) retirée(s) avec succès !`);
    
    // Refresh the list
    const wines = await fetchWines();
    window.allWines = wines;
    renderWines(wines);
    
  } catch (error) {
    console.error('Erreur lors du retrait:', error);
    alert("Erreur lors du retrait: " + error.message);
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
  
  console.log('Loading journal...');
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

    console.log('Journal data:', data);
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
