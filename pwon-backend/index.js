require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// DB connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper: generate 6-digit OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── POST /auth/send-otp ──────────────────────────────────────────────────────
// mode: "login"    → fails if user does not exist
// mode: "register" → fails if user already fully registered
app.post('/auth/send-otp', async (req, res) => {
  const { email, username, mode } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  if (!mode || !['login', 'register', 'resend'].includes(mode))
    return res.status(400).json({ message: 'Mode must be login, register, or resend' });

  try {
    const existing = await pool.query(
      `SELECT otp, "otpExpiresAt" FROM "Users" WHERE email = $1`,
      [email]
    );
    const userExists = existing.rows.length > 0;

    if (mode === 'login' && !userExists)
      return res.status(404).json({ message: 'No account found. Please register first.' });

    if (mode === 'register' && userExists) {
      const otpExpiresAt = existing.rows[0].otpExpiresAt;
      if (otpExpiresAt === null) {
        // OTP was cleared after verification = fully registered account
        return res.status(409).json({ message: 'Already have an account! Please log in.' });
      }
      // OTP still set = incomplete registration — resend OTP and let them retry
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query(
        `UPDATE "Users" SET otp = $2, "otpExpiresAt" = $3 WHERE email = $1`,
        [email, otp, expiresAt]
      );
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your PWON verification code',
        text: `Your OTP is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
      });
      return res.json({ message: 'OTP sent' });
    }

    // Check username uniqueness before inserting (register mode only)
    if (mode === 'register' && username) {
      const usernameCheck = await pool.query(
        `SELECT 1 FROM "Users" WHERE username = $1 LIMIT 1`,
        [username]
      );
      if (usernameCheck.rows.length > 0) {
        return res.status(409).json({ message: 'This username is already taken.' });
      }
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (mode === 'register') {
      // Insert new user row with email + username + OTP
      await pool.query(
        `INSERT INTO "Users" (email, username, otp, "otpExpiresAt", "creationDate", "creationTime", "noOfSubs")
         VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_TIME, 0)`,
        [email, username || null, otp, expiresAt]
      );
    } else {
      // Login or resend: just update OTP on existing row
      await pool.query(
        `UPDATE "Users" SET otp = $2, "otpExpiresAt" = $3 WHERE email = $1`,
        [email, otp, expiresAt]
      );
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your PWON verification code',
      text: `Your OTP is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
    });

    res.json({ message: 'OTP sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to send OTP' });
  }
});

// ── POST /auth/verify-otp ────────────────────────────────────────────────────
// Works for both login and register — just verifies the OTP
app.post('/auth/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });

  try {
    const result = await pool.query(
      `SELECT otp, "otpExpiresAt" FROM "Users" WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ message: 'User not found' });

    const { otp: savedOtp, otpExpiresAt } = result.rows[0];

    if (savedOtp !== otp)
      return res.status(401).json({ message: 'Incorrect OTP' });

    if (new Date() > new Date(otpExpiresAt))
      return res.status(401).json({ message: 'OTP expired' });

    // Clear OTP after successful verification
    await pool.query(
      `UPDATE "Users" SET otp = NULL, "otpExpiresAt" = NULL WHERE email = $1`,
      [email]
    );

    // Fetch username to return to the frontend so it can save to AsyncStorage
    const userRow = await pool.query(
      `SELECT username FROM "Users" WHERE email = $1`,
      [email]
    );
    const username = userRow.rows[0]?.username || null;

    // TODO Week 3: replace with real JWT signed with jsonwebtoken
    res.json({ message: 'Verified', token: 'mock_token_' + email, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Verification failed' });
  }
});

// ── POST /auth/complete-registration ────────────────────────────────────────
// Called after OTP verified — saves username, mobile number, state, district
app.post('/auth/complete-registration', async (req, res) => {
  const { email, username, mobNo, state, district } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });

  try {
    // If username was changed between send-otp and complete-registration,
    // check uniqueness again before saving
    if (username) {
      const usernameCheck = await pool.query(
        `SELECT 1 FROM "Users" WHERE username = $1 AND email != $2 LIMIT 1`,
        [username, email]
      );
      if (usernameCheck.rows.length > 0) {
        return res.status(409).json({ message: 'This username is already taken.' });
      }
    }

    await pool.query(
      `UPDATE "Users"
       SET username = $2,
           "mobNo" = $3,
           state = $4,
           district = $5,
           "savedLoc" = $6,
           "lastDate" = CURRENT_DATE,
           "lastTime" = CURRENT_TIME
       WHERE email = $1`,
      [
        email,
        username || null,
        mobNo || null,
        state || null,
        district || null,
        (state && district) ? `${state}|${district}` : null,
      ]
    );
    res.json({ message: 'Registration complete' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to complete registration' });
  }
});

// ── GET /auth/check-username ─────────────────────────────────────────────────
// Called on blur in the Register form to check if a username is already taken.
// Returns { taken: true/false }
app.get('/auth/check-username', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ message: 'Username required.' });

  try {
    const result = await pool.query(
      `SELECT 1 FROM "Users" WHERE username = $1 LIMIT 1`,
      [username]
    );
    // result.rows.length > 0 means the username already exists in the DB
    return res.json({ taken: result.rows.length > 0 });
  } catch (err) {
    console.error('check-username error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /location/pincode/:pincode ───────────────────────────────────────────
// Returns state and district for an Indian pincode using India Post API
app.get('/location/pincode/:pincode', async (req, res) => {
  const { pincode } = req.params;
  if (!/^\d{6}$/.test(pincode))
    return res.status(400).json({ message: 'Pincode must be 6 digits' });

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await response.json();

    if (!data || data[0].Status !== 'Success')
      return res.status(404).json({ message: 'Pincode not found' });

    const postOffice = data[0].PostOffice[0];
    res.json({
      state: postOffice.State,
      district: postOffice.District,
      region: postOffice.Region,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to look up pincode' });
  }
});

// ── POST /observations ───────────────────────────────────────────────────────
// Creates a new entry in CrowdSourceEntry.
// userEmail in the body is the logged-in user's email (from AsyncStorage) or null (anonymous).
// photo/video paths are left null for now — file upload comes later.
app.post('/observations', async (req, res) => {
  const { state, district, date, time, phenomena, damage, description, userEmail, username } = req.body;

  // Basic validation
  if (!state || !district)
    return res.status(400).json({ message: 'State and district are required.' });
  if (!phenomena || phenomena.length === 0)
    return res.status(400).json({ message: 'At least one phenomenon is required.' });

  // phenomena is an array e.g. ["Rainfall", "Fog"] — join into a single string for the VARCHAR column
  const phenomStr = phenomena.join(', ');

  // The "user" display column stores the username or 'anonymous'
  const userDisplay = username || 'anonymous';

  // user_email is the FK into Users(email) — null for anonymous submissions
  const fkEmail = userEmail || null;

  try {
    // Generate a simple numeric ID using epoch milliseconds
    // (CrowdSourceEntry.id is bigint with no sequence defined yet)
    const id = Date.now();

    await pool.query(
      `INSERT INTO "CrowdSourceEntry"
         (id, upload_date, upload_time, phenom, observation, state, district, damage, "user", user_email)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        date,           // YYYY-MM-DD string — Postgres accepts this for the date column
        time,           // HH:MM string — Postgres accepts this for the time column
        phenomStr,
        description || null,
        state,
        district,
        damage || null,
        userDisplay,
        fkEmail,        // null if anonymous
      ]
    );

    res.status(201).json({ message: 'Observation submitted successfully.', id });
  } catch (err) {
    console.error('Insert observation error:', err);
    res.status(500).json({ message: 'Failed to save observation.' });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Backend running on port ${process.env.PORT}`);
});