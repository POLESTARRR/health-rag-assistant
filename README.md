# Health Assistant

Upload monthly health documents (lab reports, doctor's notes, imaging reports, vitals logs) for a
family member. It extracts structured values, tracks trends month over month, generates a
plain-language monthly digest of what improved or worsened, and lets you ask questions across the
full history with a RAG chat assistant.

Everything runs on free tiers: **Next.js on Vercel** plus **Supabase** (Postgres/pgvector, Storage,
Auth) plus the **Google Gemini API**.

## 1. Create a Supabase project (free)

1. Go to [supabase.com](https://supabase.com) and create a new project on the free tier.
2. In the SQL Editor, paste and run the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). This enables `pgvector` and creates all tables, RLS policies, storage policies, and the vector search function.
3. In **Storage**, create a new bucket named `documents`. Keep it **private**.
4. In **Project Settings > API**, copy:
   - `Project URL` into `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key into `SUPABASE_SERVICE_ROLE_KEY` (server only, never expose it to the browser)
5. In **Authentication > Providers**, make sure **Email** is enabled with the magic link (OTP) flow. Family members do not need a password. They just get an email link to sign in.
6. In **Authentication > URL Configuration**, add your deployed URL and `http://localhost:3000` to the Redirect URLs list. For example `https://your-app.vercel.app/auth/callback`.

There is no invite or signup flow. Anyone with access to the Supabase Auth dashboard can add allowed
emails under Authentication > Users > Add user, since this is meant to be a small private family
tool.

## 2. Get a free Gemini API key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and create a key on the free tier.
2. Copy it into `GEMINI_API_KEY`.

The free tier is generous for personal use. If you hit rate limits during heavy testing, the Google
AI Studio dashboard shows your current usage against the quota.

## 3. Local development

```bash
cp .env.local.example .env.local
# fill in the 4 values from steps 1 and 2
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/login`. Sign in
with an email you have added in Supabase Auth.

### Signing in locally without waiting for email

The built-in Supabase email service is rate limited to a couple of messages per hour, and on newer
projects it only delivers to members of the Supabase project. The magic link often never arrives
during local development. Instead of waiting on it:

```bash
npm run login              # picks the only user, if there is exactly one
npm run login you@example.com
```

This mints a sign-in link through the admin API and opens it, with no email round trip. The link is
single use and expires in an hour. It reads the `service_role` key from `.env.local`, so it only
works on your machine.

To get real emails in production, configure custom SMTP under **Project Settings > Authentication >
SMTP Settings**. A free Resend or Brevo account is enough and removes the rate limit.

## 4. Deploy to Vercel (free)

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Add the same 4 environment variables from `.env.local` in the Vercel project settings.
4. Deploy. Once it is live, add the deployed URL's `/auth/callback` path to the Supabase Redirect URLs from step 1.6.

## How it works

- **Upload** (`/upload`) tags a file to a person and a month, stores it in Supabase Storage, then
  sends it to Gemini. The model is multimodal and reads PDFs and images directly, so there is no
  separate OCR step. It returns the full text plus structured lab values for the `lab_values` table.
- **Monthly digest** (`/`) pulls this month's values along with the full history per metric and asks
  Gemini to narrate what improved or worsened and why. Results are stored in `monthly_digests`.
- **Trend charts** (`/`) draw one line chart per metric across all uploaded months, built from
  `lab_values`.
- **Chat** (`/chat`) embeds your question, runs a pgvector similarity search over all document
  chunks scoped to the selected person using the `match_doc_chunks` SQL function, and answers with
  conversation memory per session.

## Continuous integration

Every push and pull request against `main` runs typecheck, lint, and a production build through
[`.github/workflows/ci.yml`](.github/workflows/ci.yml). The workflow uses placeholder environment
variables because nothing contacts Supabase or Gemini at build time.

## Notes

- This is not a medical device and it gives no diagnoses. Digests and chat answers always end with a
  reminder to consult a real doctor.
- Parsing and digest generation are synchronous API calls rather than background jobs, which keeps
  the free stack simple. Large documents or long histories can take a while, so those routes set
  `maxDuration = 60`.
