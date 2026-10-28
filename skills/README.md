# skills

Toate skill-urile de agent (Claude Code, claude.ai, Codex, plugin-uri) intr-un singur folder plat: 123 skill-uri, adunate pe 2026-10-28.

Instalare: copiaza (sau symlink) folderul skill-ului in `~/.claude/skills/` sau `~/.agents/skills/`.

## Conflicte de nume

Cand doua surse aveau acelasi nume cu continut diferit, a doua copie a primit un sufix:

- `caveman` (~/.agents/skills) vs `caveman-plugin` (plugin caveman)
- `pdf` (claude.ai) vs `pdf-codex` (~/.codex/skills)
- `skill-creator` (~/.agents/skills) vs `skill-creator-claude-ai` vs `skill-creator-codex`

Campul `name:` din SKILL.md a ramas neschimbat, deci la instalare pune o singura varianta sub numele original.
`hackathon-ready` exista identic in ~/.agents/skills si claude.ai; a ramas o singura copie.

## Lista

| skill | sursa | descriere |
|---|---|---|
| [academic-pptx](academic-pptx/SKILL.md) | ~/.agents/skills | Use this skill whenever the user wants to create or improve a presentation for an academic context — conference papers, seminar talks, thesis defenses,... |
| [algorithmic-art](algorithmic-art/SKILL.md) | claude.ai (synced) | Creating algorithmic art using p5.js with seeded randomness and interactive parameter exploration. Use this when users request creating art using code,... |
| [app-vulnerability-tester](app-vulnerability-tester/SKILL.md) | proiecte din Downloads | Perform safe vulnerability testing for the user's own app. Use when asked for vuln testing, security testing, auth bypass checks, RLS checks, IDOR, API... |
| [brandkit](brandkit/SKILL.md) | ~/.agents/skills | Premium brand-kit image generation skill for creating high-end brand-guidelines boards, logo systems, identity decks, and visual-world presentations.... |
| [built-in-browser](built-in-browser/SKILL.md) | claude.ai (synced) | Read this skill before the first step that uses the built-in browser, the browser pane inside the Claude desktop app (also called the in-app browser, the... |
| [cavecrew](cavecrew/SKILL.md) | plugin caveman | When to delegate to `cavecrew-investigator` (locate code), `cavecrew-builder` (1-2 file edit) or `cavecrew-reviewer` (diff review) instead of working inline... |
| [caveman](caveman/SKILL.md) | ~/.agents/skills | Ultra-compressed communication mode. Cuts token usage ~75% by speaking like caveman while keeping full technical accuracy. Supports intensity levels: lite,... |
| [caveman-commit](caveman-commit/SKILL.md) | plugin caveman | Write a Conventional Commits message compressed to intent only. Use for "write a commit", "commit message", /commit or /caveman-commit. |
| [caveman-compress](caveman-compress/SKILL.md) | plugin caveman | Compress a memory file such as CLAUDE.md or a todo list into caveman format to save input tokens, keeping a readable backup. Trigger: /caveman-compress. |
| [caveman-discover](caveman-discover/SKILL.md) | plugin caveman | Find and label every LLM workflow in the repository so Caveman Cloud groups spend by workflow instead of one bucket. Use for "discover workflows" or... |
| [caveman-evidence-review](caveman-evidence-review/SKILL.md) | plugin caveman | Read-only review of Caveman Cloud evidence: cost, Cave Score, workflows, traces, latency, errors, routing, savings. Use when asked what Caveman found or... |
| [caveman-explore](caveman-explore/SKILL.md) | plugin caveman | Read-only repository explorer for cold-start orientation, broad cross-file localization, or when a direct search failed. Skip it when the exact file or... |
| [caveman-help](caveman-help/SKILL.md) | plugin caveman | Quick-reference card for caveman modes, skills and commands. Trigger: /caveman-help or "caveman help". |
| [caveman-learn](caveman-learn/SKILL.md) | plugin caveman | Act on a Caveman learn report - review the ranked token sinks, apply cost-lowering fixes with per-edit consent, and report what those fixes returned. Use... |
| [caveman-manage](caveman-manage/SKILL.md) | plugin caveman | Inspect Caveman Cloud's experiment lifecycle and block unsafe execution. Use when asked to start, approve, cancel, promote or roll back a Caveman experiment. |
| [caveman-optimize](caveman-optimize/SKILL.md) | plugin caveman | Turn a Caveman optimization observation into an operator-chosen candidate with a paired baseline evaluation. Use when asked to inspect or evaluate a Caveman... |
| [caveman-plugin](caveman-plugin/SKILL.md) | plugin caveman | Ultra-compressed communication mode that cuts output tokens while keeping technical accuracy. Levels: lite, full, ultra and the wenyan variants. Use for... |
| [caveman-review](caveman-review/SKILL.md) | plugin caveman | Compressed code review - one line per finding with location, problem and fix. Use for /caveman-review, "review this PR", or "review the diff". |
| [caveman-setup](caveman-setup/SKILL.md) | plugin caveman | Wire a repository through the Caveman Cloud gateway so every LLM request is measured, with no behavior change. Use for "set up caveman" or adding LLM spend... |
| [caveman-stats](caveman-stats/SKILL.md) | plugin caveman | Show real token usage and estimated savings for the current session, read from the session log. Trigger: /caveman-stats. |
| [chrome-browser](chrome-browser/SKILL.md) | claude.ai (synced) | Read this skill before the first step that uses Claude in Chrome, the browser extension whose tools are named mcp__claude-in-chrome__* (also called Chrome,... |
| [click-path-audit](click-path-audit/SKILL.md) | ~/.agents/skills | Trace every user-facing button/touchpoint through its full state change sequence to find bugs where functions individually work but cancel each other out,... |
| [computer-use](computer-use/SKILL.md) | claude.ai (synced) | Read this skill before the first step of any request to do something in an app on the person's own computer (Notes, Finder, System Settings, any desktop... |
| [context-keeper](context-keeper/SKILL.md) | claude.ai (synced) | Activated when the user says "use your skill", "use the skill", "skill check", "context check", or any close variant mid-conversation. Produces a structured... |
| [context-keeper-v3](context-keeper-v3/SKILL.md) | ~/.agents/skills | Preserve and restore the operational state of a long-running project across Claude Code sessions. Use when starting or resuming substantial work,... |
| [context-keeping](context-keeping/SKILL.md) | ~/.codex/skills | Maintain and recover working context across long or multi-step tasks by creating concise state snapshots, decision logs, and next-step handoffs. Use when... |
| [deep-research](deep-research/SKILL.md) | claude.ai (synced) | Use this skill when the user's prompt requires (1) researching a topic across multiple sources, comparing options or alternatives, analyzing trends or... |
| [design-taste-frontend](design-taste-frontend/SKILL.md) | ~/.agents/skills | Anti-slop frontend skill for landing pages, portfolios, and redesigns. The agent reads the brief, infers the right design direction, and ships interfaces... |
| [design-taste-frontend-v1](design-taste-frontend-v1/SKILL.md) | ~/.agents/skills | The original v1 taste-skill, preserved for projects depending on its exact behavior. The current default is `design-taste-frontend` (v2 experimental), which... |
| [discord-ctf-threader](discord-ctf-threader/SKILL.md) | proiecte din Downloads | Minimal Discord thread helper for CTF progress tracking. Use whenever working on a CTF challenge that should be synced to a Discord challenge thread. |
| [discord-ctf-threader-team](discord-ctf-threader-team/SKILL.md) | proiecte din Downloads | Shareable team version of the Discord CTF threader that uses the embedded team bot token and guild ID. |
| [dispatching-parallel-agents](dispatching-parallel-agents/SKILL.md) | ~/.agents/skills | Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies |
| [docs](docs/SKILL.md) | claude.ai (synced) | docs (editable docs people share and comment on; the default for any document, named as a doc or not: a document, report, proposal, resume, cover letter,... |
| [docx](docx/SKILL.md) | claude.ai (synced) | Use this skill whenever the user wants to create, read, edit, or manipulate Word documents (.docx) or Word templates (.dotx). Triggers include: any mention... |
| [elevenlabs-agent-auditor](elevenlabs-agent-auditor/SKILL.md) | proiecte din Downloads | Use when debugging ElevenLabs agents, prompts, tool calls, webhook tools, dynamic variables, API keys, or agent hallucinations in the salon receptionist... |
| [elevenlabs-agent-tester](elevenlabs-agent-tester/SKILL.md) | proiecte din Downloads | Test ElevenLabs conversational agents, signed URLs, allowlists, client/server tools, booking tools, prompt behavior, voice flows, and failure states. Use... |
| [fastapi](fastapi/SKILL.md) | proiecte din Downloads | FastAPI best practices and conventions. Use when working with FastAPI APIs, Pydantic models, dependencies, streaming responses including Server-Sent Events... |
| [figma-code-connect](figma-code-connect/SKILL.md) | plugin figma 2.2.157 | Creates and maintains Figma Code Connect template files that map Figma components to code snippets. Use when the user mentions Code Connect, Figma component... |
| [figma-code-workflows](figma-code-workflows/SKILL.md) | plugin figma 2.2.157 | Import or upload local HTML or project files into Figma, choose editable Design frames, runnable Code Layers or standalone Code (also known as Make), and... |
| [figma-create-new-file](figma-create-new-file/SKILL.md) | plugin figma 2.2.157 | Always use this skill when the user wants to create a new Figma Design, FigJam, or Slides file. You MUST invoke this skill BEFORE every `create_new_file`... |
| [figma-design-to-code](figma-design-to-code/SKILL.md) | plugin figma 2.2.157 | **MANDATORY prerequisite** — you MUST invoke this skill BEFORE calling the `get_design_context` Figma MCP tool. You MUST trigger this skill whenever the... |
| [figma-generate-design](figma-generate-design/SKILL.md) | plugin figma 2.2.157 | Use this skill alongside figma-use when the task involves translating an application page, view, or multi-section layout into Figma. Triggers: 'write to... |
| [figma-generate-diagram](figma-generate-diagram/SKILL.md) | plugin figma 2.2.157 | MANDATORY prerequisite — load this skill BEFORE every `generate_diagram` tool call. NEVER call `generate_diagram` directly without loading this skill first.... |
| [figma-generate-library](figma-generate-library/SKILL.md) | plugin figma 2.2.157 | Build or update a professional-grade design system in Figma from a codebase. Use when the user wants to create variables/tokens, build component libraries,... |
| [figma-generative-plugins](figma-generative-plugins/SKILL.md) | plugin figma 2.2.157 | **MANDATORY prerequisite** — load this skill before calling `create_generative_plugin` or `update_generative_plugin`. Use when the user asks to create,... |
| [figma-implement-motion](figma-implement-motion/SKILL.md) | plugin figma 2.2.157 | Translates Figma motion and animations into production-ready application code. Use when implementing animation/motion from a Figma design — user mentions... |
| [figma-shaders](figma-shaders/SKILL.md) | plugin figma 2.2.157 | **MANDATORY prerequisite** — load this skill before calling `create_shader` or `update_shader`. Use when the user asks to create, author, change, fix, or... |
| [figma-spec](figma-spec/SKILL.md) | plugin figma 2.2.157 | This skill is required to create, read, edit, review, or comment on Figma specs. You must read it when working on a PRD, brief, RFC or any kind of document... |
| [figma-swiftui](figma-swiftui/SKILL.md) | plugin figma 2.2.157 | SwiftUI ↔ Figma translation. Use whenever the user mentions Swift, SwiftUI, iOS, iPhone, or iPad — in EITHER direction — translating a Figma design into... |
| [figma-use](figma-use/SKILL.md) | plugin figma 2.2.157 | **MANDATORY prerequisite** — you MUST invoke this skill BEFORE every `use_figma` tool call. NEVER call `use_figma` directly without loading this skill... |
| [figma-use-figjam](figma-use-figjam/SKILL.md) | plugin figma 2.2.157 | This skill helps agents use Figma's use_figma MCP tool in the FigJam context. Can be used alongside figma-use which has foundational context for using the... |
| [figma-use-motion](figma-use-motion/SKILL.md) | plugin figma 2.2.157 | Motion / animation context for the `use_figma` MCP tool — animating Figma nodes via manual keyframes, animation styles, easing, and timeline duration. Load... |
| [figma-use-slides](figma-use-slides/SKILL.md) | plugin figma 2.2.157 | This skill helps agents use Figma's use_figma MCP tool in the Slides context. Can be used alongside figma-use which has foundational context for using the... |
| [find-skills](find-skills/SKILL.md) | ~/.agents/skills | Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express... |
| [finishing-a-development-branch](finishing-a-development-branch/SKILL.md) | ~/.agents/skills | Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting... |
| [frontend-design](frontend-design/SKILL.md) | ~/.agents/skills | Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages,... |
| [frontend-ux-regression-tester](frontend-ux-regression-tester/SKILL.md) | proiecte din Downloads | Review frontend UI, UX, responsiveness, accessibility, visual polish, loading states, forms, and regression risks. Use when asked to make the site look... |
| [full-output-enforcement](full-output-enforcement/SKILL.md) | ~/.agents/skills | Overrides default LLM truncation behavior. Enforces complete code generation, bans placeholder patterns, and handles token-limit splits cleanly. Apply to... |
| [gdpr-cookie-legal-pages](gdpr-cookie-legal-pages/SKILL.md) | proiecte din Downloads | Claude Code skill for researching, drafting, and implementing GDPR/ePrivacy-ready Privacy Policy, Cookie Policy, Terms pages, cookie consent UI, consent... |
| [generate-project-plan](generate-project-plan/SKILL.md) | plugin figma 2.2.157 | Generate a FigJam project plan board from a PRD plus codebase context. Interactive flow: research → propose sections → per-section deep research →... |
| [google-workspace](google-workspace/SKILL.md) | claude.ai (synced) | Read this before the first Google Drive, Docs, Sheets or Slides connector call whenever the task creates or changes a Google file. Use this skill whenever... |
| [gpt-taste](gpt-taste/SKILL.md) | ~/.agents/skills | Elite UX/UI & Advanced GSAP Motion Engineer. Enforces Python-driven true randomization for layout variance, strict AIDA page structure, wide editorial... |
| [graphify](graphify/SKILL.md) | ~/.claude/skills | Use for any question about a codebase, its architecture, file relationships, or project content — especially when graphify-out/ exists, where the question... |
| [hackathon-brainstorm](hackathon-brainstorm/SKILL.md) | claude.ai (synced) | Stress-test a hackathon idea honestly and cut it down to what can actually be built and demoed in the time left. Use when the user is at a hackathon, demo... |
| [hackathon-ready](hackathon-ready/SKILL.md) | ~/.agents/skills | Write code that the team can actually defend to hackathon judges - inline comments in a real developer's voice that explain WHY (not what), plus four living... |
| [high-end-visual-design](high-end-visual-design/SKILL.md) | ~/.agents/skills | Teaches the AI to design like a high-end agency. Defines the exact fonts, spacing, shadows, card structures, and animations that make a website feel... |
| [humanizer](humanizer/SKILL.md) | claude.ai (synced) | Remove signs of AI-generated writing from text. Use when editing or reviewing text to make it sound more natural and human-written. Based on Wikipedia's... |
| [image-to-code](image-to-code/SKILL.md) | ~/.agents/skills | Elite website image-to-code skill for Codex. For visually important web tasks, it must first generate the design image(s) itself, deeply analyze them, then... |
| [imagegen](imagegen/SKILL.md) | ~/.codex/skills/.system | Generate or edit raster images when the task benefits from AI-created bitmap visuals such as photos, illustrations, textures, sprites, mockups, or... |
| [imagegen-frontend-mobile](imagegen-frontend-mobile/SKILL.md) | ~/.agents/skills | Elite mobile app image-generation skill for creating premium, app-native screen concepts and flows. Designed for iOS, Android, and cross-platform mobile... |
| [imagegen-frontend-web](imagegen-frontend-web/SKILL.md) | ~/.agents/skills | Elite frontend image-direction skill for generating premium, conversion-aware website design references. CRITICAL OUTPUT RULE — generate ONE separate... |
| [import-memory](import-memory/SKILL.md) | claude.ai (synced) | Import a memory export from another AI assistant into Claude's memory — conversationally, additively, and with the content treated as data. |
| [industrial-brutalist-ui](industrial-brutalist-ui/SKILL.md) | ~/.agents/skills | Raw mechanical interfaces fusing Swiss typographic print with military terminal aesthetics. Rigid grids, extreme type scale contrast, utilitarian color,... |
| [investigate-first](investigate-first/SKILL.md) | plugin caveman | Diagnose ambiguous failures before editing. Use for unknown causes, intermittent behavior, performance regressions, or investigations needing... |
| [investor-materials](investor-materials/SKILL.md) | ~/.agents/skills | Create and update pitch decks, one-pagers, investor memos, accelerator applications, financial models, and fundraising materials. Use when the user needs... |
| [investor-outreach](investor-outreach/SKILL.md) | ~/.agents/skills | Draft cold emails, warm intro blurbs, follow-ups, update emails, and investor communications for fundraising. Use when the user wants outreach to angels,... |
| [jupyter-notebook](jupyter-notebook/SKILL.md) | ~/.codex/skills | Use when the user asks to create, scaffold, or edit Jupyter notebooks (`.ipynb`) for experiments, explorations, or tutorials; prefer the bundled templates... |
| [lean-build](lean-build/SKILL.md) | plugin caveman | Build feature work with high overbuilding risk. Use for new behavior, product slices, or integrations where repository reuse, strict scope, and an explicit... |
| [market-research](market-research/SKILL.md) | ~/.agents/skills | Conduct market research, competitive analysis, investor due diligence, and industry intelligence with source attribution and decision-oriented summaries.... |
| [mcp-builder](mcp-builder/SKILL.md) | claude.ai (synced) | Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use... |
| [migration](migration/SKILL.md) | plugin caveman | Implement reversible compatibility-safe transitions. Use for schema, data, API, protocol, configuration, or dependency migrations requiring rollback and... |
| [minimalist-ui](minimalist-ui/SKILL.md) | ~/.agents/skills | Clean editorial-style interfaces. Warm monochrome palette, typographic contrast, flat bento grids, muted pastels. No gradients, no heavy shadows. |
| [morning](morning/SKILL.md) | claude.ai (synced) | Render the user's morning brief as a styled HTML artifact, or set it up as a recurring weekday task. Use only when the user explicitly asks to run, see, or... |
| [no-bs](no-bs/SKILL.md) | claude.ai (synced) | Activate this skill when the user says "no bs", "no bullshit", "be honest", "straight up", "don't sugarcoat", "real talk", "brutally honest", or any variant... |
| [openai-docs](openai-docs/SKILL.md) | ~/.codex/skills/.system | Use for Codex models/pricing, scheduled tasks, skills, settings, setup, troubleshooting, customization, automations, and self-knowledge—including 'you,'... |
| [pdf](pdf/SKILL.md) | claude.ai (synced) | Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text/tables from PDFs, combining or merging... |
| [pdf-codex](pdf-codex/SKILL.md) | ~/.codex/skills | Use when tasks involve reading, creating, or reviewing PDF files where rendering and layout matter; prefer visual checks by rendering pages (Poppler) and... |
| [philosopher-analyst](philosopher-analyst/SKILL.md) | claude.ai (synced) | Analyzes fundamental questions and concepts through philosophical lens using logic, epistemology, metaphysics, and critical analysis frameworks. Provides... |
| [playwright](playwright/SKILL.md) | ~/.codex/skills | Use when the task requires automating a real browser from the terminal (navigation, form filling, snapshots, screenshots, data extraction, UI-flow... |
| [plugin-creator](plugin-creator/SKILL.md) | ~/.codex/skills/.system | Create and scaffold plugin directories for Codex with a required `.codex-plugin/plugin.json`, optional plugin folders/files, valid manifest defaults, and... |
| [pptx](pptx/SKILL.md) | claude.ai (synced) | Use this skill any time a .pptx or .potx file is involved in any way — as input, output, or both. This includes: creating slide decks, pitch decks, or... |
| [progress-memory-maintainer](progress-memory-maintainer/SKILL.md) | proiecte din Downloads | Maintain project QA memory and handoff notes across Claude Code sessions. Use when the user asks to save progress, remember testing state, create a handoff,... |
| [react-doctor](react-doctor/SKILL.md) | proiecte din Downloads | Use when finishing a feature, fixing a bug, before committing React code, or when the user types `/doctor`, asks to scan, triage, or clean up React... |
| [redesign-existing-projects](redesign-existing-projects/SKILL.md) | ~/.agents/skills | Upgrades existing websites and apps to premium quality. Audits current design, identifies generic AI patterns, and applies high-end design standards without... |
| [requesting-code-review](requesting-code-review/SKILL.md) | ~/.agents/skills | Use when completing tasks, implementing major features, or before merging to verify work meets requirements |
| [review-agent](review-agent/SKILL.md) | ~/.codex/skills/.system | Perform a read-only, defect-first review of a specified code change and return every actionable finding. Use when another agent delegates review of... |
| [safe-refactor](safe-refactor/SKILL.md) | plugin caveman | Restructure code while preserving behavior. Use for extraction, consolidation, ownership moves, or cleanup where verification must bracket structural edits. |
| [safe-supabase-auditor](safe-supabase-auditor/SKILL.md) | proiecte din Downloads | Use when auditing Supabase schema, RLS, Edge Functions, migrations, auth headers, tenant scoping, environment variables, or broken frontend/backend Supabase... |
| [screenshot](screenshot/SKILL.md) | ~/.codex/skills | Use when the user explicitly asks for a desktop or system screenshot (full screen, specific app or window, or a pixel region), or when tool-specific capture... |
| [security-bounty-hunter](security-bounty-hunter/SKILL.md) | ~/.agents/skills | Hunt for exploitable, bounty-worthy security issues in repositories. Focuses on remotely reachable vulnerabilities that qualify for real reports instead of... |
| [security-threat-model](security-threat-model/SKILL.md) | ~/.codex/skills | Repository-grounded threat modeling that enumerates trust boundaries, assets, attacker capabilities, abuse paths, and mitigations, and writes a concise... |
| [senior-qa-test-architect](senior-qa-test-architect/SKILL.md) | proiecte din Downloads | Plan and execute senior-level QA for a frontend app with Supabase and ElevenLabs. Use when asked to test all scenarios, create test plans, find bugs, verify... |
| [seo](seo/SKILL.md) | ~/.agents/skills | Comprehensive SEO analysis for any website or business type. Full site audits, single-page analysis, technical SEO (crawlability, indexability, Core Web... |
| [skill-creator](skill-creator/SKILL.md) | ~/.agents/skills | Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize... |
| [skill-creator-claude-ai](skill-creator-claude-ai/SKILL.md) | claude.ai (synced) | Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize... |
| [skill-creator-codex](skill-creator-codex/SKILL.md) | ~/.codex/skills/.system | Create or update a Codex skill with appropriately scoped instructions and any needed supporting resources. |
| [skill-installer](skill-installer/SKILL.md) | ~/.codex/skills/.system | Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated... |
| [stitch-design-taste](stitch-design-taste/SKILL.md) | ~/.agents/skills | Semantic Design System Skill for Google Stitch. Generates agent-friendly DESIGN.md files that enforce premium, anti-generic UI standards — strict... |
| [supabase](supabase/SKILL.md) | ~/.agents/skills | Use when doing ANY task involving Supabase. Triggers: Supabase products (Database, Auth, Edge Functions, Realtime, Storage, Vectors, Cron, Queues); client... |
| [supabase-db-rls-auditor](supabase-db-rls-auditor/SKILL.md) | proiecte din Downloads | Audit Supabase database schema, migrations, row level security policies, Edge Functions, auth boundaries, and local/remote migration state. Use when working... |
| [supabase-postgres-best-practices](supabase-postgres-best-practices/SKILL.md) | ~/.agents/skills | Postgres best practices maintained by Supabase, for Postgres running anywhere. Load this skill BEFORE writing or changing anything that lives in a Postgres... |
| [surgical-patch](surgical-patch/SKILL.md) | plugin caveman | Fix bugs and small behavior changes at the narrowest responsible layer. Use when regression proof, preserved surrounding behavior, and task-relevant tests... |
| [systematic-debugging](systematic-debugging/SKILL.md) | ~/.agents/skills | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes |
| [test-driven-development](test-driven-development/SKILL.md) | ~/.agents/skills | Use when implementing any feature or bugfix, before writing implementation code |
| [threejs-shaders](threejs-shaders/SKILL.md) | ~/.agents/skills | Three.js shaders - GLSL, ShaderMaterial, uniforms, custom effects. Use when creating custom visual effects, modifying vertices, writing fragment shaders, or... |
| [typer](typer/SKILL.md) | proiecte din Downloads | Typer best practices and conventions. Use when working with Typer CLIs. Keeps Typer code clean and up to date with the latest features and patterns, updated... |
| [using-superpowers](using-superpowers/SKILL.md) | ~/.agents/skills | Use when starting any conversation - establishes how to find and use skills, requiring skill invocation before ANY response including clarifying questions |
| [verification-before-completion](verification-before-completion/SKILL.md) | ~/.agents/skills | Use when about to claim work is complete, fixed, passing, ready to commit, or ready for PR - requires fresh verification evidence before making success claims |
| [verify-and-stop](verify-and-stop/SKILL.md) | plugin caveman | Prove existing work meets acceptance conditions without expanding scope. Use for validation-only tasks, completion checks, focused gate runs, and last-mile... |
| [video-interaction-mapper](video-interaction-mapper/SKILL.md) | plugin figma 2.2.157 | This skill should be used when the user asks to analyze a UI screen recording and map interaction states into Figma. Trigger for requests such as "put video... |
| [web-artifacts-builder](web-artifacts-builder/SKILL.md) | claude.ai (synced) | Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). Use... |
| [webapp-testing](webapp-testing/SKILL.md) | ~/.agents/skills | Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior,... |
| [xlsx](xlsx/SKILL.md) | claude.ai (synced) | Use this skill any time a spreadsheet file is the primary input or output. This means any task where the user wants to: open, read, edit, or fix an existing... |

## _meta/

- `claude-ai-manifest.json`: manifestul skill-urilor sincronizate din claude.ai.
- `caveman-plugin-generated/`: pachetul generat de plugin-ul caveman (nu e skill).

## Note

- `supabase` are un patch local (vezi `LOCAL-PATCH.md`); un upgrade al skill-ului il suprascrie.
- `context-keeper-v3` e instalat imbricat pe PC (`~/.agents/skills/context-keeper-v3/context-keeper/`), aici e aplatizat. `context-keeper` e versiunea sincronizata din claude.ai, diferita.
- `fastapi` si `typer` vin bundle-uite in pachetele pip din `listo-pipecat/.venv-win`.
- Sarite: `~/.codex/vendor_imports` (catalog public openai/skills), copiile mai vechi din `C:\Users\George\.claude\skills\synced`, fisierele `.skill` din Downloads (identice cu cele din claude.ai).
