# skills-vault

Copie a tuturor skill-urilor de agent (Claude Code, claude.ai, Codex) de pe PC, adunate pe 2026-10-28.
Duplicatele identice din proiecte au fost sarite; fiecare skill apare o singura data.

Instalare: copiaza (sau symlink) folderul skill-ului in `~/.claude/skills/` sau `~/.agents/skills/`.

## agents/ (37)

Sursa: ~/.agents/skills (instalate global, symlink din ~/.claude/skills)

| skill | descriere |
|---|---|
| [academic-pptx](agents/academic-pptx/SKILL.md) | Use this skill whenever the user wants to create or improve a presentation for an academic context — conference papers, seminar talks, thesis defenses,... |
| [brandkit](agents/brandkit/SKILL.md) | Premium brand-kit image generation skill for creating high-end brand-guidelines boards, logo systems, identity decks, and visual-world presentations.... |
| [caveman](agents/caveman/SKILL.md) | Ultra-compressed communication mode. Cuts token usage ~75% by speaking like caveman while keeping full technical accuracy. Supports intensity levels: lite,... |
| [click-path-audit](agents/click-path-audit/SKILL.md) | Trace every user-facing button/touchpoint through its full state change sequence to find bugs where functions individually work but cancel each other out,... |
| [context-keeper-v3](agents/context-keeper-v3/SKILL.md) | Preserve and restore the operational state of a long-running project across Claude Code sessions. Use when starting or resuming substantial work,... |
| [design-taste-frontend](agents/design-taste-frontend/SKILL.md) | Anti-slop frontend skill for landing pages, portfolios, and redesigns. The agent reads the brief, infers the right design direction, and ships interfaces... |
| [design-taste-frontend-v1](agents/design-taste-frontend-v1/SKILL.md) | The original v1 taste-skill, preserved for projects depending on its exact behavior. The current default is `design-taste-frontend` (v2 experimental), which... |
| [dispatching-parallel-agents](agents/dispatching-parallel-agents/SKILL.md) | Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies |
| [find-skills](agents/find-skills/SKILL.md) | Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express... |
| [finishing-a-development-branch](agents/finishing-a-development-branch/SKILL.md) | Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting... |
| [frontend-design](agents/frontend-design/SKILL.md) | Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages,... |
| [full-output-enforcement](agents/full-output-enforcement/SKILL.md) | Overrides default LLM truncation behavior. Enforces complete code generation, bans placeholder patterns, and handles token-limit splits cleanly. Apply to... |
| [gpt-taste](agents/gpt-taste/SKILL.md) | Elite UX/UI & Advanced GSAP Motion Engineer. Enforces Python-driven true randomization for layout variance, strict AIDA page structure, wide editorial... |
| [hackathon-ready](agents/hackathon-ready/SKILL.md) | Write code that the team can actually defend to hackathon judges - inline comments in a real developer's voice that explain WHY (not what), plus four living... |
| [high-end-visual-design](agents/high-end-visual-design/SKILL.md) | Teaches the AI to design like a high-end agency. Defines the exact fonts, spacing, shadows, card structures, and animations that make a website feel... |
| [image-to-code](agents/image-to-code/SKILL.md) | Elite website image-to-code skill for Codex. For visually important web tasks, it must first generate the design image(s) itself, deeply analyze them, then... |
| [imagegen-frontend-mobile](agents/imagegen-frontend-mobile/SKILL.md) | Elite mobile app image-generation skill for creating premium, app-native screen concepts and flows. Designed for iOS, Android, and cross-platform mobile... |
| [imagegen-frontend-web](agents/imagegen-frontend-web/SKILL.md) | Elite frontend image-direction skill for generating premium, conversion-aware website design references. CRITICAL OUTPUT RULE — generate ONE separate... |
| [industrial-brutalist-ui](agents/industrial-brutalist-ui/SKILL.md) | Raw mechanical interfaces fusing Swiss typographic print with military terminal aesthetics. Rigid grids, extreme type scale contrast, utilitarian color,... |
| [investor-materials](agents/investor-materials/SKILL.md) | Create and update pitch decks, one-pagers, investor memos, accelerator applications, financial models, and fundraising materials. Use when the user needs... |
| [investor-outreach](agents/investor-outreach/SKILL.md) | Draft cold emails, warm intro blurbs, follow-ups, update emails, and investor communications for fundraising. Use when the user wants outreach to angels,... |
| [market-research](agents/market-research/SKILL.md) | Conduct market research, competitive analysis, investor due diligence, and industry intelligence with source attribution and decision-oriented summaries.... |
| [minimalist-ui](agents/minimalist-ui/SKILL.md) | Clean editorial-style interfaces. Warm monochrome palette, typographic contrast, flat bento grids, muted pastels. No gradients, no heavy shadows. |
| [redesign-existing-projects](agents/redesign-existing-projects/SKILL.md) | Upgrades existing websites and apps to premium quality. Audits current design, identifies generic AI patterns, and applies high-end design standards without... |
| [requesting-code-review](agents/requesting-code-review/SKILL.md) | Use when completing tasks, implementing major features, or before merging to verify work meets requirements |
| [security-bounty-hunter](agents/security-bounty-hunter/SKILL.md) | Hunt for exploitable, bounty-worthy security issues in repositories. Focuses on remotely reachable vulnerabilities that qualify for real reports instead of... |
| [seo](agents/seo/SKILL.md) | Comprehensive SEO analysis for any website or business type. Full site audits, single-page analysis, technical SEO (crawlability, indexability, Core Web... |
| [skill-creator](agents/skill-creator/SKILL.md) | Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize... |
| [stitch-design-taste](agents/stitch-design-taste/SKILL.md) | Semantic Design System Skill for Google Stitch. Generates agent-friendly DESIGN.md files that enforce premium, anti-generic UI standards — strict... |
| [supabase](agents/supabase/SKILL.md) | Use when doing ANY task involving Supabase. Triggers: Supabase products (Database, Auth, Edge Functions, Realtime, Storage, Vectors, Cron, Queues); client... |
| [supabase-postgres-best-practices](agents/supabase-postgres-best-practices/SKILL.md) | Postgres best practices maintained by Supabase, for Postgres running anywhere. Load this skill BEFORE writing or changing anything that lives in a Postgres... |
| [systematic-debugging](agents/systematic-debugging/SKILL.md) | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes |
| [test-driven-development](agents/test-driven-development/SKILL.md) | Use when implementing any feature or bugfix, before writing implementation code |
| [threejs-shaders](agents/threejs-shaders/SKILL.md) | Three.js shaders - GLSL, ShaderMaterial, uniforms, custom effects. Use when creating custom visual effects, modifying vertices, writing fragment shaders, or... |
| [using-superpowers](agents/using-superpowers/SKILL.md) | Use when starting any conversation - establishes how to find and use skills, requiring skill invocation before ANY response including clarifying questions |
| [verification-before-completion](agents/verification-before-completion/SKILL.md) | Use when about to claim work is complete, fixed, passing, ready to commit, or ready for PR - requires fresh verification evidence before making success claims |
| [webapp-testing](agents/webapp-testing/SKILL.md) | Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior,... |

## claude/ (1)

Sursa: ~/.claude/skills (non-symlink)

| skill | descriere |
|---|---|
| [graphify](claude/graphify/SKILL.md) | Use for any question about a codebase, its architecture, file relationships, or project content — especially when graphify-out/ exists, where the question... |

## claude-ai/ (22)

Sursa: ~/.claude/skills/synced (skill-uri sincronizate din claude.ai)

| skill | descriere |
|---|---|
| [algorithmic-art](claude-ai/algorithmic-art/SKILL.md) | Creating algorithmic art using p5.js with seeded randomness and interactive parameter exploration. Use this when users request creating art using code,... |
| [built-in-browser](claude-ai/built-in-browser/SKILL.md) | Read this skill before the first step that uses the built-in browser, the browser pane inside the Claude desktop app (also called the in-app browser, the... |
| [chrome-browser](claude-ai/chrome-browser/SKILL.md) | Read this skill before the first step that uses Claude in Chrome, the browser extension whose tools are named mcp__claude-in-chrome__* (also called Chrome,... |
| [computer-use](claude-ai/computer-use/SKILL.md) | Read this skill before the first step of any request to do something in an app on the person's own computer (Notes, Finder, System Settings, any desktop... |
| [context-keeper](claude-ai/context-keeper/SKILL.md) | Activated when the user says "use your skill", "use the skill", "skill check", "context check", or any close variant mid-conversation. Produces a structured... |
| [deep-research](claude-ai/deep-research/SKILL.md) | Use this skill when the user's prompt requires (1) researching a topic across multiple sources, comparing options or alternatives, analyzing trends or... |
| [docs](claude-ai/docs/SKILL.md) | docs (editable docs people share and comment on; the default for any document, named as a doc or not: a document, report, proposal, resume, cover letter,... |
| [docx](claude-ai/docx/SKILL.md) | Use this skill whenever the user wants to create, read, edit, or manipulate Word documents (.docx) or Word templates (.dotx). Triggers include: any mention... |
| [google-workspace](claude-ai/google-workspace/SKILL.md) | Read this before the first Google Drive, Docs, Sheets or Slides connector call whenever the task creates or changes a Google file. Use this skill whenever... |
| [hackathon-brainstorm](claude-ai/hackathon-brainstorm/SKILL.md) | Stress-test a hackathon idea honestly and cut it down to what can actually be built and demoed in the time left. Use when the user is at a hackathon, demo... |
| [hackathon-ready](claude-ai/hackathon-ready/SKILL.md) | Write code that the team can actually defend to hackathon judges - inline comments in a real developer's voice that explain WHY (not what), plus four living... |
| [humanizer](claude-ai/humanizer/SKILL.md) | Remove signs of AI-generated writing from text. Use when editing or reviewing text to make it sound more natural and human-written. Based on Wikipedia's... |
| [import-memory](claude-ai/import-memory/SKILL.md) | Import a memory export from another AI assistant into Claude's memory — conversationally, additively, and with the content treated as data. |
| [mcp-builder](claude-ai/mcp-builder/SKILL.md) | Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use... |
| [morning](claude-ai/morning/SKILL.md) | Render the user's morning brief as a styled HTML artifact, or set it up as a recurring weekday task. Use only when the user explicitly asks to run, see, or... |
| [no-bs](claude-ai/no-bs/SKILL.md) | Activate this skill when the user says "no bs", "no bullshit", "be honest", "straight up", "don't sugarcoat", "real talk", "brutally honest", or any variant... |
| [pdf](claude-ai/pdf/SKILL.md) | Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text/tables from PDFs, combining or merging... |
| [philosopher-analyst](claude-ai/philosopher-analyst/SKILL.md) | Analyzes fundamental questions and concepts through philosophical lens using logic, epistemology, metaphysics, and critical analysis frameworks. Provides... |
| [pptx](claude-ai/pptx/SKILL.md) | Use this skill any time a .pptx or .potx file is involved in any way — as input, output, or both. This includes: creating slide decks, pitch decks, or... |
| [skill-creator](claude-ai/skill-creator/SKILL.md) | Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize... |
| [web-artifacts-builder](claude-ai/web-artifacts-builder/SKILL.md) | Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). Use... |
| [xlsx](claude-ai/xlsx/SKILL.md) | Use this skill any time a spreadsheet file is the primary input or output. This means any task where the user wants to: open, read, edit, or fix an existing... |

## codex/ (6)

Sursa: ~/.codex/skills

| skill | descriere |
|---|---|
| [context-keeping](codex/context-keeping/SKILL.md) | Maintain and recover working context across long or multi-step tasks by creating concise state snapshots, decision logs, and next-step handoffs. Use when... |
| [jupyter-notebook](codex/jupyter-notebook/SKILL.md) | Use when the user asks to create, scaffold, or edit Jupyter notebooks (`.ipynb`) for experiments, explorations, or tutorials; prefer the bundled templates... |
| [pdf](codex/pdf/SKILL.md) | Use when tasks involve reading, creating, or reviewing PDF files where rendering and layout matter; prefer visual checks by rendering pages (Poppler) and... |
| [playwright](codex/playwright/SKILL.md) | Use when the task requires automating a real browser from the terminal (navigation, form filling, snapshots, screenshots, data extraction, UI-flow... |
| [screenshot](codex/screenshot/SKILL.md) | Use when the user explicitly asks for a desktop or system screenshot (full screen, specific app or window, or a pixel region), or when tool-specific capture... |
| [security-threat-model](codex/security-threat-model/SKILL.md) | Repository-grounded threat modeling that enumerates trust boundaries, assets, attacker capabilities, abuse paths, and mitigations, and writes a concise... |

## codex/system/ (6)

Sursa: ~/.codex/skills/.system

| skill | descriere |
|---|---|
| [imagegen](codex/system/imagegen/SKILL.md) | Generate or edit raster images when the task benefits from AI-created bitmap visuals such as photos, illustrations, textures, sprites, mockups, or... |
| [openai-docs](codex/system/openai-docs/SKILL.md) | Use for Codex models/pricing, scheduled tasks, skills, settings, setup, troubleshooting, customization, automations, and self-knowledge—including 'you,'... |
| [plugin-creator](codex/system/plugin-creator/SKILL.md) | Create and scaffold plugin directories for Codex with a required `.codex-plugin/plugin.json`, optional plugin folders/files, valid manifest defaults, and... |
| [review-agent](codex/system/review-agent/SKILL.md) | Perform a read-only, defect-first review of a specified code change and return every actionable finding. Use when another agent delegates review of... |
| [skill-creator](codex/system/skill-creator/SKILL.md) | Create or update a Codex skill with appropriately scoped instructions and any needed supporting resources. |
| [skill-installer](codex/system/skill-installer/SKILL.md) | Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated... |

## plugins/caveman/ (20)

Sursa: plugin caveman (~/.claude/plugins/cache/caveman)

| skill | descriere |
|---|---|
| [cavecrew](plugins/caveman/cavecrew/SKILL.md) | When to delegate to `cavecrew-investigator` (locate code), `cavecrew-builder` (1-2 file edit) or `cavecrew-reviewer` (diff review) instead of working inline... |
| [caveman](plugins/caveman/caveman/SKILL.md) | Ultra-compressed communication mode that cuts output tokens while keeping technical accuracy. Levels: lite, full, ultra and the wenyan variants. Use for... |
| [caveman-commit](plugins/caveman/caveman-commit/SKILL.md) | Write a Conventional Commits message compressed to intent only. Use for "write a commit", "commit message", /commit or /caveman-commit. |
| [caveman-compress](plugins/caveman/caveman-compress/SKILL.md) | Compress a memory file such as CLAUDE.md or a todo list into caveman format to save input tokens, keeping a readable backup. Trigger: /caveman-compress. |
| [caveman-discover](plugins/caveman/caveman-discover/SKILL.md) | Find and label every LLM workflow in the repository so Caveman Cloud groups spend by workflow instead of one bucket. Use for "discover workflows" or... |
| [caveman-evidence-review](plugins/caveman/caveman-evidence-review/SKILL.md) | Read-only review of Caveman Cloud evidence: cost, Cave Score, workflows, traces, latency, errors, routing, savings. Use when asked what Caveman found or... |
| [caveman-explore](plugins/caveman/caveman-explore/SKILL.md) | Read-only repository explorer for cold-start orientation, broad cross-file localization, or when a direct search failed. Skip it when the exact file or... |
| [caveman-help](plugins/caveman/caveman-help/SKILL.md) | Quick-reference card for caveman modes, skills and commands. Trigger: /caveman-help or "caveman help". |
| [caveman-learn](plugins/caveman/caveman-learn/SKILL.md) | Act on a Caveman learn report - review the ranked token sinks, apply cost-lowering fixes with per-edit consent, and report what those fixes returned. Use... |
| [caveman-manage](plugins/caveman/caveman-manage/SKILL.md) | Inspect Caveman Cloud's experiment lifecycle and block unsafe execution. Use when asked to start, approve, cancel, promote or roll back a Caveman experiment. |
| [caveman-optimize](plugins/caveman/caveman-optimize/SKILL.md) | Turn a Caveman optimization observation into an operator-chosen candidate with a paired baseline evaluation. Use when asked to inspect or evaluate a Caveman... |
| [caveman-review](plugins/caveman/caveman-review/SKILL.md) | Compressed code review - one line per finding with location, problem and fix. Use for /caveman-review, "review this PR", or "review the diff". |
| [caveman-setup](plugins/caveman/caveman-setup/SKILL.md) | Wire a repository through the Caveman Cloud gateway so every LLM request is measured, with no behavior change. Use for "set up caveman" or adding LLM spend... |
| [caveman-stats](plugins/caveman/caveman-stats/SKILL.md) | Show real token usage and estimated savings for the current session, read from the session log. Trigger: /caveman-stats. |
| [investigate-first](plugins/caveman/investigate-first/SKILL.md) | Diagnose ambiguous failures before editing. Use for unknown causes, intermittent behavior, performance regressions, or investigations needing... |
| [lean-build](plugins/caveman/lean-build/SKILL.md) | Build feature work with high overbuilding risk. Use for new behavior, product slices, or integrations where repository reuse, strict scope, and an explicit... |
| [migration](plugins/caveman/migration/SKILL.md) | Implement reversible compatibility-safe transitions. Use for schema, data, API, protocol, configuration, or dependency migrations requiring rollback and... |
| [safe-refactor](plugins/caveman/safe-refactor/SKILL.md) | Restructure code while preserving behavior. Use for extraction, consolidation, ownership moves, or cleanup where verification must bracket structural edits. |
| [surgical-patch](plugins/caveman/surgical-patch/SKILL.md) | Fix bugs and small behavior changes at the narrowest responsible layer. Use when regression proof, preserved surrounding behavior, and task-relevant tests... |
| [verify-and-stop](plugins/caveman/verify-and-stop/SKILL.md) | Prove existing work meets acceptance conditions without expanding scope. Use for validation-only tasks, completion checks, focused gate runs, and last-mile... |

## plugins/figma/ (18)

Sursa: plugin figma 2.2.157 (~/.claude/plugins/cache/claude-plugins-official)

| skill | descriere |
|---|---|
| [figma-code-connect](plugins/figma/figma-code-connect/SKILL.md) | Creates and maintains Figma Code Connect template files that map Figma components to code snippets. Use when the user mentions Code Connect, Figma component... |
| [figma-code-workflows](plugins/figma/figma-code-workflows/SKILL.md) | Import or upload local HTML or project files into Figma, choose editable Design frames, runnable Code Layers or standalone Code (also known as Make), and... |
| [figma-create-new-file](plugins/figma/figma-create-new-file/SKILL.md) | Always use this skill when the user wants to create a new Figma Design, FigJam, or Slides file. You MUST invoke this skill BEFORE every `create_new_file`... |
| [figma-design-to-code](plugins/figma/figma-design-to-code/SKILL.md) | **MANDATORY prerequisite** — you MUST invoke this skill BEFORE calling the `get_design_context` Figma MCP tool. You MUST trigger this skill whenever the... |
| [figma-generate-design](plugins/figma/figma-generate-design/SKILL.md) | Use this skill alongside figma-use when the task involves translating an application page, view, or multi-section layout into Figma. Triggers: 'write to... |
| [figma-generate-diagram](plugins/figma/figma-generate-diagram/SKILL.md) | MANDATORY prerequisite — load this skill BEFORE every `generate_diagram` tool call. NEVER call `generate_diagram` directly without loading this skill first.... |
| [figma-generate-library](plugins/figma/figma-generate-library/SKILL.md) | Build or update a professional-grade design system in Figma from a codebase. Use when the user wants to create variables/tokens, build component libraries,... |
| [figma-generative-plugins](plugins/figma/figma-generative-plugins/SKILL.md) | **MANDATORY prerequisite** — load this skill before calling `create_generative_plugin` or `update_generative_plugin`. Use when the user asks to create,... |
| [figma-implement-motion](plugins/figma/figma-implement-motion/SKILL.md) | Translates Figma motion and animations into production-ready application code. Use when implementing animation/motion from a Figma design — user mentions... |
| [figma-shaders](plugins/figma/figma-shaders/SKILL.md) | **MANDATORY prerequisite** — load this skill before calling `create_shader` or `update_shader`. Use when the user asks to create, author, change, fix, or... |
| [figma-spec](plugins/figma/figma-spec/SKILL.md) | This skill is required to create, read, edit, review, or comment on Figma specs. You must read it when working on a PRD, brief, RFC or any kind of document... |
| [figma-swiftui](plugins/figma/figma-swiftui/SKILL.md) | SwiftUI ↔ Figma translation. Use whenever the user mentions Swift, SwiftUI, iOS, iPhone, or iPad — in EITHER direction — translating a Figma design into... |
| [figma-use](plugins/figma/figma-use/SKILL.md) | **MANDATORY prerequisite** — you MUST invoke this skill BEFORE every `use_figma` tool call. NEVER call `use_figma` directly without loading this skill... |
| [figma-use-figjam](plugins/figma/figma-use-figjam/SKILL.md) | This skill helps agents use Figma's use_figma MCP tool in the FigJam context. Can be used alongside figma-use which has foundational context for using the... |
| [figma-use-motion](plugins/figma/figma-use-motion/SKILL.md) | Motion / animation context for the `use_figma` MCP tool — animating Figma nodes via manual keyframes, animation styles, easing, and timeline duration. Load... |
| [figma-use-slides](plugins/figma/figma-use-slides/SKILL.md) | This skill helps agents use Figma's use_figma MCP tool in the Slides context. Can be used alongside figma-use which has foundational context for using the... |
| [generate-project-plan](plugins/figma/generate-project-plan/SKILL.md) | Generate a FigJam project plan board from a PRD plus codebase context. Interactive flow: research → propose sections → per-section deep research →... |
| [video-interaction-mapper](plugins/figma/video-interaction-mapper/SKILL.md) | This skill should be used when the user asks to analyze a UI screen recording and map interaction states into Figma. Trigger for requests such as "put video... |

## downloads/ (14)

Sursa: gasite doar prin proiectele din Downloads

| skill | descriere |
|---|---|
| [app-vulnerability-tester](downloads/app-vulnerability-tester/SKILL.md) | Perform safe vulnerability testing for the user's own app. Use when asked for vuln testing, security testing, auth bypass checks, RLS checks, IDOR, API... |
| [discord-ctf-threader](downloads/discord-ctf-threader/SKILL.md) | Minimal Discord thread helper for CTF progress tracking. Use whenever working on a CTF challenge that should be synced to a Discord challenge thread. |
| [discord-ctf-threader-team](downloads/discord-ctf-threader-team/SKILL.md) | Shareable team version of the Discord CTF threader that uses the embedded team bot token and guild ID. |
| [elevenlabs-agent-auditor](downloads/elevenlabs-agent-auditor/SKILL.md) | Use when debugging ElevenLabs agents, prompts, tool calls, webhook tools, dynamic variables, API keys, or agent hallucinations in the salon receptionist... |
| [elevenlabs-agent-tester](downloads/elevenlabs-agent-tester/SKILL.md) | Test ElevenLabs conversational agents, signed URLs, allowlists, client/server tools, booking tools, prompt behavior, voice flows, and failure states. Use... |
| [fastapi](downloads/fastapi/SKILL.md) | FastAPI best practices and conventions. Use when working with FastAPI APIs, Pydantic models, dependencies, streaming responses including Server-Sent Events... |
| [frontend-ux-regression-tester](downloads/frontend-ux-regression-tester/SKILL.md) | Review frontend UI, UX, responsiveness, accessibility, visual polish, loading states, forms, and regression risks. Use when asked to make the site look... |
| [gdpr-cookie-legal-pages](downloads/gdpr-cookie-legal-pages/SKILL.md) | Claude Code skill for researching, drafting, and implementing GDPR/ePrivacy-ready Privacy Policy, Cookie Policy, Terms pages, cookie consent UI, consent... |
| [progress-memory-maintainer](downloads/progress-memory-maintainer/SKILL.md) | Maintain project QA memory and handoff notes across Claude Code sessions. Use when the user asks to save progress, remember testing state, create a handoff,... |
| [react-doctor](downloads/react-doctor/SKILL.md) | Use when finishing a feature, fixing a bug, before committing React code, or when the user types `/doctor`, asks to scan, triage, or clean up React... |
| [safe-supabase-auditor](downloads/safe-supabase-auditor/SKILL.md) | Use when auditing Supabase schema, RLS, Edge Functions, migrations, auth headers, tenant scoping, environment variables, or broken frontend/backend Supabase... |
| [senior-qa-test-architect](downloads/senior-qa-test-architect/SKILL.md) | Plan and execute senior-level QA for a frontend app with Supabase and ElevenLabs. Use when asked to test all scenarios, create test plans, find bugs, verify... |
| [supabase-db-rls-auditor](downloads/supabase-db-rls-auditor/SKILL.md) | Audit Supabase database schema, migrations, row level security policies, Edge Functions, auth boundaries, and local/remote migration state. Use when working... |
| [typer](downloads/typer/SKILL.md) | Typer best practices and conventions. Use when working with Typer CLIs. Keeps Typer code clean and up to date with the latest features and patterns, updated... |

## Note

- `agents/supabase` are un patch local (vezi `LOCAL-PATCH.md`); un upgrade al skill-ului il suprascrie.
- `agents/context-keeper-v3` e instalat imbricat pe PC (`~/.agents/skills/context-keeper-v3/context-keeper/`), aici e aplatizat; identic cu `Downloads/context-keeper-v3`. `claude-ai/context-keeper` e versiunea sincronizata, diferita.
- `downloads/fastapi` si `downloads/typer` vin bundle-uite in pachetele pip din `listo-pipecat/.venv-win`.
- Sarite: `~/.codex/vendor_imports` (catalog public openai/skills), copiile mai vechi din `C:\Users\George\.claude\skills\synced`, fisierele `.skill` din Downloads (identice cu `claude-ai/`).
