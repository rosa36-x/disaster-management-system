# Frontend-to-API Mapping

The Next.js frontend is a presentation client. It does not connect directly to MySQL or MongoDB. All data access goes through the existing Express API so that JWT authorization, validation, business rules, and database integrity remain enforced in one place.

| Frontend screen | Express API | Database / behavior |
|---|---|---|
| Sign in | `POST /api/auth/login` | MySQL users; JWT session |
| Overview | `/api/dashboard/overview` | MySQL aggregates and counts |
| Supply-demand | `/api/dashboard/supply-demand` | MySQL grouped stock and pending demand |
| Priority queue | `/api/dashboard/priority-queue` | MySQL ordering by victim priority, group size, and request time |
| Shelter capacity | `/api/dashboard/shelters` | MySQL aggregate and `fn_shelter_free` |
| Incident reports | `/api/incidents` | MongoDB `incident_reports` collection |
| Field updates | `/api/field-updates` and `/api/incidents/:id/updates` | MongoDB `field_updates` collection and aggregation |
| Victims | `/api/victims` | MySQL victim table |
| Relief requests | `/api/requests` | MySQL request/victim join; trigger-maintained history |
| Request matching | `/api/requests/:id/match`, `/api/matches/run` | MySQL stored procedures and matching lock |
| Delivery assignments | `/api/matches` and `/api/matches/:id/complete` | MySQL assignment records and completion procedure |
| Depots | `/api/depots` | MySQL depot table |
| Shelters | `/api/shelters` | MySQL shelter table and capacity constraints |
| Supply inventory | `/api/supplies` and `/api/supplies/:id/restock` | MySQL supply table and stock updates |
| Vehicles | `/api/vehicles` | MySQL vehicle table; matching controls `en_route` |
| Delivery routes | `/api/routes` | MySQL route table |

## Authentication and permissions

The frontend stores the JWT in `sessionStorage` for the current browser session and sends it as `Authorization: Bearer <token>`. A 401 response clears the session and returns the user to sign-in. The navigation and action controls are role-aware for `admin`, `logistics_manager`, and `field_worker`. The Express API middleware remains the security boundary and rejects unauthorized requests even if a user bypasses the interface.

## Configuration

Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local`. The Express API's `CORS_ORIGIN` must match the frontend origin. Do not commit `.env` or `.env.local` files.
