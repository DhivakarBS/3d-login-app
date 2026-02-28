const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.SECRET_KEY || "supersecretkey123";

app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'client')));

// ✅ Root route (IMPORTANT)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "client", "index.html"));
});

// ================= DATABASE =================

const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error("Database connection error:", err.message);
    } else {
        console.log("SQLite Database Connected ✅");
    }
});

db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password TEXT
    )
`);

// ================= REGISTER =================

app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "All fields required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const id = uuidv4();

        db.run(
            `INSERT INTO users (id, email, password) VALUES (?, ?, ?)`,
            [id, email, hashedPassword],
            function (err) {
                if (err) {
                    return res.status(400).json({ message: "User already exists" });
                }
                res.json({ message: "User registered successfully 🎉" });
            }
        );

    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// ================= LOGIN =================

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "All fields required" });
    }

    db.get(
        `SELECT * FROM users WHERE email = ?`,
        [email],
        async (err, user) => {
            if (err) {
                return res.status(500).json({ message: "Server error" });
            }

            if (!user) {
                return res.status(401).json({ message: "Invalid credentials" });
            }

            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
                return res.status(401).json({ message: "Invalid credentials" });
            }

            const token = jwt.sign(
                { id: user.id, email: user.email },
                SECRET_KEY,
                { expiresIn: "1h" }
            );

            res.json({
                message: "Login successful 🚀",
                token
            });
        }
    );
});

// ================= PROTECTED =================

app.get('/dashboard', (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: "Invalid token" });
        }

        res.json({
            message: "Welcome to protected dashboard 🎯",
            user: decoded
        });
    });
});

// ================= START =================

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});