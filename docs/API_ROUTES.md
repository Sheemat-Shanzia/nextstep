# API_Routes.md

Complete route map of the ISMS application.

**Conventions**

* Server-rendered HTML (EJS), not a JSON API. JSON is returned only by the two
  helper endpoints marked **JSON**.
* Mutating actions use `POST`; `PUT` / `DELETE` are supported through
  `method-override` (`?_method=DELETE` or a hidden `_method` field).
* `🔒` = requires sign-in · `👤`= student only · `🏢` = company only · `🛡️` = admin only
* `403` = signed in but wrong role · `302` = redirected (usually to the login page)

---

## Public

| Method | Route | View / effect | FR |
|---|---|---|---|
| GET | `/` | Landing page: hero + live search, DB stat counters, latest opportunities, most viewed, top companies, how-it-works | FR-08 |
| GET | `/opportunities` | Browse: keyword + type + mode + deadline + sort, pagination | FR-08 |
| GET | `/opportunities/most-viewed` | Most viewed list | bonus 14 |
| GET | `/opportunities/:id` | Details: days-left badge, similar + recommended, apply/bookmark | FR-10 |
| GET | `/search` | Advanced search with the full filter sidebar | FR-06/07 |
| GET | `/search/suggest?q=` | **JSON** live type-ahead suggestions | FR-06 |
| GET | `/search/facets` | **JSON** available categories + locations | FR-07 |
| GET | `/companies` | Public company directory | bonus 7 |
| GET | `/companies/:userId` | Public company profile + its open opportunities + reviews | bonus 7 |
| POST | `/companies/:id/review` | 👤 Student leaves a 1–5 star review | bonus 6 |
| GET | `/feedback` | Contact / feedback form | bonus 19 |
| POST | `/feedback` | Stores a message in `feedbacks` | bonus 19 |
| GET | `/auth/register` | Registration form (student or company) | FR-01 |
| POST | `/auth/register` | Creates the user + profile, signs in, redirects by role | FR-01 |
| GET | `/auth/login` | Login form | FR-01 |
| POST | `/auth/login` | JWT cookie, role-based redirect (`/student/…`, `/company/…`, `/admin/…`) | FR-01/02 |
| GET/POST | `/auth/logout` | Clears the JWT cookie | FR-01 |
| GET | `/auth/forgot-password` | Forgot-password form | bonus 4 |
| POST | `/auth/forgot-password` | Sends (or prints) a 1-hour reset link | bonus 4 |
| GET/POST | `/auth/reset-password/:token` | Sets a new password | bonus 4 |
| GET | `/dashboard` | Redirects to the signed-in role's dashboard | FR-24 |

---

## Student portal — 🔒 👤

| Method | Route | View / effect | FR |
|---|---|---|---|
| GET | `/student` · `/student/dashboard` | Student dashboard: charts, recent applications, recommendations, saved, deadlines, strength, announcements | FR-24 |
| GET | `/student/profile` | Profile with the strength meter, CV, documents, education, projects | FR-03 |
| GET | `/student/profile/edit` | Edit personal / academic information | FR-03 |
| POST | `/student/profile` | Saves the profile and recomputes `profileStrength` | FR-03 |
| GET | `/student/skills` | Skills CRUD with proficiency level | FR-05 |
| POST | `/student/skills` | Add a skill | FR-05 |
| POST | `/student/skills/:skillId` | Update a skill | FR-05 |
| DELETE | `/student/skills/:skillId` | Remove a skill | FR-05 |
| POST | `/student/cv` | Upload / replace the profile CV (PDF, DOC, DOCX ≤5 MB) | FR-12 |
| DELETE | `/student/cv` | Remove the CV | FR-12 |
| POST | `/student/documents` | Upload supporting documents (PDF/JPG/PNG) | FR-12 |
| DELETE | `/student/documents/:docId` | Delete a document | FR-12 |
| POST | `/student/education` · `/student/projects` | Add education / project entries | FR-03 |
| DELETE | `/student/education/:eduId` · `/student/projects/:projectId` | Remove them | FR-03 |
| GET | `/student/bookmarks` | Saved opportunities | bonus 1 |
| POST | `/opportunities/:id/bookmark` | Toggle the bookmark (JSON-aware, AJAX) | bonus 1 |
| GET | `/student/applications` | My applications, filterable by status | FR-13 |
| GET | `/student/applications/:id` | Application detail + status timeline | FR-13 / bonus 9 |
| POST | `/student/applications/:id/withdraw` | Withdraw the application | bonus 9 |
| GET | `/opportunities/:id/apply` | Application form (cover letter, extra answers, CV, documents) | FR-11 |
| POST | `/opportunities/:id/apply` | Creates the application; blocks duplicates + expired deadlines | FR-11 |
| GET | `/notifications` | 🔒 Notification centre, unread filter | bonus 3 |
| POST | `/notifications/:id/read` · `/notifications/read-all` | Mark read | bonus 3 |
| DELETE | `/notifications` · `/notifications/:id` | Clear the inbox | bonus 3 |
| GET | `/auth/settings` | 🔒 Account settings | bonus 5 |
| POST | `/auth/settings` | Update name / e-mail | bonus 5 |
| GET/POST | `/auth/change-password` | 🔒 Change password (current password required) | bonus 5 |

---

## Company portal — 🔒 🏢

| Method | Route | View / effect | FR |
|---|---|---|---|
| GET | `/company` · `/company/dashboard` | Company dashboard: counters, charts, recent applicants, latest posts, announcements | FR-24 |
| GET | `/company/profile` | Company profile, logo, ratings breakdown | FR-14 |
| POST | `/company/profile` | Update company details (renames also update all posts) | FR-14 |
| POST | `/company/profile/logo` | Upload logo (JPG/PNG) | FR-14 |
| DELETE | `/company/profile/logo` | Remove logo | FR-14 |
| GET | `/company/opportunities` | My posts with status badges + rejection reason | FR-16 |
| GET | `/company/opportunities/new` · POST `/company/opportunities` | Create a post (always starts as `pending`) | FR-15 |
| GET | `/company/opportunities/:id` | Manage a post (non-owners are redirected / 404) | FR-16 |
| GET | `/company/opportunities/:id/edit` · POST `/company/opportunities/:id` | Edit — re-queues an approved post for review | FR-15 |
| POST | `/company/opportunities/:id/toggle` | Close / reopen applications | FR-15 |
| DELETE | `/company/opportunities/:id` | Delete the post (applications are detached) | FR-15 |
| GET | `/company/opportunities/:id/applicants` | Applicants: profile, CGPA, skills, CV download, filters, sorting, pagination | FR-18 |
| GET | `/company/applications` | All applications across all posts | FR-18 |
| GET | `/company/applications/:id` | One applicant in detail | FR-18 |
| POST | `/company/applications/:id/status` | Change status + note → student is notified | FR-18 |
| POST | `/company/applications/bulk-status` | Bulk status change (bonus 13) | FR-18 |
| GET | `/company/applications/export.csv` | CSV export of the applicant list | bonus 12 |

---

## Admin portal — 🔒 🛡️

| Method | Route | View / effect | FR |
|---|---|---|---|
| GET | `/admin` · `/admin/dashboard` | Admin dashboard: charts, moderation queue, activity feed | FR-24 |
| GET | `/admin/users` | All users: search, role filter, status filter, pagination, bulk actions | FR-19 |
| GET | `/admin/users/export.csv` | CSV export of every user | bonus 12 |
| POST | `/admin/users/bulk` | Bulk suspend / activate / delete | FR-19 |
| GET | `/admin/users/:id` | User detail: profile, opportunities, applications, activity | FR-20 |
| POST | `/admin/users/:id` | `action` = `suspend` / `activate` / `role` / `delete` (last admin is protected) | FR-20 |
| GET | `/admin/opportunities` | All opportunities, filter by status/type/search | FR-21 |
| GET | `/admin/opportunities/export.csv` | CSV export of every opportunity | bonus 12 |
| POST | `/admin/opportunities/bulk` | Bulk approve / reject / re-queue / delete (bonus 13) | FR-22 |
| GET | `/admin/opportunities/:id` | Review one opportunity (reuses the detail view) | FR-21 |
| POST | `/admin/opportunities/:id/moderate` | `action` = `approve` / `reject` (reason required) / `pending` | FR-21 |
| POST | `/admin/companies/:id/verify` | Toggle the verified badge | FR-23 |
| GET | `/admin/analytics` | 8 Chart.js charts fed by aggregation pipelines | bonus 10 |
| GET | `/admin/activity` | Activity log with action / role / text filters | bonus 11 |
| GET | `/admin/feedback` · POST `/admin/feedback/:id` | Feedback inbox (`seen` / `resolved` / `delete`) | bonus 19 |
| GET/POST | `/admin/announcements` · POST `/admin/announcements/:id` | Announcements (`toggle` / `delete`) | bonus 20 |

---

## Protected file downloads — 🔒

`uploads/` is **never** served statically. Every file is streamed through
`controllers/fileController.js` after an authorisation check.

| Method | Route | Who may download |
|---|---|---|
| GET | `/files/application/:applicationId/cv` | the owning student, the company that received it, any admin |
| GET | `/files/application/:applicationId/document/:docId` | same |
| GET | `/files/profile/cv` | the signed-in student (own CV) |
| GET | `/files/profile/document/:docId` | the signed-in student |
| GET | `/files/company/logo/:userId` | any signed-in user |

Anyone else receives **403**, and the path is rebuilt with `path.basename()` so a
crafted filename can never escape the upload folder.

---

## Error pages

| Status | View | When |
|---|---|---|
| 403 | `views/errors/403.ejs` | Signed in with the wrong role, or a suspended account |
| 404 | `views/errors/404.ejs` | Unknown route, or a pending/rejected/expired post opened by a student |
| 500 | `views/errors/500.ejs` | Unexpected error (stack trace only outside production) |
| 429 | rendered by `express-rate-limit` | Too many login/register attempts |

---

## Quick reference — the demo walkthrough

```
1. company@isms.com   → /company/opportunities/new      (post an opportunity)
2. admin@isms.com     → /admin/opportunities?status=pending  (approve it)
3. student@isms.com   → /search                          (find + apply)
4. company@isms.com   → /company/opportunities/:id/applicants  (shortlist)
5. student@isms.com   → /student/applications            (see the timeline + notification)
```