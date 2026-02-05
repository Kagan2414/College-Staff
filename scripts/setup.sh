#!/bin/bash

# College Scheduling System - Setup Script
# This script initializes the PostgreSQL database with required tables

echo "Initializing College Scheduling System Database..."

# Install Node.js dependencies
echo "Installing dependencies..."
npm install

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "Please update .env with your PostgreSQL connection details"
fi

# Run database initialization
echo "Setting up database tables..."
npm run setup

echo "Setup complete! Start the server with: npm start"
