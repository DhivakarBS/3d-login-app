console.log("🔥 NEW VERSION DEPLOYED 🔥");
require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

const SECRET_KEY = process.env.SECRET_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// Initialize Google Client
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'client')));

// ================= ROOT =================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// ================= DATABASE =================
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('SQLite Database Connected ✅');
    }
});

// Users Table
db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password TEXT
    )
`);

// Registrations Table
db.run(`
    CREATE TABLE IF NOT EXISTS registrations (
        id TEXT PRIMARY KEY,
        user_email TEXT,
        event_name TEXT,
        department TEXT,
        year TEXT
    )
`);

// ================= REGISTER =================
app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ message: 'All fields required' });

        if (password.length < 6)
            return res.status(400).json({ message: 'Password must be at least 6 characters' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const id = uuidv4();

        db.run(
            `INSERT INTO users (id, email, password) VALUES (?, ?, ?)`,
            [id, email, hashedPassword],
            function (err) {
                if (err)
                    return res.status(400).json({ message: 'User already exists' });

                res.json({ message: 'User registered successfully 🎉' });
            }
        );
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ================= LOGIN =================
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ message: 'All fields required' });

    db.get(
        `SELECT * FROM users WHERE email = ?`,
        [email],
        async (err, user) => {
            if (err)
                return res.status(500).json({ message: 'Server error' });

            if (!user)
                return res.status(401).json({ message: 'Invalid credentials' });

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch)
                return res.status(401).json({ message: 'Invalid credentials' });

            const token = jwt.sign(
                { id: user.id, email: user.email },
                SECRET_KEY,
                { expiresIn: '1h' }
            );

            res.json({ token });
        }
    );
});

// ================= GOOGLE LOGIN =================
app.post("/google-login", async (req, res) => {
    try {
        const { token } = req.body;

        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();

        // 🔥 ADD THESE DEBUG LINES
        console.log("Backend expecting:", process.env.GOOGLE_CLIENT_ID);
        console.log("Token audience:", payload.aud);

        const email = payload.email;

        res.json({ success: true });

    } catch (error) {
        console.error("Google Auth Error:", error.message);
        res.status(401).json({ success: false });
    }
});

// ================= EVENT REGISTRATION =================
app.post('/register-event', (req, res) => {

    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ message: 'No token provided' });

    const token = authHeader.split(' ')[1];

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err)
            return res.status(401).json({ message: 'Invalid token' });

        const { event_name, department, year } = req.body;

        if (!event_name || !department || !year)
            return res.status(400).json({ message: 'All fields required' });

        const id = uuidv4();

        db.run(
            `INSERT INTO registrations (id, user_email, event_name, department, year)
             VALUES (?, ?, ?, ?, ?)`,
            [id, decoded.email, event_name, department, year],
            function (err) {

                if (err)
                    return res.status(500).json({ message: 'Registration failed' });

                // Send Email Notification
                transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: process.env.EMAIL_USER,
                    subject: 'New College Event Registration 🎓',
                    text: `
New Registration:

Email: ${decoded.email}
Event: ${event_name}
Department: ${department}
Year: ${year}
                    `
                });

                res.json({ message: 'Successfully Registered 🎉' });
            }
        );
    });
});

// ================= ADMIN DATA =================
app.get('/admin/data', (req, res) => {
    db.all(`SELECT * FROM registrations`, [], (err, rows) => {
        if (err)
            return res.status(500).json({ message: 'Database error' });

        res.json(rows);
    });
});

// ================= START SERVER =================
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});