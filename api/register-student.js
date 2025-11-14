// api/register-student.js
import { createClient } from '@libsql/client';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const {
    rollNumber,
    name,
    email,
    phone,
    year,
    semester,
    department,
    college,
    password,
    confirmPassword,
  } = req.body;

  // Validation
  const errors = [];
  if (!rollNumber) errors.push('Roll Number is required.');
  if (!name) errors.push('Full Name is required.');
  if (!email || !/^[^\s@]+@(?:svr|govpoly)\.(?:edu|ac)\.in$/.test(email)) {
    errors.push('Official email (@svr.ac.in or @govpoly.ac.in) required.');
  }
  if (!phone || !/^\+?\d{10,12}$/.test(phone)) errors.push('Valid phone number required.');
  if (!year || !['1', '2', '3'].includes(year)) errors.push('Valid Year of Study required.');
  if (!semester || !['1', '3', '4', '5'].includes(semester)) errors.push('Valid Semester required.');
  if (department !== 'Computer Engineering') errors.push('Department must be Computer Engineering.');
  if (!college || !['Government Polytechnic Proddatur', 'SVR Engineering College Nandyal'].includes(college)) {
    errors.push('Valid college required.');
  }
  if (!password || password.length < 6) errors.push('Password must be at least 6 characters.');
  if (password !== confirmPassword) errors.push('Passwords do not match.');

  if (errors.length > 0) {
    return res.status(400).json({ success: false, message: errors.join(' ') });
  }

  // Hash password
  const hashedPassword = crypto.createHash('sha256').update(password).digest('hex').toUpperCase();

  try {
    // Check for existing roll number or email
    const checkQuery = `
      SELECT RollNumber, Email
      FROM Students
      WHERE RollNumber = ? OR Email = ?
    `;
    const checkResult = await client.execute({
      sql: checkQuery,
      args: [rollNumber, email],
    });

    if (checkResult.rows.length > 0) {
      const existing = checkResult.rows[0];
      if (existing.RollNumber === rollNumber) {
        return res.status(409).json({ success: false, message: 'Roll Number already registered.' });
      }
      if (existing.Email === email) {
        return res.status(409).json({ success: false, message: 'Email already registered.' });
      }
    }

    // Insert new student
    const insertQuery = `
      INSERT INTO Students (
        RollNumber, Name, Email, Phone, Password, Year, Semester, Department, College, Status, AccountCreated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
    `;
    await client.execute({
      sql: insertQuery,
      args: [
        rollNumber,
        name,
        email,
        phone,
        hashedPassword,
        parseInt(year),
        parseInt(semester),
        department,
        college,
      ],
    });

    return res.status(200).json({
      success: true,
      message: 'Registration successful!',
    });
  } catch (error) {
    console.error('Student register error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Try again.' });
  }
}
