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

app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

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

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(32) UNIQUE NOT NULL,
      coins INTEGER NOT NULL DEFAULT 100,
      last_daily TIMESTAMP DEFAULT NULL,
      avatar TEXT DEFAULT NULL,
      equipped_skin INTEGER NOT NULL DEFAULT 1,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT NULL
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS equipped_skin INTEGER NOT NULL DEFAULT 1
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      title VARCHAR(100) NOT NULL,
      author VARCHAR(100) NOT NULL,
      description TEXT DEFAULT '',
      objects JSONB DEFAULT '[]'::jsonb,
      players INTEGER DEFAULT 0,
      earned_coins INTEGER DEFAULT 0,
      published BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      skin_id INTEGER NOT NULL,
      UNIQUE(user_id, skin_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS messages_users_time_idx
    ON messages(sender_id, receiver_id, created_at)
  `);

  console.log("Database initialized");
}

function setCookie(res, name, value) {
  res.setHeader(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`
  );
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";

  const found = cookies
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(name + "="));

  if (!found) return null;

  return decodeURIComponent(found.substring(name.length + 1));
}

async function getUser(req) {
  const id = getCookie(req, "zyvo_user");

  if (!id) return null;

  const result = await pool.query(
    `SELECT * FROM users WHERE id=$1`,
    [id]
  );

  if (!result.rows.length) return null;

  await pool.query(
    `UPDATE users SET last_seen=CURRENT_TIMESTAMP WHERE id=$1`,
    [id]
  );

  return result.rows[0];
}

async function requireUser(req, res) {
  const user = await getUser(req);

  if (!user) {
    res.status(401).json({
      error: "Необхідно увійти"
    });
    return null;
  }

  return user;
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      database: true
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      database: false,
      error: error.message
    });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    let username = String(req.body.username || "").trim();

    username = username
      .replace(/[^\p{L}\p{N}_\- ]/gu, "")
      .slice(0, 32);

    if (username.length < 2) {
      return res.status(400).json({
        error: "Ім'я має містити мінімум 2 символи"
      });
    }

    let result = await pool.query(
      `SELECT * FROM users WHERE username=$1`,
      [username]
    );

    let user;

    if (result.rows.length) {
      user = result.rows[0];
    } else {
      result = await pool.query(
        `INSERT INTO users(username, coins)
         VALUES($1,100)
         RETURNING *`,
        [username]
      );

      user = result.rows[0];

      await pool.query(
        `INSERT INTO inventory(user_id, skin_id)
         VALUES($1,1)
         ON CONFLICT DO NOTHING`,
        [user.id]
      );
    }

    setCookie(res, "zyvo_user", user.id);

    await pool.query(
      `UPDATE users SET last_seen=CURRENT_TIMESTAMP WHERE id=$1`,
      [user.id]
    );

    res.json({
      ok: true,
      user
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Помилка сервера"
    });
  }
});

app.post("/api/logout", async (req, res) => {
  const id = getCookie(req, "zyvo_user");

  if (id) {
    await pool.query(
      `UPDATE users
       SET last_seen=CURRENT_TIMESTAMP - INTERVAL '10 minutes'
       WHERE id=$1`,
      [id]
    );
  }

  res.setHeader(
    "Set-Cookie",
    "zyvo_user=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax"
  );

  res.json({ ok: true });
});

app.get("/api/me", async (req, res) => {
  const user = await requireUser(req, res);

  if (!user) return;

  res.json({
    user
  });
});

app.post("/api/daily-reward", async (req, res) => {
  const user = await requireUser(req, res);

  if (!user) return;

  const result = await pool.query(
    `SELECT last_daily,
            EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_daily)) AS seconds
     FROM users
     WHERE id=$1`,
    [user.id]
  );

  const row = result.rows[0];

  if (
    row.last_daily &&
    Number(row.seconds || 0) < 86400
  ) {
    return res.status(400).json({
      error: "Щоденну нагороду вже отримано"
    });
  }

  const updated = await pool.query(
    `UPDATE users
     SET coins=coins+50,
         last_daily=CURRENT_TIMESTAMP
     WHERE id=$1
     RETURNING *`,
    [user.id]
  );

  res.json({
    ok: true,
    reward: 50,
    user: updated.rows[0]
  });
});

app.get("/api/skins", (req, res) => {
  res.json({
    skins
  });
});

app.post("/api/buy-skin", async (req, res) => {
  const user = await requireUser(req, res);

  if (!user) return;

  const skinId = Number(req.body.skinId);
  const skin = skins.find(s => s.id === skinId);

  if (!skin) {
    return res.status(400).json({
      error: "Скін не знайдено"
    });
  }

  const owned = await pool.query(
    `SELECT id FROM inventory
     WHERE user_id=$1 AND skin_id=$2`,
    [user.id, skinId]
  );

  if (owned.rows.length) {
    return res.status(400).json({
      error: "Цей скін уже куплений"
    });
  }

  if (user.coins < skin.price) {
    return res.status(400).json({
      error: "Недостатньо коінів"
    });
  }

  const updated = await pool.query(
    `UPDATE users
     SET coins=coins-$1
     WHERE id=$2
     RETURNING *`,
    [skin.price, user.id]
  );

  await pool.query(
    `INSERT INTO inventory(user_id, skin_id)
     VALUES($1,$2)
     ON CONFLICT DO NOTHING`,
    [user.id, skinId]
  );

  res.json({
    ok: true,
    user: updated.rows[0],
    skin
  });
});

app.get("/api/inventory", async (req, res) => {
  const user = await requireUser(req, res);

  if (!user) return;

  const result = await pool.query(
    `SELECT skin_id
     FROM inventory
     WHERE user_id=$1
     ORDER BY skin_id`,
    [user.id]
  );

  const inventory = result.rows
    .map(row => skins.find(s => s.id === row.skin_id))
    .filter(Boolean);

  res.json({
    inventory,
    equippedSkin: user.equipped_skin
  });
});

app.post("/api/equip-skin", async (req, res) => {
  const user = await requireUser(req, res);

  if (!user) return;

  const skinId = Number(req.body.skinId);

  const skin = skins.find(s => s.id === skinId);

  if (!skin) {
    return res.status(400).json({
      error: "Скін не знайдено"
    });
  }

  const owned = await pool.query(
    `SELECT id
     FROM inventory
     WHERE user_id=$1 AND skin_id=$2`,
    [user.id, skinId]
  );

  if (!owned.rows.length) {
    return res.status(400).json({
      error: "Спочатку придбай цей скін"
    });
  }

  const result = await pool.query(
    `UPDATE users
     SET equipped_skin=$1
     WHERE id=$2
     RETURNING *`,
    [skinId, user.id]
  );

  res.json({
    ok: true,
    user: result.rows[0],
    skin
  });
});

app.post("/api/profile/avatar", async (req, res) => {
  const user = await requireUser(req, res);

  if (!user) return;

  const avatar = String(req.body.avatar || "");

  if (!avatar) {
    return res.status(400).json({
      error: "Аватар не передано"
    });
  }

  if (
    !avatar.startsWith("data:image/png;base64,") &&
    !avatar.startsWith("data:image/jpeg;base64,") &&
    !avatar.startsWith("data:image/webp;base64,")
  ) {
    return res.status(400).json({
      error: "Дозволені тільки PNG, JPG або WEBP"
    });
  }

  if (avatar.length > 2 * 1024 * 1024) {
    return res.status(400).json({
      error: "Аватар занадто великий"
    });
  }

  const result = await pool.query(
    `UPDATE users
     SET avatar=$1
     WHERE id=$2
     RETURNING *`,
    [avatar, user.id]
  );

  res.json({
    ok: true,
    user: result.rows[0]
  });
});

app.post("/api/friends/add", async (req, res) => {
  const user = await requireUser(req, res);

  if (!user) return;

  const username = String(req.body.username || "").trim();

  const result = await pool.query(
    `SELECT * FROM users WHERE username=$1`,
    [username]
  );

  if (!result.rows.length) {
    return res.status(404).json({
      error: "Користувача не знайдено"
    });
  }

  const friend = result.rows[0];

  if (friend.id === user.id) {
    return res.status(400).json({
      error: "Не можна додати себе"
    });
  }

  await pool.query(
    `INSERT INTO friendships(user_id,friend_id)
     VALUES($1,$2)
     ON CONFLICT DO NOTHING`,
    [user.id, friend.id]
  );

  await pool.query(
    `INSERT INTO friendships(user_id,friend_id)
     VALUES($1,$2)
     ON CONFLICT DO NOTHING`,
    [friend.id, user.id]
  );

  res.json({
    ok: true,
    friend: {
      id: friend.id,
      username: friend.username
    }
  });
});

app.get("/api/friends", async (req, res) => {
  const user = await requireUser(req, res);

  if (!user) return;

  const result = await pool.query(`
    SELECT
      u.id,
      u.username,
      u.avatar,
      u.equipped_skin,
      u.last_seen,
      CASE
        WHEN u.last_seen >= CURRENT_TIMESTAMP - INTERVAL '2 minutes'
        THEN TRUE
        ELSE FALSE
      END AS online
    FROM friendships f
    JOIN users u ON u.id=f.friend_id
    WHERE f.user_id=$1
    ORDER BY u.username
  `, [user.id]);

  res.json({
    friends: result.rows
  });
});

async function areFriends(userId, friendId) {
  const result = await pool.query(
    `SELECT id
     FROM friendships
     WHERE user_id=$1 AND friend_id=$2`,
    [userId, friendId]
  );

  return result.rows.length > 0;
}

app.get("/api/chat/:friendId", async (req, res) => {
  const user = await requireUser(req, res);

  if (!user) return;

  const friendId = Number(req.params.friendId);

  if (!(await areFriends(user.id, friendId))) {
    return res.status(403).json({
      error: "Це не ваш друг"
    });
  }

  const result = await pool.query(
    `SELECT
       m.id,
       m.sender_id,
       m.receiver_id,
       m.message,
       m.created_at
     FROM messages m
     WHERE
       (m.sender_id=$1 AND m.receiver_id=$2)
       OR
       (m.sender_id=$2 AND m.receiver_id=$1)
     ORDER BY m.created_at ASC
     LIMIT 100`,
    [user.id, friendId]
  );

  res.json({
    messages: result.rows
  });
});

app.post("/api/chat/:friendId", async (req, res) => {
  const user = await requireUser(req, res);

  if (!user) return;

  const friendId = Number(req.params.friendId);

  if (!(await areFriends(user.id, friendId))) {
    return res.status(403).json({
      error: "Це не ваш друг"
    });
  }

  let message = String(req.body.message || "");

  message = message
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 500);

  if (!message) {
    return res.status(400).json({
      error: "Повідомлення порожнє"
    });
  }

  const result = await pool.query(
    `INSERT INTO messages(sender_id,receiver_id,message)
     VALUES($1,$2,$3)
     RETURNING *`,
    [user.id, friendId, message]
  );

  res.json({
    ok: true,
    message: result.rows[0]
  });
});

app.get("/api/profile", async (req, res) => {
  const user = await requireUser(req, res);

  if (!user) return;

  res.json({
    user
  });
});

app.get("/api/games", async (req, res) => {
  const result = await pool.query(`
    SELECT *
    FROM games
    WHERE published=true
    ORDER BY created_at DESC
  `);

  res.json({
    games: result.rows
  });
});

app.get("/api/games/:id", async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM games
     WHERE id=$1 AND published=true`,
    [req.params.id]
  );

  if (!result.rows.length) {
    return res.status(404).json({
      error: "Гру не знайдено"
    });
  }

  res.json({
    game: result.rows[0]
  });
});

app.post("/api/games/:id/collect", async (req, res) => {
  const user = await requireUser(req, res);

  if (!user) return;

  const gameId = Number(req.params.id);
  const coinIndex = Number(req.body.coinIndex);

  if (!Number.isInteger(coinIndex) || coinIndex < 0) {
    return res.status(400).json({
      error: "Невірний coinIndex"
    });
  }

  const result = await pool.query(
    `INSERT INTO game_coin_claims(user_id,game_id,coin_index)
     VALUES($1,$2,$3)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [user.id, gameId, coinIndex]
  );

  if (!result.rows.length) {
    return res.status(400).json({
      error: "Цей коін уже зібрано"
    });
  }

  await pool.query(
    `UPDATE users
     SET coins=coins+10
     WHERE id=$1`,
    [user.id]
  );

  await pool.query(
    `UPDATE games
     SET earned_coins=earned_coins+10
     WHERE id=$1`,
    [gameId]
  );

  res.json({
    ok: true,
    reward: 10
  });
});

app.get("*splat", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`ZYVO Platform running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
