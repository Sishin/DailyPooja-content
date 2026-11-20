# Daily Pooja — published content

The Daily Pooja app downloads [`v1/content.json`](v1/content.json) (through the jsDelivr CDN, at most
twice a day) and applies it on top of what is built into the app. Use it for things that should change
without an app release. Merging to `main` publishes; the app picks it up within about 12 hours.

**Everything here is public.** Don't put anything private in this repo.

The app keeps working offline and ignores anything malformed, entry by entry, so a mistake here can
hide one item but can't break the app. Every pull request is validated automatically.

## What you can publish

| Key | What it does |
|---|---|
| `festivalOverrides` | Correct a calculated festival date: `{ "id": "janmashtami", "year": 2027, "date": "2027-08-25" }`, or remove one: `{ "id": "chhath", "year": 2027, "hide": true }`. An optional `note` is for reviewers only. |
| `extraFestivals` | Add a festival the app doesn't calculate (see below). |
| `verses` | Extra verses for the verse of the day: `{ "verse": "…", "meaning": { "en": "…", "hi": "…" }, "source": "…" }` |
| `banners` | A message on Home between two dates (inclusive): `{ "id": "navratri_2026", "from": "2026-10-04", "to": "2026-10-11", "icon": "auto_awesome", "text": { "en": "…", "hi": "…" }, "link": "festivals" }`. `link` can be `festivals` or `premium`. Each banner can be dismissed. |
| `disabled` | Turn a feature off remotely: `"greeting_card"`, `"panchang"`. |
| `checkIgnore` | Stop the weekly check proposing a date you've decided to keep: `{ "id": "janmashtami", "year": 2027 }`. |
| `updated` | Change this whenever you edit the file (any text; the date is easiest). |

Festival ids: `makar_sankranti`, `vasant_panchami`, `maha_shivaratri`, `holi`, `chaitra_navratri`, `ram_navami`,
`hanuman_jayanti`, `akshaya_tritiya`, `guru_purnima`, `nag_panchami`, `raksha_bandhan`, `janmashtami`,
`ganesh_chaturthi`, `sharad_navratri`, `dussehra`, `dhanteras`, `diwali`, `govardhan_puja`, `bhai_dooj`,
`chhath`, `kartik_purnima`.

Example extra festival (`icon` is a [Material Symbols](https://fonts.google.com/icons) name; `deityId` is optional and
adds a "Start pooja" button — `ganesha`, `shiva`, `durga`, `krishna`, `hanuman`, `saraswati`):

```json
{
  "id": "onam",
  "date": "2026-08-26",
  "icon": "spa",
  "name": { "en": "Onam", "hi": "ओणम" },
  "tip": { "en": "Make a pookalam at the entrance and prepare the sadya.", "hi": "द्वार पर पूक्कलम बनाएँ और सद्या तैयार करें।" }
}
```

## Weekly date check

Every Monday a GitHub Action compares the app's festival dates ([`v1/festivals.json`](v1/festivals.json),
generated from the app) with Google's public *Holidays in India* calendar. When they differ it opens
(or updates) a pull request proposing `festivalOverrides`, with a table of the differences.

**Review it before merging.** Check each date against a printed panchang for your users' region —
regional traditions can differ by a day, and the calendar can be wrong too. Drop any proposal you
disagree with and add it to `checkIgnore`. Run it any time from *Actions → Weekly festival check → Run workflow*.

Regenerate `festivals.json` from the app repo after changing festival rules, and at least once a year:

```bash
npm run content:festivals -- ../DailyPooja-content/v1/festivals.json
```

## Run locally

```bash
node scripts/check.mjs            # validate + compare
node scripts/check.mjs --validate # validate only
```
