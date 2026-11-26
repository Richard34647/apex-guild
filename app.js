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
const SUPABASE_BUCKET = "Codewix";

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
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function safeUrl(url = "", fallback = "https://via.placeholder.com/100") {
  const val = String(url).trim();
  if (/^https?:\/\//i.test(val)) return esc(val);
  return fallback;
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

async function uploadToSupabase(file, folder, uid) {
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${folder}/${uid}_${Date.now()}_${cleanName}`;
  const uploadEndpoint = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${filePath}`;

  const res = await fetch(uploadEndpoint, {
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
    let errMsg = `Upload failed (${res.status})`;
    try {
      const errData = await res.json();
      if (errData.message || errData.error) errMsg = `Upload failed: ${errData.message || errData.error}`;
    } catch {}
    throw new Error(errMsg);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${filePath}`;
}

// --- GAMESKINBO RANK & PARSER HELPERS ---
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
  if (points > 0)      return "Bronze";
  return "";
}

function parseGamesKinboResponse(raw) {
  const root = raw?.data || raw || {};
  const info = root.AccountInfo || root.basicInfo || root.accountInfo || {};
  const profile = root.AccountProfileInfo || root.profileInfo || {};
  const guild = root.GuildInfo || root.clanBasicInfo || root.guildInfo || {};

  const ign = info.AccountName || info.nickname || root.nickname || null;
  const level = info.AccountLevel ?? info.level ?? root.level ?? null;
  const region = info.AccountRegion || info.region || root.region || null;
  const likes = info.AccountLikes ?? info.liked ?? root.likes ?? null;

  const brPoints = profile.BrRankPoint ?? info.BrRankPoint ?? info.rankingPoints ?? root.rankingPoints ?? 0;
  const csPoints = profile.CsRankPoint ?? info.CsRankPoint ?? info.csRankingPoints ?? null;
  const computedRank = getBrRankFromPoints(brPoints);

  const guildName = guild.GuildName || guild.clanName || guild.name || "None";

  return {
    ign,
    level: level !== null ? Number(level) : null,
    region,
    likes,
    brPoints: Number(brPoints) || 0,
    csPoints,
    rank: computedRank,
    guildName
  };
}

// --- ROUTER & AUTH GATE ---
const path = window.location.pathname;
const fileName = path.split("/").pop() || "index.html";
const isLanding = fileName === "" || fileName === "index.html";
const isLogin = fileName === "login.html";
const isOnboarding = fileName === "onboarding.html";
const isAdmin = fileName === "admin.html";
const isPending = fileName === "pending.html";

onAuthStateChanged(auth, async (user) => {
  document.querySelectorAll("#logout-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      signOut(auth);
    };
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
    if (user) {
      window.location.href = "dashboard.html";
      return;
    }
    const googleBtn = document.getElementById("google-login-btn");
    if (googleBtn) {
      googleBtn.onclick = async () => {
        try {
          await signInWithPopup(auth, googleProvider);
        } catch (err) {
          const errEl = document.getElementById("login-error");
          if (errEl) {
            errEl.textContent = err.message;
            errEl.style.display = "block";
          }
        }
      };
    }
    return;
  }

  // 4. Redirect to login.html for all protected pages if not logged in
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // 5. Check User Status
  const userDoc = await getDoc(doc(db, "users", user.uid));
  const appDoc = await getDoc(doc(db, "applications", user.uid));

  if (!userDoc.exists()) {
    if (!appDoc.exists() && !isOnboarding) {
      window.location.href = "onboarding.html";
      return;
    }
    if (appDoc.exists() && !isPending) {
      window.location.href = "pending.html";
      return;
    }
  } else {
    const status = userDoc.data().status;
    if (status === "pending" || status === "rejected") {
      if (!isPending) window.location.href = "pending.html";
      return;
    }
    if (status === "approved") {
      if (isPending || isOnboarding) {
        window.location.href = "dashboard.html";
        return;
      }
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
  const logoutBtn = document.getElementById("logout-btn");

  if (logoutBtn) logoutBtn.style.display = "inline-block";

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().status === "approved") {
      if (navCta) { navCta.textContent = "Dashboard"; navCta.href = "dashboard.html"; }
      if (heroPrimary) { heroPrimary.textContent = "Enter Dashboard"; heroPrimary.href = "dashboard.html"; }
    } else {
      if (navCta) { navCta.textContent = "Application Status"; navCta.href = "pending.html"; }
      if (heroPrimary) { heroPrimary.textContent = "Check Application"; heroPrimary.href = "pending.html"; }
    }
  } catch (e) {
    console.error("Landing status check:", e);
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
      showToast("Please upload a screenshot proof of your profile.");
      return;
    }

    const btn = document.getElementById("submit-btn");
    btn.disabled = true;
    btn.textContent = "Uploading Data...";

    try {
      let photoURL = user.photoURL || "https://via.placeholder.com/100";
      let proofURL = "";

      const profileFile = form.profilePic.files[0];
      if (profileFile) {
        photoURL = await uploadToSupabase(profileFile, "profiles", user.uid);
      }

      proofURL = await uploadToSupabase(proofFile, "proofs", user.uid);

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
      await setDoc(doc(db, "users", user.uid), {
        status: "pending",
        email: user.email
      });

      window.location.href = "pending.html";
    } catch (err) {
      console.error(err);
      showToast("Error: " + err.message);
      btn.disabled = false;
      btn.textContent = "Submit Application";
    }
  });
}

// ==========================================
// PAGE: DASHBOARD / HOME (dashboard.html)
// ==========================================
function initHome() {
  window.copyGuildId = async () => {
    await copyText("3107592050");
    showToast("Guild ID copied ✅");
  };

  const list = document.getElementById("announce-list");
  if (!list) return;

  getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(3)))
    .then(snap => {
      if (snap.empty) {
        list.innerHTML = `<div class="empty-state">No announcements yet.</div>`;
        return;
      }
      list.innerHTML = snap.docs.map(d => `
        <article class="announce">
          <h3>${esc(d.data().title)}</h3>
          <p>${esc(d.data().body).replace(/\n/g, "<br>")}</p>
        </article>
      `).join("");
    });
}

// ==========================================
// PAGE: PROFILE (profile.html)
// ==========================================
function initProfile(user, data) {
  document.getElementById("profile-avatar").src = safeUrl(data.photoURL);
  document.getElementById("profile-name").textContent = data.ign || "";
  document.getElementById("profile-email").textContent = data.email || "";
  document.getElementById("p-ign").textContent = data.ign || "";
  document.getElementById("p-uid").textContent = data.uid || "";
  document.getElementById("p-level").textContent = data.level || "";
  document.getElementById("p-region").textContent = data.region || "";
  document.getElementById("p-rank").textContent = data.rank || "";
  document.getElementById("p-role").textContent = data.role || "";
}

// ==========================================
// PAGE: CHAT (chat.html)
// ==========================================
function initChat(user, profile) {
  const chatBox = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");

  const q = query(collection(db, "chat"), orderBy("createdAt", "asc"), limit(50));
  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      chatBox.innerHTML = `<div class="empty-state">No messages yet.</div>`;
      return;
    }
    chatBox.innerHTML = snapshot.docs.map(d => {
      const msg = d.data();
      const time = msg.createdAt?.toDate
        ? msg.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
      return `
        <div class="chat-msg">
          <img src="${safeUrl(msg.photoURL)}" class="chat-avatar" />
          <div class="chat-content">
            <span class="chat-time">${esc(time)}</span>
            <div class="chat-sender">${esc(msg.senderName)}</div>
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
      await addDoc(collection(db, "chat"), {
        text: text,
        uid: user.uid,
        senderName: profile.ign || user.displayName || "Member",
        photoURL: profile.photoURL || user.photoURL || "https://via.placeholder.com/100",
        createdAt: serverTimestamp()
      });
      chatInput.value = "";
    } catch (err) {
      showToast("Error: " + err.message);
    } finally {
      chatInput.disabled = false;
      chatInput.focus();
    }
  });
}

// ==========================================
// PAGE: MEMBERS (members.html)
// ==========================================
function initMembers() {
  const ROLE_ORDER = { leader: 0, coleader: 1, officer: 2, member: 3, recruit: 4 };
  const roleLabel = (r) => ({
    leader: "Guild Leader",
    coleader: "Co-Leader",
    officer: "Officer",
    member: "Member",
    recruit: "Recruit"
  })[r] || "Member";

  const roleClass = (r) => ({
    leader: "role-leader",
    coleader: "role-officer",
    officer: "role-officer",
    member: "role-member",
    recruit: "role-member"
  })[r] || "role-member";

  getDocs(collection(db, "members")).then(snap => {
    const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    members.sort((a, b) =>
      ((ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)) ||
      (a.ign || "").localeCompare(b.ign || "")
    );
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
      </div>
    `).join("");
  });
}

// ==========================================
// PAGE: ADMIN (admin.html + GamesKinbo API)
// ==========================================
let adminBound = false;

async function initAdmin(user) {
  const loginView = document.getElementById("login-view");
  const dashView = document.getElementById("dash-view");
  const loginError = document.getElementById("login-error");
  const logoutBtn = document.getElementById("logout-btn");

  if (!adminBound) {
    adminBound = true;

    document.getElementById("login-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      loginError.style.display = "none";
      try {
        await signInWithEmailAndPassword(auth, e.target.email.value, e.target.password.value);
      } catch (err) {
        loginError.textContent = err.message;
        loginError.style.display = "block";
      }
    });

    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".tab-panel").forEach(p => { p.style.display = "none"; });
        const targetPanel = document.getElementById(tab.dataset.target);
        if (targetPanel) targetPanel.style.display = "block";
      });
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
  }

  if (!user) {
    loginView.style.display = "block";
    dashView.style.display = "none";
    logoutBtn.style.display = "none";
    return;
  }

  const token = await user.getIdTokenResult(true);
  if (token.claims.admin !== true) {
    await signOut(auth);
    loginError.textContent = "Not an admin account.";
    loginError.style.display = "block";
    return;
  }

  loginView.style.display = "none";
  dashView.style.display = "block";
  document.getElementById("admin-email").textContent = user.email;
  logoutBtn.style.display = "inline-block";

  loadAdminData();

  function loadAdminData() {
    // 1. Load Applications
    getDocs(query(collection(db, "applications"), orderBy("createdAt", "desc"))).then(snap => {
      const tbody = document.getElementById("applications-body");
      if (snap.empty) {
        tbody.innerHTML = `<tr><td colspan="7">No applications.</td></tr>`;
        return;
      }
      tbody.innerHTML = snap.docs.map(d => {
        const a = d.data();
        const waDigits = esc(String(a.whatsapp || "").replace(/\D/g, ""));
        return `
          <tr>
            <td><img src="${safeUrl(a.photoURL)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;"></td>
            <td><strong>${esc(a.ign)}</strong><br><small>UID: ${esc(a.uid)} · Lv.${esc(a.level)} · ${esc(a.region)}</small></td>
            <td><a href="https://wa.me/${waDigits}" target="_blank" class="btn" style="font-size:0.7rem;padding:4px 8px;">Chat</a></td>
            <td>${esc(a.rank)}</td>
            <td class="status-${esc(a.status)}">${esc(a.status)}</td>
            <td><a href="${safeUrl(a.proofURL)}" target="_blank"><img src="${safeUrl(a.proofURL)}" class="proof-img" title="Click to view proof"></a></td>
            <td>
              <div class="row-actions">
                <button class="btn-secondary btn" onclick="window.reviewPlayer('applications', '${esc(d.id)}')">Review</button>
                ${a.status === "pending" ? `<button class="btn" onclick="window.approveApp('${esc(d.id)}')">Approve</button>` : ""}
                <button class="btn-danger btn" onclick="window.delApp('${esc(d.id)}')">Delete</button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    });

    // 2. Load Members
    getDocs(collection(db, "members")).then(snap => {
      const tbody = document.getElementById("members-body");
      if (snap.empty) {
        tbody.innerHTML = `<tr><td colspan="6">No members.</td></tr>`;
        return;
      }
      tbody.innerHTML = snap.docs.map(d => {
        const m = d.data();
        const waDigits = esc(String(m.whatsapp || "").replace(/\D/g, ""));
        return `
          <tr>
            <td><strong>${esc(m.ign)}</strong><br><small>Lv.${esc(m.level || "?")} · ${esc(m.rank || "Member")}</small></td>
            <td><strong>${esc(m.role)}</strong></td>
            <td><a href="https://wa.me/${waDigits}" target="_blank" class="btn wa-btn" style="font-size:0.7rem;padding:4px 8px;">Chat</a></td>
            <td>${esc(m.uid)}</td>
            <td>${esc(m.region)}</td>
            <td>
              <div class="row-actions">
                <button class="btn-secondary btn" onclick="window.reviewPlayer('members', '${esc(d.id)}')">Sync Stats</button>
                <button class="btn-secondary btn" onclick="window.promoteMember('${esc(d.id)}', 'officer')">Make Officer</button>
                <button class="btn-danger btn" onclick="window.delMember('${esc(d.id)}', '${esc(m.authUid)}')">Delete</button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    });

    // 3. Load Announcements
    getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"))).then(snap => {
      const list = document.getElementById("announcements-list");
      list.innerHTML = snap.docs.map(d => `
        <div class="announce" style="margin-bottom:12px">
          <h3>${esc(d.data().title)}</h3>
          <p>${esc(d.data().body)}</p>
          <button class="btn-danger btn" style="margin-top:10px" onclick="window.delAnn('${esc(d.id)}')">Delete</button>
        </div>
      `).join("");
    });
  }

  // --- GAMESKINBO REVIEW & SYNC MODAL ---
  window.closeReviewModal = () => {
    const modal = document.getElementById("review-modal");
    if (modal) modal.style.display = "none";
  };

  window.reviewPlayer = async (colName, docId) => {
    const modal = document.getElementById("review-modal");
    const body = document.getElementById("review-modal-body");
    const actions = document.getElementById("review-modal-actions");
    if (!modal || !body) return;

    modal.style.display = "flex";
    actions.innerHTML = "";
    body.innerHTML = `<p style="color:var(--muted);">Fetching live Free Fire stats from GamesKinbo...</p>`;

    try {
      const snap = await getDoc(doc(db, colName, docId));
      if (!snap.exists()) {
        body.innerHTML = `<p style="color:var(--red);">Record not found.</p>`;
        return;
      }

      const record = snap.data();
      const ffUid = encodeURIComponent(record.uid || "");
      const ffRegion = encodeURIComponent((record.region || "SG").toLowerCase());

      const res = await fetch(`/api/garena/ff-info?uid=${ffUid}&region=${ffRegion}`);
      const rawData = await res.json();

      if (!res.ok || rawData.error) {
        body.innerHTML = `
          <p style="color:var(--red);margin-bottom:8px;"><strong>GamesKinbo API Error:</strong> ${esc(rawData.error || res.statusText)}</p>
          <p style="font-size:0.85rem;color:var(--muted);">Submitted UID: <strong>${esc(record.uid)}</strong> (${esc(record.region)})</p>
        `;
        return;
      }

      const live = parseGamesKinboResponse(rawData);
      const liveIgn = live.ign || record.ign;
      const liveLevel = live.level ?? record.level;
      const liveRegion = live.region || record.region;
      const liveRank = live.rank || record.rank;
      const rankNote = live.brPoints > 0
        ? `${esc(liveRank)} (${live.brPoints} RP)`
        : `${esc(record.rank)} <small style="color:var(--muted);">(Hidden/0 RP)</small>`;

      body.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#090c10;padding:14px;border-radius:10px;border:1px solid var(--border);margin-bottom:14px;">
          <div>
            <small style="color:var(--muted);display:block;margin-bottom:4px;">SUBMITTED IN DATABASE</small>
            <div><strong>IGN:</strong> ${esc(record.ign)}</div>
            <div><strong>Level:</strong> ${esc(record.level)}</div>
            <div><strong>Region:</strong> ${esc(record.region)}</div>
            <div><strong>Rank:</strong> ${esc(record.rank)}</div>
          </div>
          <div>
            <small style="color:var(--green);display:block;margin-bottom:4px;">LIVE FROM GAMESKINBO</small>
            <div><strong>IGN:</strong> ${esc(liveIgn)}</div>
            <div><strong>Level:</strong> ${esc(liveLevel)}</div>
            <div><strong>Region:</strong> ${esc(liveRegion)}</div>
            <div><strong>BR Rank:</strong> ${rankNote}</div>
            ${live.csPoints !== null ? `<div><strong>CS Stars:</strong> ${esc(live.csPoints)}</div>` : ""}
            ${live.likes !== null ? `<div><strong>Likes:</strong> ${esc(live.likes)}</div>` : ""}
            <div><strong>Current Guild:</strong> ${esc(live.guildName)}</div>
          </div>
        </div>
        <p style="font-size:0.82rem;color:var(--muted);">Verify that the live IGN, level, and rank match the uploaded screenshot before updating.</p>
      `;

      const safePayload = encodeURIComponent(JSON.stringify({
        ign: liveIgn,
        level: Number(liveLevel) || record.level,
        region: liveRegion,
        rank: liveRank
      }));

      actions.innerHTML = `
        <button class="btn-secondary btn" onclick="window.applySyncedStats('${esc(colName)}', '${esc(docId)}', '${safePayload}', false)">Update Stats</button>
        ${colName === "applications" ? `<button class="btn" onclick="window.applySyncedStats('${esc(colName)}', '${esc(docId)}', '${safePayload}', true)">Sync & Approve</button>` : ""}
      `;
    } catch (err) {
      body.innerHTML = `<p style="color:var(--red);">Failed to reach GamesKinbo proxy: ${esc(err.message)}</p>`;
    }
  };

  window.applySyncedStats = async (colName, docId, encodedPayload, alsoApprove) => {
    try {
      const updates = JSON.parse(decodeURIComponent(encodedPayload));
      await updateDoc(doc(db, colName, docId), updates);

      if (colName === "members") {
        const memSnap = await getDoc(doc(db, "members", docId));
        if (memSnap.exists() && memSnap.data().authUid) {
          await updateDoc(doc(db, "users", memSnap.data().authUid), updates);
        }
        showToast("Member stats updated from GamesKinbo!");
        window.closeReviewModal();
        loadAdminData();
      } else if (colName === "applications") {
        if (alsoApprove) {
          window.closeReviewModal();
          await window.approveApp(docId, true);
        } else {
          showToast("Application stats updated!");
          window.closeReviewModal();
          loadAdminData();
        }
      }
    } catch (err) {
      showToast("Update failed: " + err.message);
    }
  };

  // --- ACTIONS ---
  window.approveApp = async (id, skipConfirm = false) => {
    if (!skipConfirm && !confirm("Approve this player?")) return;
    const appSnap = await getDoc(doc(db, "applications", id));
    const a = appSnap.data();

    await setDoc(doc(db, "members", id), {
      authUid: a.authUid,
      ign: a.ign,
      uid: a.uid,
      role: "member",
      region: a.region,
      level: a.level,
      rank: a.rank,
      whatsapp: a.whatsapp,
      photoURL: a.photoURL,
      joinedAt: serverTimestamp()
    });

    await setDoc(doc(db, "users", a.authUid), {
      status: "approved",
      ign: a.ign,
      email: a.email,
      photoURL: a.photoURL,
      uid: a.uid,
      region: a.region,
      level: a.level,
      rank: a.rank,
      role: "member",
      whatsapp: a.whatsapp
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

  window.delApp = async (id) => {
    if (confirm("Delete application?")) {
      await deleteDoc(doc(db, "applications", id));
      loadAdminData();
    }
  };

  window.delMember = async (id, authUid) => {
    if (confirm("Remove from roster?")) {
      await deleteDoc(doc(db, "members", id));
      await updateDoc(doc(db, "users", authUid), { status: "rejected" });
      loadAdminData();
    }
  };

  window.delAnn = async (id) => {
    if (confirm("Delete announcement?")) {
      await deleteDoc(doc(db, "announcements", id));
      loadAdminData();
    }
  };
}
