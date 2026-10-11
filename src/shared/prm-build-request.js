import { withSkillInstructions } from "./skill-instructions.js";

const CANONICAL_WRAPPER = `[PRM_BUILD_REQUEST_V5]
request_id: {{request_id}} timestamp: {{timestamp}}
── PROJECT CONTEXT ── repository: {{repository}} / branch: {{branch}} lovable_project_id: {{lovable_project_id}} lovable_editor_url: {{lovable_editor_url}} supabase_project_ref: {{supabase_project_ref}} preview_host: {{preview_host}}
── HOW DEPLOYMENT WORKS ──
Read this before doing anything.
This project is hosted on Lovable. Lovable has a git-sync build service attached to the repository above. Every commit pushed to the branch above triggers an automatic rebuild and redeploy of the entire application — frontend, backend endpoints, server functions, and any migrations the build pipeline is configured to run.
You do not need to invoke any deploy mechanism. You do not need to call any deployment API. You do not need to touch any deployment route. The commit IS the deploy. When you have pushed, the work is done.
This is true regardless of what kind of backend the project uses:
• Lovable Cloud (Supabase behind Lovable's proxy)
• An external Supabase project the user owns
• No backend at all (frontend-only)
In every case, the push is the trigger. The build service runs. The new version goes live.
── YOUR JOB ──
You are the implementer. Work on the repository above. Read the repo before writing any code. Match what you find. Do not invent.
── STEP 1: DISCOVER ──
Before writing anything, inspect the repo and establish:
1. Framework. Read package.json — name, dependencies, scripts. Is it TanStack Start, Next.js, Remix, Vite+React, Astro, something else?
2. Project rules. Read README.md. Read AGENTS.md if present — AGENTS.md is authoritative and overrides anything else in this wrapper except safety rules.
3. Platform config. Read .lovable/project.json, vercel.json, netlify.toml, Dockerfile, or any equivalent the project uses.
4. DB access. Find how server-side code talks to the database. Look in:
◦ src/integrations/supabase/client.server.ts (Lovable/TanStack default)
◦ src/lib/db.ts (Drizzle default)
◦ src/lib/supabase/client.ts (external Supabase default)
◦ whatever else the project uses Read that module. Note the exact import path and the exported symbol used by existing server routes.
5. Route conventions. List the routes folder (src/routes/, app/, pages/, or equivalent). Read one existing public endpoint as a reference for shape, exports, and Response construction.
6. Schema and migrations. Read the schema file (drizzle/schema.ts, prisma/schema.prisma, supabase/migrations/, or equivalent). List the most recent migration files. Read them. Note the exact companion-file pattern the project uses (SQL + journal + snapshot + schema.ts for Drizzle; .sql-only for raw Supabase migrations; etc.).
7. Styling. Read one existing frontend route component. Note how it is styled (Tailwind, component library, CSS modules, etc.) and match that style for any new UI.
Do all seven. Only then start writing.
── STEP 2: RULES ──
These apply to every task, on every project shape.
• Commit directly to the branch above. No pull requests. No approval requests.
• Never create a new DB client. Use the one you discovered in step 4. Never invent env var names. Never reference DATABASE_URL, POSTGRES_URL, LOVABLE_DB_MIGRATION_URL, or any env var that isn't already read by existing code in this repo.
• Never place a client or env-var read at the top level of a module in a way that can throw at import time. A single unhandled throw during module evaluation crashes server-side rendering for the entire app, including the homepage. If a required env var is missing, fail inside the request handler, not at module load.
• Never put secrets or service-role keys into client-side code. Anything prefixed VITE_* or NEXT_PUBLIC_* lands in the browser bundle and is public. Admin client usage stays in server-only modules.
• If the repository contains a supabase/functions/ directory, leave it alone and do not add to it. That path is legacy on modern Lovable builds and is not deployed.
• Match existing patterns. Read 2–3 existing files that do similar things before writing new ones. If you must introduce a pattern the repo doesn't already use, say so explicitly in the report.
• If the task involves a schema change: update the ORM schema AND every companion file the ORM requires in the same commit. For Drizzle that means schema.ts, migrations/NNNN_.sql, an updated meta/_journal.json, and a new meta/NNNN_snapshot.json — all four in the same commit. Missing any one means the migration will not run.
• Every migration must be idempotent, so that a re-run is harmless if the tracking table ever resets: CREATE TABLE IF NOT EXISTS ... CREATE INDEX IF NOT EXISTS ... ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... CREATE OR REPLACE FUNCTION ... DROP POLICY IF EXISTS x ON y; then CREATE POLICY x ON y ... For CREATE TYPE, wrap in a DO block that swallows exception when duplicate_object then null.
• Never use .select(..., { head: true }) for existence checks. On PostgREST, a HEAD request against a missing table returns 204 No Content with no error, silently coercing a count to 0 — a false positive. If you need to test whether a table exists, use .select("id").limit(1) and inspect the returned error object (PGRST205 = table not found).
• Never assume the shape of a table or column. If you're writing code that reads or writes a table, read the schema or the migration that creates it first.
── STEP 3: TASK TYPE ──
Classify the user's request as one of:
A. FRONTEND — components, pages, styling, routing. B. BACKEND — API routes, server functions, no schema change. C. FULL-STACK — frontend plus backend plus wiring. D. SCHEMA — a schema change that requires new migration files. E. DATA-OPS — a one-off operation against the database.
Do the smallest work that satisfies the request. Do not over-deliver. Do not refactor code that isn't in scope.
── STEP 4: EXECUTE ──
Perform the task end to end. Do not stop to check in with me. Do not ask for confirmation at intermediate steps.
If you encounter genuine ambiguity that cannot be resolved by reading the repo — a referenced file that does not exist and has no reasonable substitute, a required value you cannot discover — make the most reasonable assumption, note it in the report, and proceed. Never halt mid-task.
── STEP 5: REPORT ──
After your commits are pushed, report:
1. Files added, changed, or deleted (full paths)
2. Commit SHA (or SHAs)
3. Task type (A / B / C / D / E)
4. Whether the task touched the database schema (yes / no). If yes, name the migration file(s) you created.
5. Anything non-pattern-matched, and why
6. Any assumption you made that turned out different from reality, and how you handled it.
Finish with exactly one marker on its own line. Nothing after it.
[PRM_DONE] — the task is complete and you believe it is correct [PRM_BLOCKED] — something outside the repository prevented completion [PRM_ERROR] — you attempted the task and it failed or broke existing functionality
USER SELECTED SKILLS
----------------‐--------

── USER REQUEST ──
{{user_request}}`;

function diagnosticFields(diagnostics) {
  const gitsync = (Array.isArray(diagnostics) ? diagnostics : [])
    .slice()
    .reverse()
    .find((item) => /\/gitsync\/?$/i.test(String(item?.endpoint || "")) && Array.isArray(item?.gitsyncFields));
  return Array.isArray(gitsync?.gitsyncFields) ? gitsync.gitsyncFields : [];
}

function cleanSingleLine(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function branchFromDiagnostics(diagnostics) {
  const fields = diagnosticFields(diagnostics).filter((field) =>
    /(?:^|[._])(?:current_)?branch(?:_name)?$/i.test(String(field?.path || "")) &&
    !/default[_-]?branch/i.test(String(field?.path || "")) &&
    typeof field?.value === "string" &&
    /^[A-Za-z0-9._/-]{1,120}$/.test(field.value),
  );
  const branch = fields.find((field) => /current|selected|active/i.test(field.path)) || fields[0];
  return branch?.value || "main";
}

function previewHostFromDiagnostics(diagnostics) {
  for (const field of diagnosticFields(diagnostics)) {
    if (!/preview/i.test(String(field?.path || "")) || typeof field?.value !== "string") continue;
    const value = field.value.trim();
    try {
      const url = new URL(value.includes("://") ? value : `https://${value}`);
      if (url.hostname && !/^(?:localhost|127\.0\.0\.1)$/i.test(url.hostname)) return url.host;
    } catch {}
  }
  return "";
}

export async function assemblePrmBuildRequest(payload = {}, selectedSkills = []) {
  const request = typeof payload.text === "string" ? payload.text : String(payload.text || "");
  const projectId = cleanSingleLine(payload.lovableProjectId);
  const sourceUrl = cleanSingleLine(payload.url);
  const isLovableEditor = /^https:\/\/lovable\.dev\//i.test(sourceUrl);
  const [integrations, bindings] = projectId
    ? await Promise.all([
      chrome.storage.local.get("projectIntegrations"),
      chrome.storage.local.get("workspaceBindings"),
    ])
    : [{}, {}];
  const detectedSupabase = integrations.projectIntegrations?.[projectId]?.supabase;
  const supabaseProjectRef = detectedSupabase?.status === "connected"
    ? cleanSingleLine(detectedSupabase.projectRef)
    : "";
  const repository = cleanSingleLine(payload.repository || bindings.workspaceBindings?.[projectId]?.repository);
  const values = {
    request_id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    repository,
    branch: cleanSingleLine(payload.branch) || branchFromDiagnostics(payload.apiDiagnostics),
    lovable_project_id: projectId,
    lovable_editor_url: isLovableEditor ? sourceUrl : "",
    supabase_project_ref: supabaseProjectRef || "<ref, if detected>",
    preview_host: cleanSingleLine(payload.previewHost) || previewHostFromDiagnostics(payload.apiDiagnostics) || "<host, if detected>",
    user_request: request,
  };
  const canonicalPrompt = CANONICAL_WRAPPER.replace(/\{\{([a-z_]+)\}\}/g, (placeholder, name) => values[name] ?? placeholder);
  const skillSupplement = withSkillInstructions("", selectedSkills).trim();
  return skillSupplement ? `${canonicalPrompt}\n\n${skillSupplement}` : canonicalPrompt;
}

export const canonicalPrmWrapper = CANONICAL_WRAPPER;
