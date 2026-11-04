# ChronoPalette — Multi-Theme Smart Calendar

A responsive, client-side web application inspired by Google Calendar featuring a **Dynamic Weekly & Monthly Theme Engine**, **Multimedia Image Attachments**, **Recurring Events**, and **Automated 10-Minute Pre-Event Reminders**.

---

## Key Features

### 1. Core Calendar Architecture
- **Views:** Smooth switching between **Month**, **Week**, and **Day** views (`M`, `W`, `D` keyboard shortcuts).
- **Navigation:** Top bar with **Today** (`T`), **Previous**, and **Next** controls, plus a collapsible sidebar with an interactive **Mini-Month Date Picker**.
- **Full Event & Task CRUD:** Create (`C` or click any date cell / half-hour slot), read, edit, duplicate, complete, and delete events or tasks with Title, Start/End Date & Time, All-Day toggle, Category/Color tags, Location, and Description. Starts completely clean with zero pre-populated events or tasks.
- **Category & Custom Color Tags:** Includes three built-in tags — **Class Sched** (Purple), **Class Events** (Light Blue), and **Class Exams** (Green) — plus the ability to create custom tags with a chosen color via quick swatches or a full-spectrum custom color picker.
- **Recurring Events & Custom Recurrence:** Supports preset schedules (`Daily`, `Weekly`, `Monthly`, `Annually`) as well as a full Google Calendar–style **Custom Recurrence** dialog (`Repeat every N day/week/month/year`, multi-weekday `S M T W T F S` selector, and `Ends: Never / On [Date] / After [N occurrences]`), fully styled with the active theme's tokens.
- **Instant Search & Category Filters:** Live keyword filtering across titles, descriptions, locations, and categories, with an instant jump-to-event dropdown.
- **Client-Side Persistence:** Events (including uploaded images) persist in **IndexedDB** with automatic fallback to `localStorage`, while theme preferences and reminder state persist in `localStorage`.

### 2. Dynamic Weekly & Monthly Theme Engine
Scoped CSS Custom Properties (`[data-theme="..."]`) allow **Global**, **Per-Month**, and **Per-Week** theme assignments (`Per-Week > Per-Month > Global Default`) so different week rows inside a single Month view can render completely distinct palettes simultaneously without style leaking:
- **Standard Modes:**
  - `light` — Clean daylight white surfaces, subtle slate grid lines, and cobalt blue accents.
  - `dark` — Sleek low-glare midnight slate surfaces and soft sky-blue highlights.
- **Kamen Rider OOO (`ooo`):**
  - Metallic Greeed dark chrome surfaces, O-Scanner gold rims, and Tatoba (Taka Red / Tora Yellow / Batta Green) Core Medal badges.
- **Wednesday (`wednesday`):**
  - Addams / Nevermore gothic obsidian & charcoal dark mode with dark violet/burgundy accents and stained-glass window framing.

### 3. Multimedia Support
- Attach `PNG`, `JPG`, or `WebP` images via drag-and-drop / file picker (`FileReader` + smart canvas optimization) or paste an external image URL.
- Renders thumbnail previews directly inside calendar grid event cards and full-resolution previews (with fullscreen lightbox zoom) in the Event Detail modal.

### 4. Automated 10-Minute Pre-Event Reminders
- Requests browser `Notification` permission on first visit.
- Precision 1-second timer engine triggers both a synthesized Web Audio harmonic chime and a native desktop notification **10 minutes** before event start, falling back automatically to an animated in-app toast alert when browser notifications are denied or restricted.

---

## Getting Started

```bash
npm install
npm run dev
```
