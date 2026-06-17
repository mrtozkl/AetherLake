# 🎨 Frontend Development Standards: Control Panel

This document contains instructions for modifying the AetherLake Control Panel, a web-based dashboard built on Next.js 16 and React 19.

---

## 🏗️ Technology Stack

- **Framework**: Next.js 16 (App Router)
- **Library**: React 19 (Functional Components, Hooks)
- **Language**: TypeScript (Strict type checks)
- **Styling**: Tailwind CSS (Utility classes) & Framer Motion (Transitions)
- **Icons**: Lucide React
- **Auth**: NextAuth.js (Keycloak OpenID Connect / Credentials fallback)

---

## 🌐 Internationalization (i18n)

AetherLake Control Panel is bilingual, supporting English (`en`) and Turkish (`tr`).

1. **Locales**: All UI text is structured in [control-panel/src/app/i18n.ts](file:///Users/mrtozkl/Documents/open-lake/control-panel/src/app/i18n.ts).
2. **Usage**:
   - Wrap views/components in the `LocaleProvider` context.
   - Use the `useLocale` hook to read the translation keys.
3. **Requirement**: 
   > [!IMPORTANT]
   > Do **NOT** hardcode text strings inside component files. Always add corresponding keys to the translation object in `i18n.ts` for both Turkish (`tr`) and English (`en`).

---

## 💅 Styling & Visual Standards

AetherLake uses a modern, dark-themed, glassmorphic design. Follow these standards:

- **Typography**: Clean, sans-serif font family. Match the font styling defined in `layout.tsx`.
- **Theme**: Consistency in dark background palette (`bg-slate-950`, `bg-slate-900`, `border-slate-800`).
- **Glassmorphism**: Use backdrop filters for overlay panels (`backdrop-blur-md bg-slate-900/70 border border-slate-800`).
- **Interactive States**: Always include hover and active states (transitions, color changes, scale changes) to make components feel responsive.
- **Animations**: Use `framer-motion` for page transitions and modal reveals.

---

## ⚙️ Routing & Page Structure

1. **Pages**: Placed inside `src/app/`.
   - `/` - Dashboard / Platform Overview
   - `/trino` - Trino catalogs management
   - `/polaris` - Polaris catalog and namespace configurations
   - `/query` - SQL IDE with Monaco Editor
2. **API Routes**: Nested under `src/app/api/` (interacting with Kubernetes cluster node clients, Trino API, and Polaris API).
3. **TypeScript Guidelines**:
   - Declare interfaces for all API payloads and component props.
   - Do not use `any`. Use React generic props where applicable.
