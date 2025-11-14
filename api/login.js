// api/login.js
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

  const { rollNumber, password } = req.body;

  if (!rollNumber || !password) {
    return res.status(400).json({ success: false, message: 'Roll number and password are required' });
  }

  try {
    const query = `
      SELECT RollNumber, Name, Email, Password, Year, Semester, Department
      FROM Students
      WHERE RollNumber = ? AND Status = 'active'
    `;
    const result = await client.execute({
      sql: query,
      args: [rollNumber],
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid roll number or account not active' });
    }

    const user = result.rows[0];
    const inputHash = crypto.createHash('sha256').update(password).digest('hex').toUpperCase();

    if (inputHash !== user.Password) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    // Remove password from response
    delete user.Password;

    // Update LastLogin timestamp
    await client.execute({
      sql: 'UPDATE Students SET LastLogin = CURRENT_TIMESTAMP WHERE RollNumber = ?',
      args: [rollNumber],
    });

    return res.status(200).json({
      success: true,
      data: { student: user },
    });
  } catch (error) {
    console.error('Login DB Error:', error.message);
    return res.status(500).json({ success: false, message: 'Connection failed. Try again.' });
  }
}
