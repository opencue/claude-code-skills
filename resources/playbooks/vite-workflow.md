# Playbook: Ship a Vite + React + TanStack feature (contract → type → build → test → ship)

Use when the user asks for a new route, screen, or data-backed component on a
Vite + React + TanStack app (file-based route → Query/loader data → typed
component → test → build). This codifies the profile's domain so you build
type-first, verify visually, and never call a green build "done."

## 1. Pin the route contract

- Name the URL and its params: `/products/$id`, `/search`, `/dashboard`.
- Decide the data source: route **loader** (server-shaped, runs in parallel
  with render) vs **TanStack Query** (client-cached, refetch on focus). Don't
  put the same data in both.
- Declare typed search params with a `validateSearch` Zod schema if the route
  reads the query string.
- Smart-load `/spec` (via `/smart-loader`; not loaded in this profile) when the
  shape is fuzzy (3+ unknowns or a data contract to lock).
- For API-backed routes, coordinate the data contract with the backend first.
  Match the response shape to `playbooks/backend-workflow.md` so loader/query
  types and the server's payload stay in sync.
- **Verify:** you can state the route path, its param/search types, and which
  fetch is a loader vs a query in one sentence.

## 2. Read the seam before writing

- Open 2-3 sibling routes under `src/routes/` and copy their loader + component
  split, error/pending wiring, and import style.
- Confirm `vite.config.ts` has `tanstackRouter()` in `plugins` so the new file
  generates a typed route.
- **Verify:** the new route file matches an existing one's structure, not a
  hand-written `Route` definition.

## 3. Create the file-based route

- Add `src/routes/<path>.tsx` and let the plugin regenerate `routeTree.gen.ts`.
- Wire the typed `loader: ({ params }) => fetchThing(params.id)`; reach for
  `Route.useLoaderData()` in the component, never `useEffect` data fetch.
- Add `pendingComponent`, `errorComponent`, `notFoundComponent` on the route
  config when the route can stall or 404.
- **Verify:** `<Link to="/your/route">` autocompletes the path and params with
  no type error.

## 4. Type the data layer

- Loader data: type the fetch return; the loader propagates it to the component
  for free.
- Query data: structure `queryKey` like an API path (`['products', region,
  filters]`) and set a deliberate `staleTime`, not the default 0.
- Write paths: mutation + `invalidateQueries` on the affected key.
- **Verify:** `tsc --noEmit` (or `vite build`'s type pass) is clean with no
  `any` on loader or query results.

## 5. Build the typed component

- Explicit prop types, no `any`, every loading and error branch rendered.
- Keep the slow fetch in the loader so it streams; render the pending state
  while it resolves.
- Honor WCAG AA: role, label, and keyboard path on every interactive element.
- **Verify:** the component reads its data from `Route.useLoaderData()` /
  `useQuery`, and no branch renders `undefined`.

## 6. Write the Vitest test first

- Add `<route>.test.tsx` next to the component; Vitest reuses the Vite config so
  imports match the build.
- Test the typed loader output and the component's loading + error + success
  branches. Mock the fetch, assert the rendered result (AAA).
- Run `vitest run <file>` and confirm it fails for the right reason before you
  make it pass.
- **Verify:** the new test is green and `vitest run` (full suite) stays green.

## 7. Verify visually, not just structurally

- Run `vite dev`, open the route, and screenshot it with the inherited
  `design/screenshot` skill. A passing `vite build` is not a working page.
- Confirm the loader's pending state renders, HMR left no stale state, and the
  error route shows on a forced failure.
- Smart-load `/design-review` (via `/smart-loader`; not loaded in this profile)
  when the route is user-facing and polish matters; drive `browser/playwright`
  (or smart-load `/qa`) for multi-step flows.
- **Verify:** the screenshot shows the intended UI at the target viewport, not
  a blank or error frame.

## 8. Gate, then ship

- Run `vite build` (SPA → `dist/`, TanStack Start → `.output/`) and confirm it
  passes.
- Run `/code-review-deep` on the diff before calling it done; smart-load
  `/health` (via `/smart-loader`; not loaded in this profile) for the repo-wide
  score. Add `/careful` or `/freeze <dir>` when the blast radius is real.
- Smart-load `/ship` (via `/smart-loader`; not loaded in this profile) for the
  commit + PR; `/canary` after deploy to watch the live route.
- **Verify:** build green, review clean, and the smart-loaded `/ship` opened
  the PR.

**See also:** `playbooks/backend-workflow.md` (sync the data contract).

## Anti-patterns to avoid

- ❌ `useEffect` data fetch when a typed loader fits. You lose the type chain
  and the parallel render.
- ❌ Mirroring loader data into a TanStack Query cache (or the reverse). One
  source per datum.
- ❌ Hand-writing `Route` definitions instead of file-based routes. That breaks
  automatic code splitting and type generation.
- ❌ Calling it done on a green `vite build` without a screenshot. The build
  checks types, not pixels.
