# Suggested Project Demonstration

1. Explain the disaster-relief problem and the need to coordinate victims, incidents, supplies, shelters, vehicles, and requests.
2. Show the relational schema and explain why structured operational records are stored in MySQL.
3. Show the MongoDB collections for incident reports and field updates, including why field observations are stored as documents.
4. Sign in with each role and demonstrate role-aware access.
5. Open the command centre and explain the live dashboard aggregates, supply-demand shortfall, shelter occupancy, and priority queue.
6. Create a victim and a relief request. Show the request's pending state and any stock warning returned by the API.
7. Run matching as an admin or logistics manager. Explain that the database matching procedure selects eligible supply and a free vehicle.
8. Complete a delivery and show the resulting request and vehicle state changes.
9. Create an incident report and add a field update. Explain that these documents are stored in MongoDB.
10. Show depot, shelter, supply, vehicle, and route management, including a stock restock operation.
11. Show backend validation and integrity by demonstrating one safe rejected operation, such as an invalid request or an attempted deletion of a referenced record.
12. Finish with the automated backend test results, frontend integration checklist, screenshots, and each teammate's individual commits.

Only demonstrate actions that have been run successfully against the team's actual databases. Do not present sample values as live results unless they are in the seeded database.
