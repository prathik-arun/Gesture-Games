import { auth, database } from "./firebase-config.js";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  ref, 
  set, 
  get, 
  child 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// DOM Elements
const authModal = document.getElementById("auth-modal");
const nameModal = document.getElementById("name-modal");
const navLoginBtn = document.getElementById("nav-login-btn");
const authCloseBtn = document.getElementById("auth-close-btn");
const tabSigninBtn = document.getElementById("tab-signin-btn");
const tabSignupBtn = document.getElementById("tab-signup-btn");
const signinForm = document.getElementById("signin-form");
const signupForm = document.getElementById("signup-form");
const googleLoginBtn = document.getElementById("google-login-btn");
const authErrorMsg = document.getElementById("auth-error-msg");
const profileNameForm = document.getElementById("profile-name-form");
const profileFullNameInput = document.getElementById("profile-full-name");
const profileDisplayNameInput = document.getElementById("profile-display-name");
const authStatusContainer = document.getElementById("auth-status-container");

// Switch tab views
tabSigninBtn.addEventListener("click", () => {
  tabSigninBtn.classList.add("active");
  tabSignupBtn.classList.remove("active");
  signinForm.style.display = "block";
  signupForm.style.display = "none";
  authErrorMsg.style.display = "none";
});

tabSignupBtn.addEventListener("click", () => {
  tabSignupBtn.classList.add("active");
  tabSigninBtn.classList.remove("active");
  signupForm.style.display = "block";
  signinForm.style.display = "none";
  authErrorMsg.style.display = "none";
});

// Modal toggle
const openAuthModal = () => {
  authModal.style.display = "flex";
  authErrorMsg.style.display = "none";
};

const closeAuthModal = () => {
  authModal.style.display = "none";
  signinForm.reset();
  signupForm.reset();
};

// Event listeners for open/close modal
if (navLoginBtn) {
  navLoginBtn.addEventListener("click", openAuthModal);
}
authCloseBtn.addEventListener("click", closeAuthModal);

// Close modal when clicking outside content
window.addEventListener("click", (e) => {
  if (e.target === authModal) {
    closeAuthModal();
  }
});

// Show error helper
const showError = (message) => {
  authErrorMsg.innerText = message;
  authErrorMsg.style.display = "block";
};

// Form: Email Sign In
signinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("signin-email").value;
  const password = document.getElementById("signin-password").value;
  authErrorMsg.style.display = "none";

  signInWithEmailAndPassword(auth, email, password)
    .then(() => {
      closeAuthModal();
    })
    .catch((error) => {
      console.error("Sign in error:", error);
      showError(getFriendlyErrorMessage(error.code));
    });
});

// Form: Email Sign Up
signupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;
  authErrorMsg.style.display = "none";

  createUserWithEmailAndPassword(auth, email, password)
    .then(() => {
      closeAuthModal();
    })
    .catch((error) => {
      console.error("Sign up error:", error);
      showError(getFriendlyErrorMessage(error.code));
    });
});

// Google Sign In Popup
googleLoginBtn.addEventListener("click", () => {
  const provider = new GoogleAuthProvider();
  authErrorMsg.style.display = "none";

  signInWithPopup(auth, provider)
    .then(() => {
      closeAuthModal();
    })
    .catch((error) => {
      console.error("Google sign in error:", error);
      if (error.code !== "auth/popup-closed-by-user") {
        showError(getFriendlyErrorMessage(error.code));
      }
    });
});

// Helper for friendly error descriptions
const getFriendlyErrorMessage = (code) => {
  switch (code) {
    case "auth/invalid-email":
      return "Invalid email address format.";
    case "auth/user-disabled":
      return "This user account has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account already exists with this email.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/popup-blocked":
      return "Sign-in popup was blocked by the browser. Please enable popups.";
    default:
      return "An authentication error occurred. Please try again.";
  }
};

// State Observer
onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log("Logged in user:", user.email);
    
    // Check if user has a profile saved in Realtime Database
    try {
      const dbRef = ref(database);
      const snapshot = await get(child(dbRef, `users/${user.uid}`));
      
      if (snapshot.exists()) {
        const profile = snapshot.val();
        localStorage.setItem('currentUserDisplayName', profile.displayName);
        updateNavUI(profile.displayName, user.email);
        
        // Sync stats and achievements in background
        syncStatsAndAchievements(user.uid, profile.displayName);
      } else {
        // New user! Display name prompt modal
        openNameModal(user);
      }
    } catch (err) {
      console.error("Error checking user database profile:", err);
      // Fallback: show email or default display name if database fails
      const fallbackName = user.displayName || user.email.split("@")[0];
      localStorage.setItem('currentUserDisplayName', fallbackName);
      updateNavUI(fallbackName, user.email);
    }
  } else {
    console.log("User logged out");
    localStorage.removeItem('currentUserDisplayName');
    resetNavUI();
    closeDashboardModal();
  }
});

// Handle profile names dialog
let pendingUser = null;
const openNameModal = (user) => {
  pendingUser = user;
  nameModal.style.display = "flex";
  
  // Pre-fill fields if Google provided display name
  if (user.displayName) {
    profileFullNameInput.value = user.displayName;
    // Suggest first name / handle for display name
    profileDisplayNameInput.value = user.displayName.split(" ")[0];
  } else {
    profileFullNameInput.value = "";
    profileDisplayNameInput.value = "";
  }
};

profileNameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pendingUser) return;

  const fullName = profileFullNameInput.value.trim();
  const displayName = profileDisplayNameInput.value.trim();
  const email = pendingUser.email;
  const uid = pendingUser.uid;
  const provider = pendingUser.providerData[0]?.providerId || "password";

  try {
    // 1. Update Firebase Auth DisplayName
    await updateProfile(pendingUser, { displayName: displayName });
    
    // 2. Save profile in Realtime Database under users/{uid}
    await set(ref(database, `users/${uid}`), {
      name: fullName,
      displayName: displayName,
      email: email,
      provider: provider,
      createdAt: Date.now()
    });

    console.log("Database user profile saved successfully");
    
    // Save to localStorage for games
    localStorage.setItem('currentUserDisplayName', displayName);
    
    // 3. Update Nav and close modal
    updateNavUI(displayName, email);
    nameModal.style.display = "none";
    
    // Sync stats and achievements for the new user
    syncStatsAndAchievements(uid, displayName);
    
    pendingUser = null;
  } catch (err) {
    console.error("Error completing profile registration:", err);
    alert("Failed to save profile. Please try again.");
  }
});

// UI Navigation updates
const updateNavUI = (displayName, email) => {
  const avatarChar = (displayName || email || "U").charAt(0).toUpperCase();
  
  authStatusContainer.innerHTML = `
    <div class="user-profile-nav" id="nav-profile-widget" title="Open Dashboard (${email})">
      <div class="user-avatar">${avatarChar}</div>
      <span class="user-name-display">${displayName}</span>
      <button class="logout-nav-btn" id="nav-logout-btn">Logout</button>
    </div>
  `;
  
  // Attach logout handler
  const navLogoutBtn = document.getElementById("nav-logout-btn");
  if (navLogoutBtn) {
    navLogoutBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Avoid triggering profile widget click
      signOut(auth).catch((err) => console.error("Sign out error:", err));
    });
  }

  // Attach profile widget click to open dashboard
  const profileWidget = document.getElementById("nav-profile-widget");
  if (profileWidget) {
    profileWidget.addEventListener("click", (e) => {
      if (e.target.id === "nav-logout-btn") return;
      openDashboardModal();
    });
  }
};

const resetNavUI = () => {
  authStatusContainer.innerHTML = `
    <button id="nav-login-btn" class="btn" style="padding: 6px 15px; font-size: 0.8rem; border-radius: 4px;">Login</button>
  `;
  
  // Re-attach open auth listener to new button
  const newLoginBtn = document.getElementById("nav-login-btn");
  if (newLoginBtn) {
    newLoginBtn.addEventListener("click", openAuthModal);
  }
};

/* --- Dashboard / Stats / Achievements Logic --- */

const GAMES_CONFIG = {
  'deadzone': { name: 'Dead Zone', icon: '☣️', storageKey: 'deadzone_scores', threshold: 50 },
  'gesture-ninja': { name: 'Gesture Ninja', icon: '🥷', storageKey: 'gesture_ninja_scores', threshold: 30 },
  'flappy-mouth': { name: 'Flappy Mouth', icon: '🐦', storageKey: 'flappy_mouth_scores', threshold: 10 },
  'gesture-snake': { name: 'Gesture Snake', icon: '🐍', storageKey: 'gesture_snake_scores', threshold: 15 },
  'cyber-breaker': { name: 'Cyber Breaker', icon: '🧱', storageKey: 'cyber_breaker_scores', threshold: 50 },
  'keepy-uppy': { name: 'Neon Keepy-Uppy', icon: '🎈', storageKey: 'keepy_uppy_scores', threshold: 10 },
  'cyber-strike-3d': { name: 'Cyber Strike 3D', icon: '⚡', storageKey: 'cyberstrike_3d_leaderboard', threshold: 300 },
  'shadow-fighter': { name: 'Shadow Fighter', icon: '✊', storageKey: 'shadow_fighter_scores', threshold: 30 },
  'rhythm-saber': { name: 'Rhythm Saber', icon: '⚔️', storageKey: 'rhythm_saber_scores', threshold: 100 }
};

const ACHIEVEMENTS_LIST = [
  { id: 'first_steps', name: 'First Steps', desc: 'Play any game to get started', icon: '👣', color: '#00e5ff', glow: 'rgba(0, 229, 255, 0.4)' },
  { id: 'zombie_survivor', name: 'Zombie Survivor', desc: 'Score 50+ in Dead Zone', icon: '☣️', color: '#ff0055', glow: 'rgba(255, 0, 85, 0.4)' },
  { id: 'ninja_master', name: 'Ninja Master', desc: 'Score 30+ in Gesture Ninja', icon: '🥷', color: '#00ff88', glow: 'rgba(0, 255, 136, 0.4)' },
  { id: 'mouth_acrobat', name: 'Mouth Acrobat', desc: 'Score 10+ in Flappy Mouth', icon: '🐦', color: '#e67e22', glow: 'rgba(230, 126, 34, 0.4)' },
  { id: 'cyber_speedster', name: 'Cyber Speedster', desc: 'Score 15+ in Gesture Snake', icon: '🐍', color: '#f1c40f', glow: 'rgba(241, 196, 15, 0.4)' },
  { id: 'brick_smasher', name: 'Brick Smasher', desc: 'Score 50+ in Cyber Breaker', icon: '🧱', color: '#9b59b6', glow: 'rgba(155, 89, 182, 0.4)' },
  { id: 'balloons_maestro', name: 'Balloons Maestro', desc: 'Score 10+ in Neon Keepy-Uppy', icon: '🎈', color: '#3498db', glow: 'rgba(52, 152, 219, 0.4)' },
  { id: 'deadeye_sniper', name: 'Deadeye Sniper', desc: 'Score 300+ in Cyber Strike 3D', icon: '⚡', color: '#1abc9c', glow: 'rgba(26, 188, 156, 0.4)' },
  { id: 'dodge_master', name: 'Dodge Master', desc: 'Score 30+ in Shadow Fighter', icon: '✊', color: '#ff5500', glow: 'rgba(255, 85, 0, 0.4)' },
  { id: 'saber_master', name: 'Saber Master', desc: 'Score 100+ in Rhythm Saber', icon: '⚔️', color: '#ff007f', glow: 'rgba(255, 0, 127, 0.4)' }
];

let currentStats = {};
let currentAchievements = {};

// Dashboard DOM Elements
const dashboardModal = document.getElementById("dashboard-modal");
const dashboardCloseBtn = document.getElementById("dashboard-close-btn");
const dashboardLogoutBtn = document.getElementById("dashboard-logout-btn");
const dashboardDisplayName = document.getElementById("dashboard-display-name");
const dashboardEmail = document.getElementById("dashboard-email");
const dashboardAvatarLarge = document.getElementById("dashboard-avatar-large");
const dashboardStatsGrid = document.getElementById("dashboard-stats-grid");
const dashboardAchievementsGrid = document.getElementById("dashboard-achievements-grid");
const dashboardSyncStatus = document.getElementById("dashboard-sync-status");

const scanLocalStorageStats = (userDisplayName) => {
  const stats = {};
  Object.keys(GAMES_CONFIG).forEach(gameId => {
    const config = GAMES_CONFIG[gameId];
    try {
      const raw = localStorage.getItem(config.storageKey);
      let highestVal = 0;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(item => {
            let s = 0;
            let nameVal = '';
            if (typeof item === 'number') {
              s = item;
            } else if (item && typeof item === 'object') {
              s = Number(item.score) || 0;
              nameVal = item.name || '';
            }
            if (!nameVal || nameVal === 'Guest' || nameVal === userDisplayName) {
              if (s > highestVal) highestVal = s;
            }
          });
        }
      }
      stats[gameId] = highestVal;
    } catch (e) {
      console.error(`Error scanning stats for ${gameId}:`, e);
      stats[gameId] = 0;
    }
  });
  return stats;
};

// Helper to write back to local storage (so games can see updated scores from other browsers!)
const updateLocalStorageGameScore = (gameId, userDisplayName, score) => {
  try {
    const config = GAMES_CONFIG[gameId];
    if (!config) return;
    const raw = localStorage.getItem(config.storageKey);
    let list = [];
    if (raw) {
      list = JSON.parse(raw);
    }
    
    // Check if score is already there
    const exists = list.some(item => {
      const s = typeof item === 'number' ? item : item.score;
      const n = typeof item === 'number' ? 'Guest' : item.name;
      return s === score && (n === userDisplayName || n === 'Guest');
    });

    if (!exists) {
      list.push({ name: userDisplayName, score: score, date: new Date().toLocaleDateString() });
      list.sort((a, b) => {
        const sa = typeof a === 'number' ? a : a.score;
        const sb = typeof b === 'number' ? b : b.score;
        return sb - sa;
      });
      list = list.slice(0, 5);
      localStorage.setItem(config.storageKey, JSON.stringify(list));
    }
  } catch (e) {
    console.error(`Error updating local storage key ${gameId}:`, e);
  }
};

const syncStatsAndAchievements = async (uid, userDisplayName) => {
  try {
    const dbRef = ref(database);
    
    // 1. Fetch remote stats and achievements
    const statsSnapshot = await get(child(dbRef, `users/${uid}/stats`));
    const remoteStats = statsSnapshot.exists() ? statsSnapshot.val() : {};
    
    const achievementsSnapshot = await get(child(dbRef, `users/${uid}/achievements`));
    const remoteAchievements = achievementsSnapshot.exists() ? achievementsSnapshot.val() : {};

    // 2. Scan local stats
    const localStats = scanLocalStorageStats(userDisplayName);

    // 3. Merge stats: take maximum of local and remote
    const mergedStats = {};
    let statsChanged = false;

    Object.keys(GAMES_CONFIG).forEach(gameId => {
      const localScore = localStats[gameId] || 0;
      const remoteScore = remoteStats[gameId] || 0;
      mergedStats[gameId] = Math.max(localScore, remoteScore);

      if (mergedStats[gameId] > remoteScore) {
        statsChanged = true;
      }
      
      // Sync back to local storage if remote had a higher score
      if (remoteScore > localScore) {
        updateLocalStorageGameScore(gameId, userDisplayName, remoteScore);
      }
    });

    currentStats = mergedStats;

    // 4. Save merged stats to Firebase if changed
    if (statsChanged) {
      await set(ref(database, `users/${uid}/stats`), mergedStats);
    }

    // 5. Evaluate achievements
    const unlockedAchievements = { ...remoteAchievements };
    let achievementsChanged = false;

    // Condition evaluations
    const totalScore = Object.values(mergedStats).reduce((a, b) => a + b, 0);

    ACHIEVEMENTS_LIST.forEach(ach => {
      let shouldUnlock = false;

      if (ach.id === 'first_steps') {
        shouldUnlock = totalScore > 0;
      } else {
        // Find corresponding game
        const gameId = ach.id === 'zombie_survivor' ? 'deadzone' :
                       ach.id === 'ninja_master' ? 'gesture-ninja' :
                       ach.id === 'mouth_acrobat' ? 'flappy-mouth' :
                       ach.id === 'cyber_speedster' ? 'gesture-snake' :
                       ach.id === 'brick_smasher' ? 'cyber-breaker' :
                       ach.id === 'balloons_maestro' ? 'keepy-uppy' :
                       ach.id === 'deadeye_sniper' ? 'cyber-strike-3d' :
                       ach.id === 'dodge_master' ? 'shadow-fighter' :
                       ach.id === 'saber_master' ? 'rhythm-saber' : null;

        if (gameId && mergedStats[gameId] >= GAMES_CONFIG[gameId].threshold) {
          shouldUnlock = true;
        }
      }

      if (shouldUnlock && !unlockedAchievements[ach.id]) {
        unlockedAchievements[ach.id] = {
          unlocked: true,
          unlockedAt: Date.now()
        };
        achievementsChanged = true;
      }
    });

    currentAchievements = unlockedAchievements;

    // 6. Save achievements to Firebase if changed
    if (achievementsChanged) {
      await set(ref(database, `users/${uid}/achievements`), unlockedAchievements);
    }

    console.log("Stats & Achievements successfully synchronized!");
    return true;
  } catch (err) {
    console.error("Error syncing stats and achievements:", err);
    return false;
  }
};

const renderDashboardUI = (userDisplayName) => {
  // 1. Render Stats Section
  dashboardStatsGrid.innerHTML = '';
  Object.keys(GAMES_CONFIG).forEach(gameId => {
    const config = GAMES_CONFIG[gameId];
    const scoreVal = currentStats[gameId] || 0;
    
    const statItem = document.createElement('div');
    statItem.className = 'stat-item';
    statItem.innerHTML = `
      <div class="stat-game-info">
        <span class="stat-game-icon">${config.icon}</span>
        <span class="stat-game-name">${config.name}</span>
      </div>
      <span class="stat-game-score" style="color: ${scoreVal > 0 ? 'var(--secondary-accent)' : 'var(--text-muted)'}; text-shadow: ${scoreVal > 0 ? '0 0 5px var(--secondary-accent)' : 'none'};">
        ${scoreVal > 0 ? String(scoreVal).padStart(5, '0') : '-----'}
      </span>
    `;
    dashboardStatsGrid.appendChild(statItem);
  });

  // 2. Render Achievements Section
  dashboardAchievementsGrid.innerHTML = '';
  ACHIEVEMENTS_LIST.forEach(ach => {
    const isUnlocked = !!currentAchievements[ach.id];
    const card = document.createElement('div');
    card.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;
    
    if (isUnlocked) {
      card.setAttribute('data-color', ach.color);
      card.style.setProperty('--badge-color', ach.color);
      card.style.setProperty('--badge-glow-color', ach.glow);
      card.setAttribute('data-tooltip', `Unlocked!`);
    } else {
      card.setAttribute('data-tooltip', `Locked`);
    }

    card.innerHTML = `
      <div class="achievement-badge-icon">${ach.icon}</div>
      <div class="achievement-title">${ach.name}</div>
      <div class="achievement-desc">${ach.desc}</div>
    `;
    dashboardAchievementsGrid.appendChild(card);
  });
};

const openDashboardModal = async () => {
  const user = auth.currentUser;
  if (!user) return;
  
  // Set basic info
  const displayName = localStorage.getItem('currentUserDisplayName') || user.displayName || user.email.split("@")[0];
  dashboardDisplayName.innerText = displayName;
  dashboardEmail.innerText = user.email;
  dashboardAvatarLarge.innerText = displayName.charAt(0).toUpperCase();

  // Show modal
  dashboardModal.style.display = "flex";

  // Pre-load currently cached stats (if any) or scan local stats instantly
  const localStats = scanLocalStorageStats(displayName);
  currentStats = localStats;
  renderDashboardUI(displayName);

  // Async sync and update from Firebase
  if (dashboardSyncStatus) {
    dashboardSyncStatus.innerHTML = '<span class="sync-dot" style="background:#ffaa00; box-shadow: 0 0 8px #ffaa00; animation: none;"></span> Syncing...';
  }
  
  const success = await syncStatsAndAchievements(user.uid, displayName);
  if (dashboardSyncStatus) {
    if (success) {
      dashboardSyncStatus.innerHTML = '<span class="sync-dot"></span> Synced with Firebase';
    } else {
      dashboardSyncStatus.innerHTML = '<span class="sync-dot" style="background:#e74c3c; box-shadow: 0 0 8px #e74c3c; animation: none;"></span> Offline Mode';
    }
  }

  // Re-render with merged fresh database/local stats
  renderDashboardUI(displayName);
};

const closeDashboardModal = () => {
  if (dashboardModal) {
    dashboardModal.style.display = "none";
  }
};

if (dashboardCloseBtn) {
  dashboardCloseBtn.addEventListener("click", closeDashboardModal);
}
if (dashboardLogoutBtn) {
  dashboardLogoutBtn.addEventListener("click", () => {
    closeDashboardModal();
    signOut(auth).catch((err) => console.error("Sign out error:", err));
  });
}

