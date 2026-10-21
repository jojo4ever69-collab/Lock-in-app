# Lock In

Film a focus timelapse of yourself working without draining your battery or
filling your camera roll, then track your sessions the way Strava tracks runs.

It's a web app you add to your home screen. There's no build step, no
dependencies, no server and no account. Everything stays on your phone.

## What it does

- **Record**: prop your phone up, pick a category (Studying, Coding…) and a
  goal (25 / 50 / 90 min or no limit), and tap record. A big serif timer counts
  down and chimes when you hit the goal, then keeps counting overtime.
- **Automatic dimming**: after 6 seconds the screen goes fully black (on
  OLED phones, black pixels are switched off). Tap to wake. Finishing takes a
  deliberate press-and-hold so you can't end a session by accident.
- **Accountability**: leaving the app mid-session is counted ("Left the app
  2× · 3m away") and that time doesn't count toward your focus time.
- **Timelapse without the storage**: instead of recording video, it saves one
  small JPEG every second. At 720 frames it drops every other frame and halves
  the capture rate, so any session, 20 minutes or 6 hours, ends up as a
  12–24 second timelapse of a few MB. Each session also has a **Free up space**
  button that deletes the frames and keeps the stats and cover photo.
- **History**: a feed of your sessions with covers, playable timelapses,
  notes and categories.
- **Share**: a 1080×1920 share card (CATEGORY / 1h 4m / date) for stories, or
  an MP4 of the timelapse with a running clock burned in.
- **You**: sessions, longest and total time, filters by category, this
  week/month/all time with "% vs this time last month", a calendar heatmap,
  streaks, and a grid of every session.
- **Friends**: a weekly leaderboard with "128h 22m together", a running-total
  chart per person and per-category bars. Friends are added by sharing a link
  (see below).

Want to see it filled in before recording anything? Open **You → settings
(top right) → Load sample data**. Remove it the same way.

## Run it

Any static file server works. The camera needs `https` or `localhost`.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

### Put it on your phone (GitHub Pages)

1. Push this repo to GitHub.
2. Go to **Settings → Pages**, set **Source** to *Deploy from a branch*, and
   pick `main` and `/ (root)`.
3. Open `https://<your-username>.github.io/<repo-name>/` on your phone.
4. Add it to your home screen: in Safari, **Share → Add to Home Screen**; in
   Chrome, **⋮ → Add to Home screen**.

## How friends work without a server

**Friends → Share my link** makes a link that carries your name and your last
four weeks of minutes per category (a few hundred characters, compressed into
the URL). When a friend opens it, you appear on their leaderboard. Send a new
link whenever you want them to see fresh numbers. Nothing is uploaded
anywhere. If you want live syncing later, swap `js/friends.js` for a real
backend (Supabase or Firebase would both work).

## Honest limits of a web app

- A web page can't switch the screen off or turn the brightness down, so
  "dimming" means a pure-black screen plus a screen wake lock. That saves a lot
  on OLED screens (most recent iPhones and Androids) and less on LCD ones.
- If the phone auto-locks, the browser pauses the page and the camera. The
  wake lock prevents that on iOS 16.4+ in Safari and on Chrome for Android. If
  your screen still locks (older iOS, or some home-screen installs), set
  **Settings → Display & Brightness → Auto-Lock → Never** while you work.
- Data lives in the browser's storage on that one device. Clearing Safari's
  website data deletes it.

## Code map

| File | What it does |
| --- | --- |
| `js/recorder.js` | Camera, frame capture and thinning, wake lock, goal chime |
| `js/player.js` | Plays stored frames on a canvas, decoding a few ahead |
| `js/exporter.js` | Share card PNG and MP4/WebM timelapse export |
| `js/friends.js` | Friend-link encoding, validation and the leaderboard data |
| `js/stats.js` | Totals, period comparisons, streaks, heat levels |
| `js/db.js` | IndexedDB: sessions, frames, settings |
| `js/views/*.js` | Record, History, Session, You and Friends screens |
| `js/demo.js` | Sample data with painted desk-scene covers |
| `sw.js` | Offline support |
