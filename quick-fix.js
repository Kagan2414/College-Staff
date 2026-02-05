#!/usr/bin/env node

/**
 * Quick Fix Script for Login Issues
 * This script will diagnose and fix common login problems
 */

const { Pool } = require("pg");
const bcrypt = require("bcrypt");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:123@localhost:5432/college_scheduling",
});

async function quickFix() {
  console.log("🔍 Diagnosing login issues...\n");
  
  const client = await pool.connect();
  
  try {
    // Test 1: Check database connection
    console.log("Test 1: Database Connection");
    try {
      await client.query("SELECT NOW()");
      console.log("✅ Database connection successful\n");
    } catch (err) {
      console.log("❌ Database connection failed:", err.message);
      console.log("   Solution: Check your DATABASE_URL in .env file\n");
      return;
    }
    
    // Test 2: Check if session table exists
    console.log("Test 2: Session Table");
    try {
      const sessionCheck = await client.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'session')"
      );
      if (sessionCheck.rows[0].exists) {
        console.log("✅ Session table exists\n");
      } else {
        console.log("❌ Session table missing");
        console.log("   Fixing: Creating session table...");
        
        await client.query(`
          CREATE TABLE session (
            sid VARCHAR NOT NULL COLLATE "default",
            sess JSON NOT NULL,
            expire TIMESTAMP(6) NOT NULL,
            PRIMARY KEY (sid)
          );
          CREATE INDEX "IDX_session_expire" ON "session" ("expire");
        `);
        console.log("✅ Session table created\n");
      }
    } catch (err) {
      console.log("❌ Error checking session table:", err.message, "\n");
    }
    
    // Test 3: Check if users exist
    console.log("Test 3: Demo Users");
    try {
      const usersCheck = await client.query("SELECT email, role FROM users");
      
      if (usersCheck.rows.length === 0) {
        console.log("⚠️  No users found - creating demo users...\n");
      } else {
        console.log("✅ Found users:");
        usersCheck.rows.forEach(u => console.log(`   - ${u.email} (${u.role})`));
        console.log();
      }
      
      // Test 4: Fix password hashes
      console.log("Test 4: Password Hashes");
      const password = "Demo@123456";
      const newHash = await bcrypt.hash(password, 10);
      
      // Update admin password
      const adminUpdate = await client.query(
        `UPDATE users SET password_hash = $1 WHERE email = 'admin@college.edu' RETURNING email`,
        [newHash]
      );
      
      if (adminUpdate.rows.length > 0) {
        console.log("✅ Admin password hash updated");
      } else {
        console.log("⚠️  Admin user not found - creating...");
        await client.query(
          `INSERT INTO users (email, password_hash, role, is_active)
           VALUES ('admin@college.edu', $1, 'admin', true)`,
          [newHash]
        );
        console.log("✅ Admin user created");
      }
      
      // Update staff password
      const staffUpdate = await client.query(
        `UPDATE users SET password_hash = $1 WHERE email = 'staff1@college.edu' RETURNING email, id`,
        [newHash]
      );
      
      if (staffUpdate.rows.length > 0) {
        console.log("✅ Staff password hash updated");
        
        // Ensure staff profile exists
        const staffId = staffUpdate.rows[0].id;
        const staffProfile = await client.query(
          `SELECT id FROM staff WHERE user_id = $1`,
          [staffId]
        );
        
        if (staffProfile.rows.length === 0) {
          console.log("⚠️  Staff profile missing - creating...");
          await client.query(
            `INSERT INTO staff (user_id, name, email, department, phone, qualification, hire_date, is_active)
             VALUES ($1, 'John Doe', 'staff1@college.edu', 'Computer Science', '9876543210', 'M.Tech', '2022-01-15', true)`,
            [staffId]
          );
          console.log("✅ Staff profile created");
        }
      } else {
        console.log("⚠️  Staff user not found - creating...");
        const newStaffUser = await client.query(
          `INSERT INTO users (email, password_hash, role, is_active)
           VALUES ('staff1@college.edu', $1, 'staff', true) RETURNING id`,
          [newHash]
        );
        
        await client.query(
          `INSERT INTO staff (user_id, name, email, department, phone, qualification, hire_date, is_active)
           VALUES ($1, 'John Doe', 'staff1@college.edu', 'Computer Science', '9876543210', 'M.Tech', '2022-01-15', true)`,
          [newStaffUser.rows[0].id]
        );
        console.log("✅ Staff user and profile created");
      }
      
      console.log();
      
      // Test 5: Test password verification
      console.log("Test 5: Password Verification");
      const adminUser = await client.query(
        "SELECT password_hash FROM users WHERE email = 'admin@college.edu'"
      );
      
      const isValid = await bcrypt.compare(password, adminUser.rows[0].password_hash);
      if (isValid) {
        console.log("✅ Password verification successful\n");
      } else {
        console.log("❌ Password verification failed - This shouldn't happen!\n");
      }
      
      // Summary
      console.log("=".repeat(60));
      console.log("🎉 QUICK FIX COMPLETED!");
      console.log("=".repeat(60));
      console.log("\n✨ Login credentials (copy these):\n");
      console.log("Admin:");
      console.log("  Email:    admin@college.edu");
      console.log("  Password: Demo@123456");
      console.log("\nStaff:");
      console.log("  Email:    staff1@college.edu");
      console.log("  Password: Demo@123456");
      console.log("\n🌐 Login URL: http://localhost:3000/login.html");
      console.log("\n💡 Make sure your server is running:");
      console.log("   npm start");
      console.log("=".repeat(60) + "\n");
      
    } catch (err) {
      console.log("❌ Error:", err.message, "\n");
      throw err;
    }
    
  } catch (error) {
    console.error("\n❌ Quick fix failed:", error);
    console.error("\nPlease try running: node setup-database.js\n");
  } finally {
    client.release();
    await pool.end();
  }
}

// Check if running directly
if (require.main === module) {
  quickFix().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

module.exports = quickFix;