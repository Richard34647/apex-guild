import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// --- FIREBASE CONFIG (Auth & Firestore) ---
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

// --- SUPABASE CONFIG (File Storage) ---
const SUPABASE_URL = "https://gwzhifnghmrnvkcnjgip.supabase.co";
const SUPABASE_KEY = "sb_publishable_x5taeM5x-1gNQH5oeIqhNA_wm33ZEYK";
const SUPABASE_BUCKET = "codewix";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function uploadToSupabase(file, folder, uid) {
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${folder}/${uid}_${Date.now()}_${cleanName}`;

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(filePath);

  return data.publicUrl;
}

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

// --- ROUTER & AUTH GATE ---
const path = window.location.pathname;
const isLogin = path.includes("login.html");
const isOnboarding = path.includes("onboarding.html");
const isAdmin = path.includes("admin.html");
const isPending = path.includes("pending.html");

onAuthStateChanged(auth, async (user) => {
  document.querySelectorAll("#logout-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      signOut(auth);
    };
  });

  // 1. Admin Page Logic
  if (isAdmin) {
    initAdmin(user);
    return;
  }

  // 2. Login Page Logic
  if (isLogin) {
    if (user) {
      window.location.href = "index.html";
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

  // 3. Force Login for everything else
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // 4. Check User Status
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
        window.location.href = "index.html";
        return;
      }
    }
  }

  // 5. Init Page Logic
  if (isOnboarding) {
    initOnboarding(user);
    return;
  }
  if (document.getElementById("guildIdText")) initHome();
  if (document.getElementById("member-grid")) initMembers();
  if (document.getElementById("chat-messages") && userDoc.exists()) initChat(user, userDoc.data());
  if (document.getElementById("profile-name") && userDoc.exists()) initProfile(user, userDoc.data());
});

// ==========================================
// PAGE: ONBOARDING (With Supabase Storage)
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
      showToast("Please upload a screenshot of your Free Fire profile.");
      return;
    }

    const btn = document.getElementById("submit-btn");
    btn.disabled = true;
    btn.textContent = "Uploading Data...";

    try {
      let photoURL = user.photoURL || "https://via.placeholder.com/100";

      // Upload Profile Pic if provided
      const profileFile = form.profilePic.files[0];
      if (profileFile) {
        photoURL = await uploadToSupabase(profileFile, "profiles", user.uid);
      }

      // Upload Proof Pic (required)
      const proofURL = await uploadToSupabase(proofFile, "proofs", user.uid);

      // Save Application Data to Firestore
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
// PAGE: HOME
// ==========================================
function initHome() {
  window.copyGuildId = async () => {
    await copyText("3107592050");
    showToast("Guild ID copied ✅");
  };
  const list = document.getElementById("announce-list");
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
        </article>`).join("");
    });
}

// ==========================================
// PAGE: PROFILE
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
// PAGE: CHAT
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
      const time = msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      return `
        <div class="chat-msg">
          <img src="${esc(msg.photoURL || "https://via.placeholder.com/40")}" class="chat-avatar" />
          <div class="chat-content">
            <span class="chat-time">${esc(time)}</span>
            <div class="chat-sender">${esc(msg.senderName)}</div>
            <div class="chat-text">${esc(msg.text)}</div>
          </div>
        </div>`;
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
        photoURL: profile.photoURL || user.photoURL || "https://via.placeholder.com/40",
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
// PAGE: ADMIN
// ==========================================
let adminListenersBound = false;

async function initAdmin(u) {
  const loginView = document.getElementById("login-view");
  const dashView = document.getElementById("dash-view");
  const loginError = document.getElementById("login-error");

  if (!adminListenersBound) {
    adminListenersBound = true;

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
        document.querySelectorAll(".tab-panel").forEach(p => {
          p.style.display = "none";
        });
        const target = document.getElementById(tab.dataset.target);
        if (target) target.style.display = "block";
      });
    });

    document.getElementById("announce-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await addDoc(collection(db, "announcements"), {
          title: e.target.title.value.trim(),
          body: e.target.body.value.trim(),
          author: auth.currentUser.email,
          createdAt: serverTimestamp()
        });
        e.target.reset();
        showToast("Posted!");
        loadAdminData();
      } catch (err) {
        showToast("Error: " + err.message);
      }
    });
  }

  if (!u) {
    loginView.style.display = "";
    dashView.style.display = "none";
    return;
  }

  const token = await u.getIdTokenResult(true);
  if (token.claims.admin !== true) {
    await signOut(auth);
    loginError.textContent = "Not an admin account.";
    loginError.style.display = "block";
    return;
  }

  loginView.style.display = "none";
  dashView.style.display = "";
  document.getElementById("admin-email").textContent = u.email;
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.style.display = "block";
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
        const waDigits = String(a.whatsapp || "").replace(/\D/g, "");
        return `<tr>
          <td><img src="${esc(a.photoURL)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover"></td>
          <td><strong>${esc(a.ign)}</strong><br><small>${esc(a.uid)}</small></td>
          <td><a href="https://wa.me/${waDigits}" target="_blank" rel="noopener" class="btn" style="font-size:0.7rem;padding:4px 8px;">Chat</a></td>
          <td>${esc(a.rank)}</td>
          <td class="status-${esc(a.status)}">${esc(a.status)}</td>
          <td><a href="${esc(a.proofURL)}" target="_blank" rel="noopener"><img src="${esc(a.proofURL)}" class="proof-img" title="Click to view proof"></a></td>
          <td>
            <div class="row-actions">
              ${a.status === "pending" ? `<button class="btn" onclick="window.approveApp('${esc(d.id)}')">Approve</button>` : ""}
              <button class="btn-danger btn" onclick="window.delApp('${esc(d.id)}')">Delete</button>
            </div>
          </td>
        </tr>`;
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
        const waDigits = String(m.whatsapp || "").replace(/\D/g, "");
        return `<tr>
          <td>${esc(m.ign)}</td>
          <td><strong>${esc(m.role)}</strong></td>
          <td><a href="https://wa.me/${waDigits}" target="_blank" rel="noopener" class="btn wa-btn" style="font-size:0.7rem;padding:4px 8px;">Chat</a></td>
          <td>${esc(m.uid)}</td>
          <td>${esc(m.region)}</td>
          <td>
            <div class="row-actions">
              <button class="btn-secondary btn" onclick="window.promoteMember('${esc(d.id)}', 'officer')">Make Officer</button>
              <button class="btn-danger btn" onclick="window.delMember('${esc(d.id)}', '${esc(m.authUid)}')">Delete</button>
            </div>
          </td>
        </tr>`;
      }).join("");
    });

    // 3. Load Announcements
    getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"))).then(snap => {
      const list = document.getElementById("announcements-list");
      if (snap.empty) {
        list.innerHTML = `<div class="empty-state">No announcements posted yet.</div>`;
        return;
      }
      list.innerHTML = snap.docs.map(d => `
        <div class="announce" style="margin-bottom:12px">
          <h3>${esc(d.data().title)}</h3>
          <p>${esc(d.data().body).replace(/\n/g, "<br>")}</p>
          <button class="btn-danger btn" style="margin-top:10px" onclick="window.delAnn('${esc(d.id)}')">Delete</button>
        </div>
      `).join("");
    });
  }

  // --- ACTIONS ---
  window.approveApp = async (id) => {
    if (!confirm("Approve this player?")) return;
    try {
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
    } catch (err) {
      showToast("Error: " + err.message);
    }
  };

  window.promoteMember = async (id, role) => {
    if (!confirm(`Change role to ${role}?`)) return;
    try {
      await updateDoc(doc(db, "members", id), { role: role });
      const member = (await getDoc(doc(db, "members", id))).data();
      if (member?.authUid) {
        await updateDoc(doc(db, "users", member.authUid), { role: role });
      }
      showToast("Role updated!");
      loadAdminData();
    } catch (err) {
      showToast("Error: " + err.message);
    }
  };

  window.delApp = async (id) => {
    if (!confirm("Delete this application?")) return;
    try {
      await deleteDoc(doc(db, "applications", id));
      showToast("Application deleted.");
      loadAdminData();
    } catch (err) {
      showToast("Error: " + err.message);
    }
  };

  window.delMember = async (id, authUid) => {
    if (!confirm("Remove from roster?")) return;
    try {
      await deleteDoc(doc(db, "members", id));
      if (authUid) {
        await updateDoc(doc(db, "users", authUid), { status: "rejected" });
      }
      showToast("Member removed.");
      loadAdminData();
    } catch (err) {
      showToast("Error: " + err.message);
    }
  };

  window.delAnn = async (id) => {
    if (!confirm("Delete this announcement?")) return;
    try {
      await deleteDoc(doc(db, "announcements", id));
      showToast("Announcement deleted.");
      loadAdminData();
    } catch (err) {
      showToast("Error: " + err.message);
    }
  };
}
