let currentUser = null;
let currentChatFriend = null;
let chatTimer = null;
let currentGame = null;

let moveLeft = false;
let moveRight = false;
let velocityY = 0;
let playerX = 80;
let playerY = 100;
let jumping = false;

const skins = [
  {
    id: 1,
    name: "Classic",
    icon: "🟢",
    price: 50
  },
  {
    id: 2,
    name: "Fire",
    icon: "🔥",
    price: 100
  },
  {
    id: 3,
    name: "Ice",
    icon: "❄️",
    price: 150
  },
  {
    id: 4,
    name: "Galaxy",
    icon: "🌌",
    price: 250
  },
  {
    id: 5,
    name: "Robot",
    icon: "🤖",
    price: 350
  },
  {
    id: 6,
    name: "Lightning",
    icon: "⚡",
    price: 500
  },
  {
    id: 7,
    name: "Shadow",
    icon: "🌑",
    price: 750
  },
  {
    id: 8,
    name: "Diamond",
    icon: "💎",
    price: 1000
  }
];

let inventory = [];
let equippedSkin = 1;


/* -------------------------
   HELPERS
------------------------- */

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error || "Сталася помилка"
    );
  }

  return data;
}

function showToast(message) {
  const toast = document.getElementById("toast");

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createDefaultAvatar(username = "ZYVO") {
  const letter = escapeHtml(
    String(username).charAt(0).toUpperCase() || "Z"
  );

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="256"
         height="256"
         viewBox="0 0 256 256">
      <rect width="256" height="256" rx="128" fill="#55d66a"/>
      <text x="50%" y="55%"
            text-anchor="middle"
            font-size="110"
            font-family="Arial"
            font-weight="bold"
            fill="white">${letter}</text>
    </svg>
  `;

  return "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(svg);
}

function setAvatarImage(element, avatar, username) {
  if (!element) return;

  element.src =
    avatar ||
    createDefaultAvatar(username || "ZYVO");
}


/* -------------------------
   LOADING
------------------------- */

let loadingProgress = 0;

const loadingInterval = setInterval(() => {

  loadingProgress += Math.random() * 15;

  if (loadingProgress > 100) {
    loadingProgress = 100;
  }

  const bar =
    document.getElementById("loadingProgress");

  if (bar) {
    bar.style.width = loadingProgress + "%";
  }

  if (loadingProgress >= 100) {
    clearInterval(loadingInterval);

    setTimeout(() => {
      document
        .getElementById("loadingScreen")
        .classList.add("hidden");

      startApp();
    }, 300);
  }

}, 120);


/* -------------------------
   START
------------------------- */

async function startApp() {
  try {

    const data = await api("/api/me");

    currentUser = data.user;

    showApplication();

  } catch {

    document
      .getElementById("authScreen")
      .classList.remove("hidden");

  }
}

async function login() {

  const input =
    document.getElementById("usernameInput");

  const error =
    document.getElementById("authError");

  const username =
    input.value.trim();

  error.textContent = "";

  if (username.length < 2) {
    error.textContent =
      "Введи мінімум 2 символи";

    return;
  }

  try {

    const data = await api(
      "/api/register",
      {
        method: "POST",
        body: JSON.stringify({
          username
        })
      }
    );

    currentUser = data.user;

    document
      .getElementById("authScreen")
      .classList.add("hidden");

    showApplication();

  } catch (error) {

    error.textContent =
      error.message;

  }
}

document
  .getElementById("loginButton")
  .addEventListener("click", login);

document
  .getElementById("usernameInput")
  .addEventListener("keydown", event => {

    if (event.key === "Enter") {
      login();
    }

  });


/* -------------------------
   APPLICATION
------------------------- */

function showApplication() {

  document
    .getElementById("app")
    .classList.remove("hidden");

  updateUserUI();

  loadGames();
  loadShop();
  loadInventory();
  loadFriends();

  showPage("home");

  startPresence();

}

function updateUserUI() {

  if (!currentUser) return;

  document
    .getElementById("coinsValue")
    .textContent =
    currentUser.coins || 0;

  document
    .getElementById("profileCoins")
    .textContent =
    currentUser.coins || 0;

  document
    .getElementById("profileUsername")
    .textContent =
    currentUser.username;

  setAvatarImage(
    document.getElementById("profileAvatar"),
    currentUser.avatar,
    currentUser.username
  );

  setAvatarImage(
    document.getElementById("topAvatar"),
    currentUser.avatar,
    currentUser.username
  );

  equippedSkin =
    currentUser.equipped_skin || 1;

}


/* -------------------------
   PAGE NAVIGATION
------------------------- */

function showPage(page) {

  document
    .querySelectorAll(".page")
    .forEach(element => {
      element.classList.remove("active");
    });

  const target =
    document.getElementById(
      "page-" + page
    );

  if (target) {
    target.classList.add("active");
  }

  document
    .querySelectorAll(".bottom-nav button")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });

  if (page === "friends") {
    loadFriends();
  }

  if (page === "inventory") {
    loadInventory();
  }

  if (page === "shop") {
    loadShop();
  }

  if (page === "home") {
    loadGames();
  }

  if (page !== "chat") {
    stopChatPolling();
  }
}


/* -------------------------
   AVATAR
------------------------- */

function chooseAvatar() {

  document
    .getElementById("avatarFile")
    .click();

}

async function resizeAvatar(file) {

  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onload = () => {

      const image = new Image();

      image.onload = () => {

        const canvas =
          document.createElement("canvas");

        canvas.width = 256;
        canvas.height = 256;

        const ctx =
          canvas.getContext("2d");

        const size =
          Math.min(
            image.width,
            image.height
          );

        const sx =
          (image.width - size) / 2;

        const sy =
          (image.height - size) / 2;

        ctx.drawImage(
          image,
          sx,
          sy,
          size,
          size,
          0,
          0,
          256,
          256
        );

        resolve(
          canvas.toDataURL(
            "image/jpeg",
            0.82
          )
        );

      };

      image.onerror = reject;

      image.src = reader.result;
    };

    reader.onerror = reject;

    reader.readAsDataURL(file);

  });
}

async function uploadAvatar(event) {

  const file =
    event.target.files[0];

  if (!file) return;

  if (
    ![
      "image/png",
      "image/jpeg",
      "image/webp"
    ].includes(file.type)
  ) {

    showToast(
      "Потрібен PNG, JPG або WEBP"
    );

    return;
  }

  try {

    const avatar =
      await resizeAvatar(file);

    const data = await api(
      "/api/profile/avatar",
      {
        method: "POST",
        body: JSON.stringify({
          avatar
        })
      }
    );

    currentUser =
      data.user;

    updateUserUI();

    showToast(
      "Аватар оновлено!"
    );

  } catch (error) {

    showToast(
      error.message
    );

  }

}


/* -------------------------
   SHOP
------------------------- */

function loadShop() {

  const container =
    document.getElementById("shopList");

  container.innerHTML = "";

  skins.forEach(skin => {

    const owned =
      inventory.some(
        item => item.id === skin.id
      );

    const equipped =
      equippedSkin === skin.id;

    const card =
      document.createElement("div");

    card.className =
      "skin-card";

    card.innerHTML = `
      <div class="skin-icon">
        ${skin.icon}
      </div>

      <h3>
        ${escapeHtml(skin.name)}
      </h3>

      <div class="skin-price">
        🪙 ${skin.price}
      </div>

      <button
        class="${equipped
          ? "equipped"
          : owned
            ? "owned"
            : ""}"
        ${equipped || owned
          ? "disabled"
          : ""}
      >
        ${
          equipped
            ? "Надітий"
            : owned
              ? "Куплено"
              : "Купити"
        }
      </button>
    `;

    const button =
      card.querySelector("button");

    if (!owned && !equipped) {

      button.addEventListener(
        "click",
        () => buySkin(skin.id)
      );

    }

    container.appendChild(card);

  });

}

async function buySkin(skinId) {

  try {

    const data = await api(
      "/api/buy-skin",
      {
        method: "POST",
        body: JSON.stringify({
          skinId
        })
      }
    );

    currentUser =
      data.user;

    updateUserUI();

    await loadInventory();

    loadShop();

    showToast(
      `Скін ${data.skin.icon} куплено!`
    );

  } catch (error) {

    showToast(
      error.message
    );

  }

}


/* -------------------------
   INVENTORY
------------------------- */

async function loadInventory() {

  try {

    const data =
      await api("/api/inventory");

    inventory =
      data.inventory || [];

    equippedSkin =
      data.equippedSkin || 1;

    renderInventory();

    loadShop();

  } catch (error) {

    console.error(error);

  }

}

function renderInventory() {

  const container =
    document.getElementById(
      "inventoryList"
    );

  container.innerHTML = "";

  if (!inventory.length) {

    container.innerHTML = `
      <div class="empty">
        Інвентар порожній
      </div>
    `;

    return;
  }

  inventory.forEach(skin => {

    const equipped =
      equippedSkin === skin.id;

    const card =
      document.createElement("div");

    card.className =
      "skin-card";

    card.innerHTML = `
      <div class="skin-icon">
        ${skin.icon}
      </div>

      <h3>
        ${escapeHtml(skin.name)}
      </h3>

      <button
        class="${equipped ? "equipped" : ""}"
      >
        ${
          equipped
            ? "✓ Надітий"
            : "Надіти"
        }
      </button>
    `;

    card
      .querySelector("button")
      .addEventListener(
        "click",
        () => equipSkin(skin.id)
      );

    container.appendChild(card);

  });

}

async function equipSkin(skinId) {

  try {

    const data =
      await api(
        "/api/equip-skin",
        {
          method: "POST",
          body: JSON.stringify({
            skinId
          })
        }
      );

    currentUser =
      data.user;

    equippedSkin =
      data.user.equipped_skin;

    updateUserUI();

    renderInventory();
    loadShop();

    updateGamePlayer();

    showToast(
      `${data.skin.icon} Скін надіто!`
    );

  } catch (error) {

    showToast(
      error.message
    );

  }

}


/* -------------------------
   DAILY REWARD
------------------------- */

async function claimDaily() {

  try {

    const data =
      await api(
        "/api/daily-reward",
        {
          method: "POST"
        }
      );

    currentUser =
      data.user;

    updateUserUI();

    showToast(
      `🎁 +${data.reward} коінів!`
    );

  } catch (error) {

    showToast(
      error.message
    );

  }

}


/* -------------------------
   FRIENDS
------------------------- */

async function addFriend() {

  const input =
    document.getElementById(
      "friendUsername"
    );

  const username =
    input.value.trim();

  if (!username) {

    showToast(
      "Введи нік друга"
    );

    return;
  }

  try {

    await api(
      "/api/friends/add",
      {
        method: "POST",
        body: JSON.stringify({
          username
        })
      }
    );

    input.value = "";

    await loadFriends();

    showToast(
      "Друга додано!"
    );

  } catch (error) {

    showToast(
      error.message
    );

  }

}

async function loadFriends() {

  try {

    const data =
      await api("/api/friends");

    renderFriends(
      data.friends || []
    );

  } catch (error) {

    console.error(error);

  }

}

function renderFriends(friends) {

  const container =
    document.getElementById(
      "friendsList"
    );

  container.innerHTML = "";

  if (!friends.length) {

    container.innerHTML = `
      <div class="empty">
        У тебе поки немає друзів.
      </div>
    `;

    return;
  }

  friends.forEach(friend => {

    const card =
      document.createElement("div");

    card.className =
      "friend-card";

    const avatar =
      document.createElement("img");

    avatar.className =
      "friend-avatar";

    setAvatarImage(
      avatar,
      friend.avatar,
      friend.username
    );

    const info =
      document.createElement("div");

    info.className =
      "friend-info";

    const name =
      document.createElement("div");

    name.className =
      "friend-name";

    name.textContent =
      friend.username;

    const status =
      document.createElement("div");

    status.className =
      "friend-status";

    const dot =
      document.createElement("span");

    dot.className =
      "status-dot " +
      (friend.online
        ? "online"
        : "");

    const statusText =
      document.createElement("span");

    statusText.textContent =
      friend.online
        ? "У мережі"
        : "Не в мережі";

    status.appendChild(dot);
    status.appendChild(statusText);

    info.appendChild(name);
    info.appendChild(status);

    const button =
      document.createElement("button");

    button.className =
      "chat-open-button";

    button.textContent =
      "💬";

    button.addEventListener(
      "click",
      () => openChat(friend)
    );

    card.appendChild(avatar);
    card.appendChild(info);
    card.appendChild(button);

    container.appendChild(card);

  });

}


/* -------------------------
   CHAT
------------------------- */

async function openChat(friend) {

  currentChatFriend =
    friend;

  document
    .getElementById("chatUsername")
    .textContent =
    friend.username;

  setAvatarImage(
    document.getElementById(
      "chatAvatar"
    ),
    friend.avatar,
    friend.username
  );

  document
    .getElementById("chatStatus")
    .textContent =
    friend.online
      ? "У мережі"
      : "Не в мережі";

  showPage("chat");

  await loadChat();

  startChatPolling();

  setTimeout(() => {
    document
      .getElementById("chatInput")
      .focus();
  }, 100);

}

async function loadChat() {

  if (!currentChatFriend) return;

  try {

    const data =
      await api(
        `/api/chat/${currentChatFriend.id}`
      );

    renderChat(
      data.messages || []
    );

  } catch (error) {

    console.error(error);

  }

}

function renderChat(messages) {

  const container =
    document.getElementById(
      "chatMessages"
    );

  container.innerHTML = "";

  messages.forEach(message => {

    const row =
      document.createElement("div");

    row.className =
      "message-row " +
      (
        message.sender_id === currentUser.id
          ? "mine"
          : ""
      );

    const bubble =
      document.createElement("div");

    bubble.className =
      "message-bubble";

    /*
      textContent використовується спеціально.
      Навіть якщо користувач напише:
      <script>alert(1)</script>
      це буде показано як звичайний текст,
      а не виконано як код.
    */

    bubble.textContent =
      message.message;

    row.appendChild(bubble);

    container.appendChild(row);

  });

  container.scrollTop =
    container.scrollHeight;

}

async function sendChatMessage() {

  if (!currentChatFriend) return;

  const input =
    document.getElementById(
      "chatInput"
    );

  const message =
    input.value.trim();

  if (!message) return;

  try {

    await api(
      `/api/chat/${currentChatFriend.id}`,
      {
        method: "POST",
        body: JSON.stringify({
          message
        })
      }
    );

    input.value = "";

    await loadChat();

  } catch (error) {

    showToast(
      error.message
    );

  }

}

document
  .getElementById("chatInput")
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        sendChatMessage();

      }

    }
  );

function startChatPolling() {

  stopChatPolling();

  chatTimer =
    setInterval(() => {

      if (
        currentChatFriend &&
        document
          .getElementById(
            "page-chat"
          )
          .classList
          .contains("active")
      ) {

        loadChat();

      }

    }, 3000);

}

function stopChatPolling() {

  if (chatTimer) {

    clearInterval(chatTimer);

    chatTimer = null;

  }

}


/* -------------------------
   PRESENCE
------------------------- */

let presenceTimer = null;

function startPresence() {

  if (presenceTimer) {
    clearInterval(presenceTimer);
  }

  presenceTimer =
    setInterval(async () => {

      try {

        const data =
          await api("/api/me");

        currentUser =
          data.user;

        updateUserUI();

        if (
          document
            .getElementById(
              "page-friends"
            )
            .classList
            .contains("active")
        ) {

          loadFriends();

        }

      } catch {}

    }, 60000);

}


/* -------------------------
   GAMES
------------------------- */

async function loadGames() {

  const container =
    document.getElementById(
      "gamesList"
    );

  try {

    const data =
      await api("/api/games");

    const games =
      data.games || [];

    container.innerHTML = "";

    if (!games.length) {

      container.innerHTML = `
        <div class="empty">
          Поки що немає опублікованих ігор.
        </div>
      `;

      return;
    }

    games.forEach(game => {

      const card =
        document.createElement("div");

      card.className =
        "game-card";

      const title =
        escapeHtml(game.title);

      const description =
        escapeHtml(
          game.description || ""
        );

      card.innerHTML = `
        <div class="game-cover">
          🎮
        </div>

        <div class="game-card-body">

          <h3>${title}</h3>

          <p>${description}</p>

          <small>
            Автор: ${escapeHtml(game.author)}
          </small>

          <br><br>

          <button class="play-button">
            Грати
          </button>

        </div>
      `;

      card
        .querySelector(".play-button")
        .addEventListener(
          "click",
          () => openGame(game.id)
        );

      container.appendChild(card);

    });

  } catch (error) {

    container.innerHTML = `
      <div class="empty">
        Не вдалося завантажити ігри.
      </div>
    `;

  }

}


/* -------------------------
   GAME RUNTIME
------------------------- */

async function openGame(gameId) {

  try {

    const data =
      await api(
        `/api/games/${gameId}`
      );

    currentGame =
      data.game;

    document
      .getElementById("gameTitle")
      .textContent =
      currentGame.title;

    playerX = 80;
    playerY = 100;
    velocityY = 0;

    showPage("game
