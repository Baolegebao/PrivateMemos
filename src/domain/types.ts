export type ViewMode = 'list' | 'week' | 'month';
export type ModuleKey =
  | 'home'
  | 'notes'
  | 'privateNotes'
  | 'focus'
  | 'reminders'
  | 'tasks'
  | 'ledger'
  | 'calendar'
  | 'clipboard'
  | 'timers'
  | 'settings'
  | 'account';

export type TaskType = 'normal' | 'daily' | 'weekly' | 'monthly' | 'limited';
export type ReminderRepeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type LedgerEntryType = 'income' | 'expense';
export type LedgerPeriod = 'day' | 'week' | 'month' | 'year';
export type SyncQueueStatus = 'pending' | 'sent' | 'failed';
export type ClipboardEntryType = 'text' | 'link' | 'image';

export interface DatedEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuickNote extends DatedEntity {
  body: string;
  highlighted: boolean;
}

export interface PrivateNote extends DatedEntity {
  title: string;
  body: string;
  highlighted: boolean;
  locked: boolean;
}

export interface FocusNote extends DatedEntity {
  title: string;
  body: string;
}

export interface Reminder extends DatedEntity {
  time: string;
  memo: string;
  repeat: ReminderRepeat;
  acknowledged: boolean;
}

export interface TaskStep {
  id: string;
  body: string;
  completed: boolean;
}

export interface Task extends DatedEntity {
  title: string;
  type: TaskType;
  completed: boolean;
  highlighted?: boolean;
  startedAt?: string;
  completedAt?: string;
  rating?: number;
  dueAt?: string;
  remindHoursBefore?: number;
  steps: TaskStep[];
}

export interface LedgerBook extends DatedEntity {
  name: string;
}

export interface LedgerPerson extends DatedEntity {
  name: string;
}

export interface LedgerCategory extends DatedEntity {
  name: string;
  icon: string;
  type: LedgerEntryType;
}

export interface LedgerEntry extends DatedEntity {
  bookId: string;
  type: LedgerEntryType;
  categoryId: string;
  personId: string;
  amount: number;
  date: string;
  memo: string;
}

export interface ScheduleItem extends DatedEntity {
  title: string;
  date: string;
  repeat: 'none' | 'monthlySolar' | 'yearlySolar' | 'monthlyLunar' | 'yearlyLunar';
}

export interface ClipboardEntry extends DatedEntity {
  type: ClipboardEntryType;
  content: string;
  filePath?: string;
  signature: string;
}

export interface CountdownTimer extends DatedEntity {
  title: string;
  durationSeconds: number;
  remainingSeconds?: number;
  startedAt?: string;
  firstStartedAt?: string;
  running: boolean;
}

export interface StopwatchTimer {
  startedAt?: string;
  elapsedSeconds: number;
  running: boolean;
}

export interface SyncQueueItem extends DatedEntity {
  entity: ModuleKey | 'ledgerEntry' | 'schedule';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: string;
  status: SyncQueueStatus;
  attempts: number;
  lastError?: string;
}

export interface SyncConflict extends DatedEntity {
  entity: keyof Pick<AppState, 'notes' | 'privateNotes' | 'focusNotes' | 'reminders' | 'tasks' | 'ledgerBooks' | 'ledgerPeople' | 'ledgerCategories' | 'ledgerEntries' | 'schedules'>;
  entityId: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  resolvedBy: 'local' | 'remote';
}

export interface CloudDeletedRecord {
  entity: keyof Pick<AppState, 'notes' | 'privateNotes' | 'focusNotes' | 'reminders' | 'tasks' | 'ledgerBooks' | 'ledgerPeople' | 'ledgerCategories' | 'ledgerEntries' | 'schedules' | 'countdownTimers'>;
  recordId: string;
  deletedAt: string;
}

export interface SyncServerStatus {
  running: boolean;
  port: number;
  url?: string;
  error?: string;
}

export interface ThemePreset {
  name: string;
  theme: 'system' | 'light' | 'warm' | 'dark' | 'amber' | 'codex';
  themeAccent?: string;
  themeBackground?: string;
  themeForeground?: string;
  uiFont?: string;
  contrast?: number;
  uiFontSize?: number;
}

export interface AppState {
  notes: QuickNote[];
  privateNotes: PrivateNote[];
  focusNotes: FocusNote[];
  reminders: Reminder[];
  tasks: Task[];
  ledgerBooks: LedgerBook[];
  ledgerPeople: LedgerPerson[];
  ledgerCategories: LedgerCategory[];
  ledgerEntries: LedgerEntry[];
  schedules: ScheduleItem[];
  clipboardItems?: ClipboardEntry[];
  clipboardSaveDirectory?: string;
  clipboardLastError?: string;
  clipboardShortcut?: string;
  clipboardShortcutLastError?: string;
  defaultExportDirectory?: string;
  countdownTimers?: CountdownTimer[];
  stopwatch?: StopwatchTimer;
  syncQueue: SyncQueueItem[];
  syncConflicts: SyncConflict[];
  syncTargetUrl?: string;
  syncLastCheckedAt?: string;
  syncLastError?: string;
  cloudSyncUrl?: string;
  cloudSyncPublishableKey?: string;
  cloudSyncEmail?: string;
  cloudSyncRememberCredentials?: boolean;
  cloudSyncSavedPassword?: string;
  cloudSyncSavedPassphrase?: string;
  cloudSyncLastSyncedAt?: string;
  cloudSyncLastError?: string;
  cloudDeletedRecords?: CloudDeletedRecord[];
  dashboardOrder?: string[];
  displayName: string;
  passwordHash?: string;
  passwordUpdatedAt?: string;
  theme: 'system' | 'light' | 'warm' | 'dark' | 'amber' | 'codex';
  fontScale: number;
  customThemeName?: string;
  themeAccent?: string;
  themeBackground?: string;
  themeForeground?: string;
  uiFont?: string;
  codeFont?: string;
  contrast?: number;
  pointerCursor?: boolean;
  motionMode?: 'system' | 'on' | 'off';
  uiFontSize?: number;
  codeFontSize?: number;
  savedThemes?: ThemePreset[];
  activeThemeName?: string;
  ringtone?: string;
  language?: string;
  showLunarCalendar?: boolean;
  launchAtLogin?: boolean;
}

export interface CalendarBucket<T extends DatedEntity> {
  date: string;
  items: T[];
}
