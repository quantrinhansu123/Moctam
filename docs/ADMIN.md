# Admin panel

Protected order dashboard for Mộc Tâm.

## URL

Open the storefront with hash:

`https://<your-frontend>/#/admin`

Local: `http://localhost:5173/#/admin`

## Backend env (Render)

Set these on the backend service, then redeploy:

```env
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_strong_password
JWT_SECRET=a_long_random_secret
```

- Without `ADMIN_USERNAME` / `ADMIN_PASSWORD`, `POST /api/admin/login` returns 503.
- `JWT_SECRET` must match what the JWT middleware uses to verify Bearer tokens (defaults to `secret` if unset — change it in production).

## API

- `POST /api/admin/login` `{ "username", "password" }` → `{ token }`
- `GET /api/admin/orders` with header `Authorization: Bearer <token>`
