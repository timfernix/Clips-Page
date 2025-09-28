/**
 * Express server
 * Run with: `node server.js`
 */

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
app.use(cors());

const pool = mysql.createPool({
  //host: process.env.DB_HOST,
  //port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  //user: process.env.DB_USER,
  //password: process.env.DB_PASSWORD,
  //database: process.env.DB_NAME,
  host: "",
  port: "",
  user:"",
  password:"",
  database:"",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  decimalNumbers: true
});

function mapClipRow(row) {
  return {
    uuid: row.uuid,
    title: row.title,
    champion: row.champion,
    role: row.role,
    category: row.category,
    tags: row.tags,
    video_url: row.video_url,
    thumbnail_url: row.thumbnail_url,
    description: row.description,
    favorite: row.favorite,
    recorded_at: row.recorded_at
  };
}

app.get("/", (_req, res) => {
  res.redirect("/api/clips");
});


app.get("/api/clips", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT uuid, title, champion, role, category, tags, video_url, thumbnail_url,
              description, favorite, recorded_at
         FROM lol_clips
        ORDER BY recorded_at DESC`
    );

    res.json(rows.map(mapClipRow));
  } catch (error) {
    console.error("Failed to fetch clips", error);
    res.status(500).json({ message: "Unable to fetch clips" });
  }
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    console.error("Database health check failed", error);
    res.status(500).json({ ok: false });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 8787;
app.listen(port, () => {
  console.log(`Summoner Highlights API ready on http://localhost:${port}`);
});
