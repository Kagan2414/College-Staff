-- Create database tables for the college scheduling system

-- Users table (admins and staff)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'staff')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Staff details table
CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  department VARCHAR(255),
  phone VARCHAR(20),
  qualification VARCHAR(255),
  employment_type VARCHAR(50) DEFAULT 'Full-time',
  hire_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Timetable/Schedule table
CREATE TABLE IF NOT EXISTS timetables (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL,
  course_name VARCHAR(255) NOT NULL,
  course_code VARCHAR(50),
  day_of_week VARCHAR(20) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  classroom VARCHAR(100),
  batch VARCHAR(100),
  semester VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

-- Leave requests table
CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL,
  leave_type VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Attendance/Presence table
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL,
  date DATE NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'leave', 'half-day')),
  check_in_time TIME,
  check_out_time TIME,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  UNIQUE(staff_id, date)
);

-- Access logs table
CREATE TABLE IF NOT EXISTS access_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  login_time TIMESTAMP NOT NULL,
  logout_time TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  is_successful BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Schedule assignments table (for automatic rescheduling)
CREATE TABLE IF NOT EXISTS schedule_assignments (
  id SERIAL PRIMARY KEY,
  original_timetable_id INTEGER NOT NULL,
  original_staff_id INTEGER NOT NULL,
  assigned_staff_id INTEGER,
  leave_request_id INTEGER,
  scheduled_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (original_timetable_id) REFERENCES timetables(id),
  FOREIGN KEY (original_staff_id) REFERENCES staff(id),
  FOREIGN KEY (assigned_staff_id) REFERENCES staff(id),
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);
CREATE INDEX IF NOT EXISTS idx_timetables_staff_id ON timetables(staff_id);
CREATE INDEX IF NOT EXISTS idx_timetables_day ON timetables(day_of_week);
CREATE INDEX IF NOT EXISTS idx_leave_requests_staff_id ON leave_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_attendance_staff_id ON attendance(staff_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_login_time ON access_logs(login_time);


CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");
