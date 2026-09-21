const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));

// Файли сайту лежать прямо в корені,
// тому папка public НЕ потрібна.
app.use(express.static(__dirname));

const users = new Map();
const games = new Map();

// Перевірка сервера
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    name: "ZYVO Platform",
    version: "1.0.0"
  });
});

// Створення акаунта
app.post("/api/account", (req, res) => {
  const name = String(req.body.name || "")
    .trim()
    .slice(0, 24);

  if (!name) {
    return res.status(400).json({
      error: "Введи нікнейм"
    });
  }

  const id =
    "ZYVO-" +
    Math.random()
      .toString(36)
      .slice(2, 9)
      .toUpperCase();

  const user = {
    id,
    name,
    coins: 100,
    createdAt: Date.now()
  };

  users.set(id, user);

  res.json(user);
});

// Отримати ігри
app.get("/api/games", (req, res) => {
  res.json([...games.values()]);
});

// Створити гру
app.post("/api/games", (req, res) => {
  const title = String(req.body.title || "Без назви")
    .trim()
    .slice(0, 60);

  const author = String(req.body.author || "Creator")
    .trim()
    .slice(0, 24);

  const id = Math.random()
    .toString(36)
    .slice(2, 10);

  const game = {
    id,
    title,
    author,
    players: 0,
    createdAt: Date.now()
  };

  games.set(id, game);

  res.json(game);
});

// Головна сторінка
app.get(/.*/, (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `ZYVO Platform running on port ${PORT}`
  );
});
