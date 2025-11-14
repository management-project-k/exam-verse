// api/register-student.js
import { createClient } from "@turso/database";
import crypto from "crypto";

const client = createClient({
  url: "libsql://exam-verse-3-tfixcom.aws-ap-south-1.turso.io",
  authToken:
    "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjMxMDgwNjYsImlkIjoiZjQyMzM4ODktMThiNC00ZTNhLWI0ODQtZjc1ZDlhN2E4ZTgwIiwicmlkIjoiYTYxNDI5MjktZGExZS00NDkxLTliNTQtYWIxNTRmYWEzNjU1In0.hZ-HEKLDUehJXmtlJjK0L8wAvYem49Nd1EQABPnjbV5wd7kVsdL9hJMLNuA8i4FiIDJzQclzrCmfYJWXiyGeBQ",
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
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

  const errors = [];

  if (!rollNumber) errors.push("Roll Number is required.");
  if (!name) errors.push("Full Name is required.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.push("Valid Email is required.");
  if (!phone || !/^\+?\d{10,15}$/.test(phone))
    errors.push("Valid Phone (10–15 digits) is required.");
  if (!year) errors.push("Year is required.");
  if (!semester) errors.push("Semester is required.");
  if (!college) errors.push("College is required.");
  if (password !== confirmPassword) errors.push("Passwords do not match.");
  if (!password || password.length < 6)
    errors.push("Password must be at least 6 characters.");

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors.join(" "),
    });
  }

  const hashedPassword = crypto
    .createHash("sha256")
    .update(password)
    .digest("hex")
    .toUpperCase();

  try {
    // -------- CHECK EXISTING STUDENT --------
    const check = await client.execute({
      sql: "SELECT RollNumber FROM Students WHERE RollNumber = ? OR Email = ?;",
      args: [rollNumber, email],
    });

    if (check.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Roll Number or Email already exists.",
      });
    }

    // -------- INSERT NEW STUDENT --------
    await client.execute({
      sql: `
        INSERT INTO Students 
        (RollNumber, Name, Email, Phone, Password, Year, Semester, Department, College, Status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active');
      `,
      args: [
        rollNumber,
        name,
        email,
        phone,
        hashedPassword,
        year,
        semester,
        department,
        college,
      ],
    });

    return res.status(200).json({
      success: true,
      message: "Registration successful!",
    });
  } catch (error) {
    console.error("Turso Register Error:", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: "Server error. Try again.",
    });
  }
}
