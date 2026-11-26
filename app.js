import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc, serverTimestamp, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
function safeUrl(url = "", fallback = "https://via.placeholder.com/100") {
  const s = String(url || "").trim();
  return /^https?:\/\//i.test(s) || s.startsWith("/") ? esc(s) : fallback;
}
function formatMessageText(text = "") {
  const escaped = esc(text);
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--green,#39ff14);text-decoration:underline;">$1</a>');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } 
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); return true; }
}
window.copySimpleText = async (txt) => {
  await copyText(txt);
  showToast("Copied: " + txt);
};

// Convert GamesKinbo BrRankPoint into Free Fire BR Rank tier
function getBrRankFromPoints(rp) {
  const points = Number(rp) || 0;
  if (points >= 10000) return "Grandmaster";
  if (points >= 8000)  return "Elite Master";
  if (points >= 6001)  return "Master";
  if (points >= 4500)  return "Elite Heroic";
  if (points >= 3201)  return "Heroic";
  if (points >= 2301)  return "Diamond";
  if (points >= 1801)  return "Platinum";
  if (points >= 1301)  return "Gold";
  if (points >= 1001)  return "Silver";
  return "Bronze";
}

// Upload image file to Supabase Storage
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
    throw new Error(`Upload failed (${res.status}): ${errText}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${filePath}`;
}

// --- ROUTER & AUTH GATE ---
const path = window.location.pathname.toLowerCase();
const isLogin = path.includes("login.html");
const isOnboarding = path.includes("onboarding.html");
const isAdmin = path.includes("admin.html");
const isPending = path.includes("pending.html");
const isLanding = path.endsWith("/") || path.endsWith("/index.html");

let adminInitialized = false;

onAuthStateChanged(auth, async (user) => {
  document.querySelectorAll("#logout-btn").forEach(btn => {
    btn.onclick = (e) => { e.preventDefault(); signOut(auth); };
  });

  // 1. Admin Page
  if (isAdmin) {
    initAdmin(user);
    return;
  }

  // 2. Public Landing Page (index.html)
  if (isLanding) {
    initLanding(user);
    return;
  }

  // 3. Login Page
  if (isLogin) {
    if (user) { window.location.href = "dashboard.html"; return; }
    const loginBtn = document.getElementById("google-login-btn");
    if (loginBtn) {
      loginBtn.onclick = async () => {
        try { await signInWithPopup(auth, googleProvider); } 
        catch (err) {
          const errEl = document.getElementById("login-error");
          if (errEl) { errEl.textContent = err.message; errEl.style.display = "block"; }
        }
      };
    }
    return;
  }

  // 4. Strict Redirect to login.html if not logged in
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // 5. Check User Status for Protected Pages
  let userDoc, appDoc;
  try {
    userDoc = await getDoc(doc(db, "users", user.uid));
    appDoc = await getDoc(doc(db, "applications", user.uid));
  } catch (err) {
    console.error("Firestore read error:", err);
    showToast("Database permission error.");
    return;
  }

  if (!userDoc.exists()) {
    if (!appDoc.exists()) {
      if (!isOnboarding) { window.location.href = "onboarding.html"; return; }
      initOnboarding(user);
      return;
    } else {
      if (!isPending) { window.location.href = "pending.html"; return; }
      return;
    }
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

  // 6. Init Protected Page Logic (approved users)
  if (document.getElementById("guildIdText")) initDashboard();
  if (document.getElementById("member-grid")) initMembers();
  if (document.getElementById("chat-messages")) initChat(user, userDoc.data());
  if (document.getElementById("profile-name")) initProfile(user, userDoc.data());
});

// ==========================================
// PAGE: PUBLIC LANDING (index.html)
// ==========================================
async function initLanding(user) {
  window.copyGuildId = async () => { await copyText("3107592050"); showToast("Guild ID copied ✅"); };
  const primaryBtn = document.getElementById("landing-primary-btn");
  const navAuthBtn = document.getElementById("nav-auth-btn");
  if (!user || !primaryBtn) return;

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().status === "approved") {
      primaryBtn.textContent = "Go to Guild Dashboard";
      primaryBtn.href = "dashboard.html";
      if (navAuthBtn) { navAuthBtn.textContent = "Dashboard"; navAuthBtn.href = "dashboard.html"; }
    } else {
      primaryBtn.textContent = "Check Application Status";
      primaryBtn.href = "pending.html";
      if (navAuthBtn) { navAuthBtn.textContent = "Status"; navAuthBtn.href = "pending.html"; }
    }
  } catch (e) {
    console.warn("Landing status check skipped:", e);
  }
}

// ==========================================
// PAGE: ONBOARDING
// ==========================================
function initOnboarding(user) {
  const form = document.getElementById("onboardingForm");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "true";

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
    if (!form.rank.value) { showToast("Please select your Current BR Rank."); return; }

    const proofFile = form.proofPic.files[0];
    if (!proofFile) { showToast("Please upload a screenshot of your Free Fire profile."); return; }

    const btn = document.getElementById("submit-btn");
    btn.disabled = true;
    btn.textContent = "Uploading Data...";

    try {
      let photoURL = user.photoURL || "https://via.placeholder.com/100";
      const profileFile = form.profilePic.files[0];
      if (profileFile) {
        photoURL = await uploadToSupabase(profileFile, `profiles_${user.uid}`);
      }

      const proofURL = await uploadToSupabase(proofFile, `proofs_${user.uid}`);

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
      btn.disabled = false;
      btn.textContent = "Submit Application";
    }
  });
}

// ==========================================
// PAGE: DASHBOARD (dashboard.html)
// ==========================================
function initDashboard() {
  window.copyGuildId = async () => { await copyText("3107592050"); showToast("Guild ID copied ✅"); };
  const list = document.getElementById("announce-list");
  getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(3)))
    .then(snap => {
      if (snap.empty) { list.innerHTML = `<div class="empty-state">No announcements yet.</div>`; return; }
      list.innerHTML = snap.docs.map(d => `<article class="announce"><h3>${esc(d.data().title)}</h3><p>${esc(d.data().body).replace(/\n/g, "<br>")}</p></article>`).join("");
    });

  // Load Guild Leader photo & info dynamically if set in members collection
  getDocs(query(collection(db, "members"), where("role", "==", "leader"), limit(1)))
    .then(snap => {
      if (snap.empty) return;
      const leader = snap.docs[0].data();
      const photoEl = document.getElementById("leader-photo");
      const ignEl = document.getElementById("leader-ign");
      const metaEl = document.getElementById("leader-meta");
      if (photoEl && leader.photoURL) photoEl.src = leader.photoURL;
      if (ignEl && leader.ign) ignEl.textContent = leader.ign;
      if (metaEl) metaEl.textContent = `${leader.rank || "Heroic"} • Lv. ${leader.level || 70} • ${leader.region || "APEX"}`;
    })
    .catch(() => {});
}

// ==========================================
// PAGE: PROFILE
// ==========================================
function initProfile(user, data) {
  document.getElementById("profile-avatar").src = data.photoURL || "https://via.placeholder.com/100";
  document.getElementById("profile-name").textContent = data.ign || "Member";
  document.getElementById("profile-email").textContent = data.email || user.email;
  document.getElementById("p-ign").textContent = data.ign || "-";
  document.getElementById("p-uid").textContent = data.uid || "-";
  document.getElementById("p-level").textContent = data.level || "-";
  document.getElementById("p-region").textContent = data.region || "-";
  document.getElementById("p-rank").textContent = data.rank || "-";
  document.getElementById("p-role").textContent = data.role || "-";
}

// ==========================================
// PAGE: CHAT (With Profile Inspection & Image Attachments)
// ==========================================
function initChat(user, profile) {
  const chatBox = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const imgInput = document.getElementById("chat-image-input");
  const imgBtn = document.getElementById("chat-image-btn");

  if (imgBtn && imgInput) {
    imgBtn.onclick = () => imgInput.click();
    imgInput.onchange = () => {
      if (imgInput.files[0]) {
        imgBtn.style.borderColor = "var(--green, #39ff14)";
        showToast("Image attached: " + imgInput.files[0].name);
      }
    };
  }

  window.closeUserProfileModal = () => {
    const modal = document.getElementById("user-profile-modal");
    if (modal) modal.style.display = "none";
  };

  window.viewChatUserProfile = async (targetUid) => {
    if (!targetUid) return;
    const modal = document.getElementById("user-profile-modal");
    const content = document.getElementById("user-profile-modal-content");
    modal.style.display = "flex";
    content.innerHTML = `<div class="empty-state">Loading player profile...</div>`;

    try {
      const snap = await getDoc(doc(db, "users", targetUid));
      if (!snap.exists()) {
        content.innerHTML = `<p>Player profile not found.</p><button class="btn-secondary btn" onclick="window.closeUserProfileModal()">Close</button>`;
        return;
      }
      const p = snap.data();
      const roleLabels = { leader: "Guild Leader", coleader: "Co-Leader", officer: "Officer", member: "Member" };
      const roleBadge = roleLabels[p.role] || p.role || "Member";

      content.innerHTML = `
        <img src="${safeUrl(p.photoURL)}" class="profile-modal-avatar" />
        <span class="role-tag role-leader" style="display:inline-block;margin-bottom:6px;">${esc(roleBadge)}</span>
        <h3 style="margin:4px 0 2px; font-size:1.3rem;">${esc(p.ign || "Unknown Player")}</h3>
        <p style="margin:0; color:var(--muted); font-size:0.85rem;">${esc(p.region || "Global")} Server</p>
        <div class="profile-modal-grid">
          <div class="profile-modal-item"><small>Free Fire UID</small><strong>${esc(p.uid || "N/A")}</strong></div>
          <div class="profile-modal-item"><small>BR Rank</small><strong>${esc(p.rank || "Unranked")}</strong></div>
          <div class="profile-modal-item"><small>Level</small><strong>Lv. ${esc(p.level || "?")}</strong></div>
          <div class="profile-modal-item"><small>Playstyle</small><strong>${esc(p.role_pref || p.playstyle || roleBadge)}</strong></div>
        </div>
        <div style="display:flex; gap:10px; justify-content:center;">
          ${p.uid ? `<button class="btn" onclick="window.copySimpleText('${esc(p.uid)}')">Copy UID</button>` : ""}
          <button class="btn-secondary btn" onclick="window.closeUserProfileModal()">Close</button>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<p style="color:var(--red);">Failed to load profile: ${esc(err.message)}</p><button class="btn-secondary btn" onclick="window.closeUserProfileModal()">Close</button>`;
    }
  };

  const q = query(collection(db, "chat"), orderBy("createdAt", "asc"), limit(50));
  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) { chatBox.innerHTML = `<div class="empty-state">No messages yet.</div>`; return; }
    chatBox.innerHTML = snapshot.docs.map(d => {
      const msg = d.data();
      const time = msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
      const safeUid = esc(msg.uid || "");
      const imgHtml = msg.imageURL ? `<a href="${safeUrl(msg.imageURL)}" target="_blank" rel="noopener"><img src="${safeUrl(msg.imageURL)}" class="chat-attachment" alt="Attachment" /></a>` : "";
      return `
        <div class="chat-msg">
          <img src="${safeUrl(msg.photoURL)}" class="chat-avatar chat-avatar-link" onclick="window.viewChatUserProfile('${safeUid}')" title="View profile" />
          <div class="chat-content">
            <span class="chat-time">${time}</span>
            <div class="chat-sender chat-sender-link" onclick="window.viewChatUserProfile('${safeUid}')" title="Click to view profile">${esc(msg.senderName)}</div>
            ${msg.text ? `<div class="chat-text">${formatMessageText(msg.text)}</div>` : ""}
            ${imgHtml}
          </div>
        </div>`;
    }).join("");
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    const file = imgInput?.files[0];
    if (!text && !file) return;

    chatInput.disabled = true;
    try {
      let imageURL = "";
      if (file) {
        showToast("Uploading image...");
        imageURL = await uploadToSupabase(file, `chat_${user.uid}`);
      }

      await addDoc(collection(db, "chat"), {
        text: text || "📷 Shared a screenshot",
        imageURL: imageURL,
        uid: user.uid,
        senderName: profile.ign || user.displayName || "Member",
        photoURL: profile.photoURL || "https://via.placeholder.com/100",
        createdAt: serverTimestamp()
      });

      chatInput.value = "";
      if (imgInput) { imgInput.value = ""; imgBtn.style.borderColor = ""; }
    } catch (err) {
      showToast("Error: " + err.message);
    } finally {
      chatInput.disabled = false;
      chatInput.focus();
    }
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
        <div style="display:flex;align-items:center;gap:10px;margin:8px 0;">
          ${m.photoURL ? `<img src="${safeUrl(m.photoURL)}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:1px solid var(--border);" />` : ""}
          <div class="ign" style="margin:0;">${esc(m.ign)}</div>
        </div>
        <div class="member-meta">
          ${m.region ? `<span>🌍 ${esc(m.region)}</span>` : ""}
          ${m.level ? `<span>⭐ Lv. ${m.level}</span>` : ""}
          ${m.rank ? `<span>🏆 ${esc(m.rank)}</span>` : ""}
        </div>
      </div>`).join("");
  });
}

// ==========================================
// PAGE: ADMIN (Applications, Roster & Leader Creation, GamesKinbo Sync)
// ==========================================
function initAdmin(u) {
  const checkAdmin = async (userObj) => {
    if (!userObj) return false;
    const token = await userObj.getIdTokenResult(true);
    return token.claims.admin === true;
  };

  (async () => {
    if (!u) {
      document.getElementById("login-view").style.display = "";
      document.getElementById("dash-view").style.display = "none";
      return;
    }
    if (!(await checkAdmin(u))) {
      await signOut(auth);
      document.getElementById("login-error").textContent = "Not an admin account.";
      document.getElementById("login-error").style.display = "";
      return;
    }

    document.getElementById("login-view").style.display = "none";
    document.getElementById("dash-view").style.display = "";
    document.getElementById("admin-email").textContent = u.email;
    document.getElementById("logout-btn").style.display = "block";
    loadAdminData();
  })();

  if (adminInitialized) return;
  adminInitialized = true;

  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, e.target.email.value, e.target.password.value); } 
    catch (err) { document.getElementById("login-error").textContent = err.message; document.getElementById("login-error").style.display = ""; }
  });

  // Tab Switching
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(p => p.style.display = "none");
      const targetPanel = document.getElementById(tab.dataset.target);
      if (targetPanel) targetPanel.style.display = "block";
    });
  });

  // Add / Set Guild Leader or Roster Member Form
  document.getElementById("add-leader-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = document.getElementById("save-leader-btn");
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
      const currentAdmin = auth.currentUser;
      const linkToMe = f.linkMyAccount.checked && currentAdmin;
      const docId = linkToMe ? currentAdmin.uid : `manual_${f.uid.value.trim()}`;

      let photoURL = "https://via.placeholder.com/100";
      const file = f.photoFile.files[0];
      if (file) {
        photoURL = await uploadToSupabase(file, `leaders_${docId}`);
      } else if (linkToMe) {
        const existingUser = await getDoc(doc(db, "users", currentAdmin.uid));
        if (existingUser.exists() && existingUser.data().photoURL) {
          photoURL = existingUser.data().photoURL;
        }
      }

      const memberData = {
        authUid: linkToMe ? currentAdmin.uid : "",
        ign: f.ign.value.trim(),
        uid: f.uid.value.trim(),
        role: f.role.value,
        region: f.region.value,
        level: Number(f.level.value) || 70,
        rank: f.rank.value,
        whatsapp: f.whatsapp.value.trim(),
        photoURL: photoURL,
        joinedAt: serverTimestamp()
      };

      await setDoc(doc(db, "members", docId), memberData, { merge: true });

      if (linkToMe) {
        await setDoc(doc(db, "users", currentAdmin.uid), {
          status: "approved",
          email: currentAdmin.email,
          ign: memberData.ign,
          uid: memberData.uid,
          role: memberData.role,
          region: memberData.region,
          level: memberData.level,
          rank: memberData.rank,
          whatsapp: memberData.whatsapp,
          photoURL: memberData.photoURL
        }, { merge: true });
      }

      f.reset();
      showToast(`${memberData.ign} saved as ${memberData.role}!`);
      loadAdminData();
    } catch (err) {
      showToast("Error saving: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Save to Roster";
    }
  });

  function loadAdminData() {
    getDocs(query(collection(db, "applications"), orderBy("createdAt", "desc"))).then(snap => {
      const tbody = document.getElementById("applications-body");
      if (snap.empty) { tbody.innerHTML = `<tr><td colspan="7">No applications.</td></tr>`; return; }
      tbody.innerHTML = snap.docs.map(d => {
        const a = d.data();
        const waDigits = esc((a.whatsapp || "").replace(/\D/g, ""));
        return `<tr>
          <td><img src="${safeUrl(a.photoURL)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;"></td>
          <td><strong>${esc(a.ign)}</strong><br><small>${esc(a.uid)} (${esc(a.region)})</small></td>
          <td><a href="https://wa.me/${waDigits}" target="_blank" rel="noopener" class="btn" style="font-size:0.7rem;padding:4px 8px;">Chat</a></td>
          <td>${esc(a.rank)}<br><small>Lv.${esc(a.level)}</small></td>
          <td class="status-${esc(a.status)}">${esc(a.status)}</td>
          <td><a href="${safeUrl(a.proofURL)}" target="_blank" rel="noopener"><img src="${safeUrl(a.proofURL)}" class="proof-img" title="Click to view proof"></a></td>
          <td>
            <div class="row-actions">
              <button class="btn-secondary btn" onclick="window.reviewPlayerStats('applications', '${d.id}')">Review</button>
              ${a.status === "pending" ? `<button class="btn" onclick="window.approveApp('${d.id}')">Approve</button>` : ""}
              <button class="btn-danger btn" onclick="window.delApp('${d.id}')">Delete</button>
            </div>
          </td>
        </tr>`;
      }).join("");
    });

    getDocs(collection(db, "members")).then(snap => {
      const tbody = document.getElementById("members-body");
      if (snap.empty) { tbody.innerHTML = `<tr><td colspan="7">No members.</td></tr>`; return; }
      tbody.innerHTML = snap.docs.map(d => {
        const m = d.data();
        const waDigits = esc((m.whatsapp || "").replace(/\D/g, ""));
        return `<tr>
          <td><img src="${safeUrl(m.photoURL)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;"></td>
          <td><strong>${esc(m.ign)}</strong><br><small>${esc(m.rank)} • Lv.${esc(m.level)}</small></td>
          <td><strong>${esc(m.role)}</strong></td>
          <td><a href="https://wa.me/${waDigits}" target="_blank" rel="noopener" class="btn wa-btn" style="font-size:0.7rem;padding:4px 8px;">Chat</a></td>
          <td>${esc(m.uid)}</td>
          <td>${esc(m.region)}</td>
          <td>
            <div class="row-actions">
              <button class="btn-secondary btn" onclick="window.reviewPlayerStats('members', '${d.id}')">Sync Stats</button>
              <button class="btn-secondary btn" onclick="window.promoteMember('${d.id}', 'leader')">Make Leader</button>
              <button class="btn-secondary btn" onclick="window.promoteMember('${d.id}', 'officer')">Make Officer</button>
              <button class="btn-danger btn" onclick="window.delMember('${d.id}', '${esc(m.authUid || "")}')">Delete</button>
            </div>
          </td>
        </tr>`;
      }).join("");
    });

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

  // --- GAMESKINBO REVIEW & STATS UPDATE MODAL ---
  window.closeStatsModal = () => {
    document.getElementById("stats-modal").style.display = "none";
  };

  window.reviewPlayerStats = async (colName, docId) => {
    const modal = document.getElementById("stats-modal");
    const titleEl = document.getElementById("modal-title");
    const subEl = document.getElementById("modal-sub");
    const bodyEl = document.getElementById("modal-body");
    const actionsEl = document.getElementById("modal-actions");

    modal.style.display = "flex";
    titleEl.textContent = "GamesKinbo Live Check";
    subEl.textContent = "Querying Garena Free Fire servers...";
    bodyEl.innerHTML = "";
    actionsEl.innerHTML = `<button type="button" class="btn-secondary btn" onclick="window.closeStatsModal()">Close</button>`;

    try {
      const snap = await getDoc(doc(db, colName, docId));
      if (!snap.exists()) { subEl.textContent = "Record not found."; return; }
      const record = snap.data();
      const region = (record.region || "SG").toLowerCase();
      const uid = encodeURIComponent(record.uid || "");

      const res = await fetch(`/api/garena/ff-info?uid=${uid}&region=${encodeURIComponent(region)}`);
      const raw = await res.json();

      if (!res.ok || raw.error) {
        subEl.textContent = "API Error";
        bodyEl.innerHTML = `<p style="color:var(--red);">${esc(raw.error || "Could not fetch player stats.")}</p>`;
        return;
      }

      const info = raw.AccountInfo || raw.data?.AccountInfo || raw;
      const profile = raw.AccountProfileInfo || raw.data?.AccountProfileInfo || {};
      const guild = raw.GuildInfo || raw.data?.GuildInfo || {};

      const liveIgn = info.AccountName || info.nickname || record.ign;
      const liveLevel = Number(info.AccountLevel || info.level || record.level) || record.level;
      const brPoints = Number(profile.BrRankPoint ?? 0);
      const csPoints = Number(profile.CsRankPoint ?? 0);
      const liveRank = brPoints > 0 ? getBrRankFromPoints(brPoints) : (record.rank || "Unranked");
      const liveLikes = info.AccountLikes ?? "N/A";
      const liveGuild = guild.GuildName || "None";

      subEl.textContent = `UID: ${record.uid} • Region: ${record.region}`;
      bodyEl.innerHTML = `
        <div class="stat-compare">
          <div class="stat-box">
            <h4>Saved in Guild DB</h4>
            <p><strong>IGN:</strong> ${esc(record.ign)}</p>
            <p><strong>Level:</strong> ${esc(record.level)}</p>
            <p><strong>Rank:</strong> ${esc(record.rank)}</p>
          </div>
          <div class="stat-box" style="border-color:var(--green);">
            <h4 style="color:var(--green);">Live Free Fire Stats</h4>
            <p><strong>IGN:</strong> ${esc(liveIgn)}</p>
            <p><strong>Level:</strong> ${esc(liveLevel)}</p>
            <p><strong>BR Rank:</strong> ${esc(liveRank)} (${brPoints} RP)</p>
            <p><strong>CS Stars:</strong> ${esc(csPoints)}</p>
            <p><strong>Likes:</strong> ${esc(liveLikes)}</p>
            <p><strong>Current Guild:</strong> ${esc(liveGuild)}</p>
          </div>
        </div>
      `;

      window._pendingStatSync = { colName, docId, authUid: record.authUid, ign: liveIgn, level: liveLevel, rank: liveRank };

      actionsEl.innerHTML = `
        <button type="button" class="btn" onclick="window.applySyncedStats(false)">Update Stats</button>
        ${colName === "applications" ? `<button type="button" class="btn" onclick="window.applySyncedStats(true)">Sync & Approve</button>` : ""}
        <button type="button" class="btn-secondary btn" onclick="window.closeStatsModal()">Close</button>
      `;
    } catch (err) {
      subEl.textContent = "Request Failed";
      bodyEl.innerHTML = `<p style="color:var(--red);">${esc(err.message)}</p>`;
    }
  };

  window.applySyncedStats = async (alsoApprove) => {
    const sync = window._pendingStatSync;
    if (!sync) return;
    try {
      await updateDoc(doc(db, sync.colName, sync.docId), {
        ign: sync.ign,
        level: sync.level,
        rank: sync.rank
      });
      if (sync.authUid) {
        await updateDoc(doc(db, "users", sync.authUid), {
          ign: sync.ign,
          level: sync.level,
          rank: sync.rank
        }).catch(() => {});
      }
      window.closeStatsModal();
      if (alsoApprove && sync.colName === "applications") {
        await window.approveApp(sync.docId, true);
      } else {
        showToast("Player stats updated from Free Fire!");
        loadAdminData();
      }
    } catch (err) {
      showToast("Failed to save stats: " + err.message);
    }
  };

  // --- ACTIONS ---
  window.approveApp = async (id, skipConfirm = false) => {
    if (!skipConfirm && !confirm("Approve this player?")) return;
    const appSnap = await getDoc(doc(db, "applications", id));
    const a = appSnap.data();

    await setDoc(doc(db, "members", id), {
      authUid: a.authUid, ign: a.ign, uid: a.uid, role: "member", region: a.region,
      level: a.level, rank: a.rank, whatsapp: a.whatsapp, photoURL: a.photoURL, joinedAt: serverTimestamp()
    });

    await setDoc(doc(db, "users", a.authUid), {
      status: "approved", ign: a.ign, email: a.email, photoURL: a.photoURL, uid: a.uid,
      region: a.region, level: a.level, rank: a.rank, role: "member", role_pref: a.role, whatsapp: a.whatsapp
    });

    await deleteDoc(doc(db, "applications", id));
    showToast("Approved and added to roster!");
    loadAdminData();
  };

  window.promoteMember = async (id, role) => {
    if (!confirm(`Change role to ${role}?`)) return;
    await updateDoc(doc(db, "members", id), { role: role });
    const member = (await getDoc(doc(db, "members", id))).data();
    if (member.authUid) {
      await updateDoc(doc(db, "users", member.authUid), { role: role }).catch(() => {});
    }
    showToast("Role updated!");
    loadAdminData();
  };

  window.delApp = async (id) => { if (confirm("Delete?")) { await deleteDoc(doc(db, "applications", id)); loadAdminData(); } };
  window.delMember = async (id, authUid) => {
    if (confirm("Remove from roster?")) {
      await deleteDoc(doc(db, "members", id));
      if (authUid) {
        await updateDoc(doc(db, "users", authUid), { status: "rejected" }).catch(() => {});
      }
      loadAdminData();
    }
  };
  window.delAnn = async (id) => { if (confirm("Delete?")) { await deleteDoc(doc(db, "announcements", id)); loadAdminData(); } };

  document.getElementById("announce-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "announcements"), { title: e.target.title.value, body: e.target.body.value, author: auth.currentUser.email, createdAt: serverTimestamp() });
    e.target.reset();
    showToast("Posted!");
    loadAdminData();
  });
}
