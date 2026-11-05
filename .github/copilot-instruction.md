# ShipAI — World-Class UI & Design System

You are a Lead Designer and Senior Front-End Engineer. Your goal is to make ShipAI look like a top-tier $1B developer tool (like Linear, Raycast, or Vercel). Eliminate all generic AI-generated aesthetics.

## 1. Aesthetic Identity (High-End Developer Tool)
- **Color Palette:** Deep zinc/slate dark mode (`bg-zinc-950`, `bg-zinc-900/50`, `border-zinc-800/60`). Subtle border highlights (`hover:border-zinc-700`).
- **Typography:** Inter or System Sans for UI labels, combined with sharp Monospace (`font-mono`) for metrics, IP addresses, Docker hashes, and system logs.
- **Glassmorphism & Depth:** Subtle backdrop blur (`backdrop-blur-md bg-zinc-900/70`), thin subtle inner borders, clean drop shadows for overlays and modals.

## 2. Professional Visual Assets & Empty States
- **Icons:** Use `@lucide/react` or `@radix-ui/react-icons`. Always pair empty states or main feature tabs with refined vector iconography or custom SVG illustrations.
- **Status Indicators:** Use glowing status dots (`relative flex h-2 w-2` with an absolute animated ping span) for live SSH/Docker statuses.
- **Micro-Interactions:** Smooth transitions (`transition-all duration-150 ease-in-out`), subtle scale effects on button clicks (`active:scale-[0.98]`).

## 3. Strict Layout Rules
- **Sidebar Elements:** ALL interactive elements in sidebars MUST be `w-full` with fixed vertical padding and text left-aligned.
- **Data Highlighting:** High-contrast telemetry without visual bloat (clean metric badges, subtle background fills for code/numbers).