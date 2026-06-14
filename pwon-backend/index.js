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
  const { email, mode } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  if (!mode || !['login', 'register'].includes(mode))
    return res.status(400).json({ message: 'Mode must be login or register' });

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
      // OTP still set = incomplete registration, resend OTP and let them retry
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

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (mode === 'register') {
      // Insert new user row with just email + OTP
      await pool.query(
        `INSERT INTO "Users" (email, otp, "otpExpiresAt", "creationDate", "creationTime", "noOfSubs")
         VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_TIME, 0)`,
        [email, otp, expiresAt]
      );
    } else {
      // Login: just update OTP on existing row
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

    // TODO Week 3: replace with real JWT signed with jsonwebtoken
    res.json({ message: 'Verified', token: 'mock_token_' + email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Verification failed' });
  }
});

// ── POST /auth/complete-registration ────────────────────────────────────────
// Called after OTP verified — saves mobile number, state, district, savedLoc
app.post('/auth/complete-registration', async (req, res) => {
  const { email, mobNo, state, district } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });

  try {
    await pool.query(
      `UPDATE "Users"
       SET "mobNo" = $2,
           state = $3,
           district = $4,
           "savedLoc" = $5,
           "lastDate" = CURRENT_DATE,
           "lastTime" = CURRENT_TIME
       WHERE email = $1`,
      [
        email,
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

app.listen(process.env.PORT, () => {
  console.log(`Backend running on port ${process.env.PORT}`);
});