# Disaster Relief Management System

## Overview

The Disaster Relief Management System is a database-driven application designed to support disaster relief operations by managing victims, shelters, depots, supplies, vehicles, routes and resource requests.

The system aims to improve the organisation and allocation of relief resources during emergencies.

## Technologies Used

- MySQL: Relational database for structured disaster management data.
- MongoDB: NoSQL database for incident reports and field updates.
- Next.js: Web application frontend.
- Node.js and Express: REST API with JWT authentication and role-based access (`backend/`).
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
- `mongodb/`: MongoDB commands and sample data.
- `frontend/`: Next.js user interface.
- `backend/`: REST API (Express), database integration, tests.
- `docs/`: Project documentation, including the API reference (`docs/API.md`).
- `screenshots/`: Application and database screenshots.

## Setup and Running

### Prerequisites

- Node.js 20 or newer and npm
- MySQL 8.0.16 or newer (earlier versions ignore the `CHECK` constraints)
- Docker (for MongoDB 7)

### 1. MySQL

```bash
mysql -u <user> -p -e "CREATE DATABASE disaster"
mysql -u <user> -p disaster < database/mysql/DDL.sql
mysql -u <user> -p disaster < database/mysql/DML.sql
```

`DDL.sql` creates the tables (including `users`); `DML.sql` loads sample data, the functions, triggers and
stored procedures, and three demo accounts (`admin`, `logistics`, `fieldworker`).

### 2. MongoDB

```bash
docker run -d --name disaster-mongo -p 27017:27017 -v disaster_mongo_data:/data/db mongo:7
docker exec -i disaster-mongo mongosh --quiet < mongodb/mongo_commands.js
```

Run the sample-data script **before** the first backend start. The backend then adds the collection
validators and indexes. To reload the sample data later, drop the database first
(`db.getSiblingDB("disaster_relief").dropDatabase()`), run the script, and restart the backend.
Next time just `docker start disaster-mongo`.

### 3. Backend

```bash
cd backend
npm install
cp .env.example .env        # fill in the MySQL user/password and JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # a value for JWT_SECRET
npm run dev                 # API on http://localhost:4000
curl http://localhost:4000/api/health
```

The health check should return `{"status":"ok","mysql":"up","mongo":"up"}`.
The full endpoint list is in [`docs/API.md`](docs/API.md).

### Roles

| Role | Access |
|---|---|
| `admin` | Everything, including deleting records and creating users |
| `logistics_manager` | Manages depots, shelters, supplies, vehicles and routes; runs matching and deliveries |
| `field_worker` | Registers victims, creates and cancels requests, files incident reports and field updates |

### Tests

```bash
cd backend
npm test                    # 290+ automated checks, no databases needed (fakes)
SMOKE_ADMIN_PASSWORD=... SMOKE_LOGISTICS_PASSWORD=... SMOKE_FIELDWORKER_PASSWORD=... npm run smoke
```

`npm test` checks validation, role permissions, query building and error handling. `npm run smoke`
runs against the live API, MySQL and MongoDB (triggers, procedures, constraints, validators, cross-database
links); add `-- --matching` to also run real matching.

## Project Status

- [x] Database design and SQL implementation
- [x] MongoDB setup and initial implementation
- [x] Backend REST API (Express): authentication, three roles, CRUD, matching, dashboard, MongoDB, cross-database endpoints
- [x] Database validation and integrity (CHECK/foreign keys/triggers in MySQL, `$jsonSchema` in MongoDB)
- [x] Backend automated tests and API reference (`docs/API.md`)
- [ ] Next.js web application
- [ ] Documentation report (ER diagram, schema, screenshots, test results)
- [ ] Final demonstration
