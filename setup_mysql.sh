#!/bin/bash

# MySQL Database Setup Script for Joke Generator
# This script sets up the database and user for the joke generator application

echo "Setting up MySQL database for Joke Generator..."

# Create database and user (requires root MySQL access)
mysql -u root -e "
CREATE DATABASE IF NOT EXISTS joke_generator;
CREATE USER IF NOT EXISTS 'joke_user'@'localhost' IDENTIFIED BY 'joke_pass';
GRANT ALL PRIVILEGES ON joke_generator.* TO 'joke_user'@'localhost';
FLUSH PRIVILEGES;
"

if [ $? -eq 0 ]; then
    echo "Database and user created successfully."
else
    echo "Error creating database and user. Make sure MySQL is running and you have root access."
    exit 1
fi

# Load schema into the database
echo "Loading database schema..."
mysql -u joke_user -p'joke_pass' joke_generator < schema.sql

if [ $? -eq 0 ]; then
    echo "Schema loaded successfully."
else
    echo "Error loading schema."
    exit 1
fi

# Verify setup
echo "Verifying database setup..."
mysql -u joke_user -p'joke_pass' joke_generator -e "SHOW TABLES;"

if [ $? -eq 0 ]; then
    echo "Database setup completed successfully!"
    echo "Connection details:"
    echo "  Host: localhost"
    echo "  Database: joke_generator"
    echo "  Username: joke_user"
    echo "  Password: joke_pass"
else
    echo "Error verifying database setup."
    exit 1
fi