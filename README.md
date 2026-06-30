# Radiant International School — Attendance Management System

A modern, file-based attendance system built for a 100+ staff campus. No external database
required — all data lives in human-readable JSON files under `/data`, making it easy to host,
back up, or inspect directly.

## What's included

- **Staff portal** — sign in, check in / check out with a single tap on the attendance dial,
  request an early checkout with a reason (auto-routed to HR for approval), and view a personal
  monthly report with charts and progress rings.
- **HR Admin portal** — campus-wide dashboard with live KPIs and trend charts, today's attendance
  log, an approvals queue for early-checkout requests, a searchable staff directory (add staff,
  view individual performance reports with charts), and a filterable historical attendance log.
- **File-based database** — `data/employees.json`, `data/attendance.json`, `data/requests.json`,
  `data/admins.json`. Everything is read and written straight to disk via `db.js`.
- Sleek, fully responsive UI (desktop, tablet, mobile) with a custom navy-and-brass design system,
  no generic dashboard template look.

## Getting started

```bash
npm install
node seed.js     # generates 108 sample staff + ~45 days of attendance history (run once)
npm start         # starts the server on http://localhost:3000
```

Open `http://localhost:3000` in your browser.

### Demo logins

| Role | Email | Password |
|---|---|---|
| HR Admin | `hr@radiantis.edu.np` | `Admin@123` |
| Staff (any seeded employee) | see `data/employees.json` for emails, e.g. `aarav.sharma1@radiantis.edu.np` | `Welcome@123` |

New staff added through the HR Admin → "Add Staff Member" form are issued the temporary password
`Welcome@123` as well — encourage them to change it once a password-change screen is added (see
Next steps below).

## How early checkout works

1. A staff member taps **Check Out** before their shift ends (default shift: 08:00–16:00, more
   than 15 minutes early).
2. The system asks for a short reason instead of completing the checkout silently.
3. The reason is logged immediately under **Early Checkouts** (staff side) and **Approvals**
   (HR side) with a "Pending" status.
4. HR reviews the reason in the Approvals queue and approves or declines it — the staff member sees
   the decision and who reviewed it.

## Project structure

```
attendance-system/
├── server.js          Express server + all API routes
├── db.js              Tiny file-based "database" read/write layer
├── seed.js             Generates the initial data/*.json files
├── data/                The "database" — JSON files (back these up regularly)
├── public/
│   ├── index.html       Sign-in screen (staff / HR toggle)
│   ├── staff.html        Staff dashboard
│   ├── admin.html        HR admin dashboard
│   ├── css/style.css     Design system
│   └── js/                Client-side logic per page
└── package.json
```

## Notes for production use

- Replace the in-memory session secret in `server.js` with an environment variable.
- Passwords are hashed with bcrypt, but there's currently no "change password" or "forgot
  password" flow — worth adding before wider rollout.
- Because the database is plain JSON files, back up the `data/` folder regularly (e.g. a nightly
  cron copy) and avoid running multiple server instances against the same files concurrently.
- Shift times, late-arrival grace period (5 minutes) and early-checkout threshold (15 minutes)
  are currently fixed constants in `server.js` — easy to expose as per-employee or campus-wide
  settings later.
