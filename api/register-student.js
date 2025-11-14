// api/register-student.js
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

  const {
    rollNumber, name, email, phone, year, semester,
    department, college, password, confirmPassword
  } = req.body;

  // Validation
  const errors = [];
  if (!rollNumber) errors.push("Roll Number is required.");
  if (!name) errors.push("Full Name is required.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Valid Email is required.");
  if (!phone || !/^\+?\d{10,15}$/.test(phone)) errors.push("Valid Phone (10-15 digits) is required.");
  if (!year) errors.push("Year of Study is required.");
  if (!semester) errors.push("Semester is required.");
  if (!college) errors.push("College is required.");
  if (password !== confirmPassword) errors.push("Passwords do not match.");
  if (password.length < 6) errors.push("Password must be at least 6 characters.");

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors.join(' ') });
  }

  const hashedPassword = crypto.createHash('sha256').update(password).digest('hex').toUpperCase();

  try {
    // Check if roll or email exists
    const [existing] = await pool.execute(
      'SELECT RollNumber FROM Students WHERE RollNumber = ? OR Email = ?',
      [rollNumber, email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Roll Number or Email already exists.' });
    }

    // Insert student
    await pool.execute(
      `INSERT INTO Students 
       (RollNumber, Name, Email, Phone, Password, Year, Semester, Department, College, Status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [rollNumber, name, email, phone, hashedPassword, year, semester, department, college]
    );

    res.status(200).json({
      success: true,
      message: 'Registration successful! Please login.'
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error. Try again.' });
  }
}
