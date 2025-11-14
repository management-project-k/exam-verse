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

  const { rollNumber, password } = req.body;

  if (!rollNumber || !password) {
    return res.status(400).json({ success: false, message: 'Roll number and password required' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT RollNumber, Name, Email, Password, Year, Semester, Department FROM Students WHERE RollNumber = ? AND Status = "active"',
      [rollNumber]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid roll number or password' });
    }

    const user = rows[0];
    const inputHash = crypto.createHash('sha256').update(password).digest('hex').toUpperCase();
    const dbHash = user.Password;

    if (inputHash !== dbHash) {
      return res.status(401).json({ success: false, message: 'Invalid roll number or password' });
    }

    delete user.Password;

    res.status(200).json({
      success: true,
      data: { student: user }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}
