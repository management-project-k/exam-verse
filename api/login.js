import { createClient } from "@turso/database";
import crypto from "crypto";

const client = createClient({
  url: "libsql://exam-verse-3-tfixcom.aws-ap-south-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjMxMDgwNjYsImlkIjoiZjQyMzM4ODktMThiNC00ZTNhLWI0ODQtZjc1ZDlhN2E4ZTgwIiwicmlkIjoiYTYxNDI5MjktZGExZS00NDkxLTliNTQtYWIxNTRmYWEzNjU1In0.hZ-HEKLDUehJXmtlJjK0L8wAvYem49Nd1EQABPnjbV5wd7kVsdL9hJMLNuA8i4FiIDJzQclzrCmfYJWXiyGeBQ"
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { rollNumber, password } = req.body;

  if (!rollNumber || !password) {
    return res.status(400).json({ success: false, message: "Roll number and password required" });
  }

  try {
    // Fetch user
    const result = await client.execute({
      sql: `
        SELECT RollNumber, Name, Email, Password, Year, Semester, Department 
        FROM Students 
        WHERE RollNumber = ? AND Status = 'active'
      `,
      args: [rollNumber]
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid roll number or password" });
    }

    const user = result.rows[0];

    // Compare password (SHA256 hashed)
    const inputHash = crypto.createHash("sha256").update(password).digest("hex").toUpperCase();

    if (inputHash !== user.Password) {
      return res.status(401).json({ success: false, message: "Invalid roll number or password" });
    }

    delete user.Password;

    res.status(200).json({
      success: true,
      data: { student: user }
    });
  } catch (error) {
    console.error("Turso Login Error:", error.message);
    res.status(500).json({
      success: false,
      message: "DB connection failed. Try again."
    });
  }
}
