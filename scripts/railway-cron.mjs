// Railway cron job: runs every five minutes and exits.
const base = (process.env.APP_URL || "https://august.irlabs.tech").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
if (!secret) { console.error("CRON_SECRET missing"); process.exit(1); }
const now = new Date();
const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000);
const day = msk.getUTCDay(), hour = msk.getUTCHours(), minute = msk.getUTCMinutes();
const jobs = ["/api/cron/group-feed", "/api/cron/reminders"];
// Once per week, Monday 09:00-09:04 Moscow time.
if (day === 1 && hour === 9 && minute < 5) jobs.push("/api/cron/weekly-report");
let failed = false;
for (const path of jobs) {
  try {
    const response = await fetch(base + path, { method: "POST", headers: { Authorization: "Bearer " + secret }, signal: AbortSignal.timeout(120000) });
    const body = await response.text();
    console.log(JSON.stringify({ job: path, status: response.status, result: body.slice(0, 2000) }));
    if (!response.ok) failed = true;
  } catch (error) { failed = true; console.error(path, String(error)); }
}
if (failed) process.exitCode = 1;
