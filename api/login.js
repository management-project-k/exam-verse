// api/login.js
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'rshqto.h.filess.io',
  port: 61002,
  user: 'exam-verse-db-1_cattlelose',
  password: 'fdc0c12af81548f92845a2cf96781c33deb3542b',
  database: 'exam-verse-db-1_cattlelose',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  ssl: {
    rejectUnauthorized: false
  }
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { rollNumber, password } = req.body;

  if (!rollNumber || !password) {
    return res.status(400).json({ success: false, message: 'Roll number and password required' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    
    const [rows] = await connection.execute(
      'SELECT RollNumber, Name, Email, Password, Year, Semester, Department FROM Students WHERE RollNumber = ? AND Status = "active"',
      [rollNumber]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid roll number or password' });
    }

    const user = rows[0];
    const crypto = require('crypto');
    const inputHash = crypto.createHash('sha256').update(password).digest('hex').toUpperCase();

    if (inputHash !== user.Password) {
      return res.status(401).json({ success: false, message: 'Invalid roll number or password' });
    }

    delete user.Password;

    res.status(200).json({
      success: true,
      data: { student: user }
    });

  } catch (error) {
    console.error('Login DB Error:', error.message);
    res.status(500).json({ success: false, message: 'Connection failed. Try again.' });
  } finally {
    if (connection) connection.release();
  }
}
