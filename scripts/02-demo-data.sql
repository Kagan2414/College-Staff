-- Clear existing data (optional - comment out if you want to keep existing data)
-- TRUNCATE TABLE schedule_assignments, attendance, leave_requests, timetables, staff, access_logs, session, users RESTART IDENTITY CASCADE;

-- Insert demo admin user
-- Password: Demo@123456
-- The hash below is generated using: bcrypt.hash('Demo@123456', 10)
INSERT INTO users (email, password_hash, role, is_active)
VALUES ('admin@college.edu', '$2b$10$As6D/SkpRlZyRbiegCsrsuycF5w9u29V6yBBorPa8tkNlDkyn5exe', 'admin', true)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Insert demo staff user  
-- Password: Demo@123456
INSERT INTO users (email, password_hash, role, is_active)
VALUES ('staff1@college.edu', '$2b$10$bwGQsQc8ASuMS9W867Ctoe.1E81bxmaA1.4YPaVVH9EXuvt8IB.2a', 'staff', true)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Insert demo staff member
INSERT INTO staff (user_id, name, email, department, phone, qualification, hire_date, is_active)
SELECT u.id, 'John Doe', u.email, 'Computer Science', '9876543210', 'M.Tech', '2022-01-15', true
FROM users u WHERE u.email = 'staff1@college.edu'
ON CONFLICT (user_id) DO UPDATE SET 
  name = EXCLUDED.name,
  department = EXCLUDED.department,
  phone = EXCLUDED.phone,
  qualification = EXCLUDED.qualification,
  hire_date = EXCLUDED.hire_date;

-- Insert sample timetables
INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
SELECT s.id, 'Data Structures', 'CS101', 'I', '09:00', '10:30', 'Room 101', 'B1', '3', true
FROM staff s WHERE s.name = 'John Doe'
ON CONFLICT DO NOTHING;

INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
SELECT s.id, 'Data Structures', 'CS101', 'II', '09:00', '10:30', 'Room 101', 'B1', '3', true
FROM staff s WHERE s.name = 'John Doe'
ON CONFLICT DO NOTHING;

INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
SELECT s.id, 'Data Structures', 'CS101', 'III ', '09:00', '10:30', 'Room 101', 'B1', '3', true
FROM staff s WHERE s.name = 'John Doe'
ON CONFLICT DO NOTHING;

INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
SELECT s.id, 'Algorithms', 'CS201', 'IV', '11:00', '12:30', 'Room 102', 'B2', '4', true
FROM staff s WHERE s.name = 'John Doe'
ON CONFLICT DO NOTHING;

INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
SELECT s.id, 'Algorithms', 'CS201', 'V', '11:00', '12:30', 'Room 102', 'B2', '4', true
FROM staff s WHERE s.name = 'John Doe'
ON CONFLICT DO NOTHING;