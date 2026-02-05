const express = require("express")
const session = require("express-session")
const pgSession = require("connect-pg-simple")(session)
const { Pool } = require("pg")
const bcrypt = require("bcryptjs")
const path = require("path")
const cookieParser = require("cookie-parser")
require("dotenv").config()

const app = express()
const port = process.env.PORT || 3000

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
})

// Middleware
app.use(express.static(path.join(__dirname, "public")))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
// Trust the proxy (Render / other platforms) so secure cookies work
app.set("trust proxy", 1)
app.get("/", (req, res) => {
  res.redirect("/login.html")
})


// Session configuration
app.use(
  session({
    store: new pgSession({
      // use the existing pg Pool so the session store shares connections
      pool: pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    // When behind a proxy (like Render) enable proxy so secure cookies are set correctly
    proxy: process.env.NODE_ENV === 'production',
    cookie: {
      // 24 hours
      maxAge: 24 * 60 * 60 * 1000,
      // require HTTPS in production
      secure: process.env.NODE_ENV === 'production',
      // keep default 'lax' for same-site; change to 'none' only if serving cross-site
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax',
    },
  })
);


// Middleware: Authentication check
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next()
  } else {
    res.redirect("/login.html")
  }
}

// Middleware: Role-based access control
const hasRole = (role) => {
  return (req, res, next) => {
    if (req.session.role === role) {
      next()
    } else {
      res.status(403).json({ error: "Forbidden: Insufficient permissions" })
    }
  }
}

// Helper: Log access
const logAccess = async (userId, isSuccessful, ipAddress, userAgent) => {
  try {
    await pool.query(
      "INSERT INTO access_logs (user_id, login_time, ip_address, user_agent, is_successful) VALUES ($1, NOW(), $2, $3, $4)",
      [userId, ipAddress, userAgent, isSuccessful],
    )
  } catch (error) {
    console.error("Error logging access:", error)
  }
}

// ===================== AUTHENTICATION ROUTES =====================

// Login route
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" })
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email])

    if (result.rows.length === 0) {
      logAccess(null, false, req.ip, req.get("user-agent"))
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const user = result.rows[0]
    const passwordMatch = await bcrypt.compare(password, user.password_hash)

    if (!passwordMatch) {
      logAccess(user.id, false, req.ip, req.get("user-agent"))
      return res.status(401).json({ error: "Invalid credentials" })
    }

    if (!user.is_active) {
      return res.status(401).json({ error: "Account is inactive" })
    }

    // Set session
    req.session.userId = user.id
    req.session.email = user.email
    req.session.role = user.role

    logAccess(user.id, true, req.ip, req.get("user-agent"))

    // Redirect based on role
    const redirectUrl = user.role === "admin" ? "/admin-dashboard.html" : "/staff-dashboard.html"
    res.json({ success: true, redirectUrl })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// Logout route
app.post("/api/auth/logout", (req, res) => {
  if (req.session.userId) {
    pool
      .query(
        "UPDATE access_logs SET logout_time = NOW() WHERE id = (SELECT id FROM access_logs WHERE user_id = $1 ORDER BY login_time DESC LIMIT 1)",
        [req.session.userId],
      )
      .catch((err) => console.error("Error updating logout time:", err))
  }

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" })
    }
    res.json({ success: true })
  })
})

// Session check
app.get("/api/auth/session", (req, res) => {
  if (req.session.userId) {
    res.json({
      authenticated: true,
      userId: req.session.userId,
      email: req.session.email,
      role: req.session.role,
    })
  } else {
    res.json({ authenticated: false })
  }
})

// ===================== STAFF MANAGEMENT (ADMIN) =====================

// Get all staff
app.get("/api/staff", isAuthenticated, hasRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT s.*, u.email FROM staff s JOIN users u ON s.user_id = u.id WHERE s.is_active = true ORDER BY s.name",
    )
    res.json(result.rows)
  } catch (error) {
    console.error("Error fetching staff:", error)
    res.status(500).json({ error: "Failed to fetch staff" })
  }
})

// Get staff by ID
app.get("/api/staff/:id", isAuthenticated, hasRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT s.*, u.email FROM staff s JOIN users u ON s.user_id = u.id WHERE s.id = $1",
      [req.params.id],
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Staff not found" })
    }
    res.json(result.rows[0])
  } catch (error) {
    console.error("Error fetching staff:", error)
    res.status(500).json({ error: "Failed to fetch staff" })
  }
})

// Add new staff
app.post("/api/staff", isAuthenticated, hasRole("admin"), async (req, res) => {
  const { name, email, password, department, phone, qualification, hire_date } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Create user account
    const passwordHash = await bcrypt.hash(password, 10)
    const userResult = await client.query(
      "INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, $3, true) RETURNING id",
      [email, passwordHash, "staff"],
    )

    const userId = userResult.rows[0].id

    // Create staff record
    const staffResult = await client.query(
      `INSERT INTO staff (user_id, name, email, department, phone, qualification, hire_date, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *`,
      [userId, name, email, department, phone, qualification, hire_date],
    )

    await client.query("COMMIT")
    res.status(201).json(staffResult.rows[0])
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Error adding staff:", error)
    if (error.code === "23505") {
      res.status(400).json({ error: "Email already exists" })
    } else {
      res.status(500).json({ error: "Failed to add staff" })
    }
  } finally {
    client.release()
  }
})

// Update staff
app.put("/api/staff/:id", isAuthenticated, hasRole("admin"), async (req, res) => {
  const { name, department, phone, qualification, hire_date } = req.body

  try {
    const result = await pool.query(
      `UPDATE staff SET name = $1, department = $2, phone = $3, qualification = $4, hire_date = $5, updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, department, phone, qualification, hire_date, req.params.id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Staff not found" })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error("Error updating staff:", error)
    res.status(500).json({ error: "Failed to update staff" })
  }
})

// Delete/Deactivate staff
app.delete("/api/staff/:id", isAuthenticated, hasRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE staff SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Staff not found" })
    }

    res.json({ success: true, message: "Staff member deactivated" })
  } catch (error) {
    console.error("Error deleting staff:", error)
    res.status(500).json({ error: "Failed to delete staff" })
  }
})

// Get staff count
app.get("/api/stats/staff-count", isAuthenticated, hasRole("admin"), async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) as count FROM staff WHERE is_active = true")
    res.json({ total_staff: Number.parseInt(result.rows[0].count) })
  } catch (error) {
    console.error("Error fetching staff count:", error)
    res.status(500).json({ error: "Failed to fetch staff count" })
  }
})

// Get currently logged in staff count
app.get("/api/stats/logged-in-staff", isAuthenticated, hasRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(DISTINCT al.user_id) as count
       FROM access_logs al
       JOIN users u ON al.user_id = u.id
       WHERE u.role = 'staff' AND al.logout_time IS NULL`,
    )
    res.json({ logged_in_staff: Number.parseInt(result.rows[0].count) })
  } catch (error) {
    console.error("Error fetching logged-in count:", error)
    res.status(500).json({ error: "Failed to fetch logged-in count" })
  }
})

// ===================== TIMETABLE MANAGEMENT =====================

// Get all timetables
app.get("/api/timetables", isAuthenticated, async (req, res) => {
  try {
    let query = "SELECT t.*, s.name FROM timetables t JOIN staff s ON t.staff_id = s.id WHERE t.is_active = true"
    const params = []

    if (req.session.role === "staff") {
      const staffResult = await pool.query("SELECT id FROM staff WHERE user_id = $1", [req.session.userId])
      if (staffResult.rows.length === 0) {
        return res.status(403).json({ error: "Staff record not found" })
      }
      query += " AND t.staff_id = $1"
      params.push(staffResult.rows[0].id)
    }

    query += " ORDER BY t.day_of_week, t.start_time"
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (error) {
    console.error("Error fetching timetables:", error)
    res.status(500).json({ error: "Failed to fetch timetables" })
  }
})

// Add timetable entry
app.post("/api/timetables", isAuthenticated, hasRole("admin"), async (req, res) => {
  const { staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester } = req.body

  if (!staff_id || !course_name || !day_of_week || !start_time || !end_time) {
    return res.status(400).json({ error: "Required fields missing" })
  }

  try {
    const result = await pool.query(
      `INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true) RETURNING *`,
      [staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester],
    )
    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error("Error adding timetable:", error)
    res.status(500).json({ error: "Failed to add timetable entry" })
  }
})

// Update timetable entry
app.put("/api/timetables/:id", isAuthenticated, hasRole("admin"), async (req, res) => {
  const { staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester } = req.body

  try {
    const result = await pool.query(
      `UPDATE timetables SET staff_id = $1, course_name = $2, course_code = $3, day_of_week = $4, start_time = $5,
       end_time = $6, classroom = $7, batch = $8, semester = $9, updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [
        staff_id,
        course_name,
        course_code,
        day_of_week,
        start_time,
        end_time,
        classroom,
        batch,
        semester,
        req.params.id,
      ],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Timetable entry not found" })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error("Error updating timetable:", error)
    res.status(500).json({ error: "Failed to update timetable" })
  }
})

// Delete timetable entry
app.delete("/api/timetables/:id", isAuthenticated, hasRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE timetables SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Timetable entry not found" })
    }

    res.json({ success: true, message: "Timetable entry deleted" })
  } catch (error) {
    console.error("Error deleting timetable:", error)
    res.status(500).json({ error: "Failed to delete timetable" })
  }
})

// ===================== LEAVE & ATTENDANCE MANAGEMENT =====================

// Request leave
app.post("/api/leave-request", isAuthenticated, async (req, res) => {
  const { start_date, end_date, leave_type, reason } = req.body

  if (!start_date || !end_date || !leave_type) {
    return res.status(400).json({ error: "Required fields missing" })
  }

  const client = await pool.connect()
  try {
    // Get staff ID
    const staffResult = await client.query("SELECT id FROM staff WHERE user_id = $1", [req.session.userId])
    if (staffResult.rows.length === 0) {
      return res.status(403).json({ error: "Staff record not found" })
    }

    const staffId = staffResult.rows[0].id

    await client.query("BEGIN")

    // Create leave request
    const leaveResult = await client.query(
      `INSERT INTO leave_requests (staff_id, leave_type, start_date, end_date, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [staffId, leave_type, start_date, end_date, reason],
    )

    const leaveId = leaveResult.rows[0].id

    // Trigger automatic rescheduling
    await autoRescheduleClasses(client, staffId, start_date, end_date, leaveId)

    await client.query("COMMIT")
    res.status(201).json(leaveResult.rows[0])
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Error creating leave request:", error)
    res.status(500).json({ error: "Failed to create leave request" })
  } finally {
    client.release()
  }
})

// Approve leave
app.post("/api/leave-request/:id/approve", isAuthenticated, hasRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE leave_requests SET status = $1, approved_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
      ["approved", req.session.userId, req.params.id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Leave request not found" })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error("Error approving leave:", error)
    res.status(500).json({ error: "Failed to approve leave" })
  }
})

// Reject leave
app.post("/api/leave-request/:id/reject", isAuthenticated, hasRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE leave_requests SET status = $1, approved_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
      ["rejected", req.session.userId, req.params.id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Leave request not found" })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error("Error rejecting leave:", error)
    res.status(500).json({ error: "Failed to reject leave" })
  }
})

// Get leave requests
app.get("/api/leave-requests", isAuthenticated, async (req, res) => {
  try {
    let query = "SELECT lr.*, s.name FROM leave_requests lr JOIN staff s ON lr.staff_id = s.id"
    const params = []

    if (req.session.role === "staff") {
      const staffResult = await pool.query("SELECT id FROM staff WHERE user_id = $1", [req.session.userId])
      if (staffResult.rows.length === 0) {
        return res.status(403).json({ error: "Staff record not found" })
      }
      query += " WHERE lr.staff_id = $1"
      params.push(staffResult.rows[0].id)
    }

    query += " ORDER BY lr.created_at DESC"
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (error) {
    console.error("Error fetching leave requests:", error)
    res.status(500).json({ error: "Failed to fetch leave requests" })
  }
})

// Mark attendance
app.post("/api/attendance", isAuthenticated, async (req, res) => {
  const { date, status } = req.body

  if (!date || !status) {
    return res.status(400).json({ error: "Date and status are required" })
  }

  try {
    const staffResult = await pool.query("SELECT id FROM staff WHERE user_id = $1", [req.session.userId])
    if (staffResult.rows.length === 0) {
      return res.status(403).json({ error: "Staff record not found" })
    }

    const staffId = staffResult.rows[0].id
    const now = new Date()
    const checkInTime = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`

    const result = await pool.query(
      `INSERT INTO attendance (staff_id, date, status, check_in_time)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (staff_id, date) DO UPDATE SET status = $3, check_in_time = $4
       RETURNING *`,
      [staffId, date, status, checkInTime],
    )

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error("Error marking attendance:", error)
    res.status(500).json({ error: "Failed to mark attendance" })
  }
})

// Get attendance
app.get("/api/attendance", isAuthenticated, async (req, res) => {
  try {
    let query = "SELECT a.*, s.name FROM attendance a JOIN staff s ON a.staff_id = s.id"
    const params = []

    if (req.session.role === "staff") {
      const staffResult = await pool.query("SELECT id FROM staff WHERE user_id = $1", [req.session.userId])
      if (staffResult.rows.length === 0) {
        return res.status(403).json({ error: "Staff record not found" })
      }
      query += " WHERE a.staff_id = $1"
      params.push(staffResult.rows[0].id)
    }

    query += " ORDER BY a.date DESC"
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (error) {
    console.error("Error fetching attendance:", error)
    res.status(500).json({ error: "Failed to fetch attendance" })
  }
})

// Add these routes to your server.js file

// ===================== ENHANCED ATTENDANCE MANAGEMENT =====================

// Mark attendance (Enhanced with validation)
app.post("/api/attendance", isAuthenticated, async (req, res) => {
  const { date, status } = req.body

  if (!date || !status) {
    return res.status(400).json({ error: "Date and status are required" })
  }

  try {
    // Validate date is today
    const today = new Date().toISOString().split('T')[0]
    if (date !== today) {
      return res.status(400).json({ error: "You can only mark attendance for today" })
    }

    // Check cut-off time (10:00 AM)
    const now = new Date()
    const cutoffTime = new Date()
    cutoffTime.setHours(10, 0, 0, 0)
    
    if (now > cutoffTime && status === 'present') {
      return res.status(400).json({ error: "Attendance marking closed. Cut-off time is 10:00 AM" })
    }

    const staffResult = await pool.query("SELECT id FROM staff WHERE user_id = $1", [req.session.userId])
    if (staffResult.rows.length === 0) {
      return res.status(403).json({ error: "Staff record not found" })
    }

    const staffId = staffResult.rows[0].id

    // Check if already marked present
    const existing = await pool.query(
      "SELECT * FROM attendance WHERE staff_id = $1 AND date = $2",
      [staffId, date]
    )

    if (existing.rows.length > 0 && existing.rows[0].status === 'present') {
      return res.status(400).json({ error: "Attendance already marked as present and cannot be changed" })
    }

    // Check for approved leave
    const leaveCheck = await pool.query(
      `SELECT * FROM leave_requests 
       WHERE staff_id = $1 
       AND status = 'approved' 
       AND $2 BETWEEN start_date AND end_date`,
      [staffId, date]
    )

    if (leaveCheck.rows.length > 0) {
      const leave = leaveCheck.rows[0]
      const leaveStatus = leave.leave_type === 'full_day' ? 'leave' : 'half-day'
      
      // Auto set attendance based on leave
      const checkInTime = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      
      const result = await pool.query(
        `INSERT INTO attendance (staff_id, date, status, check_in_time, leave_session, is_locked)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (staff_id, date) DO UPDATE 
         SET status = $3, check_in_time = $4, leave_session = $5, is_locked = true
         RETURNING *`,
        [staffId, date, leaveStatus, checkInTime, leave.session || null]
      )
      
      return res.json({ ...result.rows[0], message: "Attendance auto-set based on approved leave" })
    }

    const checkInTime = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    const isLocked = status === 'present'

    const result = await pool.query(
      `INSERT INTO attendance (staff_id, date, status, check_in_time, is_locked)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (staff_id, date) DO UPDATE 
       SET status = $3, check_in_time = $4, is_locked = $5
       RETURNING *`,
      [staffId, date, status, checkInTime, isLocked]
    )

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, details, created_at)
       VALUES ($1, 'attendance_marked', $2, NOW())`,
      [req.session.userId, JSON.stringify({ date, status })]
    )

    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error("Error marking attendance:", error)
    res.status(500).json({ error: "Failed to mark attendance" })
  }
})

// Admin override attendance
app.post("/api/attendance/:id/override", isAuthenticated, hasRole("admin"), async (req, res) => {
  const { status, reason } = req.body
  
  try {
    const result = await pool.query(
      `UPDATE attendance 
       SET status = $1, override_reason = $2, overridden_by = $3, is_locked = false, updated_at = NOW()
       WHERE id = $4 
       RETURNING *`,
      [status, reason, req.session.userId, req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Attendance record not found" })
    }

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, details, created_at)
       VALUES ($1, 'attendance_override', $2, NOW())`,
      [req.session.userId, JSON.stringify({ attendance_id: req.params.id, status, reason })]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error("Error overriding attendance:", error)
    res.status(500).json({ error: "Failed to override attendance" })
  }
})

// ===================== ENHANCED LEAVE MANAGEMENT =====================

// Request leave (Enhanced with Half Day support)
app.post("/api/leave-request", isAuthenticated, async (req, res) => {
  const { start_date, end_date, leave_type, session, reason, emergency_contact } = req.body

  if (!start_date || !end_date || !leave_type) {
    return res.status(400).json({ error: "Required fields missing" })
  }

  // Validate session for half day
  if (leave_type === 'half_day' && !session) {
    return res.status(400).json({ error: "Session (FN/AN) required for half day leave" })
  }

  const client = await pool.connect()
  try {
    const staffResult = await client.query("SELECT id FROM staff WHERE user_id = $1", [req.session.userId])
    if (staffResult.rows.length === 0) {
      return res.status(403).json({ error: "Staff record not found" })
    }

    const staffId = staffResult.rows[0].id

    await client.query("BEGIN")

    // Create leave request
    const leaveResult = await client.query(
      `INSERT INTO leave_requests 
       (staff_id, leave_type, start_date, end_date, session, reason, emergency_contact, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') 
       RETURNING *`,
      [staffId, leave_type, start_date, end_date, session, reason, emergency_contact]
    )

    // Log activity
    await client.query(
      `INSERT INTO activity_logs (user_id, action, details, created_at)
       VALUES ($1, 'leave_requested', $2, NOW())`,
      [req.session.userId, JSON.stringify({ leave_id: leaveResult.rows[0].id, leave_type, start_date, end_date })]
    )

    await client.query("COMMIT")
    res.status(201).json(leaveResult.rows[0])
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Error creating leave request:", error)
    res.status(500).json({ error: "Failed to create leave request" })
  } finally {
    client.release()
  }
})

// Approve leave with replacement assignment
app.post("/api/leave-request/:id/approve", isAuthenticated, hasRole("admin"), async (req, res) => {
  const { replacement_staff_id, admin_comments } = req.body
  
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Get leave details
    const leaveResult = await client.query(
      "SELECT * FROM leave_requests WHERE id = $1",
      [req.params.id]
    )

    if (leaveResult.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Leave request not found" })
    }

    const leave = leaveResult.rows[0]

    // Update leave status
    const updateResult = await client.query(
      `UPDATE leave_requests 
       SET status = 'approved', approved_by = $1, admin_comments = $2, updated_at = NOW() 
       WHERE id = $3 
       RETURNING *`,
      [req.session.userId, admin_comments, req.params.id]
    )

    // Auto-update attendance
    const startDate = new Date(leave.start_date)
    const endDate = new Date(leave.end_date)
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]
      const attendanceStatus = leave.leave_type === 'full_day' ? 'leave' : 'half-day'
      
      await client.query(
        `INSERT INTO attendance (staff_id, date, status, leave_session, is_locked)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (staff_id, date) DO UPDATE 
         SET status = $3, leave_session = $4, is_locked = true`,
        [leave.staff_id, dateStr, attendanceStatus, leave.session]
      )
    }

    // Create replacement assignments if provided
    if (replacement_staff_id) {
      const timetables = await client.query(
        `SELECT * FROM timetables WHERE staff_id = $1 AND is_active = true`,
        [leave.staff_id]
      )

      for (const t of timetables.rows) {
        // For half day, only assign for specific session
        if (leave.leave_type === 'half_day') {
          // Check if class time matches session
          const classHour = parseInt(t.start_time.split(':')[0])
          const isAM = classHour < 12
          
          if ((leave.session === 'FN' && isAM) || (leave.session === 'AN' && !isAM)) {
            await client.query(
              `INSERT INTO schedule_assignments
               (timetable_id, original_staff_id, replacement_staff_id, scheduled_date, session, status)
               VALUES ($1, $2, $3, $4, $5, 'pending')`,
              [t.id, leave.staff_id, replacement_staff_id, leave.start_date, leave.session]
            )
          }
        } else {
          // Full day assignment
          await client.query(
            `INSERT INTO schedule_assignments
             (original_timetable_id, original_staff_id, assigned_staff_id, scheduled_date, status)
             VALUES ($1, $2, $3, $4, 'pending')`,
            [t.id, leave.staff_id, replacement_staff_id, leave.start_date]
          )
        }
      }

      // Send notification to replacement staff
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, created_at)
         VALUES (
           (SELECT user_id FROM staff WHERE id = $1),
           'replacement_assigned',
           'New Class Assignment',
           $2,
           NOW()
         )`,
        [
          replacement_staff_id,
          `You have been assigned to cover classes on ${leave.start_date}${leave.leave_type === 'half_day' ? ` (${leave.session} session)` : ''}`
        ]
      )
    }

    // Send notification to staff
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message, created_at)
       VALUES ($1, 'leave_approved', 'Leave Request Approved', $2, NOW())`,
      [leave.staff_id, `Your ${leave.leave_type} leave from ${leave.start_date} to ${leave.end_date} has been approved.`]
    )

    // Log activity
    await client.query(
      `INSERT INTO activity_logs (user_id, action, details, created_at)
       VALUES ($1, 'leave_approved', $2, NOW())`,
      [req.session.userId, JSON.stringify({ leave_id: req.params.id, replacement_staff_id })]
    )

    await client.query("COMMIT")
    res.json(updateResult.rows[0])
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Error approving leave:", error)
    res.status(500).json({ error: "Failed to approve leave" })
  } finally {
    client.release()
  }
})

// Reject leave
app.post("/api/leave-request/:id/reject", isAuthenticated, hasRole("admin"), async (req, res) => {
  const { admin_comments } = req.body
  
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const result = await client.query(
      `UPDATE leave_requests 
       SET status = 'rejected', approved_by = $1, admin_comments = $2, updated_at = NOW() 
       WHERE id = $3 
       RETURNING *`,
      ["rejected", req.session.userId, admin_comments, req.params.id]
    )

    if (result.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Leave request not found" })
    }

    const leave = result.rows[0]

    // Send notification
    await client.query(
      `INSERT INTO notifications (user_id, type, title, message, created_at)
       VALUES (
         (SELECT user_id FROM staff WHERE id = $1),
         'leave_rejected',
         'Leave Request Rejected',
         $2,
         NOW()
       )`,
      [leave.staff_id, `Your leave request has been rejected. ${admin_comments || ''}`]
    )

    // Log activity
    await client.query(
      `INSERT INTO activity_logs (user_id, action, details, created_at)
       VALUES ($1, 'leave_rejected', $2, NOW())`,
      [req.session.userId, JSON.stringify({ leave_id: req.params.id })]
    )

    await client.query("COMMIT")
    res.json(result.rows[0])
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Error rejecting leave:", error)
    res.status(500).json({ error: "Failed to reject leave" })
  } finally {
    client.release()
  }
})

// Get available replacement staff
app.get("/api/replacement-staff/:leaveId", isAuthenticated, hasRole("admin"), async (req, res) => {
  try {
    const leaveResult = await pool.query(
      "SELECT * FROM leave_requests WHERE id = $1",
      [req.params.leaveId]
    )

    if (leaveResult.rows.length === 0) {
      return res.status(404).json({ error: "Leave request not found" })
    }

    const leave = leaveResult.rows[0]

    // Find staff with no conflicts
    const availableStaff = await pool.query(
      `SELECT s.id, s.name, s.department
       FROM staff s
       WHERE s.id != $1 
       AND s.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM leave_requests lr
         WHERE lr.staff_id = s.id
         AND lr.status = 'approved'
         AND $2 BETWEEN lr.start_date AND lr.end_date
       )
       AND NOT EXISTS (
         SELECT 1 FROM schedule_assignments sa
         WHERE sa.replacement_staff_id = s.id
         AND sa.scheduled_date = $2
         ${leave.session ? `AND sa.session = '${leave.session}'` : ''}
       )
       ORDER BY s.name`,
      [leave.staff_id, leave.start_date]
    )

    res.json(availableStaff.rows)
  } catch (error) {
    console.error("Error fetching replacement staff:", error)
    res.status(500).json({ error: "Failed to fetch replacement staff" })
  }
})

// ===================== NOTIFICATIONS =====================

// Get user notifications
app.get("/api/notifications", isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.session.userId]
    )
    res.json(result.rows)
  } catch (error) {
    console.error("Error fetching notifications:", error)
    res.status(500).json({ error: "Failed to fetch notifications" })
  }
})

// Mark notification as read
app.post("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2",
      [req.params.id, req.session.userId]
    )
    res.json({ success: true })
  } catch (error) {
    console.error("Error marking notification:", error)
    res.status(500).json({ error: "Failed to mark notification" })
  }
})

// ===================== ACTIVITY LOGS =====================

// Get activity logs (Enhanced)
app.get("/api/activity-logs-detailed", isAuthenticated, hasRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT al.*, u.email, u.role 
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC 
       LIMIT 500`
    )
    res.json(result.rows)
  } catch (error) {
    console.error("Error fetching activity logs:", error)
    res.status(500).json({ error: "Failed to fetch activity logs" })
  }
})

// ===================== ACCESS LOGS & MONITORING =====================

// Get access logs
app.get("/api/access-logs", isAuthenticated, hasRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT al.*, u.email, u.role FROM access_logs al
       JOIN users u ON al.user_id = u.id
       ORDER BY al.login_time DESC LIMIT 500`,
    )
    res.json(result.rows)
  } catch (error) {
    console.error("Error fetching access logs:", error)
    res.status(500).json({ error: "Failed to fetch access logs" })
  }
})

// ===================== ACTIVITY LOGS & MONITORING =====================

// Get activity logs (fixed version)
app.get("/api/activity-logs", isAuthenticated, hasRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT al.*, u.email, u.role 
       FROM access_logs al
       JOIN users u ON al.user_id = u.id
       ORDER BY al.login_time DESC 
       LIMIT 500`
    )
    res.json(result.rows)
  } catch (error) {
    console.error("Error fetching activity logs:", error)
    res.status(500).json({ error: "Failed to fetch activity logs" })
  }
})

// Get scheduled classes for staff
app.get("/api/scheduled-classes", isAuthenticated, async (req, res) => {
  try {
    let query = `
      SELECT 
        sa.id,
        sa.scheduled_date,
        sa.status,
        t.course_name,
        t.course_code,
        t.day_of_week,
        t.start_time,
        t.end_time,
        t.classroom,
        t.batch,
        s1.name AS original_staff,
        s2.name AS replacement_staff,
        sa.created_at
      FROM schedule_assignments sa
      JOIN timetables t ON sa.timetable_id = t.id
      JOIN staff s1 ON sa.original_staff_id = s1.id
      LEFT JOIN staff s2 ON sa.replacement_staff_id = s2.id
    `
    
    const params = []

    if (req.session.role === "staff") {
      const staffResult = await pool.query(
        "SELECT id FROM staff WHERE user_id = $1", 
        [req.session.userId]
      )
      
      if (staffResult.rows.length === 0) {
        return res.status(403).json({ error: "Staff record not found" })
      }
      
      query += " WHERE sa.replacement_staff_id = $1"
      params.push(staffResult.rows[0].id)
    }

    query += " ORDER BY sa.scheduled_date DESC, t.start_time ASC"
    
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (error) {
    console.error("Error fetching scheduled classes:", error)
    res.status(500).json({ error: "Failed to fetch scheduled classes" })
  }
})

// ===================== SCHEDULING & RESCHEDULING =====================

// Helper function: Automatic rescheduling algorithm
async function autoRescheduleClasses(client, staffId, startDate, endDate) {

  // 1. Get affected timetables
  const timetables = await client.query(
    `SELECT * FROM timetables WHERE staff_id = $1 AND is_active = true`,
    [staffId]
  )

  // 2. Find available replacement staff
  const replacement = await client.query(
    `SELECT id FROM staff WHERE id != $1 AND is_active = true LIMIT 1`,
    [staffId]
  )

  if (replacement.rows.length === 0) return

  const replacementStaffId = replacement.rows[0].id

  // 3. Create schedule assignments
  for (const t of timetables.rows) {
    await client.query(
      `
      INSERT INTO schedule_assignments
      (original_timetable_id, original_staff_id, replacement_staff_id, scheduled_date, status)
      VALUES ($1, $2, $3, $4, 'pending')
      `,
      [t.id, staffId, replacementStaffId, startDate]
    )
  }
}

// Get schedule assignments
app.get('/api/schedule-assignments', isAuthenticated, hasRole('admin'), async (req, res) => {
  try {
    const { start, end } = req.query
    const endDate = end ? end : new Date().toISOString().split('T')[0]
    const startDate = start
      ? start
      : (() => {
          const d = new Date()
          d.setDate(d.getDate() - 7)
          return d.toISOString().split('T')[0]
        })()

    const params = [startDate, endDate]

    const result = await pool.query(`
       SELECT sa.*, t.day_of_week, t.start_time AS period_start, t.end_time AS period_end,
         s1.name AS original_staff,
         s2.name AS assigned_staff
  FROM schedule_assignments sa
  JOIN timetables t ON sa.original_timetable_id = t.id
  JOIN staff s1 ON sa.original_staff_id = s1.id
  LEFT JOIN staff s2 ON sa.assigned_staff_id = s2.id
  WHERE sa.scheduled_date BETWEEN $1 AND $2
  ORDER BY sa.scheduled_date DESC, t.start_time ASC
    `, params)

    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load schedule assignments' })
  }
})


// Override schedule assignment
app.post(
  "/api/schedule-assignments/:id/override",
  isAuthenticated,
  hasRole("admin"),
  async (req, res) => {
    const { replacement_staff_id } = req.body
    const assignmentId = req.params.id

    if (!replacement_staff_id) {
      return res.status(400).json({ error: "Replacement staff required" })
    }

    try {
      const result = await pool.query(
        `
        UPDATE schedule_assignments
        SET replacement_staff_id = $1,
            status = 'overridden',
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
        `,
        [replacement_staff_id, assignmentId]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Assignment not found" })
      }

      res.json(result.rows[0])
    } catch (err) {
      console.error("Override error:", err)
      res.status(500).json({ error: "Failed to override assignment" })
    }
  }
)


// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unexpected error:", err)
  res.status(500).json({ error: "Internal server error" })
})

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`)
  console.log(`Admin login: http://localhost:${port}/login.html`)
})

module.exports = app
