import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyCxw4GVzpqaymRE4c38eHHxpzFjyA6TyMk",
  authDomain: "a-p-e-x.firebaseapp.com",
  projectId: "a-p-e-x",
  storageBucket: "a-p-e-x.firebasestorage.app",
  messagingSenderId: "166858686104",
  appId: "1:166858686104:web:33ae05d1cc4ec9de44daed",
  measurementId: "G-7S6MHE6WXF"
};

// --- SUPABASE STORAGE CONFIG ---
const SUPABASE_URL = "https://gwzhifnghmrnvkcnjgip.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_x5taeM5x-1gNQH5oeIqhNA_wm33ZEYK";
const SUPABASE_BUCKET = "codewix";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// --- UTILITIES ---
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}
function esc(str = "") {
  return String(str).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function cleanPhone(str = "") {
  return String(str).replace(/[^0-9]/g, "");
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } 
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); return true; }
}

async function uploadToSupabase(file, folder) {
  const ext = (file.name.split(".").pop() || "png").replace(/[^a-zA-Z0-9]/g, "");
  const filePath = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${filePath}`;

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true"
    },
    body: file
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = "Image upload failed";
    try { msg = JSON.parse(errText).message || msg; } catch {}
    throw new Error(msg);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${filePath}`;
}

// --- GAMESKINBO API HELPER ---
async function fetchGarenaStats(uid, region) {
  const params = new URLSearchParams({
    uid: String(uid || "").trim(),
    region: String(region || "SG").trim().toUpperCase()
  });

  const res = await fetch(`/api/garena/ff-info?${params.toString()}`);
  const payload = await res.json();

  if (!res.ok || payload.error) {
    throw new Error(payload.error || payload.message || `API Error (${res.status})`);
  }

  // Normalize different possible GamesKinbo response structures
  const info = payload.basicInfo || payload.AccountInfo || payload.data?.basicInfo || payload.data?.AccountInfo || payload.data || payload;
  const clan = payload.clanBasicInfo || payload.GuildInfo || payload.data?.clanBasicInfo || {};

  return {
    raw: payload,
    ign: info.nickname || info.AccountName || info.ign || info.name || "",
    level: Number(info.level || info.AccountLevel || info.Level || 0),
    rankPoints: info.rankingPoints || info.brRank || info.BrRank || info.rank || "",
    region: info.region || info.AccountRegion || region || "",
    likes: info.liked ?? info.likes ?? info.AccountLikes ?? "",
    guildName: clan.clanName || clan.GuildName || info.guildName || "None"
  };
}

// --- ROUTER & AUTH GATE ---
const path = window.location.pathname.toLowerCase();
const isLogin = path.includes("login.html");
const isOnboarding = path.includes("onboarding.html");
const isAdmin = path.includes("admin.html");
const isPending = path.includes("pending.html");
const isDashboard = path.includes("dashboard.html");
const isIndex = !isLogin && !isOnboarding && !isAdmin && !isPending && !isDashboard &&
                !path.includes("members.html") && !path.includes("chat.html") && !path.includes("profile.html");

onAuthStateChanged(auth, async (user) => {
  document.querySelectorAll("#logout-btn").forEach(btn => {
    btn.onclick = (e) => { e.preventDefault(); signOut(auth); };
  });

  // 1. Admin Page Gate
  if (isAdmin) {
    initAdmin(user);
    return;
  }

  // 2. Public Landing Page (index.html)
  if (isIndex) {
    initLanding(user);
    return;
  }

  // 3. Login Page Logic
  if (isLogin) {
    if (user) { window.location.href = "dashboard.html"; return; }
    const googleBtn = document.getElementById("google-login-btn");
    if (googleBtn) {
      googleBtn.onclick = async () => {
        try { await signInWithPopup(auth, googleProvider); } 
        catch (err) {
          const errEl = document.getElementById("login-error");
          if (errEl) { errEl.textContent = err.message; errEl.style.display = "block"; }
        }
      };
    }
    return;
  }

  // 4. Force Redirect to login.html for ALL other pages (including onboarding.html) if NOT logged in
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // 5. Check Logged-In User Status
  const userDoc = await getDoc(doc(db, "users", user.uid));
  const appDoc = await getDoc(doc(db, "applications", user.uid));

  if (!userDoc.exists()) {
    if (!appDoc.exists() && !isOnboarding) { window.location.href = "onboarding.html"; return; }
    if (appDoc.exists() && !isPending) { window.location.href = "pending.html"; return; }
  } else {
    const status = userDoc.data().status;
    if (status === "pending" || status === "rejected") {
      if (!isPending) window.location.href = "pending.html";
      return;
    }
    if (status === "approved") {
      if (isPending || isOnboarding) { window.location.href = "dashboard.html"; return; }
    }
  }

  // 6. Init Protected Page Logic
  if (document.getElementById("guildIdText")) initHome();
  if (document.getElementById("member-grid")) initMembers();
  if (document.getElementById("chat-messages")) initChat(user, userDoc.data());
  if (document.getElementById("profile-name")) initProfile(user, userDoc.data());
  if (isOnboarding) initOnboarding(user);
});

// ==========================================
// PAGE: PUBLIC LANDING (index.html)
// ==========================================
async function initLanding(user) {
  window.copyGuildId = async () => {
    await copyText("3107592050");
    showToast("Guild ID copied ✅");
  };

  if (!user) return;

  const navCta = document.getElementById("nav-cta");
  const heroPrimary = document.getElementById("hero-primary-btn");
  const heroSecondary = document.getElementById("hero-secondary-btn");
  const ctaBottom = document.getElementById("cta-bottom-btn");

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const status = userDoc.exists() ? userDoc.data().status : null;

    if (status === "approved") {
      if (navCta) { navCta.textContent = "Dashboard"; navCta.href = "dashboard.html"; }
      if (heroPrimary) { heroPrimary.textContent = "Open Member Dashboard"; heroPrimary.href = "dashboard.html"; }
      if (heroSecondary) { heroSecondary.textContent = "View Roster"; heroSecondary.href = "members.html"; }
      if (ctaBottom) { ctaBottom.textContent = "Go to Dashboard"; ctaBottom.href = "dashboard.html"; }
    } else if (status === "pending" || status === "rejected") {
      if (navCta) { navCta.textContent = "Status"; navCta.href = "pending.html"; }
      if (heroPrimary) { heroPrimary.textContent = "Check Application Status"; heroPrimary.href = "pending.html"; }
      if (ctaBottom) { ctaBottom.textContent = "Check Application Status"; ctaBottom.href = "pending.html"; }
    } else {
      if (navCta) { navCta.textContent = "Complete Application"; navCta.href = "onboarding.html"; }
      if (heroPrimary) { heroPrimary.textContent = "Complete Your Application"; heroPrimary.href = "onboarding.html"; }
      if (ctaBottom) { ctaBottom.textContent = "Complete Application"; ctaBottom.href = "onboarding.html"; }
    }
  } catch (err) {
    console.warn("Landing status check skipped:", err.message);
  }
}

// ==========================================
// PAGE: ONBOARDING (With Supabase Uploads)
// ==========================================
function initOnboarding(user) {
  const form = document.getElementById("onboardingForm");
  if (!form) return;
  const rankOptions = document.querySelectorAll(".rank-option");
  const hiddenRankInput = document.getElementById("selectedRank");

  rankOptions.forEach(opt => {
    opt.addEventListener("click", () => {
      rankOptions.forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");
      hiddenRankInput.value = opt.dataset.rank;
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.rank.value) {
      showToast("Please select your Current BR Rank.");
      return;
    }

    const proofFile = form.proofPic.files[0];
    if (!proofFile) {
      showToast("Please upload your Free Fire profile screenshot.");
      return;
    }

    const btn = document.getElementById("submit-btn");
    btn.disabled = true; btn.textContent = "Uploading Images...";

    try {
      let photoURL = user.photoURL || "https://via.placeholder.com/100";

      const profileFile = form.profilePic.files[0];
      if (profileFile) {
        photoURL = await uploadToSupabase(profileFile, `profiles/${user.uid}`);
      }

      const proofURL = await uploadToSupabase(proofFile, `proofs/${user.uid}`);

      btn.textContent = "Saving Application...";

      const appData = {
        authUid: user.uid,
        email: user.email,
        ign: form.ign.value.trim(),
        uid: form.uid.value.trim(),
        whatsapp: form.whatsapp.value.trim(),
        region: form.region.value,
        level: Number(form.level.value),
        role: form.role.value,
        rank: form.rank.value,
        nameTag: form.nameTag.value,
        photoURL: photoURL,
        proofURL: proofURL,
        status: "pending",
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, "applications", user.uid), appData);
      await setDoc(doc(db, "users", user.uid), { status: "pending", email: user.email });
      
      window.location.href = "pending.html";
    } catch (err) {
      showToast("Error: " + err.message);
      btn.disabled = false; btn.textContent = "Submit Application";
    }
  });
}

// ==========================================
// PAGE: MEMBER DASHBOARD (dashboard.html)
// ==========================================
function initHome() {
  window.copyGuildId = async () => { await copyText("3107592050"); showToast("Guild ID copied ✅"); };
  const list = document.getElementById("announce-list");
  if (!list) return;
  getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(3)))
    .then(snap => {
      if (snap.empty) { list.innerHTML = `<div class="empty-state">No announcements yet.</div>`; return; }
      list.innerHTML = snap.docs.map(d => `<article class="announce"><h3>${esc(d.data().title)}</h3><p>${esc(d.data().body).replace(/\n/g, "<br>")}</p></article>`).join("");
    });
}

// ==========================================
// PAGE: PROFILE
// ==========================================
function initProfile(user, data) {
  document.getElementById("profile-avatar").src = data.photoURL;
  document.getElementById("profile-name").textContent = data.ign;
  document.getElementById("profile-email").textContent = data.email;
  document.getElementById("p-ign").textContent = data.ign;
  document.getElementById("p-uid").textContent = data.uid;
  document.getElementById("p-level").textContent = data.level;
  document.getElementById("p-region").textContent = data.region;
  document.getElementById("p-rank").textContent = data.rank;
  document.getElementById("p-role").textContent = data.role;
}

// ==========================================
// PAGE: CHAT
// ==========================================
function initChat(user, profile) {
  const chatBox = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");

  const q = query(collection(db, "chat"), orderBy("createdAt", "asc"), limit(50));
  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) { chatBox.innerHTML = `<div class="empty-state">No messages yet.</div>`; return; }
    chatBox.innerHTML = snapshot.docs.map(doc => {
      const msg = doc.data();
      const time = msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
      return `<div class="chat-msg"><img src="${esc(msg.photoURL)}" class="chat-avatar" /><div class="chat-content"><span class="chat-time">${esc(time)}</span><div class="chat-sender">${esc(msg.senderName)}</div><div class="chat-text">${esc(msg.text)}</div></div></div>`;
    }).join("");
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.disabled = true;
    try {
      await addDoc(collection(db, "chat"), {
        text: text, uid: user.uid, senderName: profile.ign || user.displayName, photoURL: profile.photoURL, createdAt: serverTimestamp()
      });
      chatInput.value = "";
    } catch (err) { showToast("Error: " + err.message); } 
    finally { chatInput.disabled = false; chatInput.focus(); }
  });
}

// ==========================================
// PAGE: MEMBERS
// ==========================================
function initMembers() {
  const ROLE_ORDER = { leader: 0, coleader: 1, officer: 2, member: 3, recruit: 4 };
  const roleLabel = (r) => ({ leader: "Guild Leader", coleader: "Co-Leader", officer: "Officer", member: "Member", recruit: "Recruit" })[r] || "Member";
  const roleClass = (r) => ({ leader: "role-leader", coleader: "role-officer", officer: "role-officer", member: "role-member", recruit: "role-member" })[r] || "role-member";

  getDocs(collection(db, "members")).then(snap => {
    let members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    members.sort((a, b) => ((ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)) || (a.ign || "").localeCompare(b.ign || ""));
    const grid = document.getElementById("member-grid");
    document.getElementById("member-count").textContent = `${members.length} members`;
    grid.innerHTML = members.map(m => `
      <div class="card">
        <span class="role-tag ${roleClass(m.role)}">${roleLabel(m.role)}</span>
        <div class="ign">${esc(m.ign)}</div>
        <div class="member-meta">
          ${m.region ? `<span>🌍 ${esc(m.region)}</span>` : ""}
          ${m.level ? `<span>⭐ Lv. ${esc(m.level)}</span>` : ""}
          ${m.rank ? `<span>🏆 ${esc(m.rank)}</span>` : ""}
        </div>
      </div>`).join("");
  });
}

// ==========================================
// PAGE: ADMIN (With GamesKinbo Review & Sync)
// ==========================================
let adminInitialized = false;

async function initAdmin(u) {
  const checkAdmin = async (usr) => {
    if (!usr) return false;
    const token = await usr.getIdTokenResult(true);
    return token.claims.admin === true;
  };

  if (!adminInitialized) {
    adminInitialized = true;

    document.getElementById("login-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await signInWithEmailAndPassword(auth, e.target.email.value, e.target.password.value);
      } catch (err) {
        const errBox = document.getElementById("login-error");
        errBox.textContent = err.message;
        errBox.style.display = "";
      }
    });

    document.getElementById("announce-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await addDoc(collection(db, "announcements"), {
        title: e.target.title.value,
        body: e.target.body.value,
        author: auth.currentUser.email,
        createdAt: serverTimestamp()
      });
      e.target.reset();
      showToast("Posted!");
      loadAdminData();
    });

    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".tab-panel").forEach(p => p.style.display = "none");
        const target = document.getElementById(tab.dataset.target);
        if (target) target.style.display = "block";
      });
    });

    document.getElementById("close-review-modal")?.addEventListener("click", () => {
      document.getElementById("review-modal")?.classList.remove("open");
    });
    document.getElementById("review-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "review-modal") e.target.classList.remove("open");
    });
  }

  if (!u) {
    document.getElementById("login-view").style.display = "";
    document.getElementById("dash-view").style.display = "none";
    document.getElementById("logout-btn").style.display = "none";
    return;
  }

  if (!(await checkAdmin(u))) {
    await signOut(auth);
    const errBox = document.getElementById("login-error");
    errBox.textContent = "Not an admin account.";
    errBox.style.display = "";
    return;
  }

  document.getElementById("login-view").style.display = "none";
  document.getElementById("dash-view").style.display = "";
  document.getElementById("admin-email").textContent = u.email;
  document.getElementById("logout-btn").style.display = "block";
  loadAdminData();
}

function loadAdminData() {
  // 1. Load Applications
  getDocs(query(collection(db, "applications"), orderBy("createdAt", "desc"))).then(snap => {
    const tbody = document.getElementById("applications-body");
    if (snap.empty) { tbody.innerHTML = `<tr><td colspan="7">No applications.</td></tr>`; return; }
    tbody.innerHTML = snap.docs.map(d => {
      const a = d.data();
      return `<tr>
        <td><img src="${esc(a.photoURL)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover"></td>
        <td><strong>${esc(a.ign)}</strong><br><small>${esc(a.uid)} (${esc(a.region)})</small></td>
        <td><a href="https://wa.me/${cleanPhone(a.whatsapp)}" target="_blank" class="btn" style="font-size:0.7rem;padding:4px 8px;">Chat</a></td>
        <td>${esc(a.rank)}<br><small>Lv. ${esc(a.level || "?")}</small></td>
        <td class="status-${esc(a.status)}">${esc(a.status)}</td>
        <td><a href="${esc(a.proofURL)}" target="_blank"><img src="${esc(a.proofURL)}" class="proof-img" title="Click to view proof"></a></td>
        <td>
          <div class="row-actions">
            <button class="btn btn-review" onclick="window.reviewStats('applications', '${d.id}')">Review</button>
            ${a.status === "pending" ? `<button class="btn" onclick="window.approveApp('${d.id}')">Approve</button>` : ""}
            <button class="btn-danger btn" onclick="window.delApp('${d.id}')">Delete</button>
          </div>
        </td>
      </tr>`;
    }).join("");
  });

  // 2. Load Members
  getDocs(collection(db, "members")).then(snap => {
    const tbody = document.getElementById("members-body");
    if (snap.empty) { tbody.innerHTML = `<tr><td colspan="6">No members.</td></tr>`; return; }
    tbody.innerHTML = snap.docs.map(d => {
      const m = d.data();
      return `<tr>
        <td><strong>${esc(m.ign)}</strong><br><small>${esc(m.rank || "")}</small></td>
        <td><strong>${esc(m.role)}</strong></td>
        <td><a href="https://wa.me/${cleanPhone(m.whatsapp)}" target="_blank" class="btn wa-btn" style="font-size:0.7rem;padding:4px 8px;">Chat</a></td>
        <td>${esc(m.uid)}</td>
        <td>${esc(m.region)} · Lv. ${esc(m.level || "?")}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-review" onclick="window.reviewStats('members', '${d.id}')">Sync Stats</button>
            <button class="btn-secondary btn" onclick="window.promoteMember('${d.id}', 'officer')">Make Officer</button>
            <button class="btn-danger btn" onclick="window.delMember('${d.id}', '${esc(m.authUid)}')">Delete</button>
          </div>
        </td>
      </tr>`;
    }).join("");
  });

  // 3. Load Announcements
  getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"))).then(snap => {
    const list = document.getElementById("announcements-list");
    list.innerHTML = snap.docs.map(d => `
      <div class="announce" style="margin-bottom:12px">
        <h3>${esc(d.data().title)}</h3><p>${esc(d.data().body)}</p>
        <button class="btn-danger btn" style="margin-top:10px" onclick="window.delAnn('${d.id}')">Delete</button>
      </div>
    `).join("");
  });
}

// --- REVIEW & SYNC LIVE GARENA STATS (GamesKinbo) ---
window.reviewStats = async (collectionName, docId) => {
  const modal = document.getElementById("review-modal");
  const titleEl = document.getElementById("review-modal-title");
  const bodyEl = document.getElementById("review-modal-body");
  const actionsEl = document.getElementById("review-modal-actions");

  titleEl.textContent = collectionName === "applications" ? "Review Applicant Stats" : "Sync Member Stats";
  bodyEl.innerHTML = `<p style="color:var(--muted)">Querying GamesKinbo Free Fire API...</p>`;
  actionsEl.innerHTML = "";
  modal.classList.add("open");

  try {
    const snap = await getDoc(doc(db, collectionName, docId));
    if (!snap.exists()) throw new Error("Record not found.");
    const current = snap.data();

    const live = await fetchGarenaStats(current.uid, current.region);

    bodyEl.innerHTML = `
      <p style="font-size:0.85rem;color:var(--muted);margin-bottom:8px;">
        UID: <strong>${esc(current.uid)}</strong> (${esc(current.region)}) · Current Guild: <strong>${esc(live.guildName)}</strong>
      </p>
      <table class="stat-compare">
        <thead><tr><th>Field</th><th>Saved in Site</th><th>Live Garena API</th></tr></thead>
        <tbody>
          <tr><td>IGN</td><td>${esc(current.ign)}</td><td class="stat-live">${esc(live.ign || current.ign)}</td></tr>
          <tr><td>Level</td><td>Lv. ${esc(current.level || "?")}</td><td class="stat-live">Lv. ${esc(live.level || current.level || "?")}</td></tr>
          <tr><td>BR Rank / Pts</td><td>${esc(current.rank || "—")}</td><td class="stat-live">${esc(live.rankPoints || "—")}</td></tr>
          <tr><td>Likes</td><td>—</td><td class="stat-live">${esc(live.likes !== "" ? live.likes : "—")}</td></tr>
        </tbody>
      </table>
    `;

    const applyBtn = document.createElement("button");
    applyBtn.className = "btn";
    applyBtn.textContent = "Update Stats in Database";
    applyBtn.onclick = async () => {
      applyBtn.disabled = true;
      applyBtn.textContent = "Updating...";
      try {
        const updates = {
          ign: live.ign || current.ign,
          level: live.level || current.level,
          lastSyncedAt: serverTimestamp()
        };

        await updateDoc(doc(db, collectionName, docId), updates);

        // Also keep the user's profile doc in sync if it exists
        const targetAuthUid = current.authUid || docId;
        if (collectionName === "members" && targetAuthUid) {
          await updateDoc(doc(db, "users", targetAuthUid), updates);
        }

        showToast("Player stats updated ✅");
        modal.classList.remove("open");
        loadAdminData();
      } catch (err) {
        showToast("Update failed: " + err.message);
        applyBtn.disabled = false;
        applyBtn.textContent = "Update Stats in Database";
      }
    };

    actionsEl.appendChild(applyBtn);

    if (collectionName === "applications" && current.status === "pending") {
      const approveBtn = document.createElement("button");
      approveBtn.className = "btn btn-review";
      approveBtn.textContent = "Sync & Approve";
      approveBtn.onclick = async () => {
        approveBtn.disabled = true;
        await updateDoc(doc(db, "applications", docId), {
          ign: live.ign || current.ign,
          level: live.level || current.level
        });
        modal.classList.remove("open");
        await window.approveApp(docId, true);
      };
      actionsEl.appendChild(approveBtn);
    }
  } catch (err) {
    bodyEl.innerHTML = `<p style="color:var(--red)">Failed to fetch stats: ${esc(err.message)}</p>`;
  }
};

// --- ADMIN ACTIONS ---
window.approveApp = async (id, skipConfirm = false) => {
  if (!skipConfirm && !confirm("Approve this player?")) return;
  const appSnap = await getDoc(doc(db, "applications", id));
  const a = appSnap.data();
  
  await setDoc(doc(db, "members", id), {
    authUid: a.authUid, ign: a.ign, uid: a.uid, role: "member", region: a.region, 
    level: a.level, rank: a.rank, whatsapp: a.whatsapp, photoURL: a.photoURL, joinedAt: serverTimestamp()
  });
  
  await setDoc(doc(db, "users", a.authUid), { 
    status: "approved", ign: a.ign, email: a.email, photoURL: a.photoURL, uid: a.uid, region: a.region, level: a.level, rank: a.rank, role: "member", whatsapp: a.whatsapp 
  });
  
  await deleteDoc(doc(db, "applications", id));
  
  showToast("Approved and added to roster!");
  loadAdminData();
};

window.promoteMember = async (id, role) => {
  if (!confirm(`Change role to ${role}?`)) return;
  await updateDoc(doc(db, "members", id), { role: role });
  const member = (await getDoc(doc(db, "members", id))).data();
  await updateDoc(doc(db, "users", member.authUid), { role: role });
  showToast("Role updated!");
  loadAdminData();
};

window.delApp = async (id) => { if (confirm("Delete?")) { await deleteDoc(doc(db, "applications", id)); loadAdminData(); } };
window.delMember = async (id, authUid) => { 
  if (confirm("Remove from roster?")) { 
    await deleteDoc(doc(db, "members", id)); 
    await updateDoc(doc(db, "users", authUid), { status: "rejected" });
    loadAdminData(); 
  } 
};
window.delAnn = async (id) => { if (confirm("Delete?")) { await deleteDoc(doc(db, "announcements", id)); loadAdminData(); } };
