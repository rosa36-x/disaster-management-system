# Disaster Relief Management System

## Overview

The Disaster Relief Management System is a database-driven application designed to support disaster relief operations by managing victims, shelters, depots, supplies, vehicles, routes and resource requests.

The system aims to improve the organisation and allocation of relief resources during emergencies.

## Technologies Used

- MySQL: Relational database for structured disaster management data.
- MongoDB: NoSQL database for incident reports and field updates.
- Next.js: Web application frontend and backend API.
- Docker: Local MongoDB deployment.
- Git and GitHub: Version control and team collaboration.

## Database Design

### MySQL

Stores structured information, including:
- Victims
- Depots
- Shelters
- Routes
- Supplies
- Vehicles
- Requests
- Match assignments
- Request history

### MongoDB

Contains two collections:
- `incident_reports`: Stores disaster details, severity, geographical location and related request information.
- `field_updates`: Stores observations and updates submitted by relief workers.

## Project Structure

- `database/mysql/`: MySQL DDL and DML scripts.
- `database/mongodb/`: MongoDB commands and sample data.
- `frontend/`: Next.js user interface.
- `backend/`: Application API and database integration.
- `docs/`: Project documentation.
- `screenshots/`: Application and database screenshots.

## Project Status

- [x] Database design and SQL implementation
- [x] MongoDB setup and initial implementation
- [ ] Next.js web application
- [ ] MySQL and MongoDB integration
- [ ] Authentication and authorization
- [ ] Testing and documentation
- [ ] Final demonstration
