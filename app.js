let currentUser = null;
let allGames = [];
let skins = [
  { id: 1, name: "Classic", icon: "🟢", price: 50 },
  { id: 2, name: "Fire", icon: "🔥", price: 100 },
  { id: 3, name: "Ice", icon: "❄️", price: 150 },
  { id: 4, name: "Galaxy", icon: "🌌", price: 250 },
  { id: 5, name: "Robot", icon: "🤖", price: 350 },
  { id: 6, name: "Lightning", icon: "⚡", price: 500 },
  { id: 7, name: "Shadow", icon: "🌑", price: 750 },
  { id: 8, name: "Diamond", icon: "💎", price: 1000 }
];

const $ = id => document.getElementById(id);

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let data = {};
  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(data.error || "Помилка сервера");
  }

  return data;
}

/* LOADER */

let progress = 0;

const loaderTimer = setInterval(() => {
  progress += 5;

  if (progress >= 90) {
    progress = 90;
    clearInterval(loaderTimer);
  }

  $("loaderProgress").style.width = progress + "%";
}, 60);

async function finishLoader() {
  $("loaderProgress").style.width = "100%";

  setTimeout(() => {
    $("loader").style.display = "none";
  }, 350);
}

/* INIT */

async function init() {
  try {
    await loadSession();
    await loadGames();
    renderShop();
  } catch (e) {
    console.error(e);
  }

  finishLoader();
}

window.addEventListener("load", init);

/* NAVIGATION */

function openPage(page) {
  document.querySelectorAll(".page").forEach(p => {
    p.classList.remove("active");
  });

  const target = $(page + "Page");

  if (target) {
    target.classList.add("active");
  }

  if (page === "games") loadGames();
  if (page === "friends") loadFriends();
  if (page === "inventory") loadInventory();
}

/* SESSION */

async function loadSession() {
  try {
    const data = await api("/api/me");

    currentUser = data.user || null;

    updateUserUI();
  } catch {
    currentUser = null;
  }
}

function updateUserUI() {
  if (!currentUser) {
    $("coinBalance").textContent = "0";
    $("profileUsername").textContent = "Гість";
    $("profileId").textContent = "—";
    $("profileCoins").textContent = "0";
    return;
  }

  $("coinBalance").textContent = currentUser.coins || 0;
  $("profileUsername").textContent = currentUser.username;
  $("profileId").textContent = currentUser.id;
  $("profileCoins").textContent = currentUser.coins || 0;
}

/* REGISTER */

async function register() {
  const username = prompt("Введи username:");

  if (!username) return;

  try {
    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ username })
    });

    currentUser = data.user;
    updateUserUI();

    showModal("ZYVO", "Ти увійшов як @" + currentUser.username);
  } catch (e) {
    showModal("Помилка", e.message);
  }
}

/* DAILY */

async function claimDaily() {
  if (!currentUser) {
    register();
    return;
  }

  try {
    const data = await api("/api/daily-reward", {
      method: "POST"
    });

    currentUser = data.user;
    updateUserUI();

    showModal("🎁 Daily Reward", data.message || "+50 Coins");
  } catch (e) {
    showModal("Daily Reward", e.message);
  }
}

/* GAMES */

async function loadGames() {
  try {
    const data = await api("/api/games");

    allGames = data.games || [];

    renderGames(allGames);
    renderHomeGames(allGames);
  } catch (e) {
    console.error(e);
  }
}

function renderGames(games) {
  const container = $("gamesList");

  if (!games.length) {
    container.innerHTML = `
      <div class="panel">
        <h3>Поки немає ігор</h3>
        <p class="muted">Створи першу гру через ZYVO Creator.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = games.map(game => `
    <div class="game-card">
      <div class="game-cover">🎮</div>

      <div class="game-info">
        <h3>${escapeHtml(game.title)}</h3>

        <p>
          ${escapeHtml(game.description || "Гра ZYVO")}
        </p>

        <div class="game-meta">
          👤 ${escapeHtml(game.author || "Unknown")}
        </div>

        <button
          class="primary"
          onclick="playGame(${game.id})"
        >
          ▶ Грати
        </button>
      </div>
    </div>
  `).join("");
}

function renderHomeGames(games) {
  const container = $("homeGames");

  const list = games.slice(0, 6);

  if (!list.length) {
    container.innerHTML = `
      <div class="panel">
        <p class="muted">Поки немає опублікованих ігор.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(game => `
    <div class="game-card">
      <div class="game-cover">🎮</div>

      <div class="game-info">
        <h3>${escapeHtml(game.title)}</h3>

        <div class="game-meta">
          👤 ${escapeHtml(game.author || "Unknown")}
        </div>

        <button class="primary" onclick="playGame(${game.id})">
          ▶ Грати
        </button>
      </div>
    </div>
  `).join("");
}

function filterGames() {
  const q = $("gameSearch").value.toLowerCase();

  const filtered = allGames.filter(game =>
    String(game.title || "").toLowerCase().includes(q) ||
    String(game.author || "").toLowerCase().includes(q)
  );

  renderGames(filtered);
}

/* =========================
   ZYVO GAME PLAYER
========================= */

let runtime = {
  game: null,
  canvas: null,
  ctx: null,
  running: false,

  cameraX: 0,
  cameraY: 0,

  player: {
    x: 100,
    y: 100,
    w: 30,
    h: 40,
    vx: 0,
    vy: 0,
    speed: 4,
    jump: -10,
    grounded: false
  },

  objects: [],
  coins: 0,

  keys: {
    left: false,
    right: false,
    jump: false
  },

  joystickX: 0
};

async function playGame(id) {
  try {
    const data = await api("/api/games/" + id);

    if (!data.game) {
      throw new Error("Гру не знайдено");
    }

    startGame(data.game);
  } catch (e) {
    showModal("Не вдалося запустити", e.message);
  }
}

function startGame(game) {
  runtime.game = game;
  runtime.canvas = $("gameCanvas");
  runtime.ctx = runtime.canvas.getContext("2d");

  $("playingGameTitle").textContent = game.title;
  $("playingGameAuthor").textContent =
    "👤 " + (game.author || "Unknown");

  runtime.objects = Array.isArray(game.objects)
    ? game.objects
    : [];

  runtime.coins = 0;

  const spawn = runtime.objects.find(o => o.type === "spawn");

  runtime.player.x = spawn ? spawn.x : 100;
  runtime.player.y = spawn ? spawn.y : 100;
  runtime.player.vx = 0;
  runtime.player.vy = 0;

  runtime.cameraX = 0;
  runtime.cameraY = 0;

  $("runtimeCoins").textContent = "0";

  resizeGameCanvas();

  $("gamePlayer").classList.add("active");

  runtime.running = true;

  requestAnimationFrame(gameLoop);
}

function exitGame() {
  runtime.running = false;
  $("gamePlayer").classList.remove("active");
}

function resizeGameCanvas() {
  if (!runtime.canvas) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  runtime.canvas.width = window.innerWidth * dpr;
  runtime.canvas.height = window.innerHeight * dpr;

  runtime.ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );
}

window.addEventListener("resize", resizeGameCanvas);

/* GAME LOOP */

function gameLoop() {
  if (!runtime.running) return;

  updatePlayer();
  updateCamera();
  drawGame();

  requestAnimationFrame(gameLoop);
}

/* PLAYER PHYSICS */

function updatePlayer() {
  const p = runtime.player;

  const left =
    runtime.keys.left ||
    runtime.joystickX < -0.25;

  const right =
    runtime.keys.right ||
    runtime.joystickX > 0.25;

  if (left) {
    p.vx = -p.speed;
  } else if (right) {
    p.vx = p.speed;
  } else {
    p.vx *= 0.78;
  }

  p.vy += 0.5;

  if (
    runtime.keys.jump &&
    p.grounded
  ) {
    p.vy = p.jump;
    p.grounded = false;
  }

  runtime.keys.jump = false;

  p.x += p.vx;

  resolveHorizontalCollisions();

  p.y += p.vy;

  p.grounded = false;

  resolveVerticalCollisions();

  collectCoins();

  if (p.y > 1500) {
    const spawn = runtime.objects.find(o => o.type === "spawn");

    p.x = spawn ? spawn.x : 100;
    p.y = spawn ? spawn.y : 100;
    p.vx = 0;
    p.vy = 0;
  }
}

/* COLLISIONS */

function getBlocks() {
  return runtime.objects.filter(
    o => o.type === "block"
  );
}

function intersects(a, b) {
  return (
    a.x < b.x + 30 &&
    a.x + a.w > b.x &&
    a.y < b.y + 30 &&
    a.y + a.h > b.y
  );
}

function resolveHorizontalCollisions() {
  const p = runtime.player;

  for (const block of getBlocks()) {
    const b = {
      x: block.x,
      y: block.y,
      w: 30,
      h: 30
    };

    if (!intersects(p, b)) continue;

    if (p.vx > 0) {
      p.x = b.x - p.w;
    }

    if (p.vx < 0) {
      p.x = b.x + b.w;
    }

    p.vx = 0;
  }
}

function resolveVerticalCollisions() {
  const p = runtime.player;

  for (const block of getBlocks()) {
    const b = {
      x: block.x,
      y: block.y,
      w: 30,
      h: 30
    };

    if (!intersects(p, b)) continue;

    if (p.vy > 0) {
      p.y = b.y - p.h;
      p.vy = 0;
      p.grounded = true;
    }

    if (p.vy < 0) {
      p.y = b.y + b.h;
      p.vy = 0;
    }
  }
}

/* COINS */

function collectCoins() {
  const p = runtime.player;

  runtime.objects.forEach((o, index) => {
    if (o.type !== "coin" || o.collected) return;

    const c = {
      x: o.x,
      y: o.y,
      w: 30,
      h: 30
    };

    if (intersects(p, c)) {
      o.collected = true;
      runtime.coins++;

      $("runtimeCoins").textContent = runtime.coins;

      collectServerCoin(runtime.game.id, index);
    }
  });
}

async function collectServerCoin(gameId, coinIndex) {
  try {
    const data = await api("/api/games/" + gameId + "/collect", {
      method: "POST",
      body: JSON.stringify({
        coinIndex
      })
    });

    if (data.user) {
      currentUser = data.user;
      updateUserUI();
    }
  } catch (e) {
    console.log("Coin reward:", e.message);
  }
}

/* CAMERA */

function updateCamera() {
  const p = runtime.player;

  runtime.cameraX =
    p.x - window.innerWidth / 2 + p.w / 2;

  runtime.cameraY =
    p.y - window.innerHeight / 2 + p.h / 2;

  if (runtime.cameraX < 0) {
    runtime.cameraX = 0;
  }

  if (runtime.cameraY < 0) {
    runtime.cameraY = 0;
  }
}

/* DRAW */

function drawGame() {
  const ctx = runtime.ctx;

  const width = window.innerWidth;
  const height = window.innerHeight;

  ctx.clearRect(0, 0, width, height);

  /* sky */

  ctx.fillStyle = "#9ddcff";
  ctx.fillRect(0, 0, width, height);

  /* background */

  ctx.fillStyle = "#bceaff";

  for (let x = 0; x < width + 500; x += 100) {
    ctx.fillRect(
      x - (runtime.cameraX * 0.2 % 100),
      150,
      60,
      300
    );
  }

  /* world */

  ctx.save();

  ctx.translate(
    -runtime.cameraX,
    -runtime.cameraY
  );

  drawObjects(ctx);
  drawPlayer(ctx);

  ctx.restore();
}

function drawObjects(ctx) {
  for (const o of runtime.objects) {
    if (o.type === "block") {
      ctx.fillStyle = "#252525";
      ctx.fillRect(o.x, o.y, 30, 30);

      ctx.strokeStyle = "#111";
      ctx.strokeRect(o.x, o.y, 30, 30);
    }

    if (o.type === "spawn") {
      ctx.fillStyle = "#b8ff3d";
      ctx.fillRect(o.x, o.y, 30, 30);

      ctx.fillStyle = "#111";
      ctx.font = "18px Arial";
      ctx.fillText("S", o.x + 8, o.y + 21);
    }

    if (o.type === "coin" && !o.collected) {
      ctx.fillStyle = "#ffd83d";
      ctx.beginPath();
      ctx.arc(
        o.x + 15,
        o.y + 15,
        12,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.strokeStyle = "#c99900";
      ctx.stroke();
    }
  }
}

function drawPlayer(ctx) {
  const p = runtime.player;

  ctx.fillStyle = "#b8ff3d";

  ctx.fillRect(
    p.x,
    p.y,
    p.w,
    p.h
  );

  ctx.fillStyle = "#111";

  ctx.fillRect(
    p.x + 7,
    p.y + 9,
    5,
    5
  );

  ctx.fillRect(
    p.x + 19,
    p.y + 9,
    5,
    5
  );
}

/* KEYBOARD */

window.addEventListener("keydown", e => {
  if (!runtime.running) return;

  if (e.key === "ArrowLeft" || e.key === "a") {
    runtime.keys.left = true;
  }

  if (e.key === "ArrowRight" || e.key === "d") {
    runtime.keys.right = true;
  }

  if (
    e.key === "ArrowUp" ||
    e.key === " " ||
    e.key === "w"
  ) {
    runtime.keys.jump = true;
  }
});

window.addEventListener("keyup", e => {
  if (e.key === "ArrowLeft" || e.key === "a") {
    runtime.keys.left = false;
  }

  if (e.key === "ArrowRight" || e.key === "d") {
    runtime.keys.right = false;
  }
});

/* JOYSTICK */

const joystick = $("joystick");
const knob = $("joystickKnob");

let joystickActive = false;

function updateJoystick(clientX, clientY) {
  const rect = joystick.getBoundingClientRect();

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let dx = clientX - centerX;
  let dy = clientY - centerY;

  const max = 40;

  const distance = Math.sqrt(
    dx * dx + dy * dy
  );

  if (distance > max) {
    dx = dx / distance * max;
    dy = dy / distance * max;
  }

  knob.style.transform =
    `translate(${dx}px, ${dy}px)`;

  runtime.joystickX = dx / max;
}

joystick.addEventListener("touchstart", e => {
  joystickActive = true;

  const t = e.touches[0];

  updateJoystick(
    t.clientX,
    t.clientY
  );

  e.preventDefault();
}, { passive: false });

joystick.addEventListener("touchmove", e => {
  if (!joystickActive) return;

  const t = e.touches[0];

  updateJoystick(
    t.clientX,
    t.clientY
  );

  e.preventDefault();
}, { passive: false });

function resetJoystick() {
  joystickActive = false;
  runtime.joystickX = 0;
  knob.style.transform = "translate(0,0)";
}

joystick.addEventListener("touchend", resetJoystick);
joystick.addEventListener("touchcancel", resetJoystick);

/* JUMP */

$("jumpButton").addEventListener("touchstart", e => {
  runtime.keys.jump = true;
  e.preventDefault();
}, { passive: false });

$("jumpButton").addEventListener("mousedown", () => {
  runtime.keys.jump = true;
});

/* SHOP */

function renderShop() {
  $("shopList").innerHTML = skins.map(skin => `
    <div class="skin-card">
      <div class="skin-icon">${skin.icon}</div>
      <h3>${skin.name}</h3>
      <div class="skin-price">🪙 ${skin.price}</div>
      <button
        class="primary"
        onclick="buySkin(${skin.id})"
      >
        Купити
      </button>
    </div>
  `).join("");
}

async function buySkin(id) {
  if (!currentUser) {
    register();
    return;
  }

  try {
    const data = await api("/api/buy-skin", {
      method: "POST",
      body: JSON.stringify({ skinId: id })
    });

    currentUser = data.user;

    updateUserUI();

    showModal(
      "🛒 Магазин",
      data.message || "Скін придбано!"
    );
  } catch (e) {
    showModal("Магазин", e.message);
  }
}

/* INVENTORY */

async function loadInventory() {
  if (!currentUser) {
    $("inventoryList").innerHTML = `
      <div class="panel">
        <p>Спочатку увійди в ZYVO.</p>
      </div>
    `;
    return;
  }

  try {
    const data = await api("/api/inventory");

    const items = data.inventory || [];

    if (!items.length) {
      $("inventoryList").innerHTML = `
        <div class="panel">
          <p class="muted">Інвентар порожній.</p>
        </div>
      `;
      return;
    }

    $("inventoryList").innerHTML = items.map(item => {
      const skin = skins.find(
        s => s.id === Number(item.skin_id)
      );

      return `
        <div class="skin-card">
          <div class="skin-icon">
            ${skin ? skin.icon : "🎁"}
          </div>
          <h3>${skin ? skin.name : "Skin"}</h3>
        </div>
      `;
    }).join("");
  } catch (e) {
    console.error(e);
  }
}

/* FRIENDS */

async function addFriend() {
  if (!currentUser) {
    register();
    return;
  }

  const username = $("friendUsername").value.trim();

  if (!username) return;

  try {
    const data = await api("/api/friends/add", {
      method: "POST",
      body: JSON.stringify({ username })
    });

    $("friendUsername").value = "";

    showModal(
      "👥 Друзі",
      data.message || "Друга додано!"
    );

    loadFriends();
  } catch (e) {
    showModal("Друзі", e.message);
  }
}

async function loadFriends() {
  if (!currentUser) return;

  try {
    const data = await api("/api/friends");

    const friends = data.friends || [];

    $("profileFriends").textContent =
      friends.length;

    $("friendsList").innerHTML =
      friends.map(friend => `
        <div class="friend-card">
          👤 <b>${escapeHtml(friend.username)}</b>
        </div>
      `).join("") ||
      `<p class="muted">Друзів поки немає.</p>`;
  } catch (e) {
    console.error(e);
  }
}

/* PROFILE */

async function changeUsername() {
  if (!currentUser) {
    register();
    return;
  }

  const username = prompt(
    "Новий username:",
    currentUser.username
  );

  if (!username) return;

  try {
    const data = await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ username })
    });

    currentUser = data.user;

    updateUserUI();
  } catch (e) {
    showModal("Профіль", e.message);
  }
}

async function logout() {
  try {
    await api("/api/logout", {
      method: "POST"
    });
  } catch {}

  currentUser = null;

  updateUserUI();

  openPage("home");
}

/* MODAL */

function showModal(title, text) {
  $("modalTitle").textContent = title;
  $("modalText").textContent = text;
  $("modal").classList.add("active");
}

function closeModal() {
  $("modal").classList.remove("active");
}

/* UTILS */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
