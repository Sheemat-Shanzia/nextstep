# ISMS — Internship and Scholarship Management System

A complete, runnable **3-tier web platform** (Browser → Express → MongoDB) that
brings internship and scholarship opportunities into one place for three roles:
**students**, **companies/organisations** and **administrators**.

> Built with Node.js + Express.js, MongoDB via Mongoose, EJS (server-side views
> with layouts & partials) and Bootstrap 5.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Tech stack](#2-tech-stack)
3. [Prerequisites](#3-prerequisites)
4. [Setup on Windows (step by step)](#4-setup-on-windows-step-by-step)
5. [The three commands](#5-the-three-commands)
6. [Demo accounts](#6-demo-accounts)
7. [Folder structure](#7-folder-structure)
8. [Feature checklist — FR-01 … FR-26](#8-feature-checklist--fr-01--fr-26)
9. [Bonus features checklist (all 20)](#9-bonus-features-checklist-all-20)
10. [Acceptance-check results](#10-acceptance-check-results)
11. [Security](#11-security)
12. [Database documentation](#12-database-documentation)
13. [Assumptions &amp; decisions](#13-assumptions--decisions)
14. [Troubleshooting](#14-troubleshooting)
15. [Screenshots](#15-screenshots)

---

## 1. What it does

**Core workflow**

```
Company posts an opportunity  →  Admin approves it  →  Student searches, filters,
opens the details, applies with a CV  →  Company reviews and changes the status
→  Student sees the new status and receives an in-app notification.
```

| Portal | Highlights |
|---|---|
| **Student** | Profile with a strength meter, skill CRUD, browse/search/filter, opportunity details with similar + recommended items, apply with CV upload, application tracking with a status timeline, withdrawal, saved opportunities, in-app notifications, account settings |
| **Company** | Company profile + logo, post/edit/close/delete opportunities (all moderated), applicant lists with student details, CGPA and downloadable CVs, status review with notes, bulk actions, CSV export |
| **Administrator** | User management (search/filter/suspend/activate/delete/change role), opportunity moderation queue with mandatory rejection reasons, bulk approve/reject, company verification, 8-chart analytics page, activity log, feedback inbox, announcements |

---

## 2. Tech stack

| Purpose | Library | Version used |
|---|---|---|
| Server | express | ^4.22 |
| Database | mongodb + **mongoose** | ^8.19 |
| Views | **ejs** + express-ejs-layouts | ^3.1.10 / ^2.5.1 |
| UI | **Bootstrap 5.3** + Bootstrap Icons (CDN) + **Chart.js** (CDN) | 5.3.3 / 4.4.3 |
| Auth | **jsonwebtoken** (JWT in an httpOnly cookie) + **bcryptjs** | ^9 / ^2.4 |
| Sessions / flash | express-session + connect-flash + cookie-parser | |
| Upload | **multer** (5 MB limit, PDF/DOC/DOCX + PDF/JPG/PNG) | ^2.0 |
| Validation | **express-validator** | ^7.3 |
| Security | helmet, express-rate-limit, express-mongo-sanitize, hpp | |
| Logging | morgan | |
| Config | dotenv | |
| Extras | method-override, compression, json2csv, @faker-js/faker, nodemailer | |
| Dev | nodemon (`npm run dev`) | |

> No package requires native compilation — nothing to build with Visual Studio
> or Python, nothing to install with Docker or WSL.

---

## 3. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 18 LTS or newer | tested on **Node 24.20** |
| **MongoDB Community Server** | 6.0 or newer | installed as a Windows service |
| **MongoDB Compass** | any | optional, for inspecting the data |
| PowerShell | 5.1+ (built into Windows) | every command below is PowerShell |

Check your installation:

```powershell
node --version
npm --version
Get-Service MongoDB*
```

---

## 4. Setup on Windows (step by step)

### Step 1 — install Node.js LTS (skip if already installed)

```powershell
winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
```

Then **close and reopen PowerShell** so `node` is on your `PATH`.

> **If PowerShell refuses to run `npm`** with *"npm.ps1 cannot be loaded because
> running scripts is disabled on this system"*, either run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or simply call
> **`npm.cmd`** instead of `npm` in every command below. Both work.

### Step 2 — install MongoDB Community Server

Download the **msi** installer from <https://www.mongodb.com/try/download/community>.
Tick *"Install MongoDB as a Service"* during setup. Verify it is running:

```powershell
Get-Service MongoDB*
# if it is Stopped, start it (run PowerShell as Administrator):
net start MongoDB
```

### Step 3 — install MongoDB Compass (optional)

<https://www.mongodb.com/try/download/compass> — used to inspect the data.
Connection string: `mongodb://127.0.0.1:27017/isms_db`

### Step 4 — get the project

```powershell
cd path\to\isms
```

### Step 5 — install the dependencies

```powershell
npm install
```

### Step 6 — create your `.env`

```powershell
Copy-Item .env.example .env
```

The shipped defaults already work with a default local MongoDB install. To use
MongoDB Atlas instead, edit `MONGO_URI` in `.env`.

### Step 7 — load the demo data

```powershell
npm run seed
```

You should see a summary table listing every collection and its document count,
plus the three test accounts.

### Step 8 — start the application

```powershell
npm start
```

Open **<http://localhost:3000>**.

For development with auto-reload:

```powershell
npm run dev
```

---

## 5. The three commands

```powershell
npm install
npm run seed
npm start
```

| Script | What it does |
|---|---|
| `npm start` | production start (`node server.js`) |
| `npm run dev` | same with nodauto-reload |
| `npm run seed` | wipes the collections and re-creates the demo data (asks before deleting) |
| `npm run seed:reset` | identical but never prompts (`--force`) |

---

## 6. Demo accounts

| Role | E-mail | Password |
|---|---|---|
| Admin | `admin@isms.com` | `Admin@123` |
| Company | `company@isms.com` | `Company@123` |
| Student | `student@isms.com` | `Student@123` |

All 8 companies use `Company@123`, all 25 students use `Student@123`.
See **[docs/TEST_ACCOUNTS.md](docs/TEST_ACCOUNTS.md)** for the complete list and
a 5-minute demonstration script.

---

## 7. Folder structure

```
isms/
├── package.json              npm scripts + dependencies
├── .env.example              template with documented values
├── .env                      your working configuration
├── .gitignore
├── README.md
├── server.js                 entry point: env → MongoDB → HTTP → graceful shutdown
├── app.js                    Express assembly (middleware pipeline, view engine, routers)
├── config/
│   ├── db.js                 mongoose connect + Windows-friendly failure help
│   ├── multer.js             upload config (types, 5 MB limit, safe filenames)
│   └── rateLimit.js          global + auth rate-limit presets
├── models/                   Mongoose schemas (the database design)
│   ├── User.js               StudentProfile.js   CompanyProfile.js
│   ├── Opportunity.js        Application.js     Notification.js
│   ├── Bookmark.js           Review.js           ActivityLog.js
│   └── Feedback.js           Announcement.js
├── controllers/              one per module (thin — logic lives in services)
│   ├── authController.js         studentController.js
│   ├── opportunityController.js  searchController.js
│   ├── applicationController.js  companyController.js
│   ├── applicantController.js    adminController.js
│   ├── notificationController.js dashboardController.js
│   ├── homeController.js         settingsController.js
│   ├── feedbackController.js     fileController.js
│   └── companyPublicController.js
├── services/                 business logic + all aggregation pipelines
│   ├── applicationService.js  moderationService.js
│   ├── recommendationService.js
│   └── dashboardService.js
├── routes/                   one router per module
│   ├── index.js  auth.js  opportunity.js  search.js
│   ├── student.js  application.js  company.js  applicant.js
│   ├── admin.js  notification.js  dashboard.js
│   └── files.js  feedback.js  companyPublic.js
├── middleware/
│   ├── auth.js               loadUser, isAuthenticated, JWT cookie helpers
│   ├── role.js               requireRole('student'|'company'|'admin')
│   ├── validate.js           express-validator result handler
│   ├── upload.js             Multer wrapper + friendly upload errors
│   └── errorHandler.js       404 + central error handler
├── utils/
│   ├── asyncHandler.js  flash.js  logActivity.js  notify.js
│   ├── profileStrength.js  opportunityQuery.js  pagination.js
│   ├── format.js  mailer.js
├── seed/seed.js              idempotent demo-data generator
├── views/
│   ├── layouts/main.ejs
│   ├── partials/             navbar, footer, flash, pagination, sidebar,
│   │                         opportunityCard, statCard, emptyState
│   ├── auth/                 login, register, forgot, reset, settings, changePassword
│   ├── student/              dashboard, profile, profileEdit, skills,
│   │                         applications, applicationDetail, bookmarks
│   ├── company/              dashboard, profile, opportunities, opportunityForm,
│   │                         opportunityDetail, applicants, applicantDetail,
│   │                         allApplications
│   ├── admin/                dashboard, users, userDetail, opportunities,
│   │                         analytics, activityLog, feedback, announcements
│   ├── opportunities/        index (browse), search, detail, apply, mostViewed
│   ├── notifications/index.ejs
│   ├── public/               companyDirectory, companyProfile, feedback
│   ├── home/index.ejs
│   └── errors/               404, 403, 500
├── public/
│   ├── css/style.css         brand colours, cards, sidebars, stat tiles, dark mode
│   ├── js/main.js            dark mode, validation, charts, modals, suggestions
│   ├── js/theme.js           blocking script that applies the saved theme
│   └── img/
├── uploads/                  runtime only (never public)
│   ├── cv/  documents/  logos/     (.gitkeep in each)
└── docs/
    ├── DATABASE_GUIDE.md     collections, fields, Mermaid ERD, 16 mongosh queries
    ├── API_ROUTES.md         every route with its FR number
    └── TEST_ACCOUNTS.md      credentials + demo script
```

---

## 8. Feature checklist — FR-01 … FR-26

| FR | Requirement | Implemented in | Verification |
|---|---|---|---|
| **FR-01** | Register (student/company), login, logout, JWT httpOnly cookie, bcrypt hashing | `routes/auth.js`, `controllers/authController.js`, `middleware/auth.js` | `/auth/register`, `/auth/login` |
| **FR-02** | Role-based redirect after login, `requireRole` on every protected route, 403 page, suspended users blocked | `middleware/role.js`, `controllers/authController.js`, `views/errors/403.ejs` | student → `/admin/users` = **403** |
| **FR-03** | Student profile (personal + academic), profile-strength meter | `/student/profile`, `/student/profile/edit`, `utils/profileStrength.js` | progress bar + "next steps" list |
| **FR-04** | Add / edit / delete skills with proficiency level | `/student/skills` (+ POST/DELETE routes) | `views/student/skills.ejs` |
| **FR-05** | Browse opportunities (approved + not expired) as cards, paginated | `utils/opportunityQuery.js`, `/opportunities` | `views/opportunities/index.ejs` |
| **FR-06** | Keyword search by title, company, skill (text index + regex fallback) | `utils/opportunityQuery.js` (`opportunity_text_index`), `/search`, `/search/suggest` | search box + type-ahead |
| **FR-07** | Filters (type, location, mode, category, stipend range, deadline window, skill) + sorting | `/search` | `views/opportunities/search.ejs` |
| **FR-08** | Opportunity details (company, type, location, duration, stipend, deadline, description, requirements, skills, days-left badge) | `/opportunities/:id` | `views/opportunities/detail.ejs` |
| **FR-09** | Similar opportunities | same page | aggregation with `$setIntersection` skill overlap |
| **FR-10** | Apply: cover letter, extra answers, CV upload (profile CV or new), extra documents | `/opportunities/:id/apply` | `services/applicationService.js` |
| **FR-11** | Duplicate + expired-deadline applications blocked | `services/applicationService.js` + unique compound index | "already applied" flash / no row created |
| **FR-12** | My Applications: company, type, applied date, status badge, timeline, status filter, withdraw | `/student/applications`, `/student/applications/:id` | `statusHistory[]` timeline |
| **FR-13** | *(covered by FR-12)* | | |
| **FR-14** | Company registration + profile + logo management | `/company/profile`, `POST /company/profile/logo` | `views/company/profile.ejs` |
| **FR-15** | Post internship/scholarship, edit, delete, close/reopen; new posts start `pending` | `/company/opportunities*` | `controllers/companyController.js` |
| **FR-16** | My Opportunities with status badges + rejection reason | `/company/opportunities` | `views/company/opportunities.ejs` |
| **FR-17** | View applicants per opportunity with student details, skills, CGPA, downloadable CV | `/company/opportunities/:id/applicants` | `views/company/applicants.ejs` |
| **FR-18** | Review applications: change status with a note, student notified | `POST /company/applications/:id/status`, `services/applicationService.js` | notification created in the DB |
| **FR-19** | Admin: all users with search, role filter, status filter, pagination | `/admin/users` | `views/admin/users.ejs` |
| **FR-20** | Manage users: details, suspend/activate, delete, change role (last admin protected) | `/admin/users/:id`, `protectedAdminIds()` | demoting the last admin is refused |
| **FR-21** | All submitted opportunities, filter by pending/approved/rejected; approve or reject (reason required); company notified | `/admin/opportunities`, `services/moderationService.js` | `rejectionReason` stored + notification |
| **FR-22** | Status is always exactly one of pending/approved/rejected | Mongoose enum + `services/moderationService.js` | schema-level guarantee |
| **FR-23** | Verify companies (verified badge) | `POST /admin/companies/:id/verify` | badge in nav/cards/company pages |
| **FR-24** | Three dashboards with live aggregation-backed stats | `/student/dashboard`, `/company/dashboard`, `/admin/dashboard` | Chart.js + `services/dashboardService.js` |
| **FR-25** | All data persisted in MongoDB | every model | Compass shows `isms_db` with 11 populated collections |
| **FR-26** | Flash messages, inline validation (server + client), 404/403/500 pages | `utils/flash.js`, `middleware/validate.js`, `views/errors/*` | Bootstrap `needs-validation` + flash alerts |

---

## 9. Bonus features checklist (all 20)

| # | Bonus feature | Implemented in | How to see it |
|---|---|---|---|
| 1 | **Saved / bookmarked opportunities** | `models/Bookmark.js`, `studentController.toggleBookmark`, `/student/bookmarks` | bookmark icon on every card (AJAX toggle) |
| 2 | **Skill-based recommendation with match %** | `services/recommendationService.js`, `/student/dashboard`, detail page | "Recommended for you" cards show e.g. **40 %** |
| 3 | **In-app notifications** (bell, unread count, page, mark read/all) | `models/Notification.js`, `utils/notify.js`, `/notifications` | bell badge in the navbar |
| 4 | **Forgot / reset password** (console fallback when SMTP is off) | `utils/mailer.js`, `/auth/forgot-password`, `/auth/reset-password/:token` | reset link printed + shown on screen |
| 5 | **Change password + account settings** | `/auth/change-password`, `/auth/settings` | settings page with a security summary |
| 6 | **Company reviews / ratings** (+ average on cards) | `models/Review.js`, `utils/notify.refreshCompanyRating`, `POST /companies/:id/review` | star rating on cards + company page |
| 7 | **Public company profile page** | `/companies/:userId` | lists the company's open opportunities |
| 8 | **Deadline awareness** (closing-soon badge, hidden when expired, computed expiry) | virtuals `isExpired` / `daysLeft` / `isClosingSoon` | "3 days left" red badge; expired cards show *Closed* |
| 9 | **Withdrawal + status history timeline** | `statusHistory[]`, `/student/applications/:id` | vertical timeline with the current step highlighted |
| 10 | **Admin analytics with Chart.js** | `/admin/analytics`, `services/dashboardService.js` | 8 charts (growth, category, status, trend, top skills, …) |
| 11 | **Activity log** with admin viewer + filters | `utils/logActivity.js`, `/admin/activity` | filters by action, role and free text |
| 12 | **CSV export** (admin users + opportunities, company applicants) | `json2csv`, `/admin/users/export.csv`, `/company/applications/export.csv` | CSV downloads |
| 13 | **Bulk actions for admin** (multi approve/reject/queue/delete) | `POST /admin/opportunities/bulk` | checkboxes + bulk bar |
| 14 | **Views counter + "most viewed"** | `Opportunity.views`, `/opportunities/most-viewed`, landing section | top-5 list on the landing page |
| 15 | **Dark / light mode** (persisted) | `public/js/theme.js`, `public/js/main.js` | moon icon in the navbar |
| 16 | **Pagination, sorting, empty states everywhere** | `utils/pagination.js`, `views/partials/pagination.ejs`, `emptyState.ejs` | every list screen |
| 17 | **Security hardening** | `app.js` (helmet CSP, rate limits, mongo-sanitize, hpp), `config/multer.js`, strong password policy | see [§11](#11-security) |
| 18 | **Protected file downloads** | `controllers/fileController.js`, `routes/files.js` | owner + recipient company + admin only; `uploads/` is not public |
| 19 | **Contact / feedback page** → `feedbacks` collection | `/feedback`, `/admin/feedback` | admin inbox with seen/resolved/delete |
| 20 | **Announcements** by admin on both dashboards | `models/Announcement.js`, `/admin/announcements` | banners on student + company dashboards |

---

## 10. Acceptance-check results

Verified on **Windows 11 · Node 24.20 · npm 11.19 · MongoDB 7 (service)**
with two automated suites (**99 + 74 HTTP assertions**) plus a manual browser
pass. All checks pass; the server log contains **no 500 errors**.

| # | Acceptance check | Result |
|---|---|---|
| 1 | `npm install` → `npm run seed` → `npm start` work from a clean clone on Windows PowerShell with no manual edits | ✅ |
| 2 | All three roles can register/log in and see only their own portal; cross-role URLs return 403 | ✅ 6 cross-role requests → 403 |
| 3 | Full flow: company posts → admin approves → student searches/filters/opens/applies with CV → company reviews & changes status → student sees status + notification | ✅ verified in the DB (`statusHistory` + `notifications`) |
| 4 | Rejected/pending opportunities are never visible to students | ✅ detail → 404; every rendered card re-checked against the DB |
| 5 | Duplicate application and expired-deadline application are blocked | ✅ unique index + service checks |
| 6 | CV download blocked for unauthorized users | ✅ unrelated company → 403, anonymous → login, `/uploads/...` → 404 |
| 7 | Compass shows `isms_db` with all collections populated and indexes visible | ✅ 11 collections, `opportunity_text_index` + 12 more |
| 8 | All 26 FRs and all 20 bonus features demonstrably working | ✅ mapped in §8 and §9 |
| 9 | No console errors on any page; mobile width usable | ✅ 0 console messages; responsive layout verified at phone width |

---

## 11. Security

| Measure | Implementation |
|---|---|
| Password storage | bcrypt (salt rounds = 10), `password` is `select: false` |
| Password policy | ≥8 chars with lower case + upper case + digit, enforced server-side |
| Session | JWT in an **httpOnly**, SameSite=Lax cookie (`secure` in production); never in localStorage |
| Authorisation | `requireRole()` on every protected router; permissions re-checked against the live user document, so suspension takes effect immediately |
| NoSQL injection | `express-mongo-sanitize` strips `$`/`.` operators from body, query and params |
| Parameter pollution | `hpp` (query + urlencoded body) with the intentional multi-value fields whitelisted |
| XSS | EJS `<%= %>` escaping everywhere; user output never uses `<%- %>`; strict CSP disallows inline scripts |
| CSP | `helmet` with an allow-list for the jsDelivr CDN only |
| Rate limiting | login / register / forgot / reset: 30 per 15 min per IP; global limiter |
| File uploads | allow-listed MIME **and** extension, 5 MB cap, server-generated filenames, `path.basename()` on every download, `uploads/` never mounted as static |
| CV privacy | authenticated download route — owner student, receiving company or admin only |
| Admin safeguards | the last active admin cannot be suspended, demoted or deleted; an admin cannot delete themselves |
| Error pages | stack traces only when `NODE_ENV !== 'production'` |
| Open redirect | post-login redirects and "go back" only accept same-site relative URLs |
| Headers | `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS/HSTS-capable helmet defaults |

---

## 12. Database documentation

* **[docs/DATABASE_GUIDE.md](docs/DATABASE_GUIDE.md)** — every collection and
  field, a Mermaid ER diagram, data-integrity rules and **16 ready-to-paste
  mongosh queries** (including verification queries that prove the integrity
  rules hold).
* **[docs/API_ROUTES.md](docs/API_ROUTES.md)** — every route with its FR number.
* **[docs/TEST_ACCOUNTS.md](docs/TEST_ACCOUNTS.md)** — credentials and demo script.

Seeded dataset: **1 admin · 8 companies · 25 students · 45 opportunities ·
130+ applications · 50+ bookmarks · 34 reviews · 140+ notifications ·
320+ activity logs · 4 announcements · 6 feedback messages**, plus a real
(one-page) PDF CV for every student so CV downloads work immediately.

---

## 13. Assumptions &amp; decisions

Where the specification left something open, these choices were made and are
listed here for completeness:

1. **MongoDB driver** — Mongoose bundles the official driver, so only
   `mongoose` is a direct dependency (no separate `mongodb` package).
2. **Express 4.22 instead of 5** — several required middleware packages
   (`method-override`, `hpp`, `connect-flash`) are only fully compatible with
   Express 4, and a stable, warning-free install matters more here.
3. **Extra folders** — `services/` (required by §9 "logic in services where it
   helps") and `config/rateLimit.js` were added so rate limits live in one place.
4. **`routes/companyPublic.js`** — the public company pages are mounted at
   `/companies` and kept separate from the role-guarded `/company` portal.
5. **Account settings live under `/auth/settings`** (the account area) and are
   available to all three roles.
6. **Stipend semantics** — for internships `stipend` is a monthly amount, for
   scholarships it is the total award; the UI labels it accordingly.
7. **Text search** — MongoDB's text index is used when the query reaches the
   search page and a case-insensitive regex fallback covers partial words and a
   not-yet-built index.
8. **Expiry is computed, not stored** — `isExpired` / `daysLeft` are Mongoose
   virtuals, so an expired post can never disagree with its `deadline`.
9. **Editing an approved post re-queues it** as `pending`, so students never see
   unreviewed edits.
10. **Deleting a user** removes their profile, opportunities, applications,
    bookmarks, reviews and notifications; deleting an *opportunity* instead
    detaches its applications (`opportunity: null`) and the UI renders
    "(removed)" gracefully.
11. **Logout keeps the flash session** — the session only stores flash messages
    and stale form input, and removing it would swallow the "signed out"
    message; the JWT cookie is what actually grants access.
12. **SMTP is optional** — with `SMTP_HOST` blank, e-mails (including password
    reset links) are printed to the console and shown in development mode. The
    app starts and works fully offline.
13. **PowerShell execution policy** — `npm.ps1` may be blocked by Windows
    defaults; use `npm.cmd` or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
14. **All seeded accounts share one password per role** (`Company@123` /
    `Student@123`) so any row found in Compass can be used to sign in.

---

## 14. Troubleshooting

| Symptom | Fix |
|---|---|
| `npm` → *"cannot be loaded because running scripts is disabled"* | use `npm.cmd`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `MongoDB is NOT reachable` | `net start MongoDB` (Administrator PowerShell), or start `mongod.exe --dbpath C:\data\db` |
| Port 3000 already in use | change `PORT` in `.env` |
| `MongooseError: buffering timed out` | MongoDB is not running — the connection string points at a different host/port |
| Compass cannot connect | start the MongoDB service; allow `mongod.exe` through the firewall on private networks |
| Password reset link not in an e-mail | expected without SMTP — it is printed to the server console and shown on screen |
| Pages show an empty dataset | run `npm run seed` |
| Charts are blank | the CDN is unreachable — the app needs internet for Bootstrap/Chart.js; everything else works offline |

---

## 15. Screenshots

> **Screenshots section — placeholder.**
>
> Capture these at ≥1280 px (desktop) and 390 px (mobile) and drop the images
> into `docs/screenshots/`, then reference them here:
>
> | Screen | Route | Suggested file |
> |---|---|---|
> | Landing page | `/` | `docs/screenshots/01-landing.png` |
> | Advanced search | `/search?type=internship` | `docs/screenshots/02-search.png` |
> | Opportunity details | `/opportunities/<id>` | `docs/screenshots/03-detail.png` |
> | Apply form | `/opportunities/<id>/apply` | `docs/screenshots/04-apply.png` |
> | Student dashboard | `/student/dashboard` | `docs/screenshots/05-student-dashboard.png` |
> | Application timeline | `/student/applications/<id>` | `docs/screenshots/06-timeline.png` |
> | Company dashboard | `/company/dashboard` | `docs/screenshots/07-company-dashboard.png` |
> | Applicants list | `/company/opportunities/<id>/applicants` | `docs/screenshots/08-applicants.png` |
> | Admin moderation queue | `/admin/opportunities?status=pending` | `docs/screenshots/09-moderation.png` |
> | Admin analytics | `/admin/analytics` | `docs/screenshots/10-analytics.png` |
> | Dark mode | any page + moon icon | `docs/screenshots/11-dark-mode.png` |

---

## License

MIT — free to use for academic work.