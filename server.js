const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(express.json());
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

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(24) UNIQUE NOT NULL,
      coins INTEGER NOT NULL DEFAULT 100,
      last_daily DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      title VARCHAR(100) NOT NULL,
      author VARCHAR(50) NOT NULL,
      description TEXT DEFAULT '',
      objects JSONB DEFAULT '[]',
      players INTEGER DEFAULT 0,
      earned_coins INTEGER DEFAULT 0,
      published BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS inventory (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id)
        ON DELETE CASCADE,
      skin_id INTEGER NOT NULL,
      UNIQUE(user_id, skin_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id)
        ON DELETE CASCADE,
      friend_id INTEGER REFERENCES users(id)
        ON DELETE CASCADE,
      UNIQUE(user_id, friend_id)
    )
  `);
}

/* SESSION */

function getUserId(req) {

  const cookies = {};

  const header =
    req.headers.cookie || "";

  header
    .split(";")
    .forEach(function(part) {

      const pieces =
        part.trim().split("=");

      if (pieces.length >= 2) {

        cookies[pieces.shift()] =
          decodeURIComponent(
            pieces.join("=")
          );
      }

    });

  return cookies.zyvo_user || null;
}

async function getUser(req) {

  const id =
    getUserId(req);

  if (!id) {
    return null;
  }

  const result =
    await db.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
      `,
      [id]
    );

  return result.rows[0] || null;
}

/* HEALTH */

app.get(
  "/api/health",
  async (req, res) => {

    try {

      await db.query(
        "SELECT 1"
      );

      res.json({
        ok: true,
        database: "connected"
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        ok: false,
        database: "error"
      });
    }
  }
);

/* REGISTER */

app.post(
  "/api/register",
  async (req, res) => {

    try {

      const username =
        String(
          req.body.username || ""
        )
          .trim()
          .slice(0, 24);

      if (!username) {

        return res.status(400).json({
          error:
            "Введи нікнейм."
        });
      }

      const existing =
        await db.query(
          `
          SELECT id
          FROM users
          WHERE LOWER(username)
            = LOWER($1)
          `,
          [username]
        );

      if (existing.rows.length) {

        const user =
          await db.query(
            `
            SELECT *
            FROM users
            WHERE id = $1
            `,
            [existing.rows[0].id]
          );

        const saved =
          user.rows[0];

        res.setHeader(
          "Set-Cookie",
          `zyvo_user=${saved.id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`
        );

        return res.json({
          user: {
            ...saved,
            friendsCount: 0,
            gamesCount: 0
          }
        });
      }

      const result =
        await db.query(
          `
          INSERT INTO users
            (username, coins)
          VALUES
            ($1, 100)
          RETURNING *
          `,
          [username]
        );

      const user =
        result.rows[0];

      res.setHeader(
        "Set-Cookie",
        `zyvo_user=${user.id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`
      );

      res.json({
        user: {
          ...user,
          friendsCount: 0,
          gamesCount: 0
        }
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Помилка реєстрації."
      });
    }
  }
);

/* LOGOUT */

app.post(
  "/api/logout",
  (req, res) => {

    res.setHeader(
      "Set-Cookie",
      "zyvo_user=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
    );

    res.json({
      ok: true
    });
  }
);

/* CURRENT USER */

app.get(
  "/api/me",
  async (req, res) => {

    try {

      const user =
        await getUser(req);

      if (!user) {

        return res.json({
          user: null
        });
      }

      const friends =
        await db.query(
          `
          SELECT COUNT(*)::int AS count
          FROM friendships
          WHERE user_id = $1
          `,
          [user.id]
        );

      const games =
        await db.query(
          `
          SELECT COUNT(*)::int AS count
          FROM games
          WHERE author = $1
          `,
          [user.username]
        );

      res.json({
        user: {
          ...user,
          friendsCount:
            friends.rows[0].count,
          gamesCount:
            games.rows[0].count
        }
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error: "Помилка."
      });
    }
  }
);

/* DAILY REWARD */

app.post(
  "/api/daily-reward",
  async (req, res) => {

    try {

      const user =
        await getUser(req);

      if (!user) {

        return res.status(401).json({
          error:
            "Спочатку створіть акаунт."
        });
      }

      const today =
        new Date()
          .toISOString()
          .slice(0, 10);

      if (
        user.last_daily &&
        String(user.last_daily)
          .slice(0, 10) === today
      ) {

        return res.status(400).json({
          error:
            "Ти вже отримав нагороду сьогодні."
        });
      }

      const result =
        await db.query(
          `
          UPDATE users

          SET
            coins = coins + 50,
            last_daily = CURRENT_DATE

          WHERE id = $1

          RETURNING coins
          `,
          [user.id]
        );

      res.json({
        ok: true,
        coins:
          result.rows[0].coins
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Помилка нагороди."
      });
    }
  }
);

/* BUY SKIN */

app.post(
  "/api/buy-skin",
  async (req, res) => {

    const client =
      await db.connect();

    try {

      const user =
        await getUser(req);

      if (!user) {

        return res.status(401).json({
          error:
            "Спочатку створіть акаунт."
        });
      }

      const skin =
        skins.find(
          item =>
            item.id ===
            Number(
              req.body.skinId
            )
        );

      if (!skin) {

        return res.status(404).json({
          error:
            "Скін не знайдено."
        });
      }

      const owned =
        await client.query(
          `
          SELECT id
          FROM inventory
          WHERE user_id = $1
            AND skin_id = $2
          `,
          [
            user.id,
            skin.id
          ]
        );

      if (owned.rows.length) {

        return res.status(400).json({
          error:
            "Цей скін уже є в інвентарі."
        });
      }

      await client.query(
        "BEGIN"
      );

      const balance =
        await client.query(
          `
          SELECT coins
          FROM users
          WHERE id = $1
          FOR UPDATE
          `,
          [user.id]
        );

      if (
        balance.rows[0].coins <
        skin.price
      ) {

        await client.query(
          "ROLLBACK"
        );

        return res.status(400).json({
          error:
            "Недостатньо коінів."
        });
      }

      const updated =
        await client.query(
          `
          UPDATE users

          SET coins =
            coins - $1

          WHERE id = $2

          RETURNING coins
          `,
          [
            skin.price,
            user.id
          ]
        );

      await client.query(
        `
        INSERT INTO inventory
          (user_id, skin_id)

        VALUES
          ($1, $2)
        `,
        [
          user.id,
          skin.id
        ]
      );

      await client.query(
        "COMMIT"
      );

      res.json({
        ok: true,
        coins:
          updated.rows[0].coins
      });

    } catch (error) {

      await client.query(
        "ROLLBACK"
      );

      console.error(error);

      res.status(500).json({
        error:
          "Помилка покупки."
      });

    } finally {

      client.release();
    }
  }
);

/* INVENTORY */

app.get(
  "/api/inventory",
  async (req, res) => {

    try {

      const user =
        await getUser(req);

      if (!user) {

        return res.status(401).json({
          error:
            "Не авторизовано."
        });
      }

      const result =
        await db.query(
          `
          SELECT skin_id
          FROM inventory

          WHERE user_id = $1

          ORDER BY id DESC
          `,
          [user.id]
        );

      const resultSkins =
        result.rows
          .map(
            row =>
              skins.find(
                skin =>
                  skin.id ===
                  row.skin_id
              )
          )
          .filter(Boolean);

      res.json(
        resultSkins
      );

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Помилка інвентарю."
      });
    }
  }
);

/* ADD FRIEND */

app.post(
  "/api/friends/add",
  async (req, res) => {

    try {

      const user =
        await getUser(req);

      if (!user) {

        return res.status(401).json({
          error:
            "Спочатку створіть акаунт."
        });
      }

      const username =
        String(
          req.body.username || ""
        ).trim();

      const friendResult =
        await db.query(
          `
          SELECT *
          FROM users
          WHERE LOWER(username)
            = LOWER($1)
          `,
          [username]
        );

      if (!friendResult.rows.length) {

        return res.status(404).json({
          error:
            "Користувача не знайдено."
        });
      }

      const friend =
        friendResult.rows[0];

      if (
        friend.id === user.id
      ) {

        return res.status(400).json({
          error:
            "Не можна додати самого себе."
        });
      }

      await db.query(
        `
        INSERT INTO friendships
          (user_id, friend_id)

        VALUES
          ($1, $2)

        ON CONFLICT DO NOTHING
        `,
        [
          user.id,
          friend.id
        ]
      );

      await db.query(
        `
        INSERT INTO friendships
          (user_id, friend_id)

        VALUES
          ($1, $2)

        ON CONFLICT DO NOTHING
        `,
        [
          friend.id,
          user.id
        ]
      );

      res.json({
        ok: true
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Помилка додавання друга."
      });
    }
  }
);

/* FRIENDS */

app.get(
  "/api/friends",
  async (req, res) => {

    try {

      const user =
        await getUser(req);

      if (!user) {

        return res.status(401).json({
          error:
            "Не авторизовано."
        });
      }

      const result =
        await db.query(
          `
          SELECT
            u.id,
            u.username

          FROM friendships f

          JOIN users u
            ON u.id = f.friend_id

          WHERE f.user_id = $1

          ORDER BY u.username
          `,
          [user.id]
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Помилка друзів."
      });
    }
  }
);

/* PROFILE */

app.put(
  "/api/profile",
  async (req, res) => {

    try {

      const user =
        await getUser(req);

      if (!user) {

        return res.status(401).json({
          error:
            "Не авторизовано."
        });
      }

      const username =
        String(
          req.body.username || ""
        )
          .trim()
          .slice(0, 24);

      if (!username) {

        return res.status(400).json({
          error:
            "Нікнейм не може бути порожнім."
        });
      }

      const result =
        await db.query(
          `
          UPDATE users

          SET username = $1

          WHERE id = $2

          RETURNING *
          `,
          [
            username,
            user.id
          ]
        );

      res.json({
        user:
          result.rows[0]
      });

    } catch (error) {

      console.error(error);

      if (
        error.code ===
        "23505"
      ) {

        return res.status(400).json({
          error:
            "Такий нікнейм уже зайнятий."
        });
      }

      res.status(500).json({
        error:
          "Не вдалося змінити нікнейм."
      });
    }
  }
);

/* GAMES */

app.get(
  "/api/games",
  async (req, res) => {

    try {

      const result =
        await db.query(
          `
          SELECT
            id,
            title,
            author,
            description,
            objects,
            players,
            earned_coins AS "earnedCoins",
            published

          FROM games

          WHERE published = TRUE

          ORDER BY id DESC
          `
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.error(error);

      res.status(500).json({
        error:
          "Не вдалося завантажити ігри."
      });
    }
  }
);

/* FRONTEND */

app.get(
  /.*/,
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);

/* START */

initDB()
  .then(() => {

    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          `ZYVO Platform running on ${PORT}`
        );

      }
    );

  })
  .catch(error => {

    console.error(
      "Database initialization failed:",
      error
    );

    process.exit(1);
  });
