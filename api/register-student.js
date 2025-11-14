// api/register-student.js
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
  } = req.body || {};

  // Validation
  const errors = [];
  
  if (!rollNumber?.trim()) errors.push('Roll number is required');
  if (!name?.trim()) errors.push('Full name is required');
  if (!email?.trim()) errors.push('Email is required');
  if (!phone?.trim()) errors.push('Phone number is required');
  if (!year) errors.push('Year is required');
  if (!semester) errors.push('Semester is required');
  if (!college?.trim()) errors.push('College is required');
  if (!password || password.length < 6) errors.push('Password must be at least 6 characters');
  if (password !== confirmPassword) errors.push('Passwords do not match');

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailRegex.test(email)) {
    errors.push('Invalid email format');
  }

  // Phone validation (Indian format)
  const phoneRegex = /^[6-9]\d{9}$/;
  if (phone && !phoneRegex.test(phone.replace(/\D/g, ''))) {
    errors.push('Invalid phone number (10 digits required)');
  }

  if (errors.length > 0) {
    return res.status(400).json({ 
      success: false, 
      message: errors.join('. ') 
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

    // Check if roll number already exists
    const existingStudent = await client.execute({
      sql: `SELECT RollNumber, Status FROM Students WHERE RollNumber = ?`,
      args: [rollNumber],
    });

    if (existingStudent.rows.length > 0) {
      const status = existingStudent.rows[0].Status;
      if (status === 'active' || status === 'pending') {
        return res.status(409).json({ 
          success: false, 
          message: 'Roll number already registered' 
        });
      }
    }

    // Check if email already exists
    const existingEmail = await client.execute({
      sql: `SELECT Email FROM Students WHERE Email = ? AND Status != 'deleted'`,
      args: [email],
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

    // Start transaction
    await client.execute('BEGIN TRANSACTION');

    try {
      // Insert student record
      await client.execute({
        sql: `INSERT INTO Students 
              (RollNumber, Name, Email, Phone, Password, Year, Semester, 
               Department, College, Status, AccountCreated, NoOfMockTests, OverallScore, Rank)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, 0, 0.0, 0)`,
        args: [
          rollNumber,
          name,
          email,
          phone,
          hashedPassword,
          year,
          semester,
          department || 'Computer Engineering',
          college
        ],
      });

      // Create student profile
      await client.execute({
        sql: `INSERT INTO StudentProfiles 
              (RollNumber, PrivacyLevel, ProfileViews, FollowersCount, 
               FollowingCount, PostsCount, AccountType, IsPrivate, IsVerified)
              VALUES (?, 'public', 0, 0, 0, 0, 'public', 0, 0)`,
        args: [rollNumber],
      });

      // Create default settings
      await client.execute({
        sql: `INSERT INTO UserSettings 
              (SettingID, RollNumber, ThemeMode, Language, NotificationsEnabled, 
               PrivacyLevel, EmailNotifications, LastModified)
              VALUES (?, ?, 'light', 'en', 1, 'public', 1, CURRENT_TIMESTAMP)`,
        args: [`set_${rollNumber}`, rollNumber],
      });

      // Create notification preferences
      await client.execute({
        sql: `INSERT INTO NotificationPreferences 
              (PrefID, RollNumber, LikesEnabled, CommentsEnabled, MessagesEnabled, 
               GroupsEnabled, TestRemindersEnabled)
              VALUES (?, ?, 1, 1, 1, 1, 1)`,
        args: [`pref_${rollNumber}`, rollNumber],
      });

      // Create privacy settings
      await client.execute({
        sql: `INSERT INTO PrivacySettings 
              (SettingID, UserRoll, AccountType, ProfileVisibility, WhoCanMessage, 
               WhoCanTag, WhoCanSeeFollowers, WhoCanSeePosts, WhoCanSeeStories, 
               WhoCanComment, ShowOnlineStatus)
              VALUES (?, ?, 'public', 'everyone', 'everyone', 'everyone', 
                      'everyone', 'everyone', 'everyone', 'everyone', 1)`,
        args: [`priv_${rollNumber}`, rollNumber],
      });

      // Log registration activity
      await client.execute({
        sql: `INSERT INTO StudentActivity 
              (ActivityID, StudentRoll, ActivityType, Description, IPAddress)
              VALUES (?, ?, 'registration', 'New student registration', ?)`,
        args: [
          `act_${Date.now()}`,
          rollNumber,
          req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown'
        ],
      });

      // Add welcome notification
      await client.execute({
        sql: `INSERT INTO Notifications 
              (NotificationID, RecipientRoll, Type, Title, Message, IsRead)
              VALUES (?, ?, 'welcome', 'Welcome to Exam Verse!', 
                      'Your account has been created. Awaiting admin approval.', 0)`,
        args: [`notif_${Date.now()}`, rollNumber],
      });

      // Commit transaction
      await client.execute('COMMIT');

      res.status(200).json({
        success: true,
        message: 'Registration successful! Your account is pending admin approval.',
        data: { 
          rollNumber, 
          name 
        }
      });

    } catch (txError) {
      // Rollback on error
      await client.execute('ROLLBACK');
      throw txError;
    }

  } catch (error) {
    console.error('Registration error:', error);

    // Log error
    await client.execute({
      sql: `INSERT INTO ErrorLogs 
            (ErrorID, ErrorType, ErrorMessage, ActionAttempted, RequestData, IPAddress)
            VALUES (?, 'registration_error', ?, 'student_registration', ?, ?)`,
      args: [
        `err_${Date.now()}`,
        error.message || 'Unknown error',
        JSON.stringify({ rollNumber, email }),
        req.headers['x-forwarded-for'] || 'unknown'
      ],
    }).catch(console.error);

    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again later.' 
    });
  } finally {
    client.close();
  }
}
