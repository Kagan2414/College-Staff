# College Scheduling System

A comprehensive college staff scheduling and management system built with Node.js, Express, and PostgreSQL.

## Features

### Admin Features
- **Staff Management**: Add, edit, and manage staff members
- **Timetable Management**: Create and upload class timetables
- **Leave Management**: Approve or reject staff leave requests
- **Automatic Scheduling**: Automatic class rescheduling when staff request leave
- **Manual Override**: Override automatic scheduling assignments
- **Activity Monitoring**: View staff login activity and access logs
- **Dashboard Analytics**: View total staff count and currently logged-in staff
- **Attendance Tracking**: Monitor staff presence and leave details

### Staff Features
- **Secure Login**: Role-based authentication
- **View Timetable**: See personal class schedule
- **Mark Attendance**: Mark daily presence/absence
- **Request Leave**: Submit leave requests with automatic rescheduling
- **View Leave Status**: Track leave request status

## Tech Stack

- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL
- **Authentication**: Session-based with bcrypt password hashing
- **Frontend**: HTML, CSS, JavaScript
- **Deployment**: Render

## Installation

### Prerequisites
- Node.js (v14+)
- PostgreSQL (v12+)
- npm or yarn

### Local Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd college-scheduling-system
