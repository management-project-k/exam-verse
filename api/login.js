// api/login.js
import { createClient } from '@libsql/client';
import crypto from 'crypto';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }

  const { rollNumber, password } = req.body;

  // Validation
  if (!rollNumber || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Roll number and password are required' 
    });
  }

  // Create database client
  const client = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    // Enable foreign keys
    await client.execute('PRAGMA foreign_keys = ON');
    
    // Query student
    const studentResult = await client.execute({
      sql: `SELECT 
              RollNumber, 
              Name, 
              Email, 
              Phone,
              Password, 
              Year, 
              Semester, 
              Department,
              College,
              Status,
              OverallScore,
              Rank,
              NoOfMockTests
            FROM Students 
            WHERE RollNumber = ?`,
      args: [rollNumber],
    });

    if (studentResult.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid roll number or password' 
      });
    }

    const student = studentResult.rows[0];

    // Check account status
    if (student.Status !== 'active') {
      return res.status(403).json({ 
        success: false, 
        message: `Account is ${student.Status}. Please contact admin.` 
      });
    }

    // Verify password (SHA-256 hash)
    const hashedInput = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex')
      .toUpperCase();

    if (hashedInput !== student.Password) {
      // Log failed attempt
      await client.execute({
        sql: `INSERT INTO SecurityLogs 
              (SecurityID, EventType, UserRoll, IPAddress, Action, Status, RiskLevel, Details)
              VALUES (?, 'LOGIN_FAILED', ?, ?, 'Login attempt', 'failed', 'low', 'Invalid password')`,
        args: [
          `SEC_${Date.now()}`,
          rollNumber,
          req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown'
        ]
      });

      return res.status(401).json({ 
        success: false, 
        message: 'Invalid roll number or password' 
      });
    }

    // Create session
    const sessionId = `SESS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    await client.execute({
      sql: `INSERT INTO Sessions 
            (SessionID, RollNumber, LoginTime, Active, IPAddress, UserAgent, ExpiresAt)
            VALUES (?, ?, CURRENT_TIMESTAMP, TRUE, ?, ?, ?)`,
      args: [
        sessionId,
        student.RollNumber,
        req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown',
        req.headers['user-agent'] || 'Unknown',
        expiresAt.toISOString()
      ]
    });

    // Update last login
    await client.execute({
      sql: `UPDATE Students SET LastLogin = CURRENT_TIMESTAMP WHERE RollNumber = ?`,
      args: [student.RollNumber]
    });

    // Log successful login
    await client.execute({
      sql: `INSERT INTO StudentActivity 
            (ActivityID, StudentRoll, ActivityType, Description, IPAddress, UserAgent, SessionID)
            VALUES (?, ?, 'LOGIN', 'Successful login', ?, ?, ?)`,
      args: [
        `ACT_${Date.now()}`,
        student.RollNumber,
        req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown',
        req.headers['user-agent'] || 'Unknown',
        sessionId
      ]
    });

    // Get profile data if exists
    const profileResult = await client.execute({
      sql: `SELECT 
              Bio, 
              ProfilePhotoURL, 
              CoverPhotoURL,
              City,
              State,
              FollowersCount,
              FollowingCount,
              PostsCount
            FROM StudentProfiles 
            WHERE RollNumber = ?`,
      args: [student.RollNumber]
    });

    const profile = profileResult.rows[0] || {};

    // Remove password from response
    delete student.Password;

    // Prepare response
    const responseData = {
      ...student,
      ...profile,
      SessionID: sessionId
    };

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        student: responseData
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    
    // Log error
    try {
      await client.execute({
        sql: `INSERT INTO ErrorLogs 
              (ErrorID, ErrorType, ErrorMessage, UserID, ActionAttempted, IPAddress)
              VALUES (?, 'LOGIN_ERROR', ?, ?, 'Login', ?)`,
        args: [
          `ERR_${Date.now()}`,
          error.message,
          rollNumber,
          req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown'
        ]
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again later.' 
    });
    
  } finally {
    // Always close the client
    await client.close();
  }
}
