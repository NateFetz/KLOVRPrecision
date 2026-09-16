# Getting Shawn set up

Written for somebody who machines rifle actions, not somebody who writes
software. Follow it in order. Nothing here is dangerous, and nothing you can do
by accident will break the live site — there is a test suite that runs on every
push and a set of build guards that refuse to publish something broken.

Budget an hour for parts 1 and 2, and another for part 3.

**Two things to know before you start.**

The repository is **public**. Anyone can read every file in it. That is fine —
there is nothing secret in the code — but it means a password or an API key
committed by accident is public the moment it is pushed, and the only real fix
is to change the key. Keys go in a `.env` file, which git is set up to ignore.

The storefront and the staff area are two halves of one thing. You should not
need to write code to run the shop: prices, stock, products, photographs and
orders are all managed at `/admin`. Code is for changing how the site *works*,
not what is in it.

---

## Part 1 — accounts (Nate does these)

### 1 · GitHub

Shawn makes a free account at [github.com](https://github.com). Then, on the
repository: **Settings → Collaborators → Add people**, and invite his username.
He will get an email; he needs to accept it.

Give him **Write** access, not Admin. Write lets him do everything below. Admin
lets him delete the repository.

### 2 · Netlify

[app.netlify.com](https://app.netlify.com) → the site → **Site configuration →
Members** (or team settings, depending on plan) → invite him. This is so he can
see why a deploy failed without asking.

### 3 · Claude

Claude Code needs a paid Claude plan — **Pro** is enough to start; **Max** is
worth it if he is going to work on this daily. He signs up at
[claude.ai](https://claude.ai) with his own email. Do not share a login: two
people on one account tread on each other, and the usage limits are per account.

---

## Part 2 — Shawn's machine

Everything below is typed into **Terminal** (press ⌘-Space, type "Terminal").
Lines starting with `#` are comments — you do not type those.

### 4 · Node

The site is built by a program called Node. Check whether it is there:

```bash
node --version
```

If that prints something like `v20.20.2` or higher, skip ahead. If it says
"command not found", install it from [nodejs.org](https://nodejs.org) — take the
version marked **LTS**.

It must be **v20.6 or newer**. Older versions cannot read the `.env` file the
way these instructions expect.

### 5 · Git and GitHub

```bash
git --version
```

If that errors, macOS will offer to install the developer tools — accept, wait,
and run it again.

Then tell git who you are. This name ends up on every change you make:

```bash
git config --global user.name "Shawn <surname>"
git config --global user.email "the email on his GitHub account"
```

Now let the machine log in to GitHub. The simplest route is GitHub's own tool:

```bash
brew install gh     # if brew is missing, see https://brew.sh first
gh auth login
```

Choose **GitHub.com**, then **HTTPS**, then **Login with a web browser**, and
follow it. This also hands git the credentials it needs, so there is no SSH key
to fiddle with.

### 6 · Get the code

```bash
cd ~/Desktop
gh repo clone NateFetz/KLOVRPrecision
cd KLOVRPrecision
```

### 7 · Prove it works before changing anything

```bash
node build.js
node tests/all.js
```

The first builds the whole site into a `dist/` folder and prints what it did.
The second runs nine test suites and should end with **all suites passed** in
about a second.

Then look at it:

```bash
node serve.js
```

and open <http://localhost:8787>. That is the real site, running on his machine,
with nothing connected to the internet. `Ctrl-C` in the terminal stops it.

If both of those worked, the machine is set up. Everything after this is real
work rather than installation.

### 8 · Claude Code

Install it and start it inside the project folder:

```bash
npm install -g @anthropic-ai/claude-code
cd ~/Desktop/KLOVRPrecision
claude
```

It will ask him to log in with the Claude account from step 3.

Two things worth telling him on day one. **Ask it to explain before asking it to
change** — "what does build.js actually do?" is a better first question than
"add a feature". And **it can run the tests itself**; "run the tests and tell me
if anything is broken" is a perfectly good instruction.

---

## Part 3 — build the backend

This is Shawn's first real job, and it is a good one: it is self-contained, it
is needed, and nothing depends on it being done quickly.

Everything needed is already written — ten migration files describing every
table, every security rule and every function. None of it has ever been run
against a real database. That is the job.

### 9 · Create the project

[supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.

- Make an **organisation** first and add Nate to it. The database ends up holding
  customer names and addresses; it should not hang off one personal login.
- Pick the region closest to Wyoming.
- **Save the database password in a password manager.** It is not recoverable.

Free projects **pause after about a week of no use**. If a build later fails
with a database error, check the dashboard first — it has probably just gone to
sleep and needs waking.

### 10 · Run the schema

Dashboard → **SQL Editor** → **New query**. Open `supabase/schema.sql` from the
repository, copy all of it, paste, **Run**.

That is all ten migrations in order inside one transaction: if anything fails,
nothing at all is applied, and you can fix it and paste again. It takes a few
seconds.

The SQL has been checked against the real Postgres grammar but **this is its
first execution**, so something may still surface. If it does, paste the error
to Claude Code — it knows this schema well.

Then check the security took: **Table Editor**, and every table should say **RLS
enabled**. If `orders` ever shows RLS *disabled*, stop and fix it before going
further — customer names and addresses would be readable by anyone.

### 11 · Staff sign-in

**Authentication → Providers → Email → turn OFF "Enable signups".** With signups
on, anybody could make themselves an account.

Then **Authentication → Users → Add user** for himself, and run this in the SQL
editor with his email in it:

```sql
insert into public.staff (id, email, full_name, role)
select id, email, 'Shawn <surname>', 'owner'
from auth.users where email = 'his@email.com';
```

Being in `public.staff` is what makes somebody staff. An auth account on its own
can see nothing.

### 12 · Point the site at it

**Settings → API** gives a **Project URL** and an **anon** key. Both are safe in
a browser. The **service_role** key on the same page is not — it ignores every
security rule, and it belongs only in Netlify's environment variables.

In the project folder:

```bash
cp .env.example .env
```

Open `.env`, fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then:

```bash
node --env-file=.env build.js
node serve.js
```

Open <http://localhost:8787/admin>. It should ask for a real sign-in now rather
than saying "prototype", and his Supabase login should work. Products, orders
and the Insight page are all live against the database from here.

### 13 · Then tell Nate

The same two values go into **Netlify → Site configuration → Environment
variables**, along with `SUPABASE_SERVICE_KEY`, and the live site becomes real
on the next deploy.

---

## Working on it without breaking it

**Before pushing anything:**

```bash
node tests/all.js
```

**Work on a branch, not on `main`:**

```bash
git checkout -b whatever-you-are-doing
# ... make changes ...
git add -A
git commit -m "a sentence about what changed and why"
git push -u origin whatever-you-are-doing
```

Then open a pull request on GitHub. The tests run automatically and show a green
tick or a red cross. Nate can look before it merges.

**Things the project will stop you doing**, so you do not have to remember them:

- Adding a photograph without generating its AVIF version — the build refuses.
- Publishing the policy pages with blanks still in them — the build refuses.
- Turning on analytics without updating the privacy page — the build refuses.
- Filling in half an address — the build refuses, because a half-right address
  is worse than none for local search.
- Letting the storefront and the database disagree about which states an item
  cannot ship to — a test fails.

**Things nothing will stop you doing**, so do remember them:

- Committing a `.env` file with real keys in it. Git is set up to ignore it;
  do not fight that.
- Pasting a service key into a chat window, an email, or a screenshot.
- Changing a price in the code rather than in `/admin`. The database wins on the
  next build, so the code edit quietly disappears.

## Where things are

| | |
|---|---|
| `site/index.html` | the whole public site — markup, styles and script in one file |
| `site/admin.html` | the staff area |
| `build.js` | turns those into `dist/`, one real page per route |
| `supabase/migrations/` | the database, in order |
| `supabase/schema.sql` | all of the above in one pasteable file (generated) |
| `netlify/functions/` | the bits that need a server: orders, email, dealer search |
| `tests/` | run them with `node tests/all.js` |
| `docs/` | this, the Supabase setup, and the payments write-up |

The `README.md` in the root explains the reasoning behind most decisions. It is
worth half an hour before changing anything structural.
