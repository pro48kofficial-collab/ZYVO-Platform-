const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 10000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Віддаємо всі файли прямо з кореня проєкту.
// public folder НЕ потрібна.
app.use(express.static(__dirname));

/* =========================
   DATABASE
========================= */

async function initDB() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL не встановлено. Додай DATABASE_URL у Render Environment."
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(40) UNIQUE NOT NULL,
      coins INTEGER NOT NULL DEFAULT 100,
      last_daily TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      title VARCHAR(100) NOT NULL,
      author VARCHAR(100) NOT NULL,
      description TEXT DEFAULT '',
      objects JSONB NOT NULL DEFAULT '[]'::jsonb,
      players INTEGER NOT NULL DEFAULT 0,
      earned_coins INTEGER NOT NULL DEFAULT 0,
      published BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      skin_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, skin_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, friend_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_coin_claims (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      coin_index INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, game_id, coin_index)
    )
  `);

  console.log("Database initialized");
}

/* =========================
   AUTH
========================= */

function getUserId(req) {
  const cookie = req.headers.cookie || "";

  const match = cookie.match(
    /(?:^|;\s*)zyvo_user=([^;]+)/
  );

  if (!match) return null;

  const id = Number(decodeURIComponent(match[1]));

  if (!Number.isInteger(id)) {
    return null;
  }

  return id;
}

async function getUser(userId) {
  if (!userId) return null;

  const result = await pool.query(
    `
    SELECT
      id,
      username,
      coins,
      last_daily,
      created_at
    FROM users
    WHERE id = $1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

function setLoginCookie(res, userId) {
  res.setHeader(
    "Set-Cookie",
    `zyvo_user=${encodeURIComponent(userId)}; Path=/; HttpOnly; SameSite=Lax`
  );
}

function clearLoginCookie(res) {
  res.setHeader(
    "Set-Cookie",
    "zyvo_user=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  );
}

/* =========================
   HEALTH
========================= */

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      service: "ZYVO Platform",
      database: true
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      service: "ZYVO Platform",
      database: false
    });
  }
});

/* =========================
   REGISTER / LOGIN
========================= */

app.post("/api/register", async (req, res) => {
  try {
    let username = String(req.body.username || "")
      .trim()
      .replace(/\s+/g, " ");

    if (!username) {
      return res.status(400).json({
        error: "Введи username"
      });
    }

    if (username.length < 2) {
      return res.status(400).json({
        error: "Username має містити мінімум 2 символи"
      });
    }

    if (username.length > 40) {
      return res.status(400).json({
        error: "Username занадто довгий"
      });
    }

    const existing = await pool.query(
      `
      SELECT *
      FROM users
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1
      `,
      [username]
    );

    let user;

    if (existing.rows.length) {
      user = existing.rows[0];
    } else {
      const result = await pool.query(
        `
        INSERT INTO users (username, coins)
        VALUES ($1, 100)
        RETURNING *
        `,
        [username]
      );

      user = result.rows[0];
    }

    setLoginCookie(res, user.id);

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Не вдалося створити акаунт"
    });
  }
});

/* =========================
   LOGOUT
========================= */

app.post("/api/logout", (req, res) => {
  clearLoginCookie(res);

  res.json({
    success: true
  });
});

/* =========================
   CURRENT USER
========================= */

app.get("/api/me", async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.json({
        user: null
      });
    }

    const user = await getUser(userId);

    if (!user) {
      clearLoginCookie(res);

      return res.json({
        user: null
      });
    }

    res.json({
      user
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Помилка профілю"
    });
  }
});

/* =========================
   DAILY REWARD
========================= */

app.post("/api/daily-reward", async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Спочатку увійди в ZYVO"
      });
    }

    const user = await getUser(userId);

    if (!user) {
      return res.status(401).json({
        error: "Користувача не знайдено"
      });
    }

    if (user.last_daily) {
      const last = new Date(user.last_daily);
      const now = new Date();

      const diff =
        now.getTime() - last.getTime();

      const day = 24 * 60 * 60 * 1000;

      if (diff < day) {
        const remaining =
          Math.ceil((day - diff) / (60 * 60 * 1000));

        return res.status(400).json({
          error: `Daily Reward вже отримано. Спробуй через ${remaining} год.`
        });
      }
    }

    await pool.query(
      `
      UPDATE users
      SET
        coins = coins + 50,
        last_daily = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [userId]
    );

    const updatedUser = await getUser(userId);

    res.json({
      success: true,
      message: "+50 ZYVO Coins!",
      user: updatedUser
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Не вдалося отримати Daily Reward"
    });
  }
});

/* =========================
   SHOP
========================= */

const SKIN_PRICES = {
  1: 50,
  2: 100,
  3: 150,
  4: 250,
  5: 350,
  6: 500,
  7: 750,
  8: 1000
};

app.post("/api/buy-skin", async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Спочатку увійди в ZYVO"
      });
    }

    const skinId = Number(req.body.skinId);
    const price = SKIN_PRICES[skinId];

    if (!price) {
      return res.status(400).json({
        error: "Такого скіна не існує"
      });
    }

    await client.query("BEGIN");

    const userResult = await client.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
      FOR UPDATE
      `,
      [userId]
    );

    if (!userResult.rows.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Користувача не знайдено"
      });
    }

    const user = userResult.rows[0];

    const already = await client.query(
      `
      SELECT id
      FROM inventory
      WHERE user_id = $1
        AND skin_id = $2
      `,
      [userId, skinId]
    );

    if (already.rows.length) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "Цей скін вже є в інвентарі"
      });
    }

    if (user.coins < price) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        error: "Недостатньо ZYVO Coins"
      });
    }

    await client.query(
      `
      UPDATE users
      SET coins = coins - $1
      WHERE id = $2
      `,
      [price, userId]
    );

    await client.query(
      `
      INSERT INTO inventory
      (user_id, skin_id)
      VALUES ($1, $2)
      `,
      [userId, skinId]
    );

    await client.query("COMMIT");

    const updatedUser = await getUser(userId);

    res.json({
      success: true,
      message: "Скін придбано!",
      user: updatedUser
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      error: "Не вдалося купити скін"
    });
  } finally {
    client.release();
  }
});

/* =========================
   INVENTORY
========================= */

app.get("/api/inventory", async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Спочатку увійди в ZYVO"
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        skin_id,
        created_at
      FROM inventory
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );

    res.json({
      inventory: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Помилка інвентарю"
    });
  }
});

/* =========================
   FRIENDS
========================= */

app.post("/api/friends/add", async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Спочатку увійди в ZYVO"
      });
    }

    const username = String(
      req.body.username || ""
    ).trim();

    if (!username) {
      return res.status(400).json({
        error: "Введи username друга"
      });
    }

    const friendResult = await pool.query(
      `
      SELECT id, username
      FROM users
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1
      `,
      [username]
    );

    if (!friendResult.rows.length) {
      return res.status(404).json({
        error: "Користувача не знайдено"
      });
    }

    const friend = friendResult.rows[0];

    if (friend.id === userId) {
      return res.status(400).json({
        error: "Не можна додати самого себе"
      });
    }

    await pool.query(
      `
      INSERT INTO friendships
      (user_id, friend_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [userId, friend.id]
    );

    await pool.query(
      `
      INSERT INTO friendships
      (user_id, friend_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [friend.id, userId]
    );

    res.json({
      success: true,
      message: `@${friend.username} додано в друзі`
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Не вдалося додати друга"
    });
  }
});

app.get("/api/friends", async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Спочатку увійди в ZYVO"
      });
    }

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.coins
      FROM friendships f
      JOIN users u
        ON u.id = f.friend_id
      WHERE f.user_id = $1
      ORDER BY u.username
      `,
      [userId]
    );

    res.json({
      friends: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Помилка друзів"
    });
  }
});

/* =========================
   PROFILE
========================= */

app.put("/api/profile", async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Спочатку увійди в ZYVO"
      });
    }

    let username = String(
      req.body.username || ""
    )
      .trim()
      .replace(/\s+/g, " ");

    if (username.length < 2) {
      return res.status(400).json({
        error: "Username має містити мінімум 2 символи"
      });
    }

    if (username.length > 40) {
      return res.status(400).json({
        error: "Username занадто довгий"
      });
    }

    const existing = await pool.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(username) = LOWER($1)
        AND id != $2
      LIMIT 1
      `,
      [username, userId]
    );

    if (existing.rows.length) {
      return res.status(400).json({
        error: "Такий username вже зайнятий"
      });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET username = $1
      WHERE id = $2
      RETURNING *
      `,
      [username, userId]
    );

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Не вдалося змінити username"
    });
  }
});

/* =========================
   PUBLIC GAMES
========================= */

app.get("/api/games", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        title,
        author,
        description,
        players,
        earned_coins,
        published,
        created_at
      FROM games
      WHERE published = TRUE
      ORDER BY created_at DESC
      `
    );

    res.json({
      games: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Не вдалося завантажити ігри"
    });
  }
});

/* =========================
   SINGLE GAME
========================= */

app.get("/api/games/:id", async (req, res) => {
  try {
    const gameId = Number(req.params.id);

    if (!Number.isInteger(gameId)) {
      return res.status(400).json({
        error: "Неправильний ID гри"
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        title,
        author,
        description,
        objects,
        players,
        earned_coins,
        published,
        created_at
      FROM games
      WHERE id = $1
        AND published = TRUE
      LIMIT 1
      `,
      [gameId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Гру не знайдено"
      });
    }

    res.json({
      game: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Помилка завантаження гри"
    });
  }
});

/* =========================
   GAME COINS
========================= */

app.post("/api/games/:id/collect", async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: "Увійди в ZYVO, щоб отримувати монети"
      });
    }

    const gameId = Number(req.params.id);
    const coinIndex = Number(req.body.coinIndex);

    if (!Number.isInteger(gameId)) {
      return res.status(400).json({
        error: "Неправильний ID гри"
      });
    }

    if (
      !Number.isInteger(coinIndex) ||
      coinIndex < 0
    ) {
      return res.status(400).json({
        error: "Неправильна монета"
      });
    }

    const gameResult = await client.query(
      `
      SELECT objects
      FROM games
      WHERE id = $1
        AND published = TRUE
      LIMIT 1
      `,
      [gameId]
    );

    if (!gameResult.rows.length) {
      return res.status(404).json({
        error: "Гру не знайдено"
      });
    }

    const objects = Array.isArray(
      gameResult.rows[0].objects
    )
      ? gameResult.rows[0].objects
      : [];

    const coin = objects[coinIndex];

    if (!coin || coin.type !== "coin") {
      return res.status(400).json({
        error: "Це не монета"
      });
    }

    await client.query("BEGIN");

    const claim = await client.query(
      `
      INSERT INTO game_coin_claims
      (user_id, game_id, coin_index)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
      RETURNING id
      `,
      [
        userId,
        gameId,
        coinIndex
      ]
    );

    if (!claim.rows.length) {
      await client.query("COMMIT");

      const user = await getUser(userId);

      return res.json({
        success: true,
        message: "Монета вже отримана",
        user
      });
    }

    await client.query(
      `
      UPDATE users
      SET coins = coins + 1
      WHERE id = $1
      `,
      [userId]
    );

    await client.query(
      `
      UPDATE games
      SET earned_coins = earned_coins + 1
      WHERE id = $1
      `,
      [gameId]
    );

    await client.query("COMMIT");

    const user = await getUser(userId);

    res.json({
      success: true,
      message: "+1 ZYVO Coin",
      user
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      error: "Не вдалося отримати монету"
    });
  } finally {
    client.release();
  }
});

/* =========================
   CATCH ALL
========================= */

app.get("*splat", (req, res) => {
  res.sendFile(
    require("path").join(__dirname, "index.html")
  );
});

/* =========================
   START
========================= */

async function start() {
  try {
    await initDB();

    app.listen(PORT, () => {
      console.log(
        `ZYVO Platform running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "Database initialization failed:",
      error
    );

    process.exit(1);
  }
}

start();
