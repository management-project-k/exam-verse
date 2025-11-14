// api/register-student.js
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
    confirmPassword
  } = req.body;

  // Validation
  const errors = [];
  
  if (!rollNumber?.trim()) {
    errors.push('Roll number is required');
  }
  
  if (!name?.trim()) {
    errors.push('Full name is required');
  }
  
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Valid email is required');
  }
  
  if (!phone?.trim() || !/^[0-9]{10}$/.test(phone)) {
    errors.push('Valid 10-digit phone number is required');
  }
  
  if (!year || year < 1 || year > 3) {
    errors.push('Valid year (1-3) is required');
  }
  
  if (!semester || semester < 1 || semester > 6) {
    errors.push('Valid semester (1-6) is required');
  }
  
  if (!department?.trim()) {
    errors.push('Department is required');
  }
  
  if (!college?.trim()) {
    errors.push('College is required');
  }
  
  if (!password || password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }
  
  if (password !== confirmPassword) {
    errors.push('Passwords do not match');
  }

  if (errors.length > 0) {
    return res.status(400).json({ 
      success: false, 
      message: errors.join('. ') 
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
    
    // Check if roll number already exists
    const existingStudent = await client.execute({
      sql: 'SELECT RollNumber FROM Students WHERE RollNumber = ?',
      args: [rollNumber]
    });

    if (existingStudent.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'Roll number already registered' 
      });
    }

    // Check if email already exists
    const existingEmail = await client.execute({
      sql: 'SELECT Email FROM Students WHERE Email = ?',
      args: [email]
    });

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'Email already registered' 
      });
    }

    // Hash password
    const hashedPassword = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex')
      .toUpperCase();

    // Begin transaction
    await client.execute('BEGIN TRANSACTION');

    try {
      // Insert student
      await client.execute({
        sql: `INSERT INTO Students (
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
                AccountCreated,
                NoOfMockTests,
                OverallScore,
                Rank
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, 0, 0.0, 0)`,
        args: [
          rollNumber,
          name,
          email,
          phone,
          hashedPassword,
          year,
          semester,
          department,
          college
        ]
      });

      // Create profile
      await client.execute({
        sql: `INSERT INTO StudentProfiles (
                RollNumber,
                PrivacyLevel,
                ProfileViews,
                FollowersCount,
                FollowingCount,
                PostsCount,
                AccountType,
                IsPrivate,
                IsVerified
              ) VALUES (?, 'public', 0, 0, 0, 0, 'public', FALSE, FALSE)`,
        args: [rollNumber]
      });

      // Create default settings
      await client.execute({
        sql: `INSERT INTO UserSettings (
                SettingID,
                RollNumber,
                ThemeMode,
                Language,
                NotificationsEnabled,
                PrivacyLevel,
                EmailNotifications
              ) VALUES (?, ?, 'light', 'en', TRUE, 'public', TRUE)`,
        args: [`SET_${rollNumber}`, rollNumber]
      });

      // Create notification preferences
      await client.execute({
        sql: `INSERT INTO NotificationPreferences (
                PrefID,
                RollNumber,
                LikesEnabled,
                CommentsEnabled,
                MessagesEnabled,
                GroupsEnabled,
                TestRemindersEnabled
              ) VALUES (?, ?, TRUE, TRUE, TRUE, TRUE, TRUE)`,
        args: [`PREF_${rollNumber}`, rollNumber]
      });

      // Create privacy settings
      await client.execute({
        sql: `INSERT INTO PrivacySettings (
                SettingID,
                UserRoll,
                AccountType,
                ProfileVisibility,
                WhoCanMessage,
                WhoCanTag,
                WhoCanSeeFollowers,
                WhoCanSeePosts,
                WhoCanSeeStories,
                WhoCanComment,
                ShowOnlineStatus
              ) VALUES (?, ?, 'public', 'everyone', 'everyone', 'everyone', 
                       'everyone', 'everyone', 'everyone', 'everyone', TRUE)`,
        args: [`PRIV_${rollNumber}`, rollNumber]
      });

      // Log registration
      await client.execute({
        sql: `INSERT INTO StudentActivity (
                ActivityID,
                StudentRoll,
                ActivityType,
                Description,
                IPAddress,
                UserAgent
              ) VALUES (?, ?, 'REGISTRATION', 'Account created', ?, ?)`,
        args: [
          `ACT_${Date.now()}`,
          rollNumber,
          req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown',
          req.headers['user-agent'] || 'Unknown'
        ]
      });

      // Create notification for admin
      await client.execute({
        sql: `INSERT INTO Notifications (
                NotificationID,
                RecipientRoll,
                Type,
                Title,
                Message,
                SenderRoll
              ) VALUES (?, 'ADMIN', 'NEW_REGISTRATION', 'New Student Registration', ?, ?)`,
        args: [
          `NOTIF_${Date.now()}`,
          `New student ${name} (${rollNumber}) has registered and requires approval`,
          rollNumber
        ]
      });

      // Commit transaction
      await client.execute('COMMIT');

      return res.status(200).json({
        success: true,
        message: 'Registration successful! Your account is pending admin approval.',
        data: {
          rollNumber,
          name,
          email
        }
      });

    } catch (transactionError) {
      // Rollback on error
      await client.execute('ROLLBACK');
      throw transactionError;
    }

  } catch (error) {
    console.error('Registration error:', error);
    
    // Log error
    try {
      await client.execute({
        sql: `INSERT INTO ErrorLogs (
                ErrorID,
                ErrorType,
                ErrorMessage,
                ActionAttempted,
                IPAddress,
                RequestData
              ) VALUES (?, 'REGISTRATION_ERROR', ?, 'Student Registration', ?, ?)`,
        args: [
          `ERR_${Date.now()}`,
          error.message,
          req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown',
          JSON.stringify({ rollNumber, email })
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
