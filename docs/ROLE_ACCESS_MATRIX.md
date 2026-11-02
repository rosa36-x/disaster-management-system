# Role Access Matrix

This matrix summarizes the role rules enforced by the Express API and reflected in the frontend controls. The backend remains authoritative.

| Capability | Admin | Logistics manager | Field worker |
|---|:---:|:---:|:---:|
| View dashboard and operational records | Yes | Yes | Yes |
| Register victims | Yes | No | Yes |
| Create and cancel relief requests | Yes | No | Yes |
| File incident reports and field updates | Yes | No | Yes |
| Create/update depots and shelters | Yes | Yes | No |
| Create/restock supplies | Yes | Yes | No |
| Manage vehicles and delivery routes | Yes | Yes | No |
| Run individual or batch matching | Yes | Yes | No |
| Complete delivery assignments | Yes | Yes | No |
| Delete records | Yes | No | No |
| Create user accounts | Yes | No | No |

All protected API calls require a valid JWT. A role-restricted request is rejected by the API with HTTP 403, even if a client manually invokes the endpoint.
