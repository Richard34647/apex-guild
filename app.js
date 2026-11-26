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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ==========================================
// UTILITIES
// ==========================================
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

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } 
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); return true; }
}

// ==========================================
// AUTH GATE & ROUTER
// ==========================================
const path = window.location.pathname;
const isLogin = path.includes("login.html");
const isOnboarding = path.includes("onboarding.html");
const isAdmin = path.includes("admin.html");

onAuthStateChanged(auth, async (user) => {
  // 1. Handle Logout Buttons globally
  document.querySelectorAll("#logout-btn").forEach(btn => {
    btn.onclick = (e) => { e.preventDefault(); signOut(auth); };
  });

  // 2. Admin page handles its own specific login logic
  if (isAdmin) { initAdmin(user); return; }

  // 3. Handle Login Page
  if (isLogin) {
    if (user) { window.location.href = "index.html"; return; }
    document.getElementById("google-login-btn").onclick = async () => {
      try { await signInWithPopup(auth, googleProvider); } 
      catch (err) { 
        document.getElementById("login-error").textContent = err.message;
        document.getElementById("login-error").style.display = "block";
      }
    };
    return;
  }

  // 4. Gatekeeper for everything else
  if (!user) { window.location.href = "login.html"; return; }

  const userDoc = await getDoc(doc(db, "users", user.uid));

  // If logged in but NO PROFILE, force onboarding
  if (!userDoc.exists()) {
    if (!isOnboarding) window.location.href = "onboarding.html";
    else initOnboarding(user);
    return;
  }

  // If they HAVE a profile, and are on onboarding, send to home
  if (isOnboarding) { window.location.href = "index.html"; return; }

  // 5. Initialize Page Specific Logic
  if (document.getElementById("applyForm")) initLanding(); // Note: apply form is removed from index, but keeping for backwards compatibility if you re-add it
  if (document.getElementById("guildIdText")) initHome();
  if (document.getElementById("member-grid")) initMembers();
  if (document.getElementById("chat-messages")) initChat(user);
  if (document.getElementById("profile-name")) initProfile(user, userDoc.data());
});

// ==========================================
// PAGE LOGIC: ONBOARDING
// ==========================================
function initOnboarding(user) {
  const form = document.getElementById("onboardingForm");
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
    const btn = document.getElementById("submit-btn");
    btn.disabled = true; btn.textContent = "Saving...";

    try {
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        displayName: form.ign.value.trim(),
        ign: form.ign.value.trim(),
        uid: form.uid.value.trim(),
        region: form.region.value,
        level: Number(form.level.value),
        role: form.role.value,
        rank: form.rank.value,
        nameTag: form.nameTag.value,
        photoURL: user.photoURL || "https://via.placeholder.com/100",
        createdAt: serverTimestamp()
      });
      window.location.href = "index.html";
    } catch (err) {
      showToast("Error: " + err.message);
      btn.disabled = false; btn.textContent = "Save & Enter Guild";
    }
  });
}

// ==========================================
// PAGE LOGIC: HOME (index.html)
// ==========================================
function initHome() {
  window.copyGuildId = async () => { await copyText("3107592050"); showToast("Guild ID copied ✅"); };
  
  const list = document.getElementById("announce-list");
  getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(3)))
    .then(snap => {
      if (snap.empty) { list.innerHTML = `<div class="empty-state">No announcements yet.</div>`; return; }
      list.innerHTML = snap.docs.map(d => {
        const a = d.data();
        return `<article class="announce"><h3>${esc(a.title)}</h3><p>${esc(a.body).replace(/\n/g, "<br>")}</p></article>`;
      }).join("");
    }).catch(() => { list.innerHTML = `<div class="empty-state">Error loading news.</div>`; });
}

// ==========================================
// PAGE LOGIC: PROFILE
// ==========================================
function initProfile(user, data) {
  document.getElementById("profile-avatar").src = data.photoURL || "https://via.placeholder.com/100";
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
// PAGE LOGIC: CHAT
// ==========================================
function initChat(user) {
  const chatBox = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");

  const q = query(collection(db, "chat"), orderBy("createdAt", "asc"), limit(50));
  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) { chatBox.innerHTML = `<div class="empty-state">No messages yet. Say hi!</div>`; return; }
    chatBox.innerHTML = snapshot.docs.map(doc => {
      const msg = doc.data();
      const time = msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
      return `
        <div class="chat-msg">
          <img src="${msg.photoURL || 'https://via.placeholder.com/40'}" class="chat-avatar" />
          <div class="chat-content">
            <span class="chat-time">${time}</span>
            <div class="chat-sender">${esc(msg.senderName || "Member")}</div>
            <div class="chat-text">${esc(msg.text)}</div>
          </div>
        </div>
      `;
    }).join("");
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.disabled = true;
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const profile = userSnap.data();
      await addDoc(collection(db, "chat"), {
        text: text,
        uid: user.uid,
        senderName: profile.ign || user.displayName,
        photoURL: profile.photoURL || user.photoURL || "",
        createdAt: serverTimestamp()
      });
      chatInput.value = "";
    } catch (err) { showToast("Error: " + err.message); } 
    finally { chatInput.disabled = false; chatInput.focus(); }
  });
}

// ==========================================
// PAGE LOGIC: MEMBERS
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
    if (!members.length) { grid.innerHTML = `<div class="empty-state">No members yet.</div>`; return; }
    grid.innerHTML = members.map(m => `
      <div class="card">
        <span class="role-tag ${roleClass(m.role)}">${roleLabel(m.role)}</span>
        <div class="ign">${esc(m.ign)}</div>
        <div class="member-meta">
          ${m.region ? `<span>🌍 ${esc(m.region)}</span>` : ""}
          ${m.level ? `<span>⭐ Lv. ${m.level}</span>` : ""}
          ${m.rank ? `<span>🏆 ${esc(m.rank)}</span>` : ""}
        </div>
      </div>`).join("");
  });
}

// ==========================================
// ADMIN LOGIC (admin.html) - Preserved
// ==========================================
function initAdmin(user) {
  const checkAdmin = async (u) => { if (!u) return false; const token = await u.getIdTokenResult(true); return token.claims.admin === true; };

  onAuthStateChanged(auth, async (u) => {
    if (!u) { showAdminLogin(); return; }
    if (!(await checkAdmin(u))) { await signOut(auth); showAdminLogin("Not an admin account."); return; }
    
    document.getElementById("login-view").style.display = "none";
    document.getElementById("dash-view").style.display = "";
    document.getElementById("admin-email").textContent = u.email;
    loadAdminData();
  });

  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, e.target.email.value, e.target.password.value); } 
    catch (err) { showAdminLogin(err.message); }
  });

  function showAdminLogin(msg = "") {
    document.getElementById("login-view").style.display = "";
    document.getElementById("dash-view").style.display = "none";
    if (msg) { document.getElementById("login-error").textContent = msg; document.getElementById("login-error").style.display = ""; }
  }

  function loadAdminData() {
    // Load Apps
    getDocs(query(collection(db, "applications"), orderBy("createdAt", "desc"))).then(snap => {
      const tbody = document.getElementById("applications-body");
      if (snap.empty) { tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">No applications.</div></td></tr>`; return; }
      tbody.innerHTML = snap.docs.map(d => {
        const a = d.data();
        return `<tr>
          <td>${esc(a.ign)}</td><td>${esc(a.uid)}</td><td>${a.level}</td>
          <td>${esc(a.role)}</td><td>${esc(a.region)}</td>
          <td class="status-${a.status}">${a.status}</td>
          <td><div class="row-actions">
            ${a.status === "pending" ? `<button class="btn" onclick="window.markOfficial('${d.id}')">Mark Official</button>` : ""}
            <button class="btn-danger btn" onclick="window.delApp('${d.id}')">Delete</button>
          </div></td>
        </tr>`;
      }).join("");
    });

    // Load Members
    getDocs(collection(db, "members")).then(snap => {
      const tbody = document.getElementById("members-body");
      tbody.innerHTML = snap.docs.map(d => {
        const m = d.data();
        return `<tr>
          <td>${esc(m.ign)}</td><td>${esc(m.role)}</td><td>${esc(m.uid)}</td>
          <td>${esc(m.region)}</td><td>${m.level || ""}</td><td>${esc(m.rank || "—")}</td>
          <td><button class="btn-danger btn" onclick="window.delMember('${d.id}')">Delete</button></td>
        </tr>`;
      }).join("");
    });

    // Load Announcements
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

  window.markOfficial = async (id) => {
    if (!confirm("Add to public roster?")) return;
    const appSnap = await getDoc(doc(db, "applications", id));
    const a = appSnap.data();
    await addDoc(collection(db, "members"), { ign: a.ign, uid: a.uid, role: "member", region: a.region, level: a.level, rank: a.rank, joinedAt: serverTimestamp() });
    await updateDoc(doc(db, "applications", id), { status: "official" });
    showToast("Added to roster!"); loadAdminData();
  };
  window.delApp = async (id) => { if(confirm("Delete?")) { await deleteDoc(doc(db, "applications", id)); loadAdminData(); } };
  window.delMember = async (id) => { if(confirm("Remove from roster?")) { await deleteDoc(doc(db, "members", id)); loadAdminData(); } };
  window.delAnn = async (id) => { if(confirm("Delete?")) { await deleteDoc(doc(db, "announcements", id)); loadAdminData(); } };

  document.getElementById("member-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "members"), {
      ign: e.target.ign.value, uid: e.target.uid.value, role: e.target.role.value,
      region: e.target.region.value, level: Number(e.target.level.value) || null,
      realName: e.target.realName.value, joinedAt: serverTimestamp()
    });
    e.target.reset(); showToast("Member added"); loadAdminData();
  });

  document.getElementById("announce-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "announcements"), {
      title: e.target.title.value, body: e.target.body.value, author: auth.currentUser.email, createdAt: serverTimestamp()
    });
    e.target.reset(); showToast("Posted!"); loadAdminData();
  });
}
