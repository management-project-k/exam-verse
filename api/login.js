// api/login.js
import { createClient } from '@libsql/client/http';
import crypto from 'crypto';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

console.log('TURSO_URL:', url ? 'Set' : 'Missing');
console.log('TURSO_TOKEN:', authToken ? 'Set (starts with eyJ...)' : 'Missing');

if (!url || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
}

const client = createClient({
  url,
  authToken,
});

export default async function handler(req, res) {
  if (!url || !authToken) {
    return res.status(500).json({ success: false, message: 'Server configuration error. Contact admin.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { rollNumber, password } = req.body;

  if (!rollNumber || !password) {
    return res.status(400).json({ success: false, message: 'Roll number and password are required' });
  }

  try {
    const result = await client.execute({
      sql: `
        SELECT RollNumber, Name, Email, Password, Year, Semester, Department
        FROM Students
        WHERE RollNumber = ? AND Status = 'active'
      `,
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

    delete user.Password;

    await client.execute({
      sql: 'UPDATE Students SET LastLogin = CURRENT_TIMESTAMP WHERE RollNumber = ?',
      args: [rollNumber],
    });

    return res.status(200).json({
      success: true,
      data: { student: user },
    });
  } catch (error) {
    console.error('Login error:', error.message, error.stack);
    if (error.message?.includes('401')) {
      return res.status(500).json({ success: false, message: 'Database authentication failed. Token invalid – contact admin.' });
    }
    return res.status(500).json({ success: false, message: 'Connection failed. Try again.' });
  }
}
