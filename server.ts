import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "bookings.db");
let db: any;
try {
  db = new Database(dbPath);
  console.log("Database initialized at", dbPath);
} catch (error) {
  console.error("Failed to initialize database:", error);
  // Mock database to prevent crash
  db = {
    prepare: () => ({
      all: () => [],
      run: () => ({ lastInsertRowid: Date.now() })
    }),
    exec: () => {}
  };
}

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    customer_surname TEXT,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    service TEXT NOT NULL,
    barber_id INTEGER NOT NULL,
    booking_date TEXT NOT NULL,
    booking_time TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // API Routes
  app.get("/api/bookings", (req, res) => {
    const bookings = db.prepare("SELECT * FROM bookings").all();
    res.json(bookings);
  });

  app.get("/api/previous-services", (req, res) => {
    const { email, phone } = req.query;
    if (!email && !phone) return res.json([]);
    
    const services = db.prepare(`
      SELECT DISTINCT service FROM bookings 
      WHERE customer_email = ? OR customer_phone = ?
      ORDER BY created_at DESC
    `).all(email || "", phone || "");
    
    res.json(services.map((s: any) => s.service));
  });

  app.post("/api/bookings", (req, res) => {
    const { customer_name, customer_surname, customer_email, customer_phone, service, barber_id, booking_date, booking_time } = req.body;
    try {
      const info = db.prepare(`
        INSERT INTO bookings (customer_name, customer_surname, customer_email, customer_phone, service, barber_id, booking_date, booking_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(customer_name, customer_surname, customer_email, customer_phone, service, barber_id, booking_date, booking_time);
      res.status(201).json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error creating booking" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
