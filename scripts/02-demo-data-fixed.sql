-- Demo data: admin + 10 staff users and staff records
-- NOTE: Replace the password_hash values with bcrypt hashes generated in your environment if needed.

-- Admin user
INSERT INTO users (email, password_hash, role, is_active)
VALUES ('admin@college.edu', '$2b$10$As6D/SkpRlZyRbiegCsrsuycF5w9u29V6yBBorPa8tkNlDkyn5exe', 'admin', true)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Create 10 staff user accounts
INSERT INTO users (email, password_hash, role, is_active)
VALUES
('staff1@college.edu', '$2b$10$bwGQsQc8ASuMS9W867Ctoe.1E81bxmaA1.4YPaVVH9EXuvt8IB.2a', 'staff', true),
('staff2@college.edu', '$2b$10$bwGQsQc8ASuMS9W867Ctoe.1E81bxmaA1.4YPaVVH9EXuvt8IB.2a', 'staff', true),
('staff3@college.edu', '$2b$10$bwGQsQc8ASuMS9W867Ctoe.1E81bxmaA1.4YPaVVH9EXuvt8IB.2a', 'staff', true),
('staff4@college.edu', '$2b$10$bwGQsQc8ASuMS9W867Ctoe.1E81bxmaA1.4YPaVVH9EXuvt8IB.2a', 'staff', true),
('staff5@college.edu', '$2b$10$bwGQsQc8ASuMS9W867Ctoe.1E81bxmaA1.4YPaVVH9EXuvt8IB.2a', 'staff', true),
('staff6@college.edu', '$2b$10$bwGQsQc8ASuMS9W867Ctoe.1E81bxmaA1.4YPaVVH9EXuvt8IB.2a', 'staff', true),
('staff7@college.edu', '$2b$10$bwGQsQc8ASuMS9W867Ctoe.1E81bxmaA1.4YPaVVH9EXuvt8IB.2a', 'staff', true),
('staff8@college.edu', '$2b$10$bwGQsQc8ASuMS9W867Ctoe.1E81bxmaA1.4YPaVVH9EXuvt8IB.2a', 'staff', true),
('staff9@college.edu', '$2b$10$bwGQsQc8ASuMS9W867Ctoe.1E81bxmaA1.4YPaVVH9EXuvt8IB.2a', 'staff', true),
('staff10@college.edu', '$2b$10$bwGQsQc8ASuMS9W867Ctoe.1E81bxmaA1.4YPaVVH9EXuvt8IB.2a', 'staff', true)
ON CONFLICT (email) DO NOTHING;

-- Insert staff profile rows linking to the users by email
INSERT INTO staff (user_id, name, email, department, phone, qualification, hire_date, is_active)
SELECT u.id, s.name, u.email, s.department, s.phone, s.qualification, s.hire_date, true
FROM (VALUES
  ('John Doe', 'Computer Science', '9876543210', 'M.Tech', '2022-01-15', 'staff1@college.edu'),
  ('Emma Smith', 'Mathematics', '9876543211', 'M.Sc', '2021-06-01', 'staff2@college.edu'),
  ('Liam Johnson', 'Physics', '9876543212', 'Ph.D', '2020-09-10', 'staff3@college.edu'),
  ('Olivia Brown', 'Chemistry', '9876543213', 'M.Sc', '2019-03-20', 'staff4@college.edu'),
  ('Noah Davis', 'English', '9876543214', 'M.A', '2018-11-05', 'staff5@college.edu'),
  ('Ava Wilson', 'Biology', '9876543215', 'M.Sc', '2022-05-12', 'staff6@college.edu'),
  ('William Martinez', 'Computer Science', '9876543216', 'M.Tech', '2017-08-18', 'staff7@college.edu'),
  ('Sophia Garcia', 'Mathematics', '9876543217', 'M.Sc', '2020-02-25', 'staff8@college.edu'),
  ('James Miller', 'Physics', '9876543218', 'M.Sc', '2016-07-30', 'staff9@college.edu'),
  ('Isabella Rodriguez', 'Chemistry', '9876543219', 'Ph.D', '2015-12-01', 'staff10@college.edu'
) AS s(name, department, phone, qualification, hire_date, email)
JOIN users u ON u.email = s.email
ON CONFLICT (user_id) DO UPDATE SET
  name = EXCLUDED.name,
  department = EXCLUDED.department,
  phone = EXCLUDED.phone,
  qualification = EXCLUDED.qualification,
  hire_date = EXCLUDED.hire_date;


-- Sample timetables using Roman numerals for day_of_week
INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
SELECT s.id, 'Data Structures', 'CS101', 'I', '09:00', '10:30', 'Room 101', 'B1', '3', true FROM staff s WHERE s.name = 'John Doe' LIMIT 1;

INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
SELECT s.id, 'Algorithms', 'CS201', 'II', '11:00', '12:30', 'Room 102', 'B2', '4', true FROM staff s WHERE s.name = 'William Martinez' LIMIT 1;

INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
SELECT s.id, 'Calculus I', 'MA101', 'III', '10:00', '11:30', 'Room 201', 'B1', '1', true FROM staff s WHERE s.name = 'Emma Smith' LIMIT 1;

INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
SELECT s.id, 'Physics I', 'PH101', 'IV', '08:00', '09:30', 'Room 301', 'B3', '1', true FROM staff s WHERE s.name = 'Liam Johnson' LIMIT 1;

INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
SELECT s.id, 'Organic Chemistry', 'CH201', 'V', '13:00', '14:30', 'Lab 1', 'B2', '2', true FROM staff s WHERE s.name = 'Olivia Brown' LIMIT 1;

-- Additional entries
INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
SELECT s.id, 'English Literature', 'EN101', 'I', '14:30', '16:00', 'Room 105', 'B4', '2', true FROM staff s WHERE s.name = 'Noah Davis' LIMIT 1;

INSERT INTO timetables (staff_id, course_name, course_code, day_of_week, start_time, end_time, classroom, batch, semester, is_active)
SELECT s.id, 'Microbiology', 'BI201', 'II', '09:00', '10:30', 'Lab 2', 'B2', '2', true FROM staff s WHERE s.name = 'Ava Wilson' LIMIT 1;

-- After running these inserts in pgAdmin you can verify with:
-- SELECT u.email, s.name, s.department, s.phone, s.hire_date FROM staff s JOIN users u ON s.user_id = u.id ORDER BY s.id;
