// api/register-lecturer.js
import mysql from 'mysql2/promise';
import crypto from 'crypto';

const pool = mysql.createPool({
  host: 'rshqto.h.filess.io',
  port: 61002,
  user: 'exam-verse-db-1_cattlelose',
  password: 'fdc0c12af81548f92845a2cf96781c33deb3542b',
  database: 'exam-verse-db-1_cattlelose',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { name, email, phone, subjects, password, confirmPassword } = req.body;

  const errors = [];
  if (!name) errors.push("Full Name is required.");
  if (!email || !/^[^\s@]+@(?:svr|govpoly)\.(?:edu|ac)\.in$/.test(email))
    errors.push("Official email (@svr.ac.in or @govpoly.ac.in) required.");
  if (subjects && subjects.split(',').length < 2)
    errors.push("At least 2 subjects must be selected.");
  if (password !== confirmPassword) errors.push("Passwords do not match.");
  if (password.length < 6) errors.push("Password must be at least 6 characters.");

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors.join(' ') });
  }

  const hashedPassword = crypto.createHash('sha256').update(password).digest('hex').toUpperCase();
  const lecturerId = `LEC${Date.now().toString().slice(-6)}`;

  try {
    const [existing] = await pool.execute(
      'SELECT Email FROM Administration WHERE Email = ?',
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    await pool.execute(
      `INSERT INTO Administration 
       (AdminID, Name, Email, Role, Permissions, Status)
       VALUES (?, ?, ?, 'moderator', ?, 'inactive')`,
      [lecturerId, name, email, JSON.stringify(subjects.split(','))]
    );

    // Optional: Store password in a separate table if needed
    // Or use a Lecturers table

    res.status(200).json({
      success: true,
      lecturerId,
      message: 'Registration successful! Awaiting admin approval.'
    });

  } catch (error) {
    console.error('Lecturer register error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
}
