# Frontend Integration Test Checklist

Run the backend, MySQL, and MongoDB before starting these checks. Start the Next.js app from `frontend/` with `npm run dev` and open `http://localhost:3000`.

## Authentication and roles

- [ ] Invalid credentials show the API's authentication error.
- [ ] A valid admin, logistics manager, and field worker can sign in.
- [ ] The signed-in user's name and role appear in the navigation profile.
- [ ] Refreshing a page keeps the current browser session signed in.
- [ ] Signing out returns to the login page.
- [ ] An expired/invalid token redirects to login after the API returns 401.
- [ ] Field workers do not see logistics-only create, restock, matching, or delivery-completion actions.
- [ ] The API rejects a manually attempted action when the current role is not permitted.

## MySQL-backed screens

- [ ] Dashboard cards, supply-demand balance, priority queue, and shelter occupancy load from the API.
- [ ] Victims can be searched, filtered by priority, and registered with valid coordinates.
- [ ] Relief requests can be created for an existing victim and show a stock warning when returned by the API.
- [ ] Pending requests can be cancelled by an allowed role.
- [ ] An admin/logistics manager can run batch matching and match an individual pending request.
- [ ] Delivery assignments show their request, supply location, vehicle, quantity, and ETA.
- [ ] A matched delivery can be completed and its status refreshes.
- [ ] Depots, shelters, supplies, vehicles, and routes can be listed and created by allowed roles.
- [ ] Supplies can be restocked by an admin/logistics manager.
- [ ] Search, filters, pagination, and empty states behave correctly.

## MongoDB-backed screens

- [ ] Incident reports load and can be filtered by severity and searched.
- [ ] An admin/field worker can submit a report with title, disaster type, severity, coordinates, and description.
- [ ] A field worker can submit an update against an incident.
- [ ] Field updates can be filtered by additional requirement.

## Validation and failure handling

- [ ] Invalid form values show the backend's validation message.
- [ ] Duplicate supply rows and invalid location combinations show the API's conflict/validation message.
- [ ] Attempting to delete referenced records shows the API's conflict message.
- [ ] If the API or either database is unavailable, the dashboard shows a useful error and the service indicator changes state.

Record the actual test date, account role, outcome, and screenshot for each demonstrated workflow before submission. Do not mark unchecked tests as passed.
