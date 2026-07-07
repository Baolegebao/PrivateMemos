import type {
  AppState,
  ClipboardEntry,
  ClipboardEntryType,
  CountdownTimer,
  FocusNote,
  LedgerBook,
  LedgerCategory,
  LedgerEntry,
  LedgerEntryType,
  LedgerPerson,
  PrivateNote,
  QuickNote,
  Reminder,
  ScheduleItem,
  SyncQueueItem,
  Task,
  TaskStep,
  TaskType
} from './types';

const STORAGE_KEY = 'personal-assistant-ai-state-v1';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultState(): AppState {
  const now = nowIso();
  const mainBook = createLedgerBook('日常账本');
  const self = createLedgerPerson('本人');
  const categories = createDefaultLedgerCategories();
  const food = categories.find((category) => category.name === '餐饮') ?? categories[0];
  return {
    displayName: '我',
    theme: 'system',
    fontScale: 1,
    customThemeName: 'Everforest',
    themeAccent: '#A7C080',
    themeBackground: '#2D353B',
    themeForeground: '#D3C6AA',
    uiFont: 'Inter',
    codeFont: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    contrast: 22,
    pointerCursor: true,
    motionMode: 'system',
    uiFontSize: 14,
    codeFontSize: 12,
    savedThemes: [],
    activeThemeName: '',
    ringtone: 'chime',
    language: 'zh-CN',
    showLunarCalendar: true,
    launchAtLogin: false,
    notes: [
      {
        id: id('note'),
        body: '今天开始记录 Private Memos 的第一条记事。',
        highlighted: true,
        createdAt: now,
        updatedAt: now
      }
    ],
    privateNotes: [
      {
        id: id('pnote'),
        title: '私人笔记示例',
        body: '这里可以保存带标题的私人内容，锁定后避免误改。',
        highlighted: false,
        locked: false,
        createdAt: now,
        updatedAt: now
      }
    ],
    focusNotes: [],
    clipboardItems: [],
    clipboardSaveDirectory: '',
    clipboardLastError: '',
    clipboardShortcut: 'Ctrl+E',
    clipboardShortcutLastError: '',
    defaultExportDirectory: '',
    countdownTimers: [createCountdownTimer()],
    stopwatch: { elapsedSeconds: 0, running: false },
    reminders: [
      {
        id: id('reminder'),
        time: now,
        memo: '检查今日安排',
        repeat: 'none',
        acknowledged: false,
        createdAt: now,
        updatedAt: now
      }
    ],
    tasks: [
      createTask({
        title: '完善第一阶段 MVP',
        type: 'limited',
        dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        steps: ['搭建工程', '实现核心模块', '运行测试']
      })
    ],
    ledgerBooks: [mainBook],
    ledgerPeople: [self],
    ledgerCategories: categories,
    ledgerEntries: [
      createLedgerEntry({
        bookId: mainBook.id,
        personId: self.id,
        categoryId: food.id,
        type: 'expense',
        amount: 28,
        memo: '午餐'
      })
    ],
    schedules: [createScheduleItem('项目复盘')],
    syncQueue: [],
    syncConflicts: [],
    syncTargetUrl: '',
    cloudSyncUrl: '',
    cloudSyncPublishableKey: '',
    cloudSyncEmail: '',
    cloudSyncRememberCredentials: true,
    cloudSyncSavedPassword: '',
    cloudSyncSavedPassphrase: '',
    cloudSyncLastSyncedAt: '',
    cloudSyncLastError: '',
    cloudDeletedRecords: []
  };
}

export function createTask(input: {
  title?: string;
  type?: TaskType;
  dueAt?: string;
  remindHoursBefore?: number;
  steps?: string[];
}): Task {
  const now = nowIso();
  const title = input.title?.trim() || `任务 ${new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date())}`;

  return {
    id: id('task'),
    title,
    type: input.type ?? 'normal',
    completed: false,
    createdAt: now,
    updatedAt: now,
    dueAt: input.dueAt,
    remindHoursBefore: input.remindHoursBefore,
    steps: (input.steps ?? ['']).map(createStep)
  };
}

export function createStep(body: string): TaskStep {
  return {
    id: id('step'),
    body,
    completed: false
  };
}

export function createNote(body = ''): QuickNote {
  const now = nowIso();
  return {
    id: id('note'),
    body,
    highlighted: false,
    createdAt: now,
    updatedAt: now
  };
}

export function createPrivateNote(): PrivateNote {
  const now = nowIso();
  return {
    id: id('pnote'),
    title: '新私人笔记',
    body: '',
    highlighted: false,
    locked: false,
    createdAt: now,
    updatedAt: now
  };
}

export function createFocusNote(title: string, body = ''): FocusNote {
  const now = nowIso();
  return {
    id: id('focus'),
    title: title.trim() || '重点笔记',
    body,
    createdAt: now,
    updatedAt: now
  };
}

export function createReminder(): Reminder {
  const now = nowIso();
  return {
    id: id('reminder'),
    time: now,
    memo: '',
    repeat: 'none',
    acknowledged: false,
    createdAt: now,
    updatedAt: now
  };
}

export function createLedgerBook(name = '新账本'): LedgerBook {
  const now = nowIso();
  return {
    id: id('book'),
    name,
    createdAt: now,
    updatedAt: now
  };
}

export function createLedgerPerson(name = '本人'): LedgerPerson {
  const now = nowIso();
  return {
    id: id('person'),
    name,
    createdAt: now,
    updatedAt: now
  };
}

export function createLedgerCategory(name: string, icon: string, type: LedgerEntryType): LedgerCategory {
  const now = nowIso();
  return {
    id: id('category'),
    name,
    icon,
    type,
    createdAt: now,
    updatedAt: now
  };
}

export function createDefaultLedgerCategories(): LedgerCategory[] {
  return [
    createLedgerCategory('餐饮', 'utensils', 'expense'),
    createLedgerCategory('奶茶', 'coffee', 'expense'),
    createLedgerCategory('购物', 'shopping-bag', 'expense'),
    createLedgerCategory('日用', 'toilet', 'expense'),
    createLedgerCategory('交通', 'bus', 'expense'),
    createLedgerCategory('蔬菜', 'carrot', 'expense'),
    createLedgerCategory('水果', 'apple', 'expense'),
    createLedgerCategory('零食', 'cookie', 'expense'),
    createLedgerCategory('运动', 'dumbbell', 'expense'),
    createLedgerCategory('娱乐', 'mic', 'expense'),
    createLedgerCategory('通讯', 'phone', 'expense'),
    createLedgerCategory('服饰', 'shirt', 'expense'),
    createLedgerCategory('美容', 'sparkles', 'expense'),
    createLedgerCategory('住房', 'house', 'expense'),
    createLedgerCategory('居家', 'armchair', 'expense'),
    createLedgerCategory('孩子', 'baby', 'expense'),
    createLedgerCategory('长辈', 'badge-dollar-sign', 'expense'),
    createLedgerCategory('社交', 'users', 'expense'),
    createLedgerCategory('旅行', 'plane', 'expense'),
    createLedgerCategory('烟酒', 'wine', 'expense'),
    createLedgerCategory('数码', 'smartphone', 'expense'),
    createLedgerCategory('汽车', 'car', 'expense'),
    createLedgerCategory('医疗', 'cross', 'expense'),
    createLedgerCategory('书籍', 'book-open', 'expense'),
    createLedgerCategory('学习', 'graduation-cap', 'expense'),
    createLedgerCategory('宠物', 'dog', 'expense'),
    createLedgerCategory('礼金', 'wallet-cards', 'expense'),
    createLedgerCategory('礼物', 'gift', 'expense'),
    createLedgerCategory('办公', 'briefcase', 'expense'),
    createLedgerCategory('维修', 'hammer', 'expense'),
    createLedgerCategory('捐赠', 'heart-handshake', 'expense'),
    createLedgerCategory('彩票', 'ticket', 'expense'),
    createLedgerCategory('亲友', 'house', 'expense'),
    createLedgerCategory('快递', 'package', 'expense'),
    createLedgerCategory('运费', 'truck', 'expense'),
    createLedgerCategory('饮料', 'cup-soda', 'expense'),
    createLedgerCategory('工资', 'wallet-cards', 'income'),
    createLedgerCategory('兼职', 'clock', 'income'),
    createLedgerCategory('理财', 'chart-no-axes-combined', 'income'),
    createLedgerCategory('礼金', 'badge-dollar-sign', 'income'),
    createLedgerCategory('其它', 'circle-dollar-sign', 'income')
  ];
}

export function createLedgerEntry(input: {
  bookId: string;
  personId: string;
  categoryId: string;
  type: LedgerEntryType;
  amount?: number;
  date?: string;
  memo?: string;
}): LedgerEntry {
  const now = nowIso();
  return {
    id: id('entry'),
    bookId: input.bookId,
    personId: input.personId,
    categoryId: input.categoryId,
    type: input.type,
    amount: input.amount ?? 0,
    date: input.date ?? now,
    memo: input.memo ?? '',
    createdAt: now,
    updatedAt: now
  };
}

export function createScheduleItem(title = '特殊日程'): ScheduleItem {
  const now = nowIso();
  return {
    id: id('schedule'),
    title: title.slice(0, 16),
    date: now,
    repeat: 'none',
    createdAt: now,
    updatedAt: now
  };
}

export function createClipboardEntry(input: {
  type: ClipboardEntryType;
  content: string;
  filePath?: string;
  signature: string;
}): ClipboardEntry {
  const now = nowIso();
  return {
    id: id('clip'),
    type: input.type,
    content: input.content,
    filePath: input.filePath,
    signature: input.signature,
    createdAt: now,
    updatedAt: now
  };
}

export function createCountdownTimer(title = '新倒计时', durationSeconds = 300): CountdownTimer {
  const now = nowIso();
  return {
    id: id('timer'),
    title,
    durationSeconds,
    running: false,
    createdAt: now,
    updatedAt: now
  };
}

export function createSyncQueueItem(input: Pick<SyncQueueItem, 'entity' | 'entityId' | 'operation' | 'payload'>): SyncQueueItem {
  const now = nowIso();
  return {
    id: id('sync'),
    entity: input.entity,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
    status: 'pending',
    attempts: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function loadState(): AppState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState();
  }

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

export function normalizeState(input: Partial<AppState>): AppState {
  const fallback = defaultState();
  const parsed = { ...fallback, ...input } as AppState;
  const ledgerCategories = parsed.ledgerCategories.filter((category) => category.icon !== 'settings');
  const existingCategoryKeys = new Set(ledgerCategories.map((category) => `${category.type}:${category.name}`));
  const missingCategories = fallback.ledgerCategories.filter((category) => !existingCategoryKeys.has(`${category.type}:${category.name}`));
  return {
    ...parsed,
    theme: parsed.theme === 'codex' ? 'system' : parsed.theme,
    focusNotes: parsed.focusNotes ?? [],
    clipboardItems: parsed.clipboardItems ?? [],
    clipboardSaveDirectory: parsed.clipboardSaveDirectory ?? '',
    clipboardLastError: parsed.clipboardLastError ?? '',
    clipboardShortcut: parsed.clipboardShortcut ?? 'Ctrl+E',
    clipboardShortcutLastError: parsed.clipboardShortcutLastError ?? '',
    defaultExportDirectory: parsed.defaultExportDirectory ?? '',
    countdownTimers: parsed.countdownTimers ?? [],
    stopwatch: parsed.stopwatch ?? { elapsedSeconds: 0, running: false },
    ledgerCategories: [...ledgerCategories, ...missingCategories],
    syncQueue: parsed.syncQueue ?? [],
    syncConflicts: parsed.syncConflicts ?? [],
    syncTargetUrl: parsed.syncTargetUrl ?? '',
    cloudSyncUrl: parsed.cloudSyncUrl ?? fallback.cloudSyncUrl,
    cloudSyncPublishableKey: parsed.cloudSyncPublishableKey ?? '',
    cloudSyncEmail: parsed.cloudSyncEmail ?? '',
    cloudSyncRememberCredentials: parsed.cloudSyncRememberCredentials ?? true,
    cloudSyncSavedPassword: '',
    cloudSyncSavedPassphrase: parsed.cloudSyncSavedPassphrase ?? '',
    cloudSyncLastSyncedAt: parsed.cloudSyncLastSyncedAt ?? '',
    cloudSyncLastError: parsed.cloudSyncLastError ?? '',
    cloudDeletedRecords: parsed.cloudDeletedRecords ?? [],
    customThemeName: parsed.customThemeName ?? fallback.customThemeName,
    themeAccent: parsed.themeAccent ?? fallback.themeAccent,
    themeBackground: parsed.themeBackground ?? fallback.themeBackground,
    themeForeground: parsed.themeForeground ?? fallback.themeForeground,
    uiFont: parsed.uiFont ?? fallback.uiFont,
    codeFont: parsed.codeFont ?? fallback.codeFont,
    contrast: parsed.contrast ?? fallback.contrast,
    pointerCursor: parsed.pointerCursor ?? fallback.pointerCursor,
    motionMode: parsed.motionMode ?? fallback.motionMode,
    uiFontSize: parsed.uiFontSize ?? fallback.uiFontSize,
    codeFontSize: parsed.codeFontSize ?? fallback.codeFontSize,
    savedThemes: parsed.savedThemes ?? [],
    activeThemeName: parsed.activeThemeName ?? '',
    ringtone: parsed.ringtone ?? fallback.ringtone,
    language: parsed.language ?? fallback.language,
    showLunarCalendar: parsed.showLunarCalendar ?? true,
    launchAtLogin: parsed.launchAtLogin ?? false
  };
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function touch<T extends { updatedAt: string }>(item: T): T {
  return { ...item, updatedAt: nowIso() };
}
