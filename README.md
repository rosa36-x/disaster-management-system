
# Disaster Relief Management System

A web-based Disaster Relief Management System designed to coordinate emergency response operations. The application manages affected victims, disaster incidents, relief requests, shelters, depots, supplies, vehicles and delivery assignments.

## Features

- Role-based authentication for administrators, logistics managers and field workers.
- Incident reporting and field updates.
- Victim registration and relief request management.
- Supply inventory management across depots and shelters.
- Shelter capacity monitoring.
- Automated resource and vehicle matching.
- Delivery assignment and completion tracking.
- Automatic request status history using MySQL triggers.
- Database Activity dashboard for viewing request history, assignments, inventory and vehicle status.
- MongoDB integration for incident reports and field updates.
- Dashboard for monitoring disaster response operations.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | Next.js, React |
| Backend | Node.js, Express.js |
| Relational Database | MySQL |
| NoSQL Database | MongoDB |
| Authentication | JWT, bcrypt |
| Database Deployment | Docker |
| Version Control | Git, GitHub |

## Project Structure

```text
disaster-management-system/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── db/
│   │   └── utils/
│   ├── tests/
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   ├── .env.example
│   └── package.json
├── database/
│   └── mysql/
│       ├── DDL.sql
│       └── DML.sql
├── mongodb/
│   └── mongo_commands.js
├── docs/
└── README.md
```

## Prerequisites

Install the following before running the application:

- Node.js 20 or later
- npm
- MySQL 8.0.16 or later
- Docker Desktop
- Git

## Setup and Execution Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/rosa36-x/disaster-management-system.git
cd disaster-management-system
```

### 2. Configure MySQL

Start your MySQL server.

Create and initialise the database:

```bash
mysql -u root -p < database/mysql/DDL.sql
mysql -u root -p disaster < database/mysql/DML.sql
```

**Important:** `DDL.sql` contains `DROP DATABASE IF EXISTS disaster`. Running it again will delete and recreate the existing database. Only execute these commands when setting up a fresh database.

`DML.sql` inserts the initial sample records and demo user accounts. Run it once after the DDL script.

### 3. Configure MongoDB

Start a MongoDB 7 container using Docker:

```bash
docker run -d \
  --name disaster-mongo \
  -p 27017:27017 \
  -v disaster_mongo_data:/data/db \
  mongo:7
```

Initialise the MongoDB collections and sample documents:

```bash
docker exec -i disaster-mongo mongosh --quiet < mongodb/mongo_commands.js
```

This creates the `disaster_relief` database and its `incident_reports` and `field_updates` collections.

Run the sample-data script only once during initial setup to avoid duplicate documents.

### 4. Configure and Start the Backend

Open a terminal at the project root:

```bash
cd backend
npm install
```

Create the environment configuration:

```bash
cp .env.example .env
```

Update `backend/.env` with your local MySQL credentials and a secure JWT secret.

The configuration should include:

```env
PORT=4000
CORS_ORIGIN=http://localhost:3000

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=disaster

MONGO_URI=mongodb://localhost:27017
MONGO_DB=disaster_relief

JWT_SECRET=your_generated_secret
JWT_EXPIRES_IN=8h
```

Generate a JWT secret using:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Start the backend:

```bash
npm run dev
```

The backend API runs at:

`http://localhost:4000`

Check database connectivity:

```bash
curl http://localhost:4000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "mysql": "up",
  "mongo": "up"
}
```

### 5. Configure and Start the Frontend

Open a second terminal at the project root:

```bash
cd frontend
npm install
```

Create the frontend environment file:

```bash
cp .env.example .env.local
```

Ensure it contains:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Start the frontend:

```bash
npm run dev
```

Open the application in your browser:

`http://localhost:3000`

## Application Modules

| Module | Description |
|---|---|
| Overview | Displays disaster response and operational statistics. |
| Incident Reports | Records and manages disaster incidents. |
| Field Updates | Stores observations submitted by field workers. |
| Victims | Maintains the affected-person registry. |
| Relief Requests | Creates and tracks requests for emergency resources. |
| Depots | Manages relief storage locations. |
| Shelters | Tracks shelter occupancy and capacity. |
| Supplies | Manages resource inventory. |
| Vehicles | Tracks vehicle availability and status. |
| Delivery Routes | Manages depot-to-shelter routes. |
| Assignments | Displays resource and vehicle allocations and supports delivery completion. |
| Database Activity | Displays request history, assignments, current inventory and vehicle status. |

## Database Functionality

### MySQL

MySQL stores structured operational data and implements database-level integrity and automation.

Key database features include:

- Primary and foreign key constraints.
- CHECK constraints for data validation.
- Functions for distance and shelter capacity calculations.
- Triggers for automatic request history recording.
- Triggers for inventory deduction and vehicle status updates.
- Stored procedures for resource matching and delivery completion.

Important stored procedures include:

- `sp_match_request()`
- `sp_match_request_at_depot()`
- `sp_match_all_pending()`
- `sp_complete_delivery()`

### MongoDB

MongoDB stores document-oriented data in two collections:

- `incident_reports`
- `field_updates`

It also uses document validation and a geospatial index for incident location queries.

## Request and Delivery Workflow

1. A field worker registers a victim and creates a relief request.
2. A MySQL trigger automatically records the initial request status.
3. A logistics manager runs the matching operation.
4. A stored procedure selects suitable inventory and an available vehicle.
5. Database triggers deduct the allocated stock, update the request status and mark the vehicle as en route.
6. The logistics manager completes the delivery.
7. A stored procedure marks the request as delivered and releases the vehicle.
8. The request history trigger records the status change.

The Database Activity page allows users to inspect these changes through the web application.

## User Roles

| Role | Permissions |
|---|---|
| Admin | Full system access and user administration. |
| Logistics Manager | Manages logistics resources, matching and deliveries. |
| Field Worker | Registers victims, creates and cancels requests, submits incident reports and field updates. |

## Running Tests

To run the backend automated test suite:

```bash
cd backend
npm test
```

To run live backend smoke tests against configured databases:

```bash
npm run smoke
```

The smoke tests require the backend, MySQL and MongoDB to be configured.

To verify the frontend production build:

```bash
cd frontend
npm run build
```

## Security Notes

- Do not commit `.env` or `.env.local` files.
- Use secure JWT secrets and database credentials.
- Demo credentials should only be used in a local development environment.
- Passwords are stored as bcrypt hashes.

## Team Project

This project was developed as part of an academic Database Management Systems project. It demonstrates the integration of relational and document databases, backend APIs, database triggers, stored procedures and a web-based user interface.
