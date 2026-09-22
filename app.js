let currentUser = null;
let allGames = [];
let notificationsEnabled = true;

const skins = [
  { id: 1, name: "Classic", icon: "🟢", price: 50 },
  { id: 2, name: "Fire", icon: "🔥", price: 100 },
  { id: 3, name: "Ice", icon: "❄️", price: 150 },
  { id: 4, name: "Galaxy", icon: "🌌", price: 250 },
  { id: 5, name: "Robot", icon: "🤖", price: 350 },
  { id: 6, name: "Lightning", icon: "⚡", price: 500 },
  { id: 7, name: "Shadow", icon: "🌑", price: 750 },
  { id: 8, name: "Diamond", icon: "💎", price: 1000 }
];

function api(url, options = {}) {

  return fetch(url, {
    credentials: "same-origin",

    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },

    ...options
  });
}

function escapeHtml(value) {

  return String(value).replace(
    /[&<>"']/g,
    function(char) {

      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char];

    }
  );
}

/* LOADER */

window.addEventListener("load", async function() {

  const progress =
    document.getElementById(
      "loaderProgress"
    );

  const text =
    document.getElementById(
      "loaderText"
    );

  for (
    let i = 0;
    i <= 100;
    i += 10
  ) {

    progress.style.width =
      i + "%";

    if (i < 40) {

      text.textContent =
        "Запуск ZYVO...";

    } else if (i < 80) {

      text.textContent =
        "Завантаження платформи...";

    } else {

      text.textContent =
        "Майже готово...";
    }

    await new Promise(
      resolve =>
        setTimeout(resolve, 35)
    );
  }

  document
    .getElementById("loader")
    .classList.add("hidden");

  document
    .getElementById("app")
    .classList.remove("hidden");

  await init();
});

/* INIT */

async function init() {

  await loadSession();

  await loadGames();

  renderShop();

  openPage("home");
}

/* NAVIGATION */

function openPage(page) {

  document
    .querySelectorAll(".page")
    .forEach(function(element) {

      element.classList.remove(
        "active"
      );

    });

  const target =
    document.getElementById(
      page + "Page"
    );

  if (!target) {
    return;
  }

  target.classList.add("active");

  if (page === "friends") {
    loadFriends();
  }

  if (page === "inventory") {
    loadInventory();
  }

  if (page === "shop") {
    renderShop();
  }

  if (page === "profile") {
    updateProfile();
  }
}

/* SESSION */

async function loadSession() {

  try {

    const response =
      await api("/api/me");

    if (!response.ok) {
      return;
    }

    const data =
      await response.json();

    currentUser =
      data.user || null;

    updateUserUI();

  } catch (error) {

    console.error(error);
  }
}

function updateUserUI() {

  if (!currentUser) {

    document
      .getElementById("coinBalance")
      .textContent = "🪙 0";

    document
      .getElementById("shopCoins")
      .textContent = "🪙 0";

    return;
  }

  document
    .getElementById("coinBalance")
    .textContent =
    "🪙 " + currentUser.coins;

  document
    .getElementById("shopCoins")
    .textContent =
    "🪙 " + currentUser.coins;

  document
    .getElementById("profileName")
    .textContent =
    currentUser.username;

  document
    .getElementById("profileId")
    .textContent =
    "ID: " + currentUser.id;

  document
    .getElementById("profileCoins")
    .textContent =
    currentUser.coins;

  document
    .getElementById("profileFriends")
    .textContent =
    currentUser.friendsCount || 0;

  document
    .getElementById("profileGames")
    .textContent =
    currentUser.gamesCount || 0;
}

function updateProfile() {
  updateUserUI();
}

/* REGISTER */

async function register() {

  const username =
    prompt(
      "Введи свій нікнейм:"
    );

  if (!username) {
    return;
  }

  try {

    const response =
      await api(
        "/api/register",
        {
          method: "POST",

          body: JSON.stringify({
            username
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      alert(
        data.error ||
        "Не вдалося зареєструватися."
      );

      return;
    }

    currentUser =
      data.user;

    updateUserUI();

    alert(
      "🎉 Ласкаво просимо в ZYVO!\n\n" +
      "Тобі нараховано 100 🪙."
    );

  } catch (error) {

    alert(
      "❌ Сервер недоступний."
    );
  }
}

/* DAILY */

async function claimDaily() {

  if (!currentUser) {

    await register();

    return;
  }

  try {

    const response =
      await api(
        "/api/daily-reward",
        {
          method: "POST"
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      alert(
        data.error ||
        "Нагорода недоступна."
      );

      return;
    }

    currentUser.coins =
      data.coins;

    updateUserUI();

    alert(
      "🎁 +50 🪙!\n\n" +
      "Баланс: " +
      data.coins
    );

  } catch (error) {

    alert(
      "❌ Помилка отримання нагороди."
    );
  }
}

/* GAMES */

async function loadGames() {

  try {

    const response =
      await api(
        "/api/games"
      );

    if (!response.ok) {
      throw new Error(
        "Games error"
      );
    }

    allGames =
      await response.json();

    renderGames(
      allGames
    );

    renderHomeGames(
      allGames
    );

  } catch (error) {

    console.error(error);

    document
      .getElementById("gamesList")
      .innerHTML =
      `<div class="game">
        ❌ Не вдалося завантажити ігри.
      </div>`;

    document
      .getElementById("homeGames")
      .innerHTML =
      `<div class="game">
        ❌ Не вдалося завантажити ігри.
      </div>`;
  }
}

function renderGames(games) {

  const box =
    document.getElementById(
      "gamesList"
    );

  if (!games.length) {

    box.innerHTML =
      `<div class="game">
        🎮 Ігор поки немає.
      </div>`;

    return;
  }

  box.innerHTML =
    games.map(
      function(game) {

        return `
          <div class="game">

            <div class="game-cover">
              🎮
            </div>

            <div class="game-title">
              ${escapeHtml(
                game.title
              )}
            </div>

            <div class="game-author">
              👤 ${escapeHtml(
                game.author ||
                "ZYVO Creator"
              )}
            </div>

            <div class="game-author">
              👥 ${game.players || 0}
              гравців
            </div>

            <button
              class="game-button"
              onclick="playGame('${game.id}')"
            >
              ▶ Грати
            </button>

          </div>
        `;
      }
    ).join("");
}

function renderHomeGames(games) {

  const box =
    document.getElementById(
      "homeGames"
    );

  const list =
    games.slice(0, 6);

  if (!list.length) {

    box.innerHTML =
      `<div class="game">
        🎮 Перші ігри скоро з'являться.
      </div>`;

    return;
  }

  box.innerHTML =
    list.map(
      function(game) {

        return `
          <div class="game">

            <div class="game-cover">
              🎮
            </div>

            <div class="game-title">
              ${escapeHtml(
                game.title
              )}
            </div>

            <div class="game-author">
              👥 ${game.players || 0}
              гравців
            </div>

            <button
              class="game-button"
              onclick="playGame('${game.id}')"
            >
              ▶ Грати
            </button>

          </div>
        `;

      }
    ).join("");
}

function filterGames() {

  const search =
    document
      .getElementById(
        "gameSearch"
      )
      .value
      .toLowerCase()
      .trim();

  const filtered =
    allGames.filter(
      function(game) {

        return (
          String(game.title)
            .toLowerCase()
            .includes(search)
          ||
          String(
            game.author || ""
          )
            .toLowerCase()
            .includes(search)
        );

      }
    );

  renderGames(
    filtered
  );
}

function playGame(id) {

  const game =
    allGames.find(
      item =>
        String(item.id) ===
        String(id)
    );

  if (!game) {
    return;
  }

  showModal(`
    <h2>
      🎮 ${escapeHtml(
        game.title
      )}
    </h2>

    <p>
      ${escapeHtml(
        game.description ||
        "Опис гри відсутній."
      )}
    </p>

    <p class="muted">
      👤 ${escapeHtml(
        game.author ||
        "ZYVO Creator"
      )}
    </p>

    <button
      class="game-button"
      onclick="closeModal()"
    >
      Зрозуміло
    </button>
  `);
}

/* SHOP */

function renderShop() {

  const box =
    document.getElementById(
      "skinsGrid"
    );

  box.innerHTML =
    skins.map(
      function(skin) {

        return `
          <div class="skin">

            <div class="skin-icon">
              ${skin.icon}
            </div>

            <div class="skin-name">
              ${escapeHtml(
                skin.name
              )}
            </div>

            <div class="skin-price">
              🪙 ${skin.price}
            </div>

            <button
              class="buy-button"
              onclick="buySkin(${skin.id})"
            >
              Купити
            </button>

          </div>
        `;

      }
    ).join("");
}

async function buySkin(id) {

  if (!currentUser) {

    await register();

    if (!currentUser) {
      return;
    }
  }

  try {

    const response =
      await api(
        "/api/buy-skin",
        {
          method: "POST",

          body: JSON.stringify({
            skinId: id
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      alert(
        data.error ||
        "Не вдалося купити скін."
      );

      return;
    }

    currentUser.coins =
      data.coins;

    updateUserUI();

    alert(
      "🎨 Скін додано до інвентарю!"
    );

  } catch (error) {

    alert(
      "❌ Помилка покупки."
    );
  }
}

/* INVENTORY */

async function loadInventory() {

  const box =
    document.getElementById(
      "inventoryGrid"
    );

  if (!currentUser) {

    box.innerHTML =
      `<div class="game">
        Спочатку створіть акаунт.
      </div>`;

    return;
  }

  try {

    const response =
      await api(
        "/api/inventory"
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error
      );
    }

    if (!data.length) {

      box.innerHTML =
        `<div class="game">
          🎒 Інвентар порожній.
        </div>`;

      return;
    }

    box.innerHTML =
      data.map(
        function(skin) {

          return `
            <div class="skin">

              <div class="skin-icon">
                ${skin.icon}
              </div>

              <div class="skin-name">
                ${escapeHtml(
                  skin.name
                )}
              </div>

            </div>
          `;

        }
      ).join("");

  } catch (error) {

    box.innerHTML =
      `<div class="game">
        ❌ Не вдалося завантажити інвентар.
      </div>`;
  }
}

/* FRIENDS */

async function addFriend() {

  const username =
    document
      .getElementById(
        "friendUsername"
      )
      .value
      .trim();

  if (!username) {
    return;
  }

  try {

    const response =
      await api(
        "/api/friends/add",
        {
          method: "POST",

          body: JSON.stringify({
            username
          })
        }
      );

    const data =
      await response.json();

    document
      .getElementById(
        "friendResult"
      )
      .textContent =
      response.ok
        ? "✅ Друга додано."
        : "❌ " +
          (
            data.error ||
            "Помилка."
          );

    document
      .getElementById(
        "friendUsername"
      )
      .value = "";

    if (response.ok) {
      loadFriends();
    }

  } catch (error) {

    document
      .getElementById(
        "friendResult"
      )
      .textContent =
      "❌ Сервер недоступний.";
  }
}

async function loadFriends() {

  const box =
    document.getElementById(
      "friendsList"
    );

  if (!currentUser) {

    box.innerHTML =
      `<div class="game">
        Створіть акаунт, щоб додавати друзів.
      </div>`;

    return;
  }

  try {

    const response =
      await api(
        "/api/friends"
      );

    const friends =
      await response.json();

    if (!friends.length) {

      box.innerHTML =
        `<div class="game">
          👥 Друзів поки немає.
        </div>`;

      return;
    }

    box.innerHTML =
      friends.map(
        function(friend) {

          return `
            <div class="friend">

              <div class="friend-left">

                <div class="friend-avatar">
                  👤
                </div>

                <div>

                  <strong>
                    ${escapeHtml(
                      friend.username
                    )}
                  </strong>

                  <div class="muted">
                    ID: ${friend.id}
                  </div>

                </div>

              </div>

            </div>
          `;

        }
      ).join("");

  } catch (error) {

    box.innerHTML =
      `<div class="game">
        ❌ Не вдалося завантажити друзів.
      </div>`;
  }
}

/* PROFILE */

async function changeUsername() {

  if (!currentUser) {

    await register();

    return;
  }

  const username =
    prompt(
      "Новий нікнейм:",
      currentUser.username
    );

  if (!username) {
    return;
  }

  try {

    const response =
      await api(
        "/api/profile",
        {
          method: "PUT",

          body: JSON.stringify({
            username
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      alert(
        data.error ||
        "Помилка."
      );

      return;
    }

    currentUser =
      {
        ...currentUser,
        ...data.user
      };

    updateUserUI();

  } catch (error) {

    alert(
      "❌ Не вдалося змінити нікнейм."
    );
  }
}

/* SETTINGS */

function toggleNotifications() {

  notificationsEnabled =
    !notificationsEnabled;

  document
    .getElementById(
      "notificationsState"
    )
    .textContent =
    notificationsEnabled
      ? "Увімкнено"
      : "Вимкнено";
}

function showAbout() {

  showModal(`
    <h2>
      ZYVO
    </h2>

    <p>
      Незалежна ігрова платформа
      для гравців і творців.
    </p>

    <p class="muted">
      ZYVO Platform
    </p>
  `);
}

/* LOGOUT */

async function logout() {

  try {

    await api(
      "/api/logout",
      {
        method: "POST"
      }
    );

  } catch (error) {

    console.error(error);
  }

  currentUser = null;

  updateUserUI();

  openPage("home");

  alert(
    "Ви вийшли з акаунта."
  );
}

/* MODAL */

function showModal(content) {

  document
    .getElementById(
      "modalContent"
    )
    .innerHTML = content;

  document
    .getElementById(
      "modal"
    )
    .classList.remove(
      "hidden"
    );
}

function closeModal() {

  document
    .getElementById(
      "modal"
    )
    .classList.add(
      "hidden"
    );
   }
