# VSG Flow Tracker

Value stream mapping tool. Visualizes work-vs-wait time across campaigns without complex data entry.

## Setup (5 minutes)

1. Create a project at [supabase.com](https://supabase.com)
2. Open the SQL Editor and run `schema.sql`
3. Open `index.html` in a browser (or serve with `npx serve .`)
4. Enter your Supabase Project URL + Anon Public Key on the setup screen
5. Credentials are stored in localStorage — no config file needed

## Usage

- **Campaigns** — create a campaign, add stages, toggle Work vs Wait, enter timestamps or manual durations
- **Timeline** — auto-generated horizontal VSM as soon as stages have data
- **Templates** — save a reusable stage sequence, stamp onto new campaigns from the drawer
- **Export** — PNG export of the timeline card via the button in campaign detail
- **Tweaks** — bottom-right button for dark/light mode and density

## How duration is calculated

Priority order per stage:
1. `touch_time_min` — manual override in minutes (fastest, good for historical data)
2. `ended_at - started_at` — automatic from timestamps
3. If `started_at` is set but `ended_at` is not → duration counts from now (live/in-progress)
4. If neither — stage shows as 0 width (grayed out)

## Integration

This is a standalone vanilla React app (no bundler). To embed in the KPI dashboard:
- `?embed=true` — strips sidebar/topbar, renders just the timeline (iframeable)
- `window.VSMData` — exposed in the browser console after load, clean JSON shape for external reads

## Future: connecting to SOAR DAM

The `campaigns` table can gain a `soar_template_id` foreign key to link a flow map to a SOAR template. Schema change is additive — no migration pain.

## Stack

- React 18 + Babel Standalone (no bundler)
- Supabase JS v2 (CDN)
- VSG Design System (design-system.css)
- html2canvas for PNG export
