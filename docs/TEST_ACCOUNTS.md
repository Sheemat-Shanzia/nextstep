# TEST_ACCOUNTS.md

Every seeded account can be used to sign in at <http://localhost:3000>.

> These credentials exist **only** because `npm run seed` inserts demo data.
> Change the three primary passwords before deploying anywhere real.

---

## 1. The three primary demo accounts

| Role | E-mail | Password | Lands on |
|---|---|---|---|
| **Admin** | `admin@isms.com` | `Admin@123` | `/admin/dashboard` |
| **Company** | `company@isms.com` | `Company@123` | `/company/dashboard` |
| **Student** | `student@isms.com` | `Student@123` | `/student/dashboard` |

These three are guaranteed by the seed script to have interesting data:

* **admin@isms.com** — approves/rejects posts, manages all users, sees analytics.
* **company@isms.com** — *Nexus Technologies Ltd* (verified), 6 posts, **14 applicants**
  waiting under `/company/applications` so you can immediately try the
  review / shortlist / bulk-action flow.
* **student@isms.com** — *Aisha Rahman*, 7 applications across all statuses,
  7 saved opportunities, ~96 % profile strength, ready-made recommendations.

---

## 2. All 8 seeded company accounts

Password for every one of them: **`Company@123`**

| E-mail | Company | Verified | Posts |
|---|---|:--:|---:|
| `company@isms.com` | Nexus Technologies Ltd | yes | 6 |
| `greenleaf_careers@yahoo.com` | GreenLeaf Foundation | yes | 6 |
| `finbridge.careers@gmail.com` | FinBridge Analytics | yes | 6 |
| `medicore.careers@gmail.com` | MediCore Health | no | 6 |
| `edubridge_careers@hotmail.com` | EduBridge Institute | yes | 6 |
| `solaris.careers73@yahoo.com` | Solaris Renewables | no | 5 |
| `pixelforge.careers63@hotmail.com` | PixelForge Studios | no | 5 |
| `logitrack_careers@yahoo.com` | LogiTrack Systems | no | 5 |

Open any of them at `/companies/<userId>` — the userId is shown in the URL after
you visit `/companies`.

---

## 3. Student accounts (25 total)

Password for every one of them: **`Student@123`**

| E-mail | Name |
|---|---|
| `student@isms.com` | Aisha Rahman (the main demo student) |
| `cynthia_pollich@hotmail.com` | Cynthia Pollich |
| `miss.ii@gmail.com` | Miss Raquel Schmidt II |
| `tom.skiles38@gmail.com` | Tom Skiles |
| `casey.nikolaus@gmail.com` | Casey Nikolaus |
| `kari.hammes-wisoky69@yahoo.com` | Kari Hammes-Wisoky |
| `dr.jacobs@hotmail.com` | Dr. Darin Jacobs |
| `shannon.bode72@gmail.com` | Shannon Bode |
| …plus 17 more generated accounts | |

> The remaining 17 e-mail addresses are generated randomly by
> `@faker-js/faker` on every seed run, so they differ each time.
> To list them: **`db.users.find({role:'student'}).select({email:1,_id:0})`**
> in mongosh, or open **/admin/users** in the browser.

---

## 4. 5-minute demonstration script

| Step | Sign in as | Go to | Do this |
|---|---|---|---|
| 1 | `company@isms.com` | `/company/opportunities/new` | Post a new internship (title, description ≥30 chars, deadline in the future, a few skills). It is saved as **pending**. |
| 2 | `admin@isms.com` | `/admin/opportunities?status=pending` | Approve it (✓ button) — the company is notified. |
| 3 | `student@isms.com` | `/search` | Filter by *type*, *mode*, *deadline* and sort by *newest*; open the new post. |
| 4 | `student@isms.com` | the post → **Apply now** | Write a cover letter, answer the two questions, keep the profile CV (or upload a new one), attach a document, submit. |
| 5 | `company@isms.com` | `/company/opplications` | Open the applicant, read CGPA + skills, download the CV, set **Shortlisted** + a note. |
| 6 | `student@isms.com` | `/student/applications` | Open the application — the timeline shows the new step and the bell has a new notification. |

Extra things worth showing:

* **Admin** → `/admin/analytics` (8 Chart.js charts built from aggregation pipelines)
* **Student** → `/student/dashboard` (skill-match recommendations with a % score)
* **Student** → bookmark icon on any card → `/student/bookmarks`
* **Admin** → `/admin/users` → suspend any student → that student can no longer sign in
* **Admin** → `/admin/activity` (full audit trail)
* Toggle the **moon icon** in the navbar for dark mode (remembered in localStorage)
* Resize the window to phone width — the whole layout is responsive

---

## 5. Try to break it (access-control checks)

| Attempt | Expected result |
|---|---|
| Sign in as a student, open `/admin/users` | **403 Access denied** |
| Sign in as a company, open `/student/dashboard` | **403 Access denied** |
| Sign in as an admin, open `/student/profile` | **403 Access denied** |
| Open `/student/dashboard` while signed out | redirect to `/auth/login` |
| Open a **pending / rejected / expired** opportunity as a student | **404** (never listed, never openable) |
| Apply twice to the same opportunity | refused — *"You have already applied…"* |
| Apply to an opportunity whose deadline has passed | refused |
| Download another student's CV | **403** |
| Download a CV of a company that never received the application | **403** |
| Request `/uploads/cv/<file>.pdf` directly | **404** (uploads are not public) |
| As the admin, demote or delete your own admin account | refused — *"the last administrator…"* |
| As the admin, reject a post without a reason | refused |

---

## 6. Password-reset demonstration (no mail server needed)

`SMTP_HOST` is blank by default, so the app prints the reset link:

1. Go to `/auth/forgot-password` and submit `student@isms.com`.
2. The link is shown on screen **and** printed to the server console in a boxed
   block starting with `[mailer] PASSWORD RESET LINK (dev mode)`.
3. Open the link, choose a new password (8+ chars, lower + upper + digit) and you
   are signed in immediately.

Set `DEV_SHOW_RESET_LINK=false` in `.env` to hide the on-screen link in
development.