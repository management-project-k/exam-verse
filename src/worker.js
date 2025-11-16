// s

// Hash password with SHA-256 using Web Crypto API
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Simple health check
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("Exam Verse registration API is running");
    }

    // Student registration endpoint
    if (request.method === "POST" && url.pathname === "/api/register-student") {
      return handleRegister(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleRegister(request, env) {
  let data;
  try {
    data = await request.json();
  } catch (e) {
    return jsonResponse({ success: false, message: "Invalid JSON body" }, 400);
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
  } = data;

  const errors = [];

  // Server-side validation (mirrors client, but trusted)
  if (!rollNumber || rollNumber.trim().length < 3) {
    errors.push("Roll number is required and must be at least 3 characters.");
  }

  if (!name || name.trim().length < 3) {
    errors.push("Name is required and must be at least 3 characters.");
  }

  if (!email || !email.includes("@")) {
    errors.push("Valid email is required.");
  }

  if (!phone || !/^[0-9]{10}$/.test(phone)) {
    errors.push("Phone must be a 10-digit number.");
  }

  if (!year || year < 1 || year > 3) {
    errors.push("Year of study is invalid.");
  }

  if (!semester || semester < 1 || semester > 6) {
    errors.push("Semester is invalid.");
  }

  if (!department) {
    errors.push("Department is required.");
  }

  if (!college) {
    errors.push("College is required.");
  }

  if (!password || password.length < 6) {
    errors.push("Password must be at least 6 characters.");
  }

  if (password !== confirmPassword) {
    errors.push("Passwords do not match.");
  }

  if (errors.length > 0) {
    return jsonResponse(
      { success: false, message: errors.join(" ") },
      400
    );
  }

  const db = env.EXAMVERSE_DB;

  // Check duplicate roll number or email
  const existing = await db
    .prepare(
      `
      SELECT roll_number, email
      FROM students
      WHERE roll_number = ? OR email = ?
    `
    )
    .bind(rollNumber, email)
    .all();

  if (existing.results && existing.results.length > 0) {
    const existsRoll = existing.results.some(
      (r) => r.roll_number === rollNumber
    );
    const existsEmail = existing.results.some((r) => r.email === email);

    let msg = "Student already registered with ";
    if (existsRoll && existsEmail) msg += "this roll number and email.";
    else if (existsRoll) msg += "this roll number.";
    else msg += "this email.";

    return jsonResponse({ success: false, message: msg }, 409);
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Insert student
  const insert = await db
    .prepare(
      `
      INSERT INTO students (
        roll_number, name, email, phone, year, semester,
        department, college, password_hash, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `
    )
    .bind(
      rollNumber,
      name,
      email,
      phone,
      year,
      semester,
      department,
      college,
      passwordHash
    )
    .run();

  return jsonResponse({
    success: true,
    message: "Registration successful. Pending admin approval.",
    studentId: insert.meta.last_row_id,
  });
}
