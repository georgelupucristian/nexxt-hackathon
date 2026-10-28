#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Guild,
  TextChannel,
  ThreadAutoArchiveDuration,
  ThreadChannel
} from "discord.js";
import { config as loadDotenv } from "dotenv";

const DONE_PREFIX_PATTERN = /^\s*✅\s*/u;
const LIKELY_DISCORD_ID_PATTERN = /^\d{10,30}$/;

export type CliCommand =
  | "ensure-channels"
  | "ensure-thread"
  | "read-thread"
  | "post-update"
  | "mark-done";

export type ChannelMapValue = string | { id?: string; name?: string };
export type ChannelMap = Record<string, ChannelMapValue>;

export interface ParentChannelRef {
  id: string;
  name: string;
  raw?: unknown;
}

export interface ThreadRef {
  id: string;
  name: string;
  archived: boolean;
  raw?: unknown;
}

export interface ThreadMessage {
  id: string;
  authorId: string;
  authorUsername: string;
  createdAt: string;
  content: string;
}

export interface ThreadOps {
  resolveParentChannel(target: ChannelMapValue): Promise<ParentChannelRef | null>;
  createParentChannel(name: string): Promise<ParentChannelRef>;
  listActiveThreads(parent: ParentChannelRef): Promise<ThreadRef[]>;
  listArchivedThreads(parent: ParentChannelRef): Promise<ThreadRef[]>;
  createThread(parent: ParentChannelRef, name: string): Promise<ThreadRef>;
  unarchiveThread(thread: ThreadRef): Promise<ThreadRef>;
  fetchMessages(thread: ThreadRef, limit: number): Promise<ThreadMessage[]>;
  sendMessage(thread: ThreadRef, content: string): Promise<{ id: string; content: string }>;
  renameThread(thread: ThreadRef, name: string): Promise<ThreadRef>;
  close?(): Promise<void>;
}

export interface CommandContext {
  channelMap: ChannelMap;
  ops: ThreadOps;
  dryRun: boolean;
  category: string;
  challenge: string;
  agentName: string;
}

export interface MatchResult {
  thread: ThreadRef;
  source: "active" | "archived";
}

interface EnsureThreadResult {
  action:
    | "exists"
    | "unarchived"
    | "would_unarchive"
    | "created"
    | "would_create";
  parent: ParentChannelRef;
  thread: ThreadRef | { id: null; name: string; archived: false };
  matchedFrom: "active" | "archived" | "none";
}

interface ParsedCliArgs {
  command: CliCommand;
  dryRun: boolean;
  values: Record<string, string>;
}

export function getDefaultConfigPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = homedir();
  const configuredDir = env.DISCORD_CTF_THREADER_DIR?.trim();
  const candidates = [
    path.join(home, ".codex", "discord-ctf-threader.env"),
    path.join(home, ".codex", "discord-ctf-threader", ".env"),
    configuredDir ? path.join(configuredDir, ".env") : null,
    path.join(process.cwd(), ".env")
  ];

  const unique: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!unique.includes(candidate)) unique.push(candidate);
  }
  return unique;
}

export function loadConfigFiles(env: NodeJS.ProcessEnv = process.env): string[] {
  const loaded: string[] = [];
  for (const filePath of getDefaultConfigPaths(env)) {
    if (!existsSync(filePath)) continue;
    loadDotenv({ path: filePath, override: false });
    loaded.push(filePath);
  }
  return loaded;
}

export function stripDonePrefix(value: string): string {
  return value.replace(DONE_PREFIX_PATTERN, "").trim();
}

export function normalizeChallengeName(value: string): string {
  return stripDonePrefix(value).toLowerCase();
}

export function toDoneThreadName(challenge: string): string {
  return `✅ ${stripDonePrefix(challenge)}`.trimEnd();
}

export function isDoneThreadName(name: string): boolean {
  return /^\s*✅\s+/u.test(name);
}

export function matchThreadByChallenge(
  challenge: string,
  activeThreads: ThreadRef[],
  archivedThreads: ThreadRef[]
): MatchResult | null {
  const normalizedChallenge = normalizeChallengeName(challenge);
  const active = activeThreads.find(
    (thread) => normalizeChallengeName(thread.name) === normalizedChallenge
  );
  if (active) {
    return { thread: active, source: "active" };
  }
  const archived = archivedThreads.find(
    (thread) => normalizeChallengeName(thread.name) === normalizedChallenge
  );
  if (archived) {
    return { thread: archived, source: "archived" };
  }
  return null;
}

export async function loadChannelMap(filePath: string): Promise<ChannelMap> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("DISCORD_CHANNEL_MAP_FILE must contain a JSON object.");
  }
  const maybeWrapped = (parsed as { categories?: unknown }).categories;
  const resolved = maybeWrapped ?? parsed;
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
    throw new Error("Channel map JSON must be an object.");
  }
  return resolved as ChannelMap;
}

function findCategoryTarget(channelMap: ChannelMap, category: string): ChannelMapValue {
  const key = category.trim().toLowerCase();
  const target = channelMap[key];
  if (!target) {
    throw new Error(`Category "${category}" is not defined in DISCORD_CHANNEL_MAP_FILE.`);
  }
  return target;
}

export interface EnsureParentChannelResult {
  action: "exists" | "created" | "would_create";
  parent: ParentChannelRef;
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export async function ensureParentChannelForCategory(
  ctx: CommandContext,
  category: string
): Promise<EnsureParentChannelResult> {
  const target = findCategoryTarget(ctx.channelMap, category);
  const resolved = await ctx.ops.resolveParentChannel(target);
  if (resolved) return { action: "exists", parent: resolved };

  const name =
    typeof target === "string"
      ? target.trim()
      : (target.name?.trim() || category.trim().toLowerCase());

  if (ctx.dryRun) {
    return { action: "would_create", parent: { id: "dry-run", name } };
  }
  const created = await ctx.ops.createParentChannel(name);
  return { action: "created", parent: created };
}

export async function ensureThreadForChallenge(ctx: CommandContext): Promise<EnsureThreadResult> {
  const target = findCategoryTarget(ctx.channelMap, ctx.category);
  let parent = await ctx.ops.resolveParentChannel(target);
  if (!parent) {
    const autoCreate = parseBooleanEnv(process.env.DISCORD_AUTO_CREATE_CHANNELS);
    if (!autoCreate) {
      throw new Error(
        `Parent channel for category "${ctx.category}" not found. ` +
          "Set DISCORD_AUTO_CREATE_CHANNELS=true or run ensure-channels."
      );
    }
    const ensured = await ensureParentChannelForCategory(ctx, ctx.category);
    if (ensured.parent.id === "dry-run") {
      // ensure-thread should not proceed without a real parent channel.
      throw new Error("Dry-run parent channel cannot be used to create threads.");
    }
    parent = ensured.parent;
  }

  let activeThreads = await ctx.ops.listActiveThreads(parent);
  let archivedThreads: ThreadRef[] = [];
  let match = matchThreadByChallenge(ctx.challenge, activeThreads, archivedThreads);
  if (!match) {
    archivedThreads = await ctx.ops.listArchivedThreads(parent);
    match = matchThreadByChallenge(ctx.challenge, activeThreads, archivedThreads);
  }

  if (!match) {
    activeThreads = await ctx.ops.listActiveThreads(parent);
    archivedThreads = await ctx.ops.listArchivedThreads(parent);
    match = matchThreadByChallenge(ctx.challenge, activeThreads, archivedThreads);
  }

  if (match) {
    if (match.source === "archived" && match.thread.archived) {
      if (ctx.dryRun) {
        return {
          action: "would_unarchive",
          parent,
          thread: match.thread,
          matchedFrom: "archived"
        };
      }
      const unarchived = await ctx.ops.unarchiveThread(match.thread);
      return {
        action: "unarchived",
        parent,
        thread: unarchived,
        matchedFrom: "archived"
      };
    }
    return {
      action: "exists",
      parent,
      thread: match.thread,
      matchedFrom: match.source
    };
  }

  const threadName = stripDonePrefix(ctx.challenge);
  if (ctx.dryRun) {
    return {
      action: "would_create",
      parent,
      thread: { id: null, name: threadName, archived: false },
      matchedFrom: "none"
    };
  }

  const created = await ctx.ops.createThread(parent, threadName);
  return {
    action: "created",
    parent,
    thread: created,
    matchedFrom: "none"
  };
}

export async function runEnsureChannels(
  ctx: CommandContext,
  categories: string[] | null
): Promise<Record<string, unknown>> {
  const keys = Object.keys(ctx.channelMap);
  const list = categories && categories.length > 0 ? categories : keys;
  const normalized = list.map((c) => c.trim().toLowerCase()).filter(Boolean);
  const results: Array<Record<string, unknown>> = [];

  for (const category of normalized) {
    try {
      const ensured = await ensureParentChannelForCategory(ctx, category);
      results.push({
        category,
        action: ensured.action,
        parentChannel: { id: ensured.parent.id, name: ensured.parent.name }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        category,
        action: "error",
        error: { message }
      });
    }
  }

  return {
    ok: true,
    command: "ensure-channels",
    dryRun: ctx.dryRun,
    categories: normalized,
    results
  };
}

export async function runEnsureThread(ctx: CommandContext): Promise<Record<string, unknown>> {
  const ensureResult = await ensureThreadForChallenge(ctx);
  return {
    ok: true,
    command: "ensure-thread",
    dryRun: ctx.dryRun,
    category: ctx.category,
    challenge: ctx.challenge,
    action: ensureResult.action,
    matchedFrom: ensureResult.matchedFrom,
    parentChannel: {
      id: ensureResult.parent.id,
      name: ensureResult.parent.name
    },
    thread: ensureResult.thread
  };
}

export async function runReadThread(
  ctx: CommandContext,
  limit: number
): Promise<Record<string, unknown>> {
  const target = findCategoryTarget(ctx.channelMap, ctx.category);
  const parent = await ctx.ops.resolveParentChannel(target);
  if (!parent) {
    return {
      ok: false,
      command: "read-thread",
      dryRun: ctx.dryRun,
      category: ctx.category,
      challenge: ctx.challenge,
      error: {
        code: "parent_channel_not_found",
        message: "Parent category channel not found. Run ensure-channels first."
      }
    };
  }

  const activeThreads = await ctx.ops.listActiveThreads(parent);
  const archivedThreads = await ctx.ops.listArchivedThreads(parent);
  const match = matchThreadByChallenge(ctx.challenge, activeThreads, archivedThreads);
  if (!match) {
    return {
      ok: false,
      command: "read-thread",
      dryRun: ctx.dryRun,
      category: ctx.category,
      challenge: ctx.challenge,
      error: {
        code: "thread_not_found",
        message: "No matching thread found. Run ensure-thread first."
      }
    };
  }

  let thread = match.thread;
  let threadStateAction: "none" | "unarchived" | "would_unarchive" = "none";
  if (match.source === "archived" && match.thread.archived) {
    if (ctx.dryRun) {
      threadStateAction = "would_unarchive";
    } else {
      thread = await ctx.ops.unarchiveThread(match.thread);
      threadStateAction = "unarchived";
    }
  }

  const messages = await ctx.ops.fetchMessages(thread, limit);
  const orderedMessages = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    ok: true,
    command: "read-thread",
    dryRun: ctx.dryRun,
    category: ctx.category,
    challenge: ctx.challenge,
    threadStateAction,
    thread: {
      id: thread.id,
      name: thread.name,
      archived: thread.archived
    },
    messageCount: orderedMessages.length,
    messages: orderedMessages
  };
}

export async function runPostUpdate(
  ctx: CommandContext,
  messageFilePath: string
): Promise<Record<string, unknown>> {
  const messageRaw = await readFile(messageFilePath, "utf8");
  const messageText = messageRaw.trim();
  if (!messageText) {
    throw new Error("message file is empty.");
  }

  const ensureResult = await ensureThreadForChallenge(ctx);
  const thread = ensureResult.thread;
  const prefixedMessage = `[${ctx.agentName}] ${messageText}`;

  if (ctx.dryRun || thread.id === null) {
    return {
      ok: true,
      command: "post-update",
      dryRun: true,
      category: ctx.category,
      challenge: ctx.challenge,
      ensureAction: ensureResult.action,
      thread,
      message: prefixedMessage,
      action: "would_post"
    };
  }

  const sent = await ctx.ops.sendMessage(thread, prefixedMessage);
  return {
    ok: true,
    command: "post-update",
    dryRun: false,
    category: ctx.category,
    challenge: ctx.challenge,
    ensureAction: ensureResult.action,
    thread: {
      id: thread.id,
      name: thread.name,
      archived: thread.archived
    },
    postedMessage: sent
  };
}

export async function runMarkDone(ctx: CommandContext): Promise<Record<string, unknown>> {
  const ensureResult = await ensureThreadForChallenge(ctx);
  const thread = ensureResult.thread;
  const baseName = stripDonePrefix(thread.name);
  const targetName = toDoneThreadName(baseName || ctx.challenge);
  const alreadyDone = isDoneThreadName(thread.name) && stripDonePrefix(thread.name) === baseName;

  if (alreadyDone && thread.name === targetName) {
    return {
      ok: true,
      command: "mark-done",
      dryRun: ctx.dryRun,
      category: ctx.category,
      challenge: ctx.challenge,
      ensureAction: ensureResult.action,
      action: "no_change",
      thread
    };
  }

  if (ctx.dryRun || thread.id === null) {
    return {
      ok: true,
      command: "mark-done",
      dryRun: true,
      category: ctx.category,
      challenge: ctx.challenge,
      ensureAction: ensureResult.action,
      action: "would_rename",
      fromName: thread.name,
      toName: targetName,
      thread
    };
  }

  const renamed = await ctx.ops.renameThread(thread, targetName);
  return {
    ok: true,
    command: "mark-done",
    dryRun: false,
    category: ctx.category,
    challenge: ctx.challenge,
    ensureAction: ensureResult.action,
    action: "renamed",
    fromName: thread.name,
    toName: renamed.name,
    thread: renamed
  };
}

// No background polling by design.

class DiscordJsThreadOps implements ThreadOps {
  private readonly client: Client;
  private readonly guild: Guild;

  private constructor(client: Client, guild: Guild) {
    this.client = client;
    this.guild = guild;
  }

  static async connect(token: string, guildId: string): Promise<DiscordJsThreadOps> {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });
    await client.login(token);
    const guild = await client.guilds.fetch(guildId);
    return new DiscordJsThreadOps(client, guild);
  }

  async close(): Promise<void> {
    this.client.destroy();
  }

  async resolveParentChannel(target: ChannelMapValue): Promise<ParentChannelRef | null> {
    const normalizedTarget =
      typeof target === "string"
        ? LIKELY_DISCORD_ID_PATTERN.test(target.trim())
          ? { id: target.trim(), name: target.trim() }
          : { name: target.trim() }
        : { id: target.id?.trim(), name: target.name?.trim() };

    let channel: TextChannel | null = null;
    if (normalizedTarget.id) {
      channel = await this.fetchTextChannelById(normalizedTarget.id);
    }
    if (!channel && normalizedTarget.name) {
      channel = await this.fetchTextChannelByName(normalizedTarget.name);
    }
    if (!channel) return null;
    return { id: channel.id, name: channel.name, raw: channel };
  }

  async createParentChannel(name: string): Promise<ParentChannelRef> {
    const created = await this.guild.channels.create({
      name,
      type: ChannelType.GuildText,
      reason: "CTF category channel created by discord-ctf-threader"
    });
    if (created.type !== ChannelType.GuildText) {
      throw new Error("Created channel was not a text channel.");
    }
    return { id: created.id, name: created.name, raw: created };
  }

  async listActiveThreads(parent: ParentChannelRef): Promise<ThreadRef[]> {
    const parentChannel = this.expectParent(parent);
    const fetched = await parentChannel.threads.fetchActive();
    return [...fetched.threads.values()].map((thread) => this.toThreadRef(thread));
  }

  async listArchivedThreads(parent: ParentChannelRef): Promise<ThreadRef[]> {
    const parentChannel = this.expectParent(parent);
    const fetched = await parentChannel.threads.fetchArchived({ type: "public" });
    return [...fetched.threads.values()].map((thread) => this.toThreadRef(thread));
  }

  async createThread(parent: ParentChannelRef, name: string): Promise<ThreadRef> {
    const parentChannel = this.expectParent(parent);
    const created = await parentChannel.threads.create({
      name,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: "CTF challenge thread created by discord-ctf-threader"
    });
    return this.toThreadRef(created);
  }

  async unarchiveThread(thread: ThreadRef): Promise<ThreadRef> {
    const resolved = await this.resolveThread(thread);
    if (resolved.archived) {
      await resolved.setArchived(false, "Re-open challenge thread");
    }
    return this.toThreadRef(resolved);
  }

  async fetchMessages(thread: ThreadRef, limit: number): Promise<ThreadMessage[]> {
    const resolved = await this.resolveThread(thread);
    const fetched = await resolved.messages.fetch({ limit });
    const ordered = [...fetched.values()].sort(
      (left, right) => left.createdTimestamp - right.createdTimestamp
    );
    return ordered.map((message) => ({
      id: message.id,
      authorId: message.author.id,
      authorUsername: message.author.username,
      createdAt: new Date(message.createdTimestamp).toISOString(),
      content: message.content
    }));
  }

  async sendMessage(thread: ThreadRef, content: string): Promise<{ id: string; content: string }> {
    const resolved = await this.resolveThread(thread);
    const sent = await resolved.send(content);
    return { id: sent.id, content: sent.content };
  }

  async renameThread(thread: ThreadRef, name: string): Promise<ThreadRef> {
    const resolved = await this.resolveThread(thread);
    await resolved.setName(name, "Mark challenge as done");
    return this.toThreadRef(resolved);
  }

  private async fetchTextChannelById(id: string): Promise<TextChannel | null> {
    const channel = await this.guild.channels.fetch(id).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return null;
    }
    return channel;
  }

  private async fetchTextChannelByName(name: string): Promise<TextChannel | null> {
    const fetched = await this.guild.channels.fetch();
    const channel = fetched.find(
      (entry) => entry?.type === ChannelType.GuildText && entry.name === name
    );
    if (!channel || channel.type !== ChannelType.GuildText) {
      return null;
    }
    return channel;
  }

  private expectParent(parent: ParentChannelRef): TextChannel {
    if (parent.raw instanceof TextChannel) {
      return parent.raw;
    }
    throw new Error("Parent channel is missing Discord channel reference.");
  }

  private async resolveThread(thread: ThreadRef): Promise<ThreadChannel> {
    if (thread.raw instanceof ThreadChannel) {
      return thread.raw;
    }
    const fetched = await this.client.channels.fetch(thread.id);
    if (!fetched || !fetched.isThread()) {
      throw new Error(`Thread ${thread.id} not found.`);
    }
    return fetched;
  }

  private toThreadRef(thread: ThreadChannel): ThreadRef {
    return {
      id: thread.id,
      name: thread.name,
      archived: Boolean(thread.archived),
      raw: thread
    };
  }
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  if (argv.length === 0) {
    throw new Error("Missing command.");
  }
  const command = argv[0];
  if (!["ensure-channels", "ensure-thread", "read-thread", "post-update", "mark-done"].includes(command)) {
    throw new Error(`Unsupported command "${command}".`);
  }

  const values: Record<string, string> = {};
  let dryRun = false;

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument "${arg}".`);
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}.`);
    }
    values[key] = next;
    i += 1;
  }

  return { command: command as CliCommand, dryRun, values };
}

function requireCliValue(values: Record<string, string>, key: string): string {
  const value = values[key];
  if (!value || !value.trim()) {
    throw new Error(`Missing required --${key}.`);
  }
  return value;
}

function parsePositiveInteger(raw: string, argName: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${argName} must be a positive integer.`);
  }
  return value;
}

function resolveEnv(key: string): string {
  const value = process.env[key];
  if (value && value.trim()) return value.trim();
  throw new Error(`Missing required environment variable ${key}.`);
}

function resolveOptionalEnv(key: string, fallback: string): string {
  const value = process.env[key];
  if (!value || !value.trim()) return fallback;
  return value.trim();
}

export function resolveBotToken(env: NodeJS.ProcessEnv = process.env): string {
  const configuredKey = env.DISCORD_BOT_TOKEN_ENV_VAR?.trim() || "DISCORD_BOT_TOKEN";
  const value = env[configuredKey];
  if (value && value.trim()) return value.trim();
  throw new Error(
    `Missing required environment variable ${configuredKey}. ` +
      "Set DISCORD_BOT_TOKEN or point DISCORD_BOT_TOKEN_ENV_VAR at another env var name."
  );
}

function outputJson(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function runCli(): Promise<void> {
  let command: CliCommand | null = null;
  try {
    loadConfigFiles();
    const parsed = parseCliArgs(process.argv.slice(2));
    command = parsed.command;

    const channelMapFile = resolveEnv("DISCORD_CHANNEL_MAP_FILE");
    const guildId = resolveEnv("DISCORD_GUILD_ID");
    const botToken = resolveBotToken();
    const agentName = resolveOptionalEnv("CODEX_AGENT_NAME", "codex-local");

    const channelMap = await loadChannelMap(channelMapFile);
    const category = parsed.values["category"]?.trim() || "";
    const challenge = parsed.values["challenge"]?.trim() || "";

    const ops = await DiscordJsThreadOps.connect(botToken, guildId);
    try {
      const ctx: CommandContext = {
        channelMap,
        ops,
        dryRun: parsed.dryRun,
        category,
        challenge,
        agentName
      };

      let payload: Record<string, unknown>;
      if (parsed.command === "ensure-channels") {
        const categoriesRaw = parsed.values["categories"]?.trim();
        const categories = categoriesRaw
          ? categoriesRaw.split(",").map((c) => c.trim()).filter(Boolean)
          : null;
        payload = await runEnsureChannels(ctx, categories);
      } else if (parsed.command === "ensure-thread") {
        if (!category) throw new Error("Missing required --category.");
        if (!challenge) throw new Error("Missing required --challenge.");
        payload = await runEnsureThread(ctx);
      } else if (parsed.command === "read-thread") {
        if (!category) throw new Error("Missing required --category.");
        if (!challenge) throw new Error("Missing required --challenge.");
        const limitRaw = requireCliValue(parsed.values, "limit");
        const limit = parsePositiveInteger(limitRaw, "--limit");
        payload = await runReadThread(ctx, limit);
      } else if (parsed.command === "post-update") {
        if (!category) throw new Error("Missing required --category.");
        if (!challenge) throw new Error("Missing required --challenge.");
        const messageFile = requireCliValue(parsed.values, "message-file");
        payload = await runPostUpdate(ctx, messageFile);
      } else {
        if (!category) throw new Error("Missing required --category.");
        if (!challenge) throw new Error("Missing required --challenge.");
        payload = await runMarkDone(ctx);
      }

      outputJson(payload);
      if (payload.ok === false) {
        process.exitCode = 1;
      }
    } finally {
      await ops.close?.();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputJson({
      ok: false,
      command,
      error: {
        code: "cli_error",
        message
      }
    });
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}
