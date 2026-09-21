async function createAccount() {
  const nameInput = document.getElementById("name");
  const accountBox = document.getElementById("account");

  const name = nameInput.value.trim();

  if (!name) {
    accountBox.textContent = "Введи нікнейм";
    return;
  }

  accountBox.textContent = "Створення акаунта...";

  try {
    const response = await fetch("/api/account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: name
      })
    });

    const data = await response.json();

    if (!response.ok) {
      accountBox.textContent =
        data.error || "Не вдалося створити акаунт";
      return;
    }

    accountBox.innerHTML = `
      <div>
        ✅ Акаунт створено!
      </div>
      <div>
        ZYVO ID: <b>${escapeHtml(data.id)}</b>
      </div>
      <div>
        🪙 Коіни: <b>${data.coins}</b>
      </div>
    `;

    localStorage.setItem(
      "zyvoAccount",
      JSON.stringify(data)
    );

  } catch (error) {
    console.error(error);

    accountBox.textContent =
      "❌ Помилка з'єднання із сервером";
  }
}


async function loadGames() {
  const gamesBox = document.getElementById("games");

  gamesBox.textContent = "Завантаження...";

  try {
    const response = await fetch("/api/games");

    if (!response.ok) {
      throw new Error("Server error");
    }

    const games = await response.json();

    if (!games.length) {
      gamesBox.innerHTML = `
        <div class="game">
          🎮 Поки що ігор немає.
        </div>
      `;

      return;
    }

    gamesBox.innerHTML = games
      .map(function (game) {
        return `
          <div class="game">
            <b>🎮 ${escapeHtml(game.title)}</b>
            <br>
            <small>
              👤 ${escapeHtml(game.author)}
              • 👥 ${game.players} гравців
            </small>
          </div>
        `;
      })
      .join("");

  } catch (error) {
    console.error(error);

    gamesBox.innerHTML = `
      <div class="game">
        ❌ Не вдалося завантажити ігри.
      </div>
    `;
  }
}


function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    function (char) {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };

      return entities[char];
    }
  );
}


function restoreAccount() {
  const saved = localStorage.getItem("zyvoAccount");

  if (!saved) {
    return;
  }

  try {
    const account = JSON.parse(saved);

    const accountBox =
      document.getElementById("account");

    accountBox.innerHTML = `
      <div>
        👤 ${escapeHtml(account.name)}
      </div>
      <div>
        ZYVO ID: <b>${escapeHtml(account.id)}</b>
      </div>
      <div>
        🪙 Коіни: <b>${account.coins}</b>
      </div>
    `;

  } catch (error) {
    localStorage.removeItem("zyvoAccount");
  }
}


document.addEventListener(
  "DOMContentLoaded",
  function () {
    restoreAccount();
    loadGames();
  }
);
