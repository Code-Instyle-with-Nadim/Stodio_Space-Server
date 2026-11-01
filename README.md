# StudioSpace API

Express + TypeScript + MongoDB API for StudioSpace.

## Features

- Register/login/logout/current-user endpoints with bcrypt password hashing and HTTP-only JWT cookies.
- Studio listing, detail, create, update, delete and owner-only listing management.
- ImgBB upload proxy using a server-side API key.
- Booking create/list/cancel, host booking management, confirmation collision checks and status transitions.
- Reviews with aggregate rating updates, wishlist toggles, newsletter subscriptions and dashboard counts.
- Seed script to import sample studios from `data/studios.json`.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `MONGODB_URI`, `DB_NAME`, `JWT_SECRET`, `CLIENT_URL`.
3. Optional: set `IMGBB_API_KEY` to enable direct image uploads.
4. `npm run seed` to load sample studios.
5. `npm run dev` to start the API at port 5000.

## API routes

- `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout`; `GET /api/auth/me`
- `GET /api/studios`, `GET /api/studios/:id`, `POST /api/studios`, `PATCH /api/studios/:id`, `DELETE /api/studios/:id`
- `GET /api/my/studios`, `GET /api/my/bookings`, `GET /api/host/bookings`
- `POST /api/bookings`, `PATCH /api/bookings/:id/cancel`, `PATCH /api/host/bookings/:id`
- `GET /api/reviews/:studioId`, `POST /api/reviews`
- `GET /api/my/wishlist`, `POST /api/my/wishlist/:studioId`
- `POST /api/newsletter`, `POST /api/upload/image`, `GET /api/dashboard`, `GET /api/health`

## Security / deployment

Use a long random JWT secret. In production set `COOKIE_SECURE=true`, serve over HTTPS, restrict MongoDB network access, and set `CLIENT_URL` to the exact deployed frontend origin. Google OAuth and Better Auth are not configured in this build; Google requires provider credentials and this implementation intentionally uses the included custom JWT auth.
