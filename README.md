# Aboud's Tasks

A one-list to-do app in the Microsoft To Do style. It's an installable web app (PWA) that runs from the iPhone home screen. Data lives in Supabase (project **Tracker**), and the site is hosted on Vercel.

- **App:** Vite + vanilla JS (`index.html`, `src/main.js`, `src/style.css`)
- **Data:** Supabase table `public.tasks`, with files in the private Storage bucket `task-files`. Realtime is on, so changes show up live on every device.
- **Login:** email and password (Supabase Auth), so it works inside the home screen app and with the default Supabase emails (no SMTP needed). The first account to sign in becomes the owner, and later sign-ups are refused. Row level security limits every row to its owner.
- **Reminders:** Web Push. The Edge Function `send-reminders` (`supabase/functions/send-reminders`) is run every minute by pg_cron. It sends:
  - a push when a task's `reminder_at` time arrives
  - a 9 am push for tasks due that day that have no reminder time

  The VAPID keys and the cron secret are kept in Supabase Vault.

## Morning weather

The sun button in the Tasks header turns on a daily forecast notification (default 7 am, changeable to 5–10 am).

- **Location:** the app saves your location, rounded to about 1 km, in `public.user_settings`. It refreshes the location each time the app is opened, if location access is allowed.
- **Place name:** comes from BigDataCloud's free reverse-geocoding service.
- **Forecast:** comes from Open-Meteo (free, no key).
- **Sending:** the `send-reminders` function sends the notification during the chosen hour, in your time zone, once a day.

## Run locally

```
npm install
npm run dev
```

`src/config.js` holds the public Supabase URL, the publishable key and the VAPID public key. The Vercel environment variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_VAPID_PUBLIC_KEY` override them if set. Nothing secret is in this repo.

## Editing tasks with SQL (for another Claude chat)

Any Claude chat with the Supabase connector can manage the list directly. Run SQL on project **Tracker** (`qoizudddelbifkibcize`) against `public.tasks`. The app updates live.

### Columns

| column | type | meaning |
|---|---|---|
| `id` | text | Unique id. Leave it out on insert and one is generated. |
| `user_id` | uuid | Owner. Leave it out: it defaults to the only account. |
| `title` | text | The task text. |
| `important` | boolean | `true` = starred (red). |
| `priority` | text | `'normal'` or `'low'` (green "Low priority" tag). A starred task counts as high. |
| `done` | boolean | `true` = ticked off, shown under Completed. |
| `completed_at` | bigint | When it was ticked off, in milliseconds since 1970. Set automatically when `done` becomes true. Cleared when it is un-ticked. |
| `created` | bigint | When it was created, in milliseconds since 1970. Has a default. |
| `"order"` | double precision | Position in the list. **A smaller number is higher in the list.** Leave it out on insert to put the task at the bottom. Put it in double quotes, because `order` is a SQL keyword. |
| `due` | date | Due date, such as `'2026-11-20'`. Shown blue when it is today and red when it is overdue. |
| `repeat` | text | `null`, `'daily'`, `'weekdays'`, `'weekly'`, `'monthly'` or `'yearly'`. Needs a `due` date. Ticking it off **in the app** creates the next one. |
| `reminder_at` | timestamptz | The **due time**: the task's due date plus a time, such as `'2026-11-20 15:30 America/Toronto'`. A push notification is sent at this moment. In the app it shows as "Due Fri, Nov 20, 3:30 PM". Keep it on the same day as `due`. `null` means no time: the task gets the 9 am "due today" push instead. |
| `reminded_at` | timestamptz | Set when the reminder push was sent. Reset automatically when `reminder_at` changes. |
| `due_notified` | date | The day the 9 am "due today" push was sent. Internal. |
| `notes` | text | Free-text notes. |
| `steps` | jsonb | Subtasks: `[{"id":"s1","title":"…","done":false}]` |
| `links` | jsonb | `[{"url":"https://…","label":"…"}]` |
| `files` | jsonb | Attachments in Storage bucket `task-files`: `[{"id":"<path>","name":"…","type":"image/png","size":1234}]`. Add files in the app, not with SQL. |
| `updated_at` | timestamptz | Set automatically. |

### How order works

The open tasks are sorted by `"order"`, smallest first. Imported tasks use steps of 1000 (1000, 2000, …), so there is room between them.

- **Put a task between two others:** use a number between theirs. For example, between 2000 and 3000, use 2500.
- **Move a task to the top:** use something smaller than the current smallest. For example: `update tasks set "order" = (select min("order") - 1000 from tasks where not done) where id = '…';`
- **Add a task at the bottom:** leave `"order"` out.

### Examples

```sql
-- See the open list in order
select id, title, due, important from public.tasks where not done order by "order";

-- Add a task (goes to the bottom)
insert into public.tasks (title, notes) values ('Book the car service', 'Ask about winter tires');

-- Add a starred task at the top, due Friday at 9:30 (notification at 9:30)
insert into public.tasks (title, important, due, reminder_at, "order")
values ('Call the venue', true, '2026-11-20', '2026-11-20 09:30 America/Toronto',
        (select coalesce(min("order"), 1000) - 1000 from public.tasks where not done));

-- Add a task with steps
insert into public.tasks (title, steps) values ('Clean the garage',
  '[{"id":"s1","title":"Sort shelves","done":false},{"id":"s2","title":"Sweep","done":false}]');

-- Edit
update public.tasks set title = 'Return the drill to Canadian Tire', due = current_date + 1 where id = 't11canadiantire';

-- Tick off (completed_at is filled in automatically)
update public.tasks set done = true where id = 't09car';

-- Un-tick
update public.tasks set done = false where id = 't09car';

-- Tick one step inside a task (step 0 = the first step)
update public.tasks set steps = jsonb_set(steps, '{0,done}', 'true') where id = 't09car';

-- Delete
delete from public.tasks where id = '…';
```

Notes:
- A repeating task ticked off with SQL does not create the next one. Only the app does that. To keep it repeating, move its `due` (and `reminder_at`) forward instead of setting `done`.
- Times without a time zone are read as UTC. Add `America/Toronto` (or your zone) to reminder times.

## Database objects

These live in Supabase. The schema was applied as migration `tasks_schema`.

- **Tables:** `tasks` and `push_subscriptions`, both with RLS by `auth.uid()`
- **Triggers:**
  - `tasks_before_write` sets the default order, `completed_at` and the reminder resets
  - `single_owner_guard` closes sign-ups after the first account
  - `claim_orphan_tasks` gives unowned rows to the owner
- **Function:** `get_push_config()` reads the Vault secrets. Only the service role can call it.
- **Cron job:** `send-reminders` runs every minute and posts to the Edge Function with the `x-cron-secret` header.

## Calendar (Outlook sync) — for another Claude chat

The **Calendar** tab shows `public.calendar_events`. The Edge Function `outlook-sync` keeps that table in two-way sync with the owner's Outlook (Microsoft 365) calendar about every minute. Changes made here reach Outlook within seconds: a database trigger starts a sync as soon as a row changes. Outlook sends the meeting invites, updates and cancellations from the owner's account.

**To add, change or delete events, just change rows with SQL** on project **Tracker** (`qoizudddelbifkibcize`). Don't set `sync_state`, `outlook_id` or `remote` yourself; the triggers handle them.

### Columns you can set

| column | meaning |
|---|---|
| `subject` | Title. |
| `start_at`, `end_at` | `timestamptz`. Always give the zone, such as `'2026-11-20 13:00 America/Toronto'`. |
| `is_all_day` | `true` for all-day events. Then use local midnights: start = the day at 00:00 and end = the next day at 00:00 (in America/Toronto). |
| `location` | Free text, such as `'Joey''s, 25 Main St'`. |
| `attendees` | Invitees. Outlook emails them an invite. `[{"email":"sam@example.com","name":"Sam","type":"required"}]`. `type` is `required` or `optional`. `response` is filled in by sync (`accepted`, `declined`, `tentativelyAccepted`, `none`). |
| `is_online_meeting` | `true` = add a Teams meeting link. The link appears in `online_url` after sync. |
| `notes` | Plain-text description. |
| `reminder_minutes` | Minutes before the start for the reminder. `null` = none. The app also sends a phone push at this time. |
| `show_as` | `free`, `tentative`, `busy`, `oof` (away) or `workingElsewhere`. |
| `categories` | Such as `'["Blue category"]'`. Presets: Red, Orange, Yellow, Green, Blue, Purple category. |
| `sensitivity` | `normal` or `private`. |
| `recurrence` | Repeating events, in the Microsoft Graph format: `{"pattern":{"type":"weekly","interval":1,"daysOfWeek":["tuesday"]},"range":{"type":"noEnd"}}`. Types: `daily`, `weekly` (with `daysOfWeek`), `absoluteMonthly` (with `dayOfMonth`), `absoluteYearly` (with `dayOfMonth` and `month`). For an end, use `"range":{"type":"endDate","endDate":"2027-03-01"}`. The range start date is taken from `start_at`. |

### Columns filled in by sync (read only)

| column | meaning |
|---|---|
| `outlook_id` | The event's ID in Outlook. |
| `event_type` | `singleInstance`, `occurrence` (one date of a series), `exception` (a changed date of a series) or `seriesMaster` (the rule; hidden in the app). |
| `series_master_id` | For an occurrence: the `outlook_id` of its series master. |
| `organizer`, `is_organizer`, `response_status` | Who organized the event. For invites you received, `is_organizer = false`. |
| `web_link` | The event's link in Outlook. |
| `sync_state` | `synced`, `pending_create`, `pending_update`, `pending_delete` or `error`. |
| `sync_error` | The error message if `sync_state = 'error'`. |

### Examples

```sql
-- What's on this week
select id, subject, start_at at time zone 'America/Toronto' as starts, location, sync_state
from public.calendar_events
where event_type <> 'seriesMaster' and start_at >= date_trunc('week', now()) and start_at < date_trunc('week', now()) + interval '7 days'
order by start_at;

-- Lunch Friday 1-2 pm at Joey's, invite Sam
insert into public.calendar_events (subject, start_at, end_at, location, attendees)
values ('Lunch with Sam', '2026-11-20 13:00 America/Toronto', '2026-11-20 14:00 America/Toronto', 'Joey''s',
        '[{"email":"sam@example.com","name":"Sam","type":"required"}]');

-- Teams meeting every Tuesday 10:00-10:30 until March
insert into public.calendar_events (subject, start_at, end_at, is_online_meeting, attendees, recurrence)
values ('Weekly sync', '2026-11-24 10:00 America/Toronto', '2026-11-24 10:30 America/Toronto', true,
        '[{"email":"team@example.com","type":"required"}]',
        '{"pattern":{"type":"weekly","interval":1,"daysOfWeek":["tuesday"]},"range":{"type":"endDate","endDate":"2027-03-31"}}');

-- All-day event
insert into public.calendar_events (subject, start_at, end_at, is_all_day, show_as)
values ('Day off', '2026-11-27 00:00 America/Toronto', '2026-11-28 00:00 America/Toronto', true, 'oof');

-- Move an event (attendees get an update)
update public.calendar_events set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = '…';

-- Add a person to an existing meeting
update public.calendar_events set attendees = attendees || '[{"email":"alex@example.com","type":"required"}]'::jsonb where id = '…';

-- Cancel / delete an event (attendees get a cancellation). Use this UPDATE: it needs no delete confirmation.
update public.calendar_events set sync_state = 'pending_delete' where id = '…';

-- Delete a whole repeating series: mark its series master
update public.calendar_events set sync_state = 'pending_delete'
where outlook_id = (select series_master_id from public.calendar_events where id = '…');

-- Change the whole series (time, title, attendees…): update the row with event_type = 'seriesMaster'
-- Change only one date of a series: update that occurrence row
```

Notes:
- Answering an invite (accept, tentative or decline) is done in the app's event view, or through the function: `POST outlook-sync {"action":"respond","id":"<row id>","response":"accept"}`.
- The sync window is 90 days back to 400 days ahead.
- If `sync_state = 'error'`, read `sync_error`. Fix the row, or set `sync_state = 'pending_retry'` to try again.
- Times: the owner is in `America/Toronto`.
