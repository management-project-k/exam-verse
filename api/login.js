// api/login.js
import { createClient } from '@libsql/client';
import crypto from 'crypto';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }

  // Get credentials
  const { rollNumber, password } = req.body || {};
  
  // Validate input
  if (!rollNumber || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Roll number and password are required' 
    });
  }

  // Create Turso client
  const client = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    // Enable foreign keys
    await client.execute('PRAGMA foreign_keys = ON');

    // Get student record
    const result = await client.execute({
      sql: `SELECT RollNumber, Name, Email, Password, Year, Semester, 
            Department, College, Status, OverallScore, Rank, NoOfMockTests
            FROM Students 
            WHERE RollNumber = ? AND Status != 'deleted'`,
      args: [rollNumber],
    });

    // Check if student exists
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid roll number or password' 
      });
    }

    const student = result.rows[0];

    // Check account status
    if (student.Status === 'pending') {
      return res.status(403).json({ 
        success: false, 
        message: 'Account pending approval. Please contact admin.' 
      });
    }
    
    if (student.Status === 'suspended') {
      return res.status(403).json({ 
        success: false, 
        message: 'Account suspended. Please contact admin.' 
      });
    }

    // Verify password (SHA-256)
    const hashedInput = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex')
      .toUpperCase();

    if (hashedInput !== student.Password) {
      // Log failed attempt
      await client.execute({
        sql: `INSERT INTO SecurityLogs 
              (SecurityID, EventType, UserRoll, IPAddress, Action, Status)
              VALUES (?, 'failed_login', ?, ?, 'login_attempt', 'failed')`,
        args: [
          `sec_${Date.now()}`,
          rollNumber,
          req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown'
        ],
      });

      return res.status(401).json({ 
        success: false, 
        message: 'Invalid roll number or password' 
      });
    }

    // Create session
    const sessionId = `sess_${crypto.randomUUID()}`;
    const ipAddress = req.headers['x-forwarded-for'] || 
                     req.connection.remoteAddress || 
                     'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    await client.execute({
      sql: `INSERT INTO Sessions 
            (SessionID, RollNumber, LoginTime, Active, IPAddress, UserAgent, ExpiresAt)
            VALUES (?, ?, CURRENT_TIMESTAMP, 1, ?, ?, datetime('now', '+24 hours'))`,
      args: [sessionId, student.RollNumber, ipAddress, userAgent],
    });

    // Update last login
    await client.execute({
      sql: `UPDATE Students 
            SET LastLogin = CURRENT_TIMESTAMP 
            WHERE RollNumber = ?`,
      args: [student.RollNumber],
    });

    // Log successful login
    await client.execute({
      sql: `INSERT INTO StudentActivity 
            (ActivityID, StudentRoll, ActivityType, Description, IPAddress, SessionID)
            VALUES (?, ?, 'login', 'Student logged in', ?, ?)`,
      args: [
        `act_${Date.now()}`,
        student.RollNumber,
        ipAddress,
        sessionId
      ],
    });

    // Get profile data if exists
    const profileResult = await client.execute({
      sql: `SELECT Bio, ProfilePhotoURL, FollowersCount, FollowingCount, PostsCount
            FROM StudentProfiles 
            WHERE RollNumber = ?`,
      args: [student.RollNumber],
    });

    // Prepare response (exclude password)
    const { Password, ...studentData } = student;
    
    if (profileResult.rows.length > 0) {
      Object.assign(studentData, profileResult.rows[0]);
    }

    studentData.SessionID = sessionId;

    res.status(200).json({ 
      success: true, 
      message: 'Login successful',
      data: { 
        student: studentData 
      } 
    });

  } catch (error) {
    console.error('Login error:', error);
    
    // Log error
    await client.execute({
      sql: `INSERT INTO ErrorLogs 
            (ErrorID, ErrorType, ErrorMessage, UserID, ActionAttempted, IPAddress)
            VALUES (?, 'login_error', ?, ?, 'login', ?)`,
      args: [
        `err_${Date.now()}`,
        error.message || 'Unknown error',
        rollNumber,
        req.headers['x-forwarded-for'] || 'unknown'
      ],
    }).catch(console.error);

    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again.' 
    });
  } finally {
    client.close();
  }
}
