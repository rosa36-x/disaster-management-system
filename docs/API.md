# Disaster Relief Management System: API Reference

REST API in `backend/` (Node.js, Express). MySQL holds the structured relief data, MongoDB holds
incident reports and field updates. This file is the contract between the API and the frontend.

- **Base URL:** `http://localhost:4000` (set by `PORT` in `backend/.env`). All routes start with `/api`.
- **Format:** JSON in, JSON out. Dates are ISO 8601 strings. Latitude and longitude are plain numbers.
- **Run it:** see the *Setup and Running* section of the root `README.md`.

## Conventions

### Authentication
Log in with `POST /api/auth/login`, then send the returned token on every other request:

```
Authorization: Bearer <token>
```

Tokens expire after 8 hours (`JWT_EXPIRES_IN`). A `401` means: log in again.

### Roles

| Role | Can do |
|---|---|
| `admin` | Everything, including deleting records and creating user accounts |
| `logistics_manager` | Read everything; manage depots, shelters, supplies, vehicles and routes; run matching and complete deliveries |
| `field_worker` | Read everything; register victims, create and cancel requests, file incident reports and field updates |

The **Roles** column in the tables below lists who may call a route. "any" means every logged-in role.
A call from another role returns `403`.

### Errors
Every error has the same shape, with a human-readable message:

```json
{ "error": "quantity must be at least 1" }
```

| Status | Meaning |
|---|---|
| 400 | Invalid input, or a reference to something that doesn't exist (e.g. unknown `person_id`) |
| 401 | Missing, invalid or expired token |
| 403 | Logged in, but this role isn't allowed |
| 404 | The record doesn't exist |
| 409 | Conflict: duplicate value, record still referenced by others, wrong state (e.g. cancelling a matched request), or a business rule (e.g. `"No supply available"`) |
| 500 | Unexpected server error (details are only in the server log) |

`DELETE` returns `204` with no body.

### Lists, paging, sorting
Most list routes accept `page` (default 1), `limit` (default 20, max 100), `sort` and `order` (`asc`/`desc`)
and return:

```json
{ "data": [ ... ], "pagination": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 } }
```

Routes that return a short ranked list (`dashboard/*`, `incidents/nearby`, `depots/nearest`,
`field-updates/requirements`) return `{ "data": [ ... ] }` without paging.

### Ids and enums
- MySQL records use integer ids (`person_id`, `request_id`, `depot_id`, ...).
- MongoDB records use a 24-character hex string, returned as `id`.
- Priority: `critical` `high` `medium` `low`. Request status: `pending` `matched` `delivered` `cancelled`.
- Vehicle status: `available` `en_route` `maintenance`. Route status: `open` `blocked`.
- Incident severity: `critical` `high` `medium` `low`.

## Endpoints

### Health and authentication

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/health` | public | `{status, mysql, mongo}`; `503` if a database is down |
| POST | `/api/auth/login` | public | `{username, password}` -> `{token, user:{id, username, full_name, role}}` |
| GET | `/api/auth/me` | any | The logged-in user |
| POST | `/api/auth/register` | admin | `{username, password (min 8), full_name?, role}`; `409` if the username exists |

### Victims

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/victims` | any | Filters: `priority`, `search` (name). Sort: `person_id` `name` `group_size` `priority` |
| GET | `/api/victims/:id` | any | |
| POST | `/api/victims` | admin, field_worker | `{latitude, longitude, name?, group_size?, priority?}` |
| PATCH | `/api/victims/:id` | admin, field_worker | Send only the fields to change |
| DELETE | `/api/victims/:id` | admin | `409` if the victim has requests |

### Requests

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/requests` | any | Filters: `status`, `resource_type`, `priority` (victim's), `person_id`, `search`. Sort: `requested_at` `request_id` `quantity` `status` `victim_priority`. Each row includes victim name/priority and a nested `match` (or `null`) |
| GET | `/api/requests/:id` | any | |
| POST | `/api/requests` | admin, field_worker | `{person_id, resource_type, quantity, description?}`. Starts as `pending`; `status` can't be set by the client |
| PATCH | `/api/requests/:id/cancel` | admin, field_worker | Only `pending` requests; otherwise `409` |
| GET | `/api/requests/:id/history` | any | Status changes recorded by the database triggers |
| POST | `/api/requests/:id/match` | admin, logistics_manager | Runs `sp_match_request`. `409` with the reason if no supply or vehicle fits |
| GET | `/api/requests/:id/incidents` | any | MongoDB incidents that list this request |

### Matching

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/api/matches/run` | admin, logistics_manager | Runs `sp_match_all_pending` -> `{pending_before, matched, still_pending, assignments}`. Unmatchable requests stay pending |
| GET | `/api/matches` | any | Filters: `request_status` (`matched`/`delivered`), `resource_type`, `request_id`, `vehicle_id`, `supply_id`. Newest first |
| GET | `/api/matches/:id` | any | |
| POST | `/api/matches/:id/complete` | admin, logistics_manager | Marks the delivery done: request -> `delivered`, vehicle -> `available`. `409` if already completed |

Matching and completion are serialized with a database lock; if another one is running you get `409`, retry.

### Depots, shelters, supplies, vehicles, routes
Read: any role. Create and update: admin, logistics_manager. Delete: admin (`409` if still referenced).

| Resource | Paths | Notes |
|---|---|---|
| Depots | `/api/depots`, `/api/depots/:id` | `POST/PATCH {name, latitude, longitude}`. Filter: `search`. Detail includes the depot's `supplies` |
| | `GET /api/depots/nearest` | Params: `lat`, `lng` (required), `resource_type`, `min_quantity`, `limit` (default 3). With `resource_type`, only depots holding enough stock |
| Shelters | `/api/shelters`, `/api/shelters/:id` | `{name, latitude, longitude, capacity, occupancy?}`. Filters: `search`, `has_space=true/false`. Sort includes `free_capacity`. Occupancy above capacity is rejected |
| Supplies | `/api/supplies`, `/api/supplies/:id` | `POST {depot_id` **or** `shelter_id, resource_type, quantity}`. Filters: `resource_type`, `location_type`, `depot_id`, `shelter_id`, `in_stock` |
| | `POST /api/supplies/:id/restock` | `{amount}` adds to the stock (there is deliberately no "set quantity") |
| Vehicles | `/api/vehicles`, `/api/vehicles/:id` | `{capacity, status?, latitude?, longitude?}`. Status can only be set to `available`/`maintenance`; `en_route` is managed by matching. Filters: `status`, `min_capacity` |
| Routes | `/api/routes`, `/api/routes/:id` | `POST {depot_id, shelter_id, distance_km?, status?}`; `PATCH` only `distance_km`/`status`. Filters: `status`, `depot_id`, `shelter_id` |

### Dashboard (MySQL aggregates, any role)

| Path | Returns |
|---|---|
| `GET /api/dashboard/overview` | Victim counts, requests by status, pending by priority, vehicles by status, shelter occupancy %, depot count |
| `GET /api/dashboard/supply-demand` | Per resource type: `stock`, `pending_demand`, `balance`, `shortfall` |
| `GET /api/dashboard/shelters?limit=` | Most crowded shelters first |
| `GET /api/dashboard/priority-queue?limit=` | Pending requests in the order matching will serve them |

### Incidents and field updates (MongoDB)

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/incidents` | any | Filters: `severity`, `disaster_type`, `search`, `request_id`. Sort by date with `order` |
| POST | `/api/incidents` | admin, field_worker | `{title, disaster_type, severity, latitude, longitude, description, related_request_ids?}`. `reported_by` is set from the login. Every request id must exist in MySQL (`400` otherwise) |
| GET | `/api/incidents/:id` | any | Includes its `field_updates` |
| PATCH | `/api/incidents/:id` | admin, field_worker | `title`, `disaster_type`, `severity`, `description`, `related_request_ids` |
| DELETE | `/api/incidents/:id` | admin | `409` while it has field updates |
| GET | `/api/incidents/stats` | any | Counts by severity and by disaster type |
| GET | `/api/incidents/nearby` | any | `lat`, `lng` (required), `radius_km` (default 10), `severity`, `limit`. Nearest first, with `distance_km` |
| GET | `/api/incidents/:id/requests` | any | **Cross-database:** the incident plus its MySQL requests, a status summary and `missing_request_ids` |
| GET | `/api/incidents/:id/nearest-depots` | any | **Cross-database:** MySQL depots closest to the incident's location. Params: `resource_type`, `min_quantity`, `limit` |
| GET | `/api/incidents/:id/updates` | any | Field updates for the incident, newest first |
| POST | `/api/incidents/:id/updates` | admin, field_worker | `{situation, damage_observed?, additional_requirements?[]}`. `worker_name` is set from the login |
| GET | `/api/field-updates` | any | Filters: `requirement` (e.g. `drinking water`), `incident_id`, `worker` |
| GET | `/api/field-updates/requirements` | any | Most requested items across all updates (`limit`) |
| GET | `/api/field-updates/:id` | any | |

## Notes for the frontend

1. **API address:** keep it in an environment variable (for Next.js, `NEXT_PUBLIC_API_URL=http://localhost:4000`), never hard-coded.
2. **CORS:** the API only accepts browser requests from the origin in `CORS_ORIGIN` (default `http://localhost:3000`). If the Next.js app runs on another port, change it in `backend/.env` and restart the API.
3. **Login flow:** call `POST /api/auth/login`, keep the token (session storage, or an httpOnly cookie set by a Next.js route handler; avoid long-lived `localStorage`), and send it as the `Authorization` header. On any `401`, clear it and go to the login page.
4. **Role-based UI:** use `user.role` from the login response to hide buttons the role can't use (the API enforces it anyway and returns `403`).
5. **Show the API's `error` text** for `400` and `409` responses; it is written to be shown to users (e.g. `"No supply available"`).
6. **Lists:** use `pagination.totalPages` for page controls; pass filters as query parameters.
7. **Status changes are actions, not edits:** request status moves through buttons: *Cancel* (`PATCH .../cancel`), *Match* (`POST .../match`), and *Complete delivery* (`POST /api/matches/:id/complete`). There is no "set status" call.
8. **Maps:** latitude/longitude are plain numbers on every record; incidents also expose `latitude`/`longitude`.
9. **Demo accounts:** `admin`, `logistics`, `fieldworker` are created by `DML.sql`. Ask the repo owner for the demo passwords.
