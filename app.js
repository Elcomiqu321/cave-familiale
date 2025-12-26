// ---------------- SUPABASE SETUP ----------------
const SUPABASE_URL = "https://iidougkfgzrtvrdephkp.supabase.co";
const SUPABASE_KEY = "sb_publishable_q5zrjLAmfmtFjBsA6D6muw_xBIKKjNX";
const supabase = Supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
  if (cellarKey !== "abcd") return { success: false, message: "Clé de la cave incorrecte" }; // replace with real key if needed

  // Update last_connection
  await supabase.from('users').update({ last_connection: new Date().toISOString() }).eq('personal_id', personalId);

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
  }
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

// Example: render wines (same as before)
async function initInventaire() {
  requireLogin();
  const wines = await fetchWines();
  renderWines(wines);
}

function renderWines(list) {
  const container = document.getElementById('winesList');
  container.innerHTML = '';
  list.forEach((wine, i) => {
    if (wine.quantite <= 0) return; // hide zero stock
    const div = document.createElement('div');
    div.className = 'wine-card';
    div.innerHTML = `
      <strong>${wine.appellation} - ${wine.climat || ""} (${wine.millesime})</strong>
      <p>Couleur: ${wine.couleur}, Quantité: ${wine.quantite}, Emplacement: ${wine.emplacement}</p>
      <button onclick="withdraw(${i})">Retirer</button>
    `;
    container.appendChild(div);
  });
}

async function withdraw(index) {
  const container = document.getElementById('winesList');
  const qty = prompt("Combien de bouteilles voulez-vous retirer ?");
  const n = parseInt(qty);
  const wines = await fetchWines();
  if (!isNaN(n) && n > 0 && n <= wines[index].quantite) {
    const wine = wines[index];
    const newQty = wine.quantite - n;

    const { error } = await supabase
      .from('wines')
      .update({ quantite: newQty })
      .eq('appellation', wine.appellation)
      .eq('millesime', wine.millesime)
      .eq('emplacement', wine.emplacement);

    if (error) {
      alert("Erreur lors du retrait !");
      console.error(error);
      return;
    }

    // Optionally log withdrawal in a "logs" table
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    await supabase.from('withdrawals').insert([
      { user_id: currentUser.personal_id, wine_id: wine.id, quantity: n, date: new Date().toISOString() }
    ]);

    renderWines(await fetchWines());
  } else {
    alert("Quantité invalide !");
  }
}
