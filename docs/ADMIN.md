# Admin panel

Protected order dashboard for Mộc Tâm.

## URL

Open the storefront with hash:

`https://<your-frontend>/#/admin`

Local: `http://localhost:5173/#/admin`

## Users table (preferred)

Admin login reads from Supabase **`users`** (`role = Admin`).

1. Run [`USERS_TABLE.sql`](./USERS_TABLE.sql) in Supabase SQL Editor.
2. Restart / redeploy the backend — it seeds default admin if missing:
   - username: `adminmoctam`
   - password: `123456` (from `ADMIN_USERNAME` / `ADMIN_PASSWORD`)

Login accepts **username or email**.

## Backend env

```env
ADMIN_USERNAME=adminmoctam
ADMIN_PASSWORD=123456
JWT_SECRET=a_long_random_secret
```

- Used to **seed** the admin row and as a **fallback** login if the `users` table is missing.
- `JWT_SECRET` signs Bearer tokens (defaults to `secret` if unset — change in production).

## API

- `POST /api/admin/login` `{ "username", "password" }` → `{ token }`
- `GET /api/admin/orders` with header `Authorization: Bearer <token>`
- `GET /api/products` (public catalog)
- `PUT /api/admin/products/:id` (admin JWT) — name, price, images, copy

## Content CMS (ảnh / giá / nội dung)

1. Run [`SITE_PRODUCTS.sql`](./SITE_PRODUCTS.sql) in Supabase.
2. Redeploy backend (seeds `tra-moc-tam` / `mam-xoi` if empty).
3. Open `/#/admin` → tab **Nội dung**.
4. Redeploy frontend once so the storefront loads catalog from API ([moctam.vercel.app](https://moctam.vercel.app/)).
