# TaDay

*Log your day. Celebrate what's done.*

TaDay is a light, pastel time tracker for teams. Log time with a timer or by hand, keep a To Do list (and a Ta-da list of what you've finished), see your day, week and month, track office, home and field work hours plus leave and public holidays, and export to CSV.

People sign in with just their email (a one-time link, no password). Only people the admin invites can get in. Each person sees and edits only their own time; admins see everyone's.

## What's in here

| File | What it does |
| --- | --- |
| `index.html` | The page and its styling |
| `app.js` | How the tracker works |
| `config.js` | Your Supabase connection details (fill these in) |
| `supabase/setup.sql` | Creates the database and its access rules (run once) |
| `supabase/todos.sql` | Adds the To Do and Ta-da lists to an existing database (run once) |
| `logo.svg`, `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | The pastel blue stopwatch logo and icons |

## One-time setup

### 1. Database (Supabase, free)
1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor > New query**, paste everything from `supabase/setup.sql`, and click **Run**.
3. Open **Project Settings > API** and copy the **Project URL** and the **anon public** key (newer projects call it the **publishable** key). Put both into `config.js`.

### 2. Website (GitHub Pages, free)
1. In this repository, go to **Settings > Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
3. After a minute, the site address appears at the top of that page, for example `https://your-username.github.io/team-timesheet/`.

### 3. Connect the two
In Supabase, open **Authentication > URL Configuration**:
- **Site URL**: your GitHub Pages address from step 2.
- **Redirect URLs**: add the same address.

Then open the site, enter your email, and click the link that arrives in your inbox.

## Inviting people
Open the **Team** tab (admins only), enter a name and email, and click **Send invite**. They get an email with a sign-in link. **Remove** turns off someone's access without deleting their past hours; **Restore access** brings them back.

## Good to know
- **Email limits:** Supabase's built-in email sends only a small number of sign-in emails per hour. That's plenty for a small team. For more, connect your own email provider under **Authentication > Emails > SMTP Settings**.
- **Free plan pause:** a free Supabase project pauses after about a week with no activity. Daily use keeps it awake. If it pauses, click **Restore project** in Supabase; nothing is lost.
- **The keys in `config.js` are safe to publish.** The access rules in `setup.sql` decide what each signed-in person can read or change.
