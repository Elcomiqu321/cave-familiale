/****************************************************
 * SUPABASE CONFIGURATION
 ****************************************************/

const SUPABASE_URL = "https://XXXX.supabase.co";
const SUPABASE_KEY = "YOUR_PUBLISHABLE_KEY";

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/****************************************************
 * GLOBAL STATE
 ****************************************************/

let currentUser = null;

/****************************************************
 * DOM REFERENCES
 ****************************************************/

const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginButton = document.getElementById("login-button");
const loginError = document.getElementById("login-error");
const personalIdInput = document.getElementById("personal-id");
const wineList = document.getElementById("wine-list");
const userNameSpan = document.getElementById("user-name");

/****************************************************
 * LOGIN
 ****************************************************/

loginButton.addEventListener("click", login);

async function login() {
  loginError.textContent = "";

  const personalId = personalIdInput.value.trim();

  if (!personalId) {
    loginError.textContent = "Identifiant requis";
    return;
  }

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("personal_id", personalId)
    .single();

  if (error || !data) {
    loginError.textContent = "Identifiant invalide";
    return;
  }

  currentUser = data;

  // Update last connection date
  await supabase
    .from("users")
    .update({ last_connection_at: new Date() })
    .eq("id", data.id);

  userNameSpan.textContent = data.full_name;

  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  loadWines();
}

/****************************************************
 * LOAD WINES
 ****************************************************/

async function loadWines() {
  wineList.innerHTML = "Chargement...";

  const { data, error } = await supabase
    .from("wines")
    .select(`
      id,
      appellation,
      climat,
      millesime,
      couleur,
      origine,
      emplacement,
      quantity
    `)
    .gt("quantity", 0)
    .order("appellation");

  if (error) {
    wineList.innerHTML = "Erreur lors du chargement";
    console.error(error);
    return;
  }

  renderWines(data);
}

/****************************************************
 * RENDER WINES
 ****************************************************/

function renderWines(wines) {
  wineList.innerHTML = "";

  if (wines.length === 0) {
    wineList.textContent = "Aucune bouteille disponible";
    return;
  }

  wines.forEach(wine => {
    const card = document.createElement("div");
    card.className = "wine-card";

    card.innerHTML = `
      <strong>${wine.appellation}${wine.climat ? " – " + wine.climat : ""}</strong><br>
      ${wine.millesime} • ${wine.couleur}<br>
      Stock : ${wine.quantity}<br>
      <small>Emplacement : ${wine.emplacement || "-"}</small>
    `;

    wineList.appendChild(card);
  });
}
