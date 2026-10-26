import { z } from 'zod';
import { ESTIMATE_MAX, NOTES_MAX, TITLE_MAX } from '../domain/tasks/types';

const MAX_TS = 8.64e15;
const ts = z.number().int().min(0).max(MAX_TS);
const id = z.string().min(1).max(128);
const kind = z.enum(['focus', 'short', 'long']);

export const closedSegmentSchema = z
  .object({ start: ts, end: ts })
  .refine((s) => s.end >= s.start, 'segment end before start');

export const sessionSchema = z.object({
  id,
  kind,
  outcome: z.enum(['completed', 'interrupted', 'skipped']),
  plannedMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 3_600_000),
  actualMs: z
    .number()
    .int()
    .min(0)
    .max(30 * 24 * 3_600_000),
  segments: z.array(closedSegmentSchema).max(10_000),
  startedAt: ts,
  endedAt: ts,
  taskId: id.nullable(),
  cycleIndex: z.number().int().min(0).max(100),
});

export const taskSchema = z.object({
  id,
  title: z.string().min(1).max(TITLE_MAX),
  notes: z.string().max(NOTES_MAX),
  estimate: z.number().int().min(1).max(ESTIMATE_MAX).nullable(),
  completedPomodoros: z.number().int().min(0).max(1_000_000),
  done: z.boolean(),
  doneAt: ts.nullable(),
  createdAt: ts,
  order: z.number().finite(),
});

export const timerStateSchema = z.object({
  v: z.literal(1),
  idPrefix: id,
  seq: z.number().int().min(1),
  sessionId: id,
  kind,
  status: z.enum(['idle', 'running', 'paused']),
  plannedMs: z.number().int().min(1),
  deadline: ts.nullable(),
  remainingMs: z.number().min(0),
  segments: z.array(z.object({ start: ts, end: ts.optional() })).max(10_000),
  completedInCycle: z.number().int().min(0).max(100),
  taskId: id.nullable(),
  checkpoint: ts,
  notice: z.object({ kind, finishedAt: ts }).nullable(),
});

export const themeSchema = z.enum(['light', 'dark', 'system']);

export const settingsSchema = z.object({
  v: z.literal(1),
  focusMin: z.number().int().min(1).max(120),
  shortMin: z.number().int().min(1).max(60),
  longMin: z.number().int().min(1).max(90),
  cycleLength: z.number().int().min(2).max(8),
  autoProgress: z.boolean(),
  autoStartFocus: z.boolean(),
  autoStartBreaks: z.boolean(),
  sound: z.boolean(),
  volume: z.number().int().min(0).max(100),
  distinctBreakChime: z.boolean(),
  notifications: z.boolean(),
  keepAwake: z.boolean(),
  theme: themeSchema,
  reduceMotion: z.boolean(),
  focusMode: z.boolean(),
  pandaPose: z.enum(['default', 'pose-stretch']),
});

export type Settings = z.infer<typeof settingsSchema>;
export type Theme = z.infer<typeof themeSchema>;

export const DEFAULT_SETTINGS: Settings = {
  v: 1,
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  cycleLength: 4,
  autoProgress: true,
  autoStartFocus: false,
  autoStartBreaks: false,
  sound: true,
  volume: 60,
  distinctBreakChime: true,
  notifications: false,
  keepAwake: false,
  theme: 'system',
  reduceMotion: false,
  focusMode: false,
  pandaPose: 'default',
};

export const BACKUP_FORMAT = 'pandaro-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_MAX_BYTES = 10 * 1024 * 1024;

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: ts,
  app: z.string().max(64).optional(),
  settings: settingsSchema,
  tasks: z.array(taskSchema).max(100_000),
  sessions: z.array(sessionSchema).max(1_000_000),
});

export type Backup = z.infer<typeof backupSchema>;
