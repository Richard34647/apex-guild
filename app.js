import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs, doc, updateDoc, deleteDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- FIREBASE CONFIG (Replace with your actual config) ---
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

// ==========================================
// GLOBAL SETTINGS
// ==========================================
const GUILD_ID = "3107592050";
const WA_NUMBER = "910000000000"; // CHANGE THIS TO YOUR WHATSAPP NUMBER
const WA_GROUP_URL = `https://wa.me/${WA_NUMBER}`;
const DISCORD_URL = "https://discord.gg/HVAQGpfPm"; // YOUR DISCORD LINK

// --- UTILITIES ---
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

function esc(str = "") {
  return String(str).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  }
}

// ==========================================
// 1. LANDING PAGE LOGIC (index.html)
// ==========================================
if (document.getElementById("applyForm")) {
  window.copyGuildId = async () => {
    await copyText(document.getElementById("guildIdText").textContent.trim());
    showToast("Guild ID copied ✅");
  };

  window.copySuccessId = async (btn) => {
    await copyText(document.getElementById("successGuildId").textContent.trim());
    btn.textContent = "Copied ✓";
    showToast("Now open Free Fire!");
    setTimeout(() => btn.textContent = "📋 Copy Guild ID", 2000);
  };

  window.resetApplyForm = () => {
    document.getElementById("apply-success").style.display = "none";
    document.getElementById("apply-form-wrap").style.display = "";
    document.getElementById("applyForm").reset();
  };

  const loadAnnouncements = async () => {
    const list = document.getElementById("announce-list");
    try {
      const snap = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(3)));
      if (snap.empty) { list.innerHTML = `<div class="empty-state">No announcements yet.</div>`; return; }
      list.innerHTML = snap.docs.map(d => {
        const a = d.data();
        const date = a.createdAt?.toDate ? a.createdAt.toDate().toLocaleDateString() : "";
        return `<article class="announce"><h3>${esc(a.title)}</h3><p>${esc(a.body).replace(/\n/g, "<br>")}</p><div class="date">${date}</div></article>`;
      }).join("");
    } catch (err) { list.innerHTML = `<div class="empty-state">Error loading news.</div>`; }
  };

  document.getElementById("applyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector("button[type=submit]");
    const data = {
      ign: form.ign.value.trim(),
      uid: form.uid.value.trim(),
      level: Number(form.level.value),
      region: form.region.value,
      role: form.role.value,
      nameTag: form.nameTag.value,
      notes: form.notes.value.trim(),
      status: "pending",
      createdAt: serverTimestamp()
    };

    btn.disabled = true; btn.textContent = "Sending...";
    try {
      await addDoc(collection(db, "applications"), data);
      
      document.getElementById("apply-form-wrap").style.display = "none";
      const success = document.getElementById("apply-success");
      success.style.display = "";
      document.getElementById("successHello").textContent = data.ign;
      document.getElementById("successGuildId").textContent = GUILD_ID;
      document.getElementById("successWaBtn").href = WA_GROUP_URL;
      document.getElementById("successDiscordBtn").href = DISCORD_URL;
      
      showToast("Application saved! Welcome 🔥");
      form.reset();
    } catch (err) {
      showToast("Error: " + err.message);
    } finally {
      btn.disabled = false; btn.textContent = "🚀 Submit Application";
    }
  });

  loadAnnouncements();
}

// ==========================================
// 2. MEMBERS PAGE LOGIC (members.html)
// ==========================================
if (document.getElementById("member-grid")) {
  const ROLE_ORDER = { leader: 0, coleader: 1, officer: 2, member: 3, recruit: 4 };
  const roleLabel = (r) => ({ leader: "Guild Leader", coleader: "Co-Leader", officer: "Officer", member: "Member", recruit: "Recruit" })[r] || "Member";
  const roleClass = (r) => ({ leader: "role-leader", coleader: "role-officer", officer: "role-officer", member: "role-member", recruit: "role-member" })[r] || "role-member";

  const loadMembers = async () => {
    const grid = document.getElementById("member-grid");
    try {
      const snap = await getDocs(collection(db, "members"));
      let members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      members.sort((a, b) => ((ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)) || (a.ign || "").localeCompare(b.ign || ""));
      
      document.getElementById("member-count").textContent = `${members.length} members`;
      if (!members.length) { grid.innerHTML = `<div class="empty-state">No members yet.</div>`; return; }

      grid.innerHTML = members.map(m => `
        <div class="card">
          <span class="role-tag ${roleClass(m.role)}">${roleLabel(m.role)}</span>
          <div class="ign">${esc(m.ign)}</div>
          ${m.realName ? `<p>${esc(m.realName)}</p>` : ""}
          <div class="member-meta">
            ${m.region ? `<span>🌍 ${esc(m.region)}</span>` : ""}
            ${m.level ? `<span>⭐ Lv. ${m.level}</span>` : ""}
            ${m.uid ? `<span>ID: ${esc(m.uid)}</span>` : ""}
          </div>
        </div>`).join("");
    } catch (err) { grid.innerHTML = `<div class="empty-state">Error loading roster.</div>`; }
  };
  loadMembers();
}

// ==========================================
// 3. ADMIN DASHBOARD LOGIC (admin.html)
// ==========================================
if (document.getElementById("login-form")) {
  let currentUser = null;

  const checkAdmin = async (user) => {
    if (!user) return false;
    const token = await user.getIdTokenResult(true);
    return token.claims.admin === true;
  };

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      document.getElementById("login-view").style.display = "";
      document.getElementById("dash-view").style.display = "none";
      return;
    }
    const admin = await checkAdmin(user);
    if (!admin) {
      await signOut(auth);
      document.getElementById("login-error").textContent = "Not an admin account.";
      document.getElementById("login-error").style.display = "";
      return;
    }
    currentUser = user;
    document.getElementById("login-view").style.display = "none";
    document.getElementById("dash-view").style.display = "";
    document.getElementById("admin-email").textContent = user.email;
    document.getElementById("logout-btn").style.display = "";
    loadAdminData();
  });

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true; btn.textContent = "Signing in...";
    try {
      await signInWithEmailAndPassword(auth, e.target.email.value, e.target.password.value);
    } catch (err) {
      document.getElementById("login-error").textContent = err.message;
      document.getElementById("login-error").style.display = "";
    } finally { btn.disabled = false; btn.textContent = "Sign In"; }
  });

  document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.style.display = "none");
      tab.classList.add("active");
      document.getElementById(tab.dataset.target).style.display = "";
    });
  });

  const loadAdminData = () => {
    loadApps();
    loadAdminMembers();
    loadAdminAnnouncements();
  };

  const loadApps = async () => {
    const tbody = document.getElementById("applications-body");
    const snap = await getDocs(query(collection(db, "applications"), orderBy("createdAt", "desc")));
    if (snap.empty) { tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">No applications.</div></td></tr>`; return; }
    tbody.innerHTML = snap.docs.map(d => {
      const a = d.data();
      return `<tr>
        <td>${esc(a.ign)}</td><td>${esc(a.uid)}</td><td>${a.level}</td>
        <td>${esc(a.role)}</td><td>${esc(a.region)}</td>
        <td class="status-${a.status}">${a.status}</td>
        <td><div class="row-actions">
          ${a.status === "pending" ? `
            <button class="btn" onclick="window.markOfficial('${d.id}')">Mark Official</button>
            <button class="btn-secondary btn" onclick="window.markRemoved('${d.id}')">Mark Removed</button>
          ` : `<button class="btn-secondary btn" onclick="window.reopenApp('${d.id}')">Reopen</button>`}
          <button class="btn-danger btn" onclick="window.delApp('${d.id}')">Delete</button>
        </div></td>
      </tr>`;
    }).join("");
  };

  window.markOfficial = async (id) => {
    if (!confirm("Add to public roster?")) return;
    const appSnap = await getDoc(doc(db, "applications", id));
    const a = appSnap.data();
    await addDoc(collection(db, "members"), { ign: a.ign, uid: a.uid, role: "member", region: a.region, level: a.level, joinedAt: serverTimestamp() });
    await updateDoc(doc(db, "applications", id), { status: "official" });
    showToast("Added to roster!"); loadAdminData();
  };
  window.markRemoved = async (id) => { await updateDoc(doc(db, "applications", id), { status: "removed" }); loadAdminData(); };
  window.reopenApp = async (id) => { await updateDoc(doc(db, "applications", id), { status: "pending" }); loadAdminData(); };
  window.delApp = async (id) => { if(confirm("Delete?")) { await deleteDoc(doc(db, "applications", id)); loadAdminData(); } };

  const loadAdminMembers = async () => {
    const tbody = document.getElementById("members-body");
    const snap = await getDocs(collection(db, "members"));
    tbody.innerHTML = snap.docs.map(d => {
      const m = d.data();
      return `<tr>
        <td>${esc(m.ign)}</td><td>${esc(m.role)}</td><td>${esc(m.uid)}</td>
        <td>${esc(m.region)}</td><td>${m.level || ""}</td>
        <td>
          <button class="btn-secondary btn" onclick="window.refreshGarena('${d.id}', '${m.uid}', '${m.region}')">Refresh Garena</button>
          <button class="btn-danger btn" onclick="window.delMember('${d.id}')">Delete</button>
        </td>
      </tr>`;
    }).join("");
  };
  window.delMember = async (id) => { if(confirm("Remove from roster?")) { await deleteDoc(doc(db, "members", id)); loadAdminData(); } };
  
  window.refreshGarena = async (id, uid, region) => {
    if(!uid || !region) return showToast("Missing UID or Region");
    showToast("Fetching...");
    try {
      const res = await fetch(`/api/garena/player?region=${encodeURIComponent(region)}&uid=${encodeURIComponent(uid)}`);
      const json = await res.json();
      const info = json.data?.basicInfo || json.basicInfo || json.data || json;
      const updates = {};
      if (info.nickname) updates.ign = info.nickname;
      if (info.level) updates.level = info.level;
      if (!Object.keys(updates).length) return showToast("No data found");
      await updateDoc(doc(db, "members", id), updates);
      showToast("Refreshed ✅"); loadAdminData();
    } catch (err) { showToast("Error: " + err.message); }
  };

  document.getElementById("member-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "members"), {
      ign: e.target.ign.value, uid: e.target.uid.value, role: e.target.role.value,
      region: e.target.region.value, level: Number(e.target.level.value) || null,
      realName: e.target.realName.value, joinedAt: serverTimestamp()
    });
    e.target.reset(); showToast("Member added"); loadAdminData();
  });

  const loadAdminAnnouncements = async () => {
    const list = document.getElementById("announcements-list");
    const snap = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc")));
    list.innerHTML = snap.docs.map(d => `
      <div class="announce" style="margin-bottom:12px">
        <h3>${esc(d.data().title)}</h3>
        <p>${esc(d.data().body)}</p>
        <button class="btn-danger btn" style="margin-top:10px" onclick="window.delAnn('${d.id}')">Delete</button>
      </div>
    `).join("");
  };
  window.delAnn = async (id) => { if(confirm("Delete?")) { await deleteDoc(doc(db, "announcements", id)); loadAdminData(); } };

  document.getElementById("announce-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "announcements"), {
      title: e.target.title.value, body: e.target.body.value, author: currentUser.email, createdAt: serverTimestamp()
    });
    e.target.reset(); showToast("Posted!"); loadAdminData();
  });
}