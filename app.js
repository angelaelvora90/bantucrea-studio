/* ============================================================
   BantuCrea Studio — Créateur de CV
   Tout le comportement de l'application est ici, commenté en français
   pour faciliter l'apprentissage. ✨
   ============================================================ */

// ---------- 1. DONNÉES ----------

// Modèle de CV vide : c'est la structure de toutes nos données.
function etatVide() {
  return {
    template: "moderne",   // moderne | elegant | creatif
    accent: "#b45309",     // couleur d'accent
    photo: "",             // photo en base64 (ou "" si aucune)
    prenom: "", nom: "", titre: "",
    email: "", telephone: "", adresse: "", lien: "",
    resume: "",
    experiences: [],       // [{id, poste, entreprise, ville, debut, fin, encours, description}]
    formations: [],        // [{id, diplome, ecole, ville, debut, fin, description}]
    competences: [],       // [{id, nom, niveau}] niveau de 1 à 5
    langues: [],           // [{id, nom, niveau}]
    interets: ""           // texte, un intérêt par ligne
  };
}

// Exemple pré-rempli (profil fictif camerounais 🇨🇲)
function exempleData() {
  return {
    template: "moderne",
    accent: "#b45309",
    photo: "",
    prenom: "Angela", nom: "Elvora",
    titre: "Graphiste & Créatrice de contenu",
    email: "angela.elvora@mail.com",
    telephone: "+237 6 90 00 00 00",
    adresse: "Douala, Cameroun",
    lien: "linkedin.com/in/angela-elvora",
    resume: "Graphiste passionnée avec 4 ans d'expérience dans la création visuelle. Spécialisée en identité de marque et design pour réseaux sociaux. J'aide les entreprises africaines à raconter leur histoire en images.",
    experiences: [
      { id: uid(), poste: "Graphiste freelance", entreprise: "BantuCrea Studio", ville: "Douala", debut: "Jan 2023", fin: "", encours: true, description: "Création de logos et identités visuelles pour 20+ clients.\nDesign de visuels pour réseaux sociaux.\nCollaboration avec des imprimeurs locaux." },
      { id: uid(), poste: "Assistante designer", entreprise: "Agence Mboa Design", ville: "Yaoundé", debut: "Juin 2021", fin: "Déc 2022", encours: false, description: "Mise en page de brochures et affiches.\nRetouche photo et préparation pour impression." }
    ],
    formations: [
      { id: uid(), diplome: "Licence en Communication visuelle", ecole: "Université de Douala", ville: "Douala", debut: "2018", fin: "2021", description: "Mention Bien. Projet de fin d'études sur le design d'emballages artisanaux." },
      { id: uid(), diplome: "Certification Design graphique", ecole: "Formation en ligne", ville: "", debut: "2022", fin: "2022", description: "Photoshop, Illustrator, Figma." }
    ],
    competences: [
      { id: uid(), nom: "Photoshop / Illustrator", niveau: 5 },
      { id: uid(), nom: "Figma", niveau: 4 },
      { id: uid(), nom: "Réseaux sociaux", niveau: 5 },
      { id: uid(), nom: "Photographie", niveau: 3 }
    ],
    langues: [
      { id: uid(), nom: "Français", niveau: "Natif" },
      { id: uid(), nom: "Anglais", niveau: "Courant" },
      { id: uid(), nom: "Ewondo", niveau: "Courant" }
    ],
    interets: "Art traditionnel africain\nPhotographie\nMusique"
  };
}

// Petit identifiant unique pour chaque bloc ajouté
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- 2. SAUVEGARDE AUTOMATIQUE (localStorage) ----------
// Les données restent dans le navigateur, même après fermeture.

const CLE_STOCKAGE = "bantucrea-cv";

function chargerEtat() {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (brut) return { ...etatVide(), ...JSON.parse(brut) };
  } catch (e) { console.warn("Sauvegarde illisible, on repart de zéro.", e); }
  return etatVide();
}

let delaiSauvegarde = null;
function sauvegarder() {
  // On attend 300ms après la dernière frappe pour ne pas sauvegarder à chaque touche
  clearTimeout(delaiSauvegarde);
  delaiSauvegarde = setTimeout(() => {
    try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify(etat)); } catch (e) {}
  }, 300);
}

// L'état global de l'application : toutes les données du CV
let etat = chargerEtat();

// ---------- 3. PETITES FONCTIONS UTILES ----------

// Évite les problèmes si l'utilisateur tape des caractères spéciaux
function echapper(texte) {
  return String(texte ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Affiche un petit message en bas de l'écran
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 2500);
}

// ---------- 4. FORMULAIRE : champs simples ----------
// Chaque champ <input data-field="prenom"> est lié à etat.prenom automatiquement.

function lierChampsSimples() {
  document.querySelectorAll("[data-field]").forEach((champ) => {
    const cle = champ.dataset.field;
    champ.value = etat[cle] || "";
    champ.addEventListener("input", () => {
      etat[cle] = champ.value;
      sauvegarder();
      afficherCV();
    });
  });
}

// ---------- 5. FORMULAIRE : listes dynamiques ----------
// Expériences, formations, compétences, langues : on peut en ajouter/supprimer.

const CONFIG_LISTES = {
  experiences: {
    conteneur: "list-experiences",
    vide: () => ({ id: uid(), poste: "", entreprise: "", ville: "", debut: "", fin: "", encours: false, description: "" }),
    html: (item) => `
      <input type="text" data-liste="experiences" data-id="${item.id}" data-cle="poste" placeholder="Poste — Ex : Graphiste" value="${echapper(item.poste)}" />
      <div class="item-row">
        <input type="text" data-liste="experiences" data-id="${item.id}" data-cle="entreprise" placeholder="Entreprise" value="${echapper(item.entreprise)}" />
        <input type="text" data-liste="experiences" data-id="${item.id}" data-cle="ville" placeholder="Ville" value="${echapper(item.ville)}" />
      </div>
      <div class="item-row">
        <input type="text" data-liste="experiences" data-id="${item.id}" data-cle="debut" placeholder="Début — Ex : Jan 2023" value="${echapper(item.debut)}" />
        <input type="text" data-liste="experiences" data-id="${item.id}" data-cle="fin" placeholder="Fin — Ex : Déc 2024" value="${echapper(item.fin)}" ${item.encours ? "disabled" : ""} />
      </div>
      <label class="check-line">
        <input type="checkbox" data-liste="experiences" data-id="${item.id}" data-cle="encours" ${item.encours ? "checked" : ""} style="width:auto" />
        Poste actuel (en cours)
      </label>
      <textarea rows="3" data-liste="experiences" data-id="${item.id}" data-cle="description" placeholder="Missions et réalisations (une par ligne)">${echapper(item.description)}</textarea>
      <button type="button" class="btn btn-danger" data-supprimer="experiences" data-id="${item.id}">Supprimer</button>
    `
  },
  formations: {
    conteneur: "list-formations",
    vide: () => ({ id: uid(), diplome: "", ecole: "", ville: "", debut: "", fin: "", description: "" }),
    html: (item) => `
      <input type="text" data-liste="formations" data-id="${item.id}" data-cle="diplome" placeholder="Diplôme — Ex : Licence en informatique" value="${echapper(item.diplome)}" />
      <div class="item-row">
        <input type="text" data-liste="formations" data-id="${item.id}" data-cle="ecole" placeholder="École / Université" value="${echapper(item.ecole)}" />
        <input type="text" data-liste="formations" data-id="${item.id}" data-cle="ville" placeholder="Ville" value="${echapper(item.ville)}" />
      </div>
      <div class="item-row">
        <input type="text" data-liste="formations" data-id="${item.id}" data-cle="debut" placeholder="Début — Ex : 2018" value="${echapper(item.debut)}" />
        <input type="text" data-liste="formations" data-id="${item.id}" data-cle="fin" placeholder="Fin — Ex : 2021" value="${echapper(item.fin)}" />
      </div>
      <textarea rows="2" data-liste="formations" data-id="${item.id}" data-cle="description" placeholder="Détails (mention, projet…)">${echapper(item.description)}</textarea>
      <button type="button" class="btn btn-danger" data-supprimer="formations" data-id="${item.id}">Supprimer</button>
    `
  },
  competences: {
    conteneur: "list-competences",
    vide: () => ({ id: uid(), nom: "", niveau: 3 }),
    html: (item) => `
      <div class="item-row">
        <input type="text" data-liste="competences" data-id="${item.id}" data-cle="nom" placeholder="Ex : Photoshop" value="${echapper(item.nom)}" />
        <select data-liste="competences" data-id="${item.id}" data-cle="niveau">
          ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(item.niveau) === n ? "selected" : ""}>Niveau ${n}/5</option>`).join("")}
        </select>
      </div>
      <button type="button" class="btn btn-danger" data-supprimer="competences" data-id="${item.id}">Supprimer</button>
    `
  },
  langues: {
    conteneur: "list-langues",
    vide: () => ({ id: uid(), nom: "", niveau: "Courant" }),
    html: (item) => `
      <div class="item-row">
        <input type="text" data-liste="langues" data-id="${item.id}" data-cle="nom" placeholder="Ex : Anglais" value="${echapper(item.nom)}" />
        <select data-liste="langues" data-id="${item.id}" data-cle="niveau">
          ${["Débutant", "Intermédiaire", "Avancé", "Courant", "Natif"].map((n) => `<option ${item.niveau === n ? "selected" : ""}>${n}</option>`).join("")}
        </select>
      </div>
      <button type="button" class="btn btn-danger" data-supprimer="langues" data-id="${item.id}">Supprimer</button>
    `
  }
};

// Dessine les blocs d'une liste (appelé après ajout/suppression)
function afficherListe(nom) {
  const config = CONFIG_LISTES[nom];
  const conteneur = document.getElementById(config.conteneur);
  conteneur.innerHTML = etat[nom].map((item) =>
    `<div class="item-card">${config.html(item)}</div>`
  ).join("");
}

// Écoute globale : frappe dans un champ de liste OU clic sur Supprimer
function lierListes() {
  document.querySelector(".editor").addEventListener("input", (e) => {
    const champ = e.target;
    if (!champ.dataset.liste) return;
    const { liste, id, cle } = champ.dataset;
    const item = etat[liste].find((x) => x.id === id);
    if (!item) return;
    item[cle] = champ.type === "checkbox" ? champ.checked : champ.value;
    // Si "en cours" est coché, on vide la date de fin
    if (cle === "encours") {
      if (item.encours) item.fin = "";
      afficherListe(liste); // redessine pour activer/désactiver le champ Fin
    }
    sauvegarder();
    afficherCV();
  });

  document.querySelector(".editor").addEventListener("change", (e) => {
    const champ = e.target;
    if (!champ.dataset.liste) return;
    const { liste, id, cle } = champ.dataset;
    const item = etat[liste].find((x) => x.id === id);
    if (!item) return;
    item[cle] = champ.value;
    sauvegarder();
    afficherCV();
  });

  document.querySelector(".editor").addEventListener("click", (e) => {
    const bouton = e.target.closest("[data-supprimer]");
    if (!bouton) return;
    const { supprimer: liste, id } = bouton.dataset;
    etat[liste] = etat[liste].filter((x) => x.id !== id);
    afficherListe(liste);
    sauvegarder();
    afficherCV();
  });

  // Boutons "+ Ajouter ..."
  document.querySelectorAll("[data-add]").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      const liste = bouton.dataset.add;
      etat[liste].push(CONFIG_LISTES[liste].vide());
      afficherListe(liste);
      sauvegarder();
      afficherCV();
    });
  });
}

// ---------- 6. MODÈLE + COULEUR + PHOTO ----------

function lierModeles() {
  const boutons = document.querySelectorAll(".template-btn");
  const maj = () => boutons.forEach((b) =>
    b.classList.toggle("active", b.dataset.template === etat.template));
  boutons.forEach((b) => b.addEventListener("click", () => {
    etat.template = b.dataset.template;
    maj(); sauvegarder(); afficherCV();
  }));
  maj();
}

function lierCouleur() {
  const input = document.getElementById("accent-color");
  input.value = etat.accent || "#b45309";
  input.addEventListener("input", () => {
    etat.accent = input.value;
    sauvegarder(); afficherCV();
  });
}

function lierPhoto() {
  const input = document.getElementById("photo-input");
  input.addEventListener("change", () => {
    const fichier = input.files[0];
    if (!fichier) return;
    const lecteur = new FileReader();
    lecteur.onload = () => {
      // On réduit l'image à 400px max pour ne pas saturer la sauvegarde
      const img = new Image();
      img.onload = () => {
        const max = 400;
        const ratio = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        etat.photo = canvas.toDataURL("image/jpeg", 0.85);
        sauvegarder(); afficherCV();
        toast("📷 Photo ajoutée !");
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}

// ---------- 7. APERÇU DU CV ----------

// Petits morceaux de HTML réutilisés par les 3 modèles
function htmlContact() {
  return [etat.email, etat.telephone, etat.adresse, etat.lien]
    .filter(Boolean).map((x) => `<div class="contact-item">• ${echapper(x)}</div>`).join("");
}

function htmlCompetences(style) {
  return etat.competences.filter((c) => c.nom.trim()).map((c) => {
    if (style === "barres") {
      const pct = Math.min(100, Math.max(0, Number(c.niveau) * 20));
      return `<div class="skill"><div class="skill-name">${echapper(c.nom)}</div><div class="bar"><div style="width:${pct}%"></div></div></div>`;
    }
    // style "points" : ●●●○○
    let points = "";
    for (let i = 1; i <= 5; i++) points += `<span class="${i <= c.niveau ? "on" : "off"}">●</span>`;
    return `<div class="skill"><div class="skill-name">${echapper(c.nom)}</div><div class="dots">${points}</div></div>`;
  }).join("");
}

function htmlLangues() {
  return etat.langues.filter((l) => l.nom.trim()).map((l) =>
    `<div class="lang"><span>${echapper(l.nom)}</span><span>${echapper(l.niveau)}</span></div>`
  ).join("");
}

function htmlInterets() {
  return etat.interets.split("\n").map((x) => x.trim()).filter(Boolean)
    .map((x) => `<span class="interet-tag">${echapper(x)}</span>`).join("");
}

function htmlExperiences() {
  return etat.experiences.map((e) => {
    const fin = e.encours ? "En cours" : e.fin;
    const dates = [e.debut, fin].filter(Boolean).join(" – ");
    const lieu = [e.entreprise, e.ville].filter(Boolean).join(" · ");
    return `<div class="job">
      <div class="job-head"><span class="job-title">${echapper(e.poste) || "Poste"}</span><span class="job-date">${echapper(dates)}</span></div>
      <div class="job-company">${echapper(lieu)}</div>
      <div class="job-desc">${echapper(e.description)}</div>
    </div>`;
  }).join("");
}

function htmlFormations() {
  return etat.formations.map((f) => {
    const dates = [f.debut, f.fin].filter(Boolean).join(" – ");
    const lieu = [f.ecole, f.ville].filter(Boolean).join(" · ");
    return `<div class="school">
      <div class="school-head"><span class="school-title">${echapper(f.diplome) || "Diplôme"}</span><span class="school-date">${echapper(dates)}</span></div>
      <div class="job-company">${echapper(lieu)}</div>
      <div class="school-desc">${echapper(f.description)}</div>
    </div>`;
  }).join("");
}

function htmlPhoto() {
  return etat.photo ? `<img class="cv-photo" src="${etat.photo}" alt="Photo" />` : "";
}

function section(titre, contenu) {
  return contenu.trim() ? `<h3>${titre}</h3>${contenu}` : "";
}

// La fonction principale : reconstruit tout l'aperçu du CV
function afficherCV() {
  const feuille = document.getElementById("cv-sheet");
  const nomComplet = [etat.prenom, etat.nom].filter(Boolean).join(" ") || "Votre nom";

  // Si tout est vide, on affiche un message d'aide
  const estVide = !etat.prenom && !etat.nom && !etat.titre && etat.experiences.length === 0
    && etat.formations.length === 0 && etat.competences.length === 0;
  if (estVide) {
    feuille.innerHTML = `<div class="cv"><div class="cv-empty">👈 Remplissez le formulaire à gauche<br/>ou cliquez sur <strong>✨ Exemple</strong> pour voir un CV pré-rempli.</div></div>`;
    return;
  }

  let html = "";

  if (etat.template === "moderne") {
    html = `<div class="cv cv-moderne" style="--cv-accent:${echapper(etat.accent)}">
      <div class="side">
        ${htmlPhoto()}
        ${section("Contact", htmlContact())}
        ${section("Compétences", htmlCompetences("points"))}
        ${section("Langues", htmlLangues())}
        ${section("Intérêts", htmlInterets())}
      </div>
      <div class="main">
        <div class="cv-name">${echapper(nomComplet)}</div>
        <div class="cv-title">${echapper(etat.titre)}</div>
        ${etat.resume ? `<p>${echapper(etat.resume)}</p>` : ""}
        ${section("Expériences", htmlExperiences())}
        ${section("Formations", htmlFormations())}
      </div>
    </div>`;
  } else if (etat.template === "elegant") {
    const ligneContact = [etat.email, etat.telephone, etat.adresse, etat.lien].filter(Boolean).map(echapper).join(" · ");
    html = `<div class="cv cv-elegant" style="--cv-accent:${echapper(etat.accent)}">
      <div class="head">
        <div class="cv-name">${echapper(nomComplet)}</div>
        <div class="cv-title">${echapper(etat.titre)}</div>
        <div class="contact-line">${ligneContact}</div>
      </div>
      ${etat.resume ? `<h3>Profil</h3><p>${echapper(etat.resume)}</p>` : ""}
      ${section("Expériences professionnelles", htmlExperiences())}
      ${section("Formations", htmlFormations())}
      ${section("Compétences", htmlCompetences("barres"))}
      ${section("Langues", htmlLangues())}
      ${section("Centres d'intérêt", htmlInterets())}
    </div>`;
  } else { // creatif
    html = `<div class="cv cv-creatif" style="--cv-accent:${echapper(etat.accent)}">
      <div class="banner">
        ${htmlPhoto()}
        <div>
          <div class="cv-name">${echapper(nomComplet)}</div>
          <div class="cv-title">${echapper(etat.titre)}</div>
        </div>
      </div>
      <div class="body">
        <div>
          ${etat.resume ? `<h3>Profil</h3><p>${echapper(etat.resume)}</p>` : ""}
          ${section("Expériences", htmlExperiences())}
          ${section("Formations", htmlFormations())}
        </div>
        <div>
          ${section("Contact", htmlContact())}
          ${section("Compétences", htmlCompetences("barres"))}
          ${section("Langues", htmlLangues())}
          ${section("Intérêts", htmlInterets())}
        </div>
      </div>
    </div>`;
  }

  feuille.innerHTML = html;
}

// ---------- 8. BOUTONS : PDF, IMPRIMER, EXEMPLE, RESET ----------

function lierBoutons() {
  // Télécharger en PDF (via la librairie html2pdf)
  document.getElementById("btn-pdf").addEventListener("click", async () => {
    const element = document.getElementById("cv-sheet");
    const nom = [etat.prenom, etat.nom].filter(Boolean).join("-") || "mon-cv";
    // Si la librairie n'a pas chargé (pas d'internet), on propose l'impression
    if (typeof html2pdf === "undefined") {
      toast("⚠️ Pas de connexion : utilisez Imprimer → Enregistrer en PDF");
      return;
    }
    toast("⏳ Génération du PDF…");
    try {
      await html2pdf().set({
        margin: 0,
        filename: `CV-${nom}.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      }).from(element).save();
      toast("✅ PDF téléchargé !");
    } catch (e) {
      console.error(e);
      toast("⚠️ Erreur PDF, essayez Imprimer à la place");
    }
  });

  // Imprimer (on peut aussi choisir "Enregistrer en PDF" dans la boîte de dialogue)
  document.getElementById("btn-print").addEventListener("click", () => window.print());

  // Charger l'exemple
  document.getElementById("btn-example").addEventListener("click", () => {
    if (!confirm("Charger l'exemple ? Vos données actuelles seront remplacées.")) return;
    etat = exempleData();
    toutRafraichir();
    toast("✨ Exemple chargé !");
  });

  // Tout effacer
  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm("Tout effacer ? Cette action est irréversible.")) return;
    etat = etatVide();
    localStorage.removeItem(CLE_STOCKAGE);
    toutRafraichir();
    toast("🗑 CV effacé, on repart de zéro !");
  });
}

// Re-remplit tout le formulaire depuis l'état (après Exemple / Reset)
function toutRafraichir() {
  document.querySelectorAll("[data-field]").forEach((champ) => {
    champ.value = etat[champ.dataset.field] || "";
  });
  document.getElementById("accent-color").value = etat.accent || "#b45309";
  document.querySelectorAll(".template-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.template === etat.template));
  Object.keys(CONFIG_LISTES).forEach(afficherListe);
  sauvegarder();
  afficherCV();
}

// ---------- 9. DÉMARRAGE ----------

lierChampsSimples();
lierListes();
lierModeles();
lierCouleur();
lierPhoto();
lierBoutons();
Object.keys(CONFIG_LISTES).forEach(afficherListe);
afficherCV();
