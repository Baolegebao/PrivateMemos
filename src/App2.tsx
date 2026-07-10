import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, DragEvent, MouseEvent, ReactNode, SetStateAction, TouchEvent } from 'react';
import {
  Apple,
  Armchair,
  Baby,
  BadgeDollarSign,
  Bell,
  BookLock,
  BookOpen,
  Briefcase,
  Bus,
  CalendarDays,
  Car,
  Carrot,
  Check,
  CheckSquare,
  ChartNoAxesCombined,
  CircleDollarSign,
  ClipboardList,
  Clock,
  Coffee,
  Cookie,
  Copy,
  Cross,
  CupSoda,
  Dog,
  Download,
  Dumbbell,
  Eye,
  FileText,
  FolderOpen,
  Gift,
  GraduationCap,
  Hammer,
  HeartHandshake,
  Home,
  House,
  Image,
  Landmark,
  Lock,
  Mic,
  Package,
  Phone,
  Pin,
  Plane,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shirt,
  ShoppingBag,
  Smartphone,
  Star,
  Square,
  Ticket,
  Trash2,
  Truck,
  Unlock,
  Users,
  Utensils,
  User,
  WalletCards,
  Wine
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatDateTime, formatLunarDate, groupByView, todayIso, toLocalDateKey } from './domain/date';
import { buildStateBackup, parseStateBackup } from './domain/backup';
import { mergeCloudStates, syncCloudRecords, withCloudDeletionTombstones } from './domain/cloudSync';
import { buildDocx, buildDocxFromParagraphs, type DocxParagraph } from './domain/exporters';
import { buildLedgerTypePatch, canDeleteLedgerBook } from './domain/ledger';
import { isMobileApp, loadMobileState, saveMobileState } from './domain/mobileStorage';
import { applyDueReminder } from './domain/reminders';
import { rolloverRecurringTasks } from './domain/tasks';
import {
  createLedgerBook,
  createLedgerCategory,
  createLedgerEntry,
  createLedgerPerson,
  createClipboardEntry,
  createCountdownTimer,
  createFocusNote,
  createNote,
  createPrivateNote,
  createReminder,
  createScheduleItem,
  createStep,
  createTask,
  loadState,
  normalizeState,
  saveState,
  touch
} from './domain/store';
import {
  filterLedgerEntries,
  getLedgerEntries,
  getLedgerPeriodLabel,
  getMonthSchedules,
  getSchedulesForMonth,
  groupLedgerEntriesByDate,
  getOpenTasks,
  getTodayReminders,
  getYesterdaySummary,
  isScheduleOnDate,
  searchState,
  shouldHighlightLimitedTask,
  summarizeLedger,
  summarizeLedgerByCategory
} from './domain/selectors';
import type {
  AppState,
  ClipboardEntry,
  ClipboardEntryType,
  CountdownTimer,
  DatedEntity,
  LedgerEntry,
  LedgerEntryType,
  LedgerPeriod,
  ModuleKey,
  PrivateNote,
  QuickNote,
  Reminder,
  ScheduleItem,
  Task,
  TaskType,
  ThemePreset,
  ViewMode
} from './domain/types';

type DataStoreStatus = {
  path: string;
  exists: boolean;
  directory: string;
  defaultDirectory: string;
  customDirectory?: string;
};

const modules: Array<{ key: ModuleKey; label: string; icon: typeof Home }> = [
  { key: 'home', label: '首页', icon: Home },
  { key: 'calendar', label: '日程表', icon: CalendarDays },
  { key: 'focus', label: '重点', icon: Star },
  { key: 'clipboard', label: '剪贴板集合', icon: ClipboardList },
  { key: 'timers', label: '计时器', icon: Clock },
  { key: 'notes', label: '记事', icon: FileText },
  { key: 'privateNotes', label: '私人笔记', icon: BookLock },
  { key: 'reminders', label: '提醒', icon: Bell },
  { key: 'tasks', label: '任务', icon: CheckSquare },
  { key: 'ledger', label: '记账', icon: Landmark },
  { key: 'settings', label: '设置', icon: Settings },
  { key: 'account', label: '账号', icon: User }
];
const mobileModules = modules.filter((item) => ['home', 'calendar', 'focus', 'notes', 'privateNotes', 'reminders', 'tasks', 'ledger'].includes(item.key));
const mobileModuleKeys = new Set<ModuleKey>(mobileModules.map((item) => item.key));
const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const LAST_LOGIN_ACCOUNT_KEY = 'personal-assistant-ai-last-login-account';
const themeDefaults = {
  customThemeName: 'Everforest',
  themeAccent: '#A7C080',
  themeBackground: '#2D353B',
  themeForeground: '#D3C6AA',
  uiFont: 'Inter',
  codeFont: 'ui-monospace, SFMono-Regular, Consolas, monospace',
  contrast: 22,
  pointerCursor: true,
  motionMode: 'system' as const,
  uiFontSize: 14,
  codeFontSize: 12
};

type ThemePayload = Pick<AppState, keyof typeof themeDefaults | 'theme'>;

const themePalettes: Record<AppState['theme'], Pick<ThemePayload, 'themeAccent' | 'themeBackground' | 'themeForeground'>> = {
  system: { themeAccent: '#A7C080', themeBackground: '#2D353B', themeForeground: '#D3C6AA' },
  light: { themeAccent: '#E7EFE9', themeBackground: '#F4F8F6', themeForeground: '#16352A' },
  warm: { themeAccent: '#F4D06F', themeBackground: '#F7ECD0', themeForeground: '#2D353B' },
  amber: { themeAccent: '#FFEE80', themeBackground: '#2D353B', themeForeground: '#D3C6AA' },
  dark: { themeAccent: '#A7C080', themeBackground: '#2D353B', themeForeground: '#D3C6AA' },
  codex: { themeAccent: '#A7C080', themeBackground: '#2D353B', themeForeground: '#D3C6AA' }
};

const builtInThemeNames = new Set(['暗黄', '深色+黄']);

const ringtoneOptions = [
  { id: 'chime', label: '清脆叮咚', frequencies: [880, 1174, 1568] },
  { id: 'bubble', label: '气泡提示', frequencies: [523, 659, 784] },
  { id: 'pixel', label: '像素跳跃', frequencies: [988, 784, 1174] },
  { id: 'mail', label: '邮件到达', frequencies: [660, 880] },
  { id: 'bell', label: '小铃铛', frequencies: [1046, 1318, 1046] },
  { id: 'spark', label: '灵感闪光', frequencies: [740, 988, 1480] },
  { id: 'drop', label: '水滴提醒', frequencies: [1200, 900, 600] },
  { id: 'coin', label: '金币提示', frequencies: [1318, 1568] },
  { id: 'pop', label: '弹跳提示', frequencies: [392, 784, 988] },
  { id: 'soft', label: '柔和提示', frequencies: [440, 554, 659] }
];

type LanguageCode = 'zh-CN' | 'en-US';

const languageOptions: Array<{ value: LanguageCode; label: string }> = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' }
];

const zhText = {
  globalSearch: '全局搜索',
  nav: {
    home: '首页', calendar: '日程表', focus: '重点', clipboard: '剪贴板集合', timers: '计时器',
    notes: '记事', privateNotes: '私人笔记', reminders: '提醒', tasks: '任务', ledger: '记账', settings: '设置', account: '账号'
  } satisfies Record<ModuleKey, string>,
  common: {
    all: '全部', list: '列表', week: '周', month: '月', new: '新建', export: '导出', browse: '浏览', pin: '置顶',
    locked: '已锁定', unlocked: '未锁定', image: '图片', close: '关闭', selectAll: '全选',
    thisWeek: '本周', lastWeek: '上周', thisMonth: '本月', lastMonth: '上月', thisYear: '本年度'
  },
  privateNotes: {
    title: '私人笔记', search: '搜索笔记关键词', untitled: '无标题', chooseNote: '选择笔记',
    titlePlaceholder: '标题', bodyPlaceholder: '正文', empty: '新建一条私人笔记后开始编辑',
    exportConfirm: '确定导出 {count} 条私人笔记吗？', previewTitle: '浏览私人笔记', pinnedPrefix: '1置顶'
  },
  settings: { languageTitle: '语言', languageHint: '切换界面显示语言', dataDirectory: '设置保存目录' },
  empty: '暂无内容'
};

type AppText = typeof zhText;

const enText: AppText = {
  globalSearch: 'Search',
  nav: {
    home: 'Home', calendar: 'Calendar', focus: 'Focus', clipboard: 'Clipboard', timers: 'Timer',
    notes: 'Memos', privateNotes: 'Private Memos', reminders: 'Reminders', tasks: 'Tasks', ledger: 'Ledger', settings: 'Settings', account: 'Account'
  },
  common: {
    all: 'All', list: 'List', week: 'Week', month: 'Month', new: 'New', export: 'Export', browse: 'View', pin: 'Pin',
    locked: 'Locked', unlocked: 'Unlocked', image: 'Image', close: 'Close', selectAll: 'Select all',
    thisWeek: 'This week', lastWeek: 'Last week', thisMonth: 'This month', lastMonth: 'Last month', thisYear: 'This year'
  },
  privateNotes: {
    title: 'Private Memos', search: 'Search private memos', untitled: 'Untitled', chooseNote: 'Select memo',
    titlePlaceholder: 'Title', bodyPlaceholder: 'Body', empty: 'Create a private memo to start editing',
    exportConfirm: 'Export {count} private memos?', previewTitle: 'View private memo', pinnedPrefix: '1Pinned'
  },
  settings: { languageTitle: 'Language', languageHint: 'Switch interface language', dataDirectory: 'Set data directory' },
  empty: 'No content'
};

const TextContext = createContext<AppText>(zhText);

function getText(language?: string): AppText {
  return language === 'en-US' ? enText : zhText;
}

function useText() {
  return useContext(TextContext);
}
function themeValue<K extends keyof typeof themeDefaults>(state: AppState, key: K): (typeof themeDefaults)[K] {
  return (state[key] ?? themeDefaults[key]) as (typeof themeDefaults)[K];
}

function buildThemePayload(state: AppState): ThemePayload {
  return {
    theme: state.theme,
    customThemeName: themeValue(state, 'customThemeName'),
    themeAccent: themeValue(state, 'themeAccent'),
    themeBackground: themeValue(state, 'themeBackground'),
    themeForeground: themeValue(state, 'themeForeground'),
    uiFont: themeValue(state, 'uiFont'),
    codeFont: themeValue(state, 'codeFont'),
    contrast: themeValue(state, 'contrast'),
    pointerCursor: themeValue(state, 'pointerCursor'),
    motionMode: themeValue(state, 'motionMode'),
    uiFontSize: themeValue(state, 'uiFontSize'),
    codeFontSize: themeValue(state, 'codeFontSize')
  };
}

function buildThemeStyle(state: AppState): CSSProperties {
  return {
    fontSize: `${themeValue(state, 'uiFontSize')}px`,
    '--app-accent': themeValue(state, 'themeAccent'),
    '--app-bg': themeValue(state, 'themeBackground'),
    '--app-fg': themeValue(state, 'themeForeground'),
    '--app-ui-font': themeValue(state, 'uiFont'),
    '--app-code-font': themeValue(state, 'codeFont'),
    '--app-code-size': `${themeValue(state, 'codeFontSize')}px`,
    '--app-contrast': String(themeValue(state, 'contrast'))
  } as CSSProperties;
}

function inputDateToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isoToDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

type DialogRequest =
  | { kind: 'alert'; title: string; message: string; confirmLabel?: string; resolve: () => void }
  | { kind: 'confirm'; title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; resolve: (value: boolean) => void }
  | { kind: 'prompt'; title: string; message?: string; defaultValue?: string; inputType?: 'text' | 'password'; confirmLabel?: string; cancelLabel?: string; resolve: (value: string | undefined) => void };

let dialogController: ((request: DialogRequest) => void) | undefined;

function appAlert(message: string, title = '提示'): Promise<void> {
  if (!dialogController) {
    window.alert(message);
    return Promise.resolve();
  }
  return new Promise((resolve) => dialogController?.({ kind: 'alert', title, message, resolve }));
}

function appConfirm(message: string, options: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  if (!dialogController) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => dialogController?.({
    kind: 'confirm',
    title: options.title ?? '确认操作',
    message,
    confirmLabel: options.confirmLabel,
    cancelLabel: options.cancelLabel,
    danger: options.danger,
    resolve
  }));
}

function appPrompt(message: string, options: { title?: string; defaultValue?: string; inputType?: 'text' | 'password'; confirmLabel?: string; cancelLabel?: string } = {}): Promise<string | undefined> {
  if (!dialogController) return Promise.resolve(window.prompt(message, options.defaultValue ?? '') ?? undefined);
  return new Promise((resolve) => dialogController?.({
    kind: 'prompt',
    title: options.title ?? message,
    message,
    defaultValue: options.defaultValue,
    inputType: options.inputType,
    confirmLabel: options.confirmLabel,
    cancelLabel: options.cancelLabel,
    resolve
  }));
}

function playRingtone(ringtoneId = 'chime') {
  const preset = ringtoneOptions.find((item) => item.id === ringtoneId) ?? ringtoneOptions[0];
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  const startedAt = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startedAt);
  gain.connect(context.destination);

  // 用 Web Audio 直接生成短提示音，避免引入外部音频文件和额外依赖。
  preset.frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const noteStart = startedAt + index * 0.13;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    oscillator.connect(gain);
    gain.gain.exponentialRampToValueAtTime(0.12, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.11);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.12);
  });

  window.setTimeout(() => void context.close(), preset.frequencies.length * 150 + 250);
}

function confirmDelete(target: string): Promise<boolean> {
  return appConfirm(`确定删除${target}吗？此操作不能撤销。`, { title: '删除确认', confirmLabel: '删除', danger: true });
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function quickDateRange(range: 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear', now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);

  if (range === 'thisWeek' || range === 'lastWeek') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (range === 'lastWeek') start.setDate(start.getDate() - 7);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (range === 'thisMonth' || range === 'lastMonth') {
    start.setDate(1);
    if (range === 'lastMonth') start.setMonth(start.getMonth() - 1);
    end.setTime(start.getTime());
    end.setMonth(start.getMonth() + 1, 0);
  } else {
    start.setMonth(0, 1);
    end.setTime(start.getTime());
    end.setMonth(11, 31);
  }

  return { from: localDateKey(start), to: localDateKey(end) };
}

const ledgerIconMap: Record<string, LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  'shopping-bag': ShoppingBag,
  toilet: Settings,
  bus: Bus,
  carrot: Carrot,
  apple: Apple,
  cookie: Cookie,
  dumbbell: Dumbbell,
  mic: Mic,
  phone: Phone,
  shirt: Shirt,
  sparkles: Star,
  house: House,
  armchair: Armchair,
  baby: Baby,
  'badge-dollar-sign': BadgeDollarSign,
  users: Users,
  plane: Plane,
  wine: Wine,
  smartphone: Smartphone,
  car: Car,
  cross: Cross,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  dog: Dog,
  'wallet-cards': WalletCards,
  gift: Gift,
  briefcase: Briefcase,
  hammer: Hammer,
  'heart-handshake': HeartHandshake,
  ticket: Ticket,
  package: Package,
  truck: Truck,
  'cup-soda': CupSoda,
  settings: Settings,
  clock: Clock,
  'chart-no-axes-combined': ChartNoAxesCombined,
  'circle-dollar-sign': CircleDollarSign
};

function sortPinnedItems<T extends { highlighted: boolean; createdAt: string; updatedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.highlighted !== b.highlighted) return a.highlighted ? -1 : 1;
    return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt);
  });
}

function addClipboardEntry(state: AppState, item: ClipboardEntry): AppState {
  const items = state.clipboardItems ?? [];
  if (items.some((current) => current.signature === item.signature)) return state;
  return { ...state, clipboardItems: [item, ...items].slice(0, 1000) };
}

function isUrlText(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function getCloudSyncChangeKey(state: AppState) {
  return JSON.stringify({
    notes: state.notes,
    privateNotes: state.privateNotes,
    focusNotes: state.focusNotes,
    reminders: state.reminders,
    tasks: state.tasks,
    ledgerBooks: state.ledgerBooks,
    ledgerPeople: state.ledgerPeople,
    ledgerCategories: state.ledgerCategories,
    ledgerEntries: state.ledgerEntries,
    schedules: state.schedules,
    countdownTimers: state.countdownTimers ?? [],
    cloudDeletedRecords: state.cloudDeletedRecords ?? []
  });
}

type SyncUpdateCollectionKey = keyof Pick<AppState, 'notes' | 'privateNotes' | 'focusNotes' | 'reminders' | 'tasks' | 'ledgerBooks' | 'ledgerPeople' | 'ledgerCategories' | 'ledgerEntries' | 'schedules' | 'countdownTimers'>;

interface SyncUpdateStat {
  label: string;
  count: number;
}

const SYNC_UPDATE_COLLECTIONS: Array<{ key: SyncUpdateCollectionKey; label: string }> = [
  { key: 'notes', label: '记事' },
  { key: 'privateNotes', label: '私人笔记' },
  { key: 'focusNotes', label: '重点' },
  { key: 'reminders', label: '提醒' },
  { key: 'tasks', label: '任务' },
  { key: 'ledgerBooks', label: '记账' },
  { key: 'ledgerPeople', label: '记账' },
  { key: 'ledgerCategories', label: '记账' },
  { key: 'ledgerEntries', label: '记账' },
  { key: 'schedules', label: '日程' },
  { key: 'countdownTimers', label: '计时器' }
];

function getSyncCollection(state: AppState, key: SyncUpdateCollectionKey): DatedEntity[] {
  return ((state[key] ?? []) as DatedEntity[]);
}

function countCollectionChanges(before: DatedEntity[], after: DatedEntity[]) {
  const beforeMap = new Map(before.map((item) => [item.id, JSON.stringify(item)]));
  const afterMap = new Map(after.map((item) => [item.id, JSON.stringify(item)]));
  const ids = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  return [...ids].filter((id) => beforeMap.get(id) !== afterMap.get(id)).length;
}

function getSyncUpdateStats(before: AppState, after: AppState): SyncUpdateStat[] {
  const counts = new Map<string, number>();
  SYNC_UPDATE_COLLECTIONS.forEach(({ key, label }) => {
    const count = countCollectionChanges(getSyncCollection(before, key), getSyncCollection(after, key));
    if (count > 0) counts.set(label, (counts.get(label) ?? 0) + count);
  });
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

function formatSyncUpdateToast(stats: SyncUpdateStat[]) {
  if (stats.length === 0) return '';
  return `已更新${stats.map((item) => `${item.label} ${item.count} 条`).join('、')}`;
}

export function App() {
  const mobileApp = isMobileApp();
  const [state, setState] = useState<AppState>(() => loadState());
  const [cloudRuntime, setCloudRuntime] = useState({ passphrase: '' });
  const [desktopDataLoaded, setDesktopDataLoaded] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleKey>('home');
  const [calendarTargetDate, setCalendarTargetDate] = useState<string | undefined>();
  const [globalQuery, setGlobalQuery] = useState('');
  const [notifiedReminderIds, setNotifiedReminderIds] = useState<string[]>([]);
  const [dialogRequest, setDialogRequest] = useState<DialogRequest | undefined>();
  const [manualSyncing, setManualSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState('');
  const lastClipboardSignature = useRef('');
  const stateRef = useRef(state);
  const previousCloudState = useRef<AppState | undefined>();
  const cloudSyncBusy = useRef(false);
  const cloudSyncPending = useRef(false);
  const cloudSyncActive = useRef<Promise<SyncUpdateStat[] | undefined> | undefined>();
  const syncToastTimer = useRef<number | undefined>();
  const pullRefreshStartY = useRef<number | undefined>();
  const pullRefreshTriggered = useRef(false);
  const globalResults = useMemo(() => searchState(state, globalQuery), [state, globalQuery]);
  const cloudSyncChangeKey = useMemo(() => getCloudSyncChangeKey(state), [state]);
  const visibleModules = mobileApp ? mobileModules : modules;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => () => {
    if (syncToastTimer.current) window.clearTimeout(syncToastTimer.current);
  }, []);

  useEffect(() => {
    if (!desktopDataLoaded) return;
    if (!previousCloudState.current) {
      previousCloudState.current = state;
      return;
    }
    const next = withCloudDeletionTombstones(previousCloudState.current, state);
    previousCloudState.current = next;
    if (next !== state) setState(next);
  }, [desktopDataLoaded, state]);

  useEffect(() => {
    dialogController = setDialogRequest;
    return () => {
      dialogController = undefined;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (mobileApp) {
      void loadMobileState().then((payload) => {
        if (cancelled) return;
        if (payload) setState(payload);
        setDesktopDataLoaded(true);
      }).catch(() => setDesktopDataLoaded(true));
      return () => {
        cancelled = true;
      };
    }
    void window.assistantApp?.data?.load().then((payload) => {
      if (cancelled || !payload) {
        setDesktopDataLoaded(true);
        return;
      }

      try {
        setState(normalizeState(JSON.parse(payload)));
      } catch {
        console.error('Failed to load desktop data.');
      } finally {
        setDesktopDataLoaded(true);
      }
    });
    if (!window.assistantApp?.data) {
      setDesktopDataLoaded(true);
    }
    return () => {
      cancelled = true;
    };
  }, [mobileApp]);

  useEffect(() => {
    if (!desktopDataLoaded) return;
    saveState(state);
    if (mobileApp) void saveMobileState(state);
    else void window.assistantApp?.data?.save(JSON.stringify(state));
  }, [desktopDataLoaded, mobileApp, state]);

  useEffect(() => {
    if (!desktopDataLoaded) return;
    setCloudRuntime((current) => ({
      passphrase: current.passphrase || state.cloudSyncSavedPassphrase || ''
    }));
  }, [desktopDataLoaded, state.cloudSyncSavedPassphrase]);

  useEffect(() => {
    if (mobileApp && !mobileModuleKeys.has(activeModule) && activeModule !== 'settings') {
      setActiveModule('home');
    }
  }, [activeModule, mobileApp]);

  useEffect(() => {
    if (mobileApp && activeModule !== 'home' && globalQuery) setGlobalQuery('');
  }, [activeModule, globalQuery, mobileApp]);

  const hasCloudRuntime = Boolean(
    state.cloudSyncUrl &&
    state.cloudSyncPublishableKey &&
    cloudRuntime.passphrase
  );

  function showSyncToast(stats?: SyncUpdateStat[]) {
    const message = formatSyncUpdateToast(stats ?? []);
    if (!message) return;
    if (syncToastTimer.current) window.clearTimeout(syncToastTimer.current);
    setSyncToast(message);
    syncToastTimer.current = window.setTimeout(() => setSyncToast(''), 2600);
  }

  async function runCloudRecordSync(silent = false, overrideState?: AppState, force = false): Promise<SyncUpdateStat[] | undefined> {
    if (!hasCloudRuntime) return;
    if (cloudSyncBusy.current) {
      if (force) cloudSyncPending.current = true;
      return cloudSyncActive.current;
    }
    cloudSyncBusy.current = true;
    const syncOnce = async (sourceState: AppState, notify: boolean): Promise<SyncUpdateStat[] | undefined> => {
      const result = await syncCloudRecords({
        url: sourceState.cloudSyncUrl ?? '',
        publishableKey: sourceState.cloudSyncPublishableKey ?? '',
        passphrase: cloudRuntime.passphrase
      }, sourceState);
      const syncedAt = result.updatedAt ?? new Date().toISOString();
      const syncedState = mergeCloudStates(sourceState, result.state);
      const stats = getSyncUpdateStats(sourceState, syncedState);
      setState((current) => {
        const mergedState = mergeCloudStates(current, result.state);
        return normalizeState({
          ...mergedState,
          clipboardItems: current.clipboardItems,
          clipboardSaveDirectory: current.clipboardSaveDirectory,
          clipboardLastError: current.clipboardLastError,
          cloudSyncUrl: current.cloudSyncUrl,
          cloudSyncPublishableKey: current.cloudSyncPublishableKey,
          cloudSyncEmail: current.cloudSyncEmail,
          cloudSyncRememberCredentials: current.cloudSyncRememberCredentials,
          cloudSyncSavedPassword: current.cloudSyncSavedPassword,
          cloudSyncSavedPassphrase: current.cloudSyncSavedPassphrase,
          cloudSyncLastSyncedAt: syncedAt,
          cloudSyncLastError: ''
        });
      });
      return notify ? stats : undefined;
    };
    const syncTask = (async () => {
      let stats: SyncUpdateStat[] | undefined;
      try {
        stats = await syncOnce(overrideState ?? stateRef.current, !silent);
        while (cloudSyncPending.current) {
          cloudSyncPending.current = false;
          await syncOnce(stateRef.current, false);
        }
        return stats;
      } catch (error) {
        const message = error instanceof Error ? error.message : '云端逐条同步失败。';
        setState((current) => ({ ...current, cloudSyncLastError: message }));
        if (!silent) await appAlert(message);
        return undefined;
      } finally {
        cloudSyncBusy.current = false;
        cloudSyncActive.current = undefined;
      }
    })();
    cloudSyncActive.current = syncTask;
    return syncTask;
  }

  async function refreshCloudSync() {
    if (!hasCloudRuntime) {
      await appAlert('请先填写 Supabase URL、publishable key 和同步口令。');
      return;
    }
    setManualSyncing(true);
    try {
      showSyncToast(await runCloudRecordSync(false, undefined, true));
    } finally {
      setManualSyncing(false);
    }
  }

  useEffect(() => {
    if (!desktopDataLoaded || !hasCloudRuntime) return;
    const timer = window.setInterval(() => void runCloudRecordSync(true), 8000);
    void runCloudRecordSync(true);
    return () => window.clearInterval(timer);
  }, [desktopDataLoaded, hasCloudRuntime, cloudRuntime.passphrase, state.cloudSyncUrl, state.cloudSyncPublishableKey]);

  useEffect(() => {
    if (!desktopDataLoaded || !hasCloudRuntime) return;
    const timer = window.setTimeout(() => void runCloudRecordSync(true, undefined, true), 250);
    return () => window.clearTimeout(timer);
  }, [cloudSyncChangeKey, desktopDataLoaded, hasCloudRuntime, cloudRuntime.passphrase, state.cloudSyncUrl, state.cloudSyncPublishableKey]);

  useEffect(() => {
    if (!desktopDataLoaded || !hasCloudRuntime) return;
    const syncVisible = () => {
      if (document.visibilityState === 'visible') void runCloudRecordSync(true);
    };
    const syncFocused = () => void runCloudRecordSync(true);
    document.addEventListener('visibilitychange', syncVisible);
    window.addEventListener('focus', syncFocused);
    return () => {
      document.removeEventListener('visibilitychange', syncVisible);
      window.removeEventListener('focus', syncFocused);
    };
  }, [desktopDataLoaded, hasCloudRuntime, cloudRuntime.passphrase, state.cloudSyncUrl, state.cloudSyncPublishableKey]);

  useEffect(() => {
    if (!desktopDataLoaded || !window.assistantApp?.appSettings) return;
    void window.assistantApp.appSettings.getLaunchAtLogin().then((enabled) => {
      setState((current) => current.launchAtLogin === enabled ? current : { ...current, launchAtLogin: enabled });
    });
  }, [desktopDataLoaded]);

  useEffect(() => {
    if (!desktopDataLoaded || !window.assistantApp?.clipboard?.registerShortcut) return;
    const shortcut = state.clipboardShortcut?.trim() || 'Ctrl+E';
    void window.assistantApp.clipboard.registerShortcut(shortcut).then(async (result) => {
      const message = result.ok ? '' : result.message ?? `快捷键 ${shortcut} 注册失败。`;
      setState((current) => current.clipboardShortcutLastError === message ? current : { ...current, clipboardShortcutLastError: message });
      if (!result.ok) await appAlert(message, '剪贴板快捷键冲突');
    });
  }, [desktopDataLoaded, state.clipboardShortcut]);

  useEffect(() => {
    if (!window.assistantApp?.navigation?.onModule) return;
    return window.assistantApp.navigation.onModule((module) => setActiveModule(module));
  }, []);

  useEffect(() => {
    if (!desktopDataLoaded || state.clipboardSaveDirectory || !window.assistantApp?.clipboard?.defaultDirectory) return;
    void window.assistantApp.clipboard.defaultDirectory().then((directory) => {
      setState((current) => current.clipboardSaveDirectory ? current : { ...current, clipboardSaveDirectory: directory });
    });
  }, [desktopDataLoaded, state.clipboardSaveDirectory]);

  useEffect(() => {
    if (!desktopDataLoaded) return;
    const rolledTasks = rolloverRecurringTasks(state.tasks);
    if (rolledTasks !== state.tasks && JSON.stringify(rolledTasks) !== JSON.stringify(state.tasks)) {
      setState((current) => ({ ...current, tasks: rolloverRecurringTasks(current.tasks) }));
    }
  }, [desktopDataLoaded, state.tasks]);

  useEffect(() => {
    const clipboardApi = window.assistantApp?.clipboard;
    if (mobileApp) return;
    if (!desktopDataLoaded || !clipboardApi || (state.passwordHash && !isUnlocked)) return;
    let cancelled = false;

    const capture = async () => {
      try {
        const snapshot = await clipboardApi.read();
        if (cancelled || snapshot.kind === 'empty' || snapshot.signature === lastClipboardSignature.current) return;
        lastClipboardSignature.current = snapshot.signature;

        if (snapshot.kind === 'text') {
          const type = isUrlText(snapshot.text) ? 'link' : 'text';
          const saved = await clipboardApi.saveText(snapshot.text, type, state.clipboardSaveDirectory);
          const item = createClipboardEntry({ type, content: snapshot.text, filePath: saved.path, signature: `${type}:${snapshot.signature}` });
          setState((current) => addClipboardEntry({ ...current, clipboardLastError: '' }, item));
          return;
        }

        const saved = await clipboardApi.saveImage(snapshot.dataUrl, state.clipboardSaveDirectory);
        const item = createClipboardEntry({
          type: 'image',
          content: saved.path,
          filePath: saved.path,
          signature: snapshot.signature
        });
        setState((current) => addClipboardEntry({ ...current, clipboardLastError: '' }, item));
      } catch (error) {
        const message = error instanceof Error ? error.message : '剪贴板自动保存失败。';
        setState((current) => ({ ...current, clipboardLastError: message }));
      }
    };

    void capture();
    const timer = window.setInterval(() => void capture(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [desktopDataLoaded, isUnlocked, mobileApp, state.clipboardSaveDirectory, state.passwordHash]);

  useEffect(() => {
    const checkDueReminder = () => {
      const nowDate = new Date();
      const now = nowDate.getTime();
      const dueReminder = stateRef.current.reminders.find((reminder) => {
        return !reminder.acknowledged && !notifiedReminderIds.includes(reminder.id) && new Date(reminder.time).getTime() <= now;
      });
      if (!dueReminder) return;
      const dueResult = applyDueReminder(dueReminder, notifiedReminderIds, nowDate);
      playRingtone(stateRef.current.ringtone);
      void appAlert(`${formatDateTime(dueReminder.time)}\n${dueReminder.memo || '无备注'}`, '提醒');
      setState((current) => ({
        ...current,
        reminders: current.reminders.map((reminder) => {
          if (reminder.id !== dueReminder.id) return reminder;
          return dueResult.reminder;
        })
      }));
      setNotifiedReminderIds((current) => applyDueReminder(dueReminder, current, nowDate).notifiedIds);
    };
    const timer = window.setInterval(checkDueReminder, 15000);
    if (mobileApp) {
      checkDueReminder();
      const checkWhenVisible = () => {
        if (document.visibilityState === 'visible') checkDueReminder();
      };
      document.addEventListener('visibilitychange', checkWhenVisible);
      window.addEventListener('focus', checkDueReminder);
      return () => {
        window.clearInterval(timer);
        document.removeEventListener('visibilitychange', checkWhenVisible);
        window.removeEventListener('focus', checkDueReminder);
      };
    }
    return () => window.clearInterval(timer);
  }, [mobileApp, notifiedReminderIds, state.reminders, state.ringtone]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      const dueTimer = (state.countdownTimers ?? []).find((item) => (
        item.running && countdownRemainingSeconds(item) <= 0
      ));
      if (!dueTimer) return;
      const endedAt = new Date().toISOString();
      const startedAt = dueTimer.firstStartedAt ?? dueTimer.startedAt ?? endedAt;
      const totalSeconds = Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
      setState((current) => ({
        ...current,
        countdownTimers: (current.countdownTimers ?? []).map((item) => (
          item.id === dueTimer.id ? touch({ ...item, running: false, startedAt: undefined, remainingSeconds: 0 }) : item
        ))
      }));
      playRingtone(state.ringtone);
      void appAlert(`开始时间：${formatDateTime(startedAt)}\n结束时间：${formatDateTime(endedAt)}\n计时时长：${formatTimerSeconds(dueTimer.durationSeconds)}\n总用时长：${formatTimerSeconds(totalSeconds)}`, dueTimer.title || '倒计时结束');
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.countdownTimers, state.ringtone]);

  if (!desktopDataLoaded) {
    return <><StartupGate /><AppDialog request={dialogRequest} onClose={() => setDialogRequest(undefined)} /></>;
  }

  if (state.passwordHash && !isUnlocked) {
    return <><LoginGate accountName={state.displayName} passwordHash={state.passwordHash} onUnlock={() => setIsUnlocked(true)} /><AppDialog request={dialogRequest} onClose={() => setDialogRequest(undefined)} /></>;
  }

  const themeClass = state.theme === 'amber' ? 'theme-amber theme-dark' : `theme-${state.theme}`;
  const text = getText(state.language);
  const showGlobalSearch = !mobileApp || activeModule === 'home';

  function handlePullRefreshStart(event: TouchEvent<HTMLDivElement>) {
    if (!mobileApp || window.scrollY > 0) return;
    pullRefreshStartY.current = event.touches[0]?.clientY;
    pullRefreshTriggered.current = false;
  }

  function handlePullRefreshMove(event: TouchEvent<HTMLDivElement>) {
    const startY = pullRefreshStartY.current;
    if (!mobileApp || startY === undefined || pullRefreshTriggered.current) return;
    if ((event.touches[0]?.clientY ?? startY) - startY > 90) {
      pullRefreshTriggered.current = true;
      void refreshCloudSync();
    }
  }

  function handlePullRefreshEnd() {
    pullRefreshStartY.current = undefined;
    pullRefreshTriggered.current = false;
  }

  async function copyClipboardItem(item: ClipboardEntry): Promise<boolean> {
    try {
      if (item.type === 'image') {
        const result = await window.assistantApp?.clipboard?.writeImage?.(item.filePath ?? item.content);
        if (!result) {
          await appAlert('浏览器环境不能直接复制图片，请在桌面端使用。');
          return false;
        }
        lastClipboardSignature.current = result.signature;
        return true;
      }

      const result = await window.assistantApp?.clipboard?.writeText?.(item.content);
      if (result) {
        lastClipboardSignature.current = result.signature;
        return true;
      }
      await navigator.clipboard.writeText(item.content);
      return true;
    } catch (error) {
      await appAlert(error instanceof Error ? error.message : '复制失败。');
      return false;
    }
  }

  async function openClipboardDirectory() {
    if (!state.clipboardSaveDirectory) {
      await appAlert('请先选择保存目录。');
      return;
    }
    const error = await window.assistantApp?.file?.openPath?.(state.clipboardSaveDirectory);
    if (error) await appAlert(error);
  }

  return (
    <TextContext.Provider value={text}>
    <div
      className={`app-shell ${themeClass} ${mobileApp ? 'mobile-app-shell' : ''}`}
      style={buildThemeStyle(state)}
      onTouchStart={handlePullRefreshStart}
      onTouchMove={handlePullRefreshMove}
      onTouchEnd={handlePullRefreshEnd}
      onTouchCancel={handlePullRefreshEnd}
    >
      <header className="topbar">
        <div className="brand-stack">
          <div className="brand">Private Memos</div>
          <div className="brand-version">version:0.3.1</div>
        </div>
        {showGlobalSearch && <label className="global-search">
          <Search size={18} />
          <input value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} placeholder={text.globalSearch} aria-label={text.globalSearch} />
        </label>}
        <div className="topbar-actions">
          {hasCloudRuntime && (
            <button className={manualSyncing ? 'topbar-icon-button active syncing' : 'topbar-icon-button'} type="button" aria-label="刷新同步" onClick={() => void refreshCloudSync()} disabled={manualSyncing}>
              <RotateCcw size={18} />
            </button>
          )}
          {mobileApp && (
            <button className={activeModule === 'settings' ? 'topbar-icon-button active' : 'topbar-icon-button'} type="button" aria-label="设置" onClick={() => setActiveModule('settings')}>
              <Settings size={18} />
            </button>
          )}
          {!mobileApp && <div className="account-pill">{state.displayName}</div>}
        </div>
      </header>

      {showGlobalSearch && globalResults.length > 0 && (
        <div className="global-results">
          {globalResults.slice(0, 6).map((item) => (
            <button key={`${item.type}-${item.id}`} onClick={() => { setActiveModule(item.module); setGlobalQuery(''); }}>
              <span>{item.type}</span>
              {item.title}
            </button>
          ))}
        </div>
      )}

      <main className="layout">
        <nav className="sidebar" aria-label={text.nav.home}>
          {visibleModules.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={activeModule === item.key ? 'nav-item active' : 'nav-item'} onClick={() => { if (item.key === 'calendar') setCalendarTargetDate(todayIso()); setActiveModule(item.key); }}>
                <Icon size={19} />
                <span>{text.nav[item.key]}</span>
              </button>
            );
          })}
        </nav>

        <section className="workspace">
          {activeModule === 'home' && <HomePanel state={state} setState={setState} openCalendarDate={(date) => { setCalendarTargetDate(date); setActiveModule('calendar'); }} setActiveModule={setActiveModule} />}
          {activeModule === 'notes' && <NotesPanel state={state} setState={setState} />}
          {activeModule === 'privateNotes' && <PrivateNotesPanel state={state} setState={setState} />}
          {activeModule === 'focus' && <FocusPanel state={state} setState={setState} />}
          {!mobileApp && activeModule === 'clipboard' && <ClipboardPanel state={state} setState={setState} onCopyItem={copyClipboardItem} onOpenDirectory={openClipboardDirectory} />}
          {!mobileApp && activeModule === 'timers' && <TimersPanel state={state} setState={setState} />}
          {activeModule === 'reminders' && <RemindersPanel state={state} setState={setState} />}
          {activeModule === 'tasks' && <TasksPanel state={state} setState={setState} />}
          {activeModule === 'ledger' && <LedgerPanel state={state} setState={setState} />}
          {activeModule === 'calendar' && <CalendarPanel state={state} setState={setState} targetDate={calendarTargetDate} />}
          {activeModule === 'settings' && <SettingsPanelV2 state={state} setState={setState} cloudRuntime={cloudRuntime} setCloudRuntime={setCloudRuntime} mobileApp={mobileApp} onSyncRefresh={refreshCloudSync} cloudSyncing={manualSyncing} />}
          {!mobileApp && activeModule === 'account' && <AccountPanelV2 state={state} setState={setState} />}
        </section>
      </main>
      {syncToast && <div className="sync-toast" role="status">{syncToast}</div>}
      <AppDialog request={dialogRequest} onClose={() => setDialogRequest(undefined)} />
    </div>
    </TextContext.Provider>
  );
}

function AppDialog({ request, onClose }: { request?: DialogRequest; onClose: () => void }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(request?.kind === 'prompt' ? request.defaultValue ?? '' : '');
  }, [request]);

  if (!request) return null;

  const close = () => onClose();
  const cancel = () => {
    if (request.kind === 'confirm') request.resolve(false);
    if (request.kind === 'prompt') request.resolve(undefined);
    close();
  };
  const submit = () => {
    if (request.kind === 'alert') request.resolve();
    if (request.kind === 'confirm') request.resolve(true);
    if (request.kind === 'prompt') request.resolve(value);
    close();
  };

  return (
    <div className="modal-backdrop app-dialog-backdrop" role="presentation">
      <section className="modal-panel app-dialog-panel" role="dialog" aria-modal="true" aria-label={request.title}>
        <h2>{request.title}</h2>
        {request.message && <p className="dialog-message">{request.message}</p>}
        {request.kind === 'prompt' && (
          <input
            type={request.inputType ?? 'text'}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
            autoFocus
          />
        )}
        <div className="modal-actions">
          {request.kind !== 'alert' && <button className="toolbar-button" type="button" onClick={cancel}>{request.cancelLabel ?? '取消'}</button>}
          <button className={request.kind === 'confirm' && request.danger ? 'toolbar-button danger-action' : 'toolbar-button active'} type="button" onClick={submit}>
            {request.confirmLabel ?? (request.kind === 'alert' ? '知道了' : '确认')}
          </button>
        </div>
      </section>
    </div>
  );
}

function StartupGate() {
  return (
    <div className="login-shell">
      <section className="login-panel">
        <h1>Private Memos</h1>
        <p className="muted">正在加载本地数据...</p>
      </section>
    </div>
  );
}

function formatScheduleFocusDate(value: string) {
  const date = new Date(value);
  return `${toLocalDateKey(date).slice(5)} ${formatLunarDate(date)}`;
}

function HomePanel({ state, setState, setActiveModule, openCalendarDate }: StatePanelProps & { setActiveModule: (module: ModuleKey) => void; openCalendarDate: (date: string) => void }) {
  const mobileApp = isMobileApp();
  type DashboardCardId = 'summary' | 'todos' | 'reminders' | 'month';
  const summary = getYesterdaySummary(state);
  const openTasks = getOpenTasks(state);
  const reminders = getTodayReminders(state);
  const monthSchedules = getMonthSchedules(state);
  const nextMonthSchedules = getSchedulesForMonth(state, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1));
  const defaultDashboardOrder: DashboardCardId[] = mobileApp ? ['todos', 'reminders', 'month'] : ['summary', 'todos', 'reminders', 'month'];
  const dashboardOrder = [...(state.dashboardOrder?.filter((id): id is DashboardCardId => defaultDashboardOrder.includes(id as DashboardCardId)) ?? []), ...defaultDashboardOrder.filter((id) => !state.dashboardOrder?.includes(id))];
  const [draggingCard, setDraggingCard] = useState<DashboardCardId | undefined>();
  const [dragOverCard, setDragOverCard] = useState<DashboardCardId | undefined>();
  const [monthFocusView, setMonthFocusView] = useState<'current' | 'next'>('current');
  const activeMonthSchedules = monthFocusView === 'current' ? monthSchedules : nextMonthSchedules;

  function moveDashboardCard(target = dragOverCard) {
    if (!draggingCard || !target || draggingCard === target) return;
    const next = dashboardOrder.filter((id) => id !== draggingCard);
    next.splice(next.indexOf(target), 0, draggingCard);
    setState((current) => ({ ...current, dashboardOrder: next }));
  }

  function card(id: DashboardCardId, children: ReactNode, className = 'panel') {
    return (
      <section
        key={id}
        className={[className, 'dashboard-card', draggingCard === id ? 'dragging' : '', dragOverCard === id && draggingCard !== id ? 'drop-target' : ''].join(' ')}
        draggable
        onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggingCard(id); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverCard(id); }}
        onDragLeave={() => setDragOverCard((current) => (current === id ? undefined : current))}
        onDrop={(event) => { event.preventDefault(); moveDashboardCard(id); setDraggingCard(undefined); setDragOverCard(undefined); }}
        onDragEnd={() => { setDraggingCard(undefined); setDragOverCard(undefined); }}
      >
        {children}
      </section>
    );
  }

  const cards: Record<DashboardCardId, ReactNode> = {
    summary: card('summary', <>
      <h1>昨日总结</h1>
      <div className="metric-grid">
        <Metric label="总更新" value={summary.total} />
        <Metric label="记事" value={summary.notes} />
        <Metric label="私人笔记" value={summary.privateNotes} />
        <Metric label="提醒" value={summary.reminders} />
        <Metric label="任务" value={summary.tasks} />
      </div>
    </>),
    todos: card('todos', <>
      <h2>今日待办</h2>
      <div className="stack-list">
        {openTasks.slice(0, 5).map((task) => (
          <button key={task.id} className="summary-row" onClick={() => setActiveModule('tasks')}>
            <span>{task.title}</span>
            <small>{task.steps.find((step) => !step.completed)?.body || '等待完成'}</small>
          </button>
        ))}
        {openTasks.length === 0 && <EmptyText>没有未完成任务</EmptyText>}
      </div>
    </>),
    reminders: card('reminders', <>
      <h2>今日提醒</h2>
      <div className="stack-list">
        {reminders.map((reminder) => (
          <button key={reminder.id} className="summary-row" onClick={() => setActiveModule('reminders')}>
            <span>{reminder.memo || '无备注提醒'}</span>
            <small>{formatDateTime(reminder.time)}</small>
          </button>
        ))}
        {reminders.length === 0 && <EmptyText>今天没有提醒</EmptyText>}
      </div>
    </>),
    month: card('month', <>
      <div className="pane-header">
        <h2>{monthFocusView === 'current' ? '本月关注' : '下月关注'}</h2>
        <div className="segmented-control">
          <button type="button" className={monthFocusView === 'current' ? 'active' : ''} onClick={() => setMonthFocusView('current')}>本月</button>
          <button type="button" className={monthFocusView === 'next' ? 'active' : ''} onClick={() => setMonthFocusView('next')}>下月</button>
        </div>
      </div>
      <div className="stack-list">
        {activeMonthSchedules.map((schedule) => (
          <button key={`${schedule.id}-${schedule.date}`} className="summary-row" onClick={() => openCalendarDate(toLocalDateKey(new Date(schedule.date)))}>
            <span>{schedule.title}</span>
            <small>{formatScheduleFocusDate(schedule.date)}</small>
          </button>
        ))}
        {activeMonthSchedules.length === 0 && <EmptyText>{monthFocusView === 'current' ? '本月没有特殊日程' : '下月没有特殊日程'}</EmptyText>}
      </div>
    </>)
  };

  return (
    <>
    <div className="dashboard">
      {dashboardOrder.map((id) => cards[id])}
    </div>
    </>
  );
}

function FocusPanel({ state, setState }: StatePanelProps) {
  const [focusEditor, setFocusEditor] = useState<{ id?: string; title: string; body: string } | undefined>();
  const [expandedFocusId, setExpandedFocusId] = useState<string | undefined>();
  const [draggingId, setDraggingId] = useState<string | undefined>();
  const [dropIndex, setDropIndex] = useState<number | undefined>();

  function addFocusNote() {
    setFocusEditor({ title: '', body: '' });
  }

  function editFocusNote(id: string) {
    const note = state.focusNotes.find((item) => item.id === id);
    if (!note) return;
    setFocusEditor({ id, title: note.title, body: note.body });
  }

  function saveFocusNote() {
    if (!focusEditor?.title.trim()) return;
    setState((current) => ({
      ...current,
      focusNotes: focusEditor.id
        ? current.focusNotes.map((item) => (item.id === focusEditor.id ? touch({ ...item, title: focusEditor.title.trim(), body: focusEditor.body.trim() }) : item))
        : [createFocusNote(focusEditor.title.trim(), focusEditor.body.trim()), ...current.focusNotes]
    }));
    setFocusEditor(undefined);
  }

  async function deleteFocusNote(id: string) {
    if (!(await confirmDelete('这条重点笔记'))) return;
    setState((current) => ({ ...current, focusNotes: current.focusNotes.filter((item) => item.id !== id) }));
    if (expandedFocusId === id) setExpandedFocusId(undefined);
  }

  function getDropIndex(event: DragEvent<HTMLDivElement>): number {
    const cards = [...event.currentTarget.querySelectorAll<HTMLElement>('.focus-note:not(.dragging)')];
    const nearest = cards.findIndex((card) => {
      const rect = card.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2 || (Math.abs(event.clientY - rect.top) < rect.height && event.clientX < rect.left + rect.width / 2);
    });
    return nearest === -1 ? cards.length : nearest;
  }

  function moveFocusNote(index: number) {
    if (!draggingId) return;
    setState((current) => {
      const next = current.focusNotes.filter((note) => note.id !== draggingId);
      const dragging = current.focusNotes.find((note) => note.id === draggingId);
      if (!dragging) return current;
      next.splice(Math.min(Math.max(index, 0), next.length), 0, dragging);
      return { ...current, focusNotes: next };
    });
  }

  return (
    <>
      <section className="panel full-panel focus-page">
        <div className="pane-header">
          <h1>重点</h1>
          <button className="toolbar-button" type="button" onClick={addFocusNote}>新增重点</button>
        </div>
        {state.focusNotes.length > 0 ? (
          <div
            className="focus-board"
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropIndex(getDropIndex(event)); }}
            onDrop={(event) => { event.preventDefault(); moveFocusNote(dropIndex ?? getDropIndex(event)); setDraggingId(undefined); setDropIndex(undefined); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropIndex(undefined); }}
          >
            {state.focusNotes.map((note, index) => {
              const expanded = expandedFocusId === note.id;
              return (
                <Fragment key={note.id}>
                {draggingId && dropIndex === index && <div className="focus-drop-slot" />}
                <article
                  className={['focus-note', expanded ? 'expanded' : '', draggingId === note.id ? 'dragging' : ''].join(' ')}
                  draggable
                  onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggingId(note.id); }}
                  onDragEnd={() => { setDraggingId(undefined); setDropIndex(undefined); }}
                >
                  <button type="button" onClick={() => setExpandedFocusId(expanded ? undefined : note.id)}>
                    <strong>{note.title}</strong>
                    {note.body && <span>{note.body}</span>}
                  </button>
                  <div className="focus-actions">
                    <button type="button" onClick={() => editFocusNote(note.id)}>编辑</button>
                    <button type="button" onClick={() => void deleteFocusNote(note.id)}>删除</button>
                  </div>
                </article>
                </Fragment>
              );
            })}
            {draggingId && dropIndex === state.focusNotes.filter((note) => note.id !== draggingId).length && <div className="focus-drop-slot" />}
          </div>
        ) : <EmptyText>暂无重点笔记</EmptyText>}
      </section>
      {focusEditor && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-label="重点关注">
            <h2>{focusEditor.id ? '编辑重点' : '新增重点'}</h2>
            <input value={focusEditor.title} onChange={(event) => setFocusEditor((current) => current && { ...current, title: event.target.value })} placeholder="标题" />
            <textarea value={focusEditor.body} onChange={(event) => setFocusEditor((current) => current && { ...current, body: event.target.value })} placeholder="正文" />
            <div className="modal-actions">
              <button className="toolbar-button" type="button" onClick={() => setFocusEditor(undefined)}>取消</button>
              <button className="toolbar-button active" type="button" onClick={saveFocusNote}>保存</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function ClipboardPanel({ state, setState, onCopyItem, onOpenDirectory }: StatePanelProps & { onCopyItem: (item: ClipboardEntry) => Promise<boolean>; onOpenDirectory: () => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ClipboardEntryType | 'all'>('all');
  const [previewImage, setPreviewImage] = useState<ClipboardEntry | undefined>();
  const [previewCopied, setPreviewCopied] = useState(false);
  const hasClipboardApi = Boolean(window.assistantApp?.clipboard?.chooseDirectory);
  const items = (state.clipboardItems ?? [])
    .filter((item) => type === 'all' || item.type === type)
    .filter((item) => {
      const keyword = query.trim().toLowerCase();
      if (!keyword) return true;
      return `${clipboardTypeLabel(item.type)} ${item.content} ${item.filePath ?? ''}`.toLowerCase().includes(keyword);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups = groupClipboardItems(items);

  useEffect(() => {
    if (state.clipboardSaveDirectory || !window.assistantApp?.clipboard?.defaultDirectory) return;
    void window.assistantApp.clipboard.defaultDirectory().then((directory) => {
      setState((current) => current.clipboardSaveDirectory ? current : { ...current, clipboardSaveDirectory: directory });
    });
  }, [setState, state.clipboardSaveDirectory]);

  async function chooseDirectory() {
    const directory = await (window.assistantApp?.clipboard?.chooseDirectory?.() ?? window.assistantApp?.file?.chooseDirectory?.());
    if (!directory) {
      if (!hasClipboardApi) await appAlert('桌面端接口未加载，请使用重新打包后的 Private Memos.exe。');
      return;
    }
    setState((current) => ({ ...current, clipboardSaveDirectory: directory, clipboardLastError: '' }));
  }

  async function pinPreviewImage(item: ClipboardEntry) {
    const src = toFileUrl(item.filePath ?? item.content);
    await window.assistantApp?.window?.pinNote?.({ title: '剪贴板图片', body: `![图片](${src})` });
  }

  return (
    <section className="panel full-panel clipboard-page">
      <div className="pane-header">
        <h1>剪贴板集合</h1>
        <div className="toolbar">
          <button className="toolbar-button" type="button" onClick={() => void chooseDirectory()}>选择保存目录</button>
          <button className="toolbar-button icon-only" type="button" aria-label="打开保存目录" onClick={() => void onOpenDirectory()}><FolderOpen size={16} /></button>
        </div>
      </div>
      <div className="clipboard-toolbar">
        <label className="module-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文字、链接或图片路径" />
        </label>
        <select value={type} onChange={(event) => setType(event.target.value as ClipboardEntryType | 'all')} aria-label="剪贴板类型">
          <option value="all">全部类型</option>
          <option value="text">文字</option>
          <option value="link">链接</option>
          <option value="image">图片</option>
        </select>
      </div>
      <p className="muted">保存目录：{state.clipboardSaveDirectory || (hasClipboardApi ? '未设置，桌面端会自动使用默认目录。' : '桌面端接口未加载，无法自动保存剪贴板。')}</p>
      {!hasClipboardApi && <p className="muted">当前未检测到桌面端剪贴板接口，请确认正在使用最新打包的 Private Memos.exe。</p>}
      {state.clipboardLastError && <p className="muted">自动保存失败：{state.clipboardLastError}</p>}
      <div className="clipboard-groups">
        {groups.map((group) => (
          <section className="clipboard-group" key={group.date}>
            <h2>{group.date}</h2>
            <div className="stack-list">
              {group.items.map((item) => <ClipboardRow key={item.id} item={item} onCopy={() => onCopyItem(item)} onPreviewImage={() => { setPreviewCopied(false); setPreviewImage(item); }} />)}
            </div>
          </section>
        ))}
        {items.length === 0 && <EmptyText>暂无剪贴板记录</EmptyText>}
      </div>
      {previewImage && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel clipboard-preview-modal" role="dialog" aria-modal="true" aria-label="浏览剪贴板图片">
            <div className="modal-actions top-actions">
              <button
                className="toolbar-button icon-only"
                type="button"
                aria-label="复制图片"
                onClick={async () => {
                  if (!await onCopyItem(previewImage)) return;
                  setPreviewCopied(true);
                  window.setTimeout(() => setPreviewCopied(false), 1000);
                }}
              >
                {previewCopied ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button
                className="toolbar-button icon-only"
                type="button"
                aria-label="钉住图片"
                onClick={() => { void pinPreviewImage(previewImage); setPreviewImage(undefined); }}
              >
                <Pin size={16} />
              </button>
              <button className="toolbar-button" type="button" onClick={() => setPreviewImage(undefined)}>关闭</button>
            </div>
            <img src={toFileUrl(previewImage.filePath ?? previewImage.content)} alt="剪贴板图片" />
          </section>
        </div>
      )}
    </section>
  );
}

function ClipboardRow({ item, onCopy, onPreviewImage }: { item: ClipboardEntry; onCopy: () => Promise<boolean>; onPreviewImage: () => void }) {
  const label = clipboardTypeLabel(item.type);
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!await onCopy()) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  }
  return (
    <article className="clipboard-row">
      <div className="clipboard-row-meta">
        <strong>{label}</strong>
        <small>{formatDateTime(item.createdAt)}</small>
      </div>
      <div className="clipboard-row-body">
        {item.type === 'image' ? (
          <div className="clipboard-image-entry">
            <button className="image-preview-button" type="button" onClick={onPreviewImage} aria-label="放大剪贴板图片">
              <img src={toFileUrl(item.filePath ?? item.content)} alt="剪贴板图片" />
            </button>
            <span>{item.filePath ?? item.content}</span>
          </div>
        ) : item.type === 'link' ? (
          <a href={item.content} target="_blank" rel="noreferrer">{item.content}</a>
        ) : (
          <p>{item.content}</p>
        )}
      </div>
      <button className="toolbar-button icon-only clipboard-copy-button" type="button" aria-label={`复制${label}`} onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
    </article>
  );
}

function groupClipboardItems(items: ClipboardEntry[]) {
  const groups = new Map<string, ClipboardEntry[]>();
  for (const item of items) {
    const date = item.createdAt.slice(0, 10);
    groups.set(date, [...(groups.get(date) ?? []), item]);
  }
  return [...groups.entries()].map(([date, groupItems]) => ({ date, items: groupItems }));
}

function clipboardTypeLabel(type: ClipboardEntryType) {
  return type === 'image' ? '图片' : type === 'link' ? '链接' : '文字';
}

function toFileUrl(filePath: string) {
  if (filePath.startsWith('file://') || filePath.startsWith('data:')) return filePath;
  return encodeURI(`file:///${filePath.replace(/\\/g, '/')}`);
}

function TimersPanel({ state, setState }: StatePanelProps) {
  const timers = state.countdownTimers ?? [];
  const [selectedId, setSelectedId] = useState<string | undefined>(timers[0]?.id);
  const [timerDraft, setTimerDraft] = useState<{ title: string; hours: number; minutes: number; seconds: number } | undefined>();
  const [, setTick] = useState(0);
  const selected = timers.find((timer) => timer.id === selectedId) ?? timers[0];
  const stopwatch = state.stopwatch ?? { elapsedSeconds: 0, running: false };
  const stopwatchSeconds = stopwatch.elapsedSeconds + (stopwatch.running && stopwatch.startedAt ? Math.floor((Date.now() - new Date(stopwatch.startedAt).getTime()) / 1000) : 0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function confirmCountdownDraft() {
    if (!timerDraft) return;
    const duration = timerDraft.hours * 3600 + timerDraft.minutes * 60 + timerDraft.seconds;
    if (duration <= 0) {
      await appAlert('请选择大于 0 的倒计时时长。');
      return;
    }
    const timer = createCountdownTimer(timerDraft.title.trim() || '新倒计时', duration);
    setState((current) => ({ ...current, countdownTimers: [timer, ...(current.countdownTimers ?? [])] }));
    setSelectedId(timer.id);
    setTimerDraft(undefined);
  }

  async function deleteCountdown(timer: CountdownTimer) {
    if (!(await confirmDelete('这个倒计时'))) return;
    setState((current) => ({ ...current, countdownTimers: (current.countdownTimers ?? []).filter((item) => item.id !== timer.id) }));
    if (selectedId === timer.id) setSelectedId(undefined);
  }

  function updateCountdown(id: string, patch: Partial<CountdownTimer>) {
    setState((current) => ({
      ...current,
      countdownTimers: (current.countdownTimers ?? []).map((timer) => (timer.id === id ? touch({ ...timer, ...patch }) : timer))
    }));
  }

  function toggleCountdown(timer: CountdownTimer) {
    setSelectedId(timer.id);
    if (timer.running) {
      updateCountdown(timer.id, { running: false, startedAt: undefined, remainingSeconds: countdownRemainingSeconds(timer) });
      return;
    }
    const remainingSeconds = countdownRemainingSeconds(timer) || timer.durationSeconds;
    const startedAt = new Date().toISOString();
    updateCountdown(timer.id, { running: true, startedAt, firstStartedAt: timer.firstStartedAt ?? startedAt, remainingSeconds });
  }

  function resetCountdown(timer: CountdownTimer) {
    updateCountdown(timer.id, { running: false, startedAt: undefined, firstStartedAt: undefined, remainingSeconds: timer.durationSeconds });
  }

  function stopStopwatch() {
    if (!stopwatch.running || !stopwatch.startedAt) return;
    const elapsedSeconds = stopwatch.elapsedSeconds + Math.floor((Date.now() - new Date(stopwatch.startedAt).getTime()) / 1000);
    setState((current) => ({ ...current, stopwatch: { elapsedSeconds, running: false } }));
  }

  function resetStopwatch() {
    setState((current) => ({ ...current, stopwatch: { elapsedSeconds: 0, running: false } }));
  }

  function toggleStopwatch() {
    if (stopwatch.running) {
      stopStopwatch();
      return;
    }
    setState((current) => ({ ...current, stopwatch: { elapsedSeconds: stopwatch.elapsedSeconds, running: true, startedAt: new Date().toISOString() } }));
  }

  return (
    <>
    <SplitPanel
      title="计时器"
      actions={<ToolbarButton onClick={() => setTimerDraft({ title: '新倒计时', hours: 0, minutes: 5, seconds: 0 })}><Plus size={16} />新建倒计时</ToolbarButton>}
      list={
        <div className="timer-list">
          {timers.map((timer) => (
            <article key={timer.id} className={['timer-row', selected?.id === timer.id ? 'active' : '', timer.running ? 'running' : ''].join(' ')} onClick={() => setSelectedId(timer.id)}>
              <span>
                <input value={timer.title} onChange={(event) => updateCountdown(timer.id, { title: event.target.value })} onClick={(event) => event.stopPropagation()} aria-label="倒计时标题" />
                <small>{timer.running ? '进行中' : '已暂停'}</small>
              </span>
              <b>{formatTimerSeconds(countdownRemainingSeconds(timer))}</b>
              <button className="timer-icon-button" type="button" onClick={(event) => { event.stopPropagation(); toggleCountdown(timer); }} aria-label={timer.running ? '暂停倒计时' : '开始倒计时'}>
                {timer.running ? <Square size={16} /> : <Play size={16} />}
              </button>
              <button className="timer-icon-button" type="button" onClick={(event) => { event.stopPropagation(); resetCountdown(timer); }} aria-label="归位倒计时">
                <RotateCcw size={16} />
              </button>
            </article>
          ))}
          {timers.length === 0 && <EmptyText>暂无倒计时</EmptyText>}
          {selected && (
            <div className="timer-actions">
              <ToolbarButton onClick={() => void deleteCountdown(selected)}><Trash2 size={15} />删除</ToolbarButton>
            </div>
          )}
        </div>
      }
      editor={
        <div className="editor timer-editor">
          <h2>计时器</h2>
          <div className="stopwatch-display">{formatTimerSeconds(stopwatchSeconds)}</div>
          <div className="timer-control-row">
            <ToolbarButton active={stopwatch.running} className="timer-round-button" onClick={toggleStopwatch}>{stopwatch.running ? <Square size={22} /> : <Play size={22} />}</ToolbarButton>
            <ToolbarButton className="timer-round-button" onClick={resetStopwatch}><RotateCcw size={22} /></ToolbarButton>
          </div>
        </div>
      }
    />
    {timerDraft && (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-panel timer-create-modal" role="dialog" aria-modal="true" aria-label="新建倒计时">
          <h2>新建倒计时</h2>
          <label className="field-row"><span>名称</span><input value={timerDraft.title} onChange={(event) => setTimerDraft({ ...timerDraft, title: event.target.value })} /></label>
          <div className="time-scroll-grid">
            <TimeScroll label="小时" value={timerDraft.hours} max={23} onChange={(hours) => setTimerDraft({ ...timerDraft, hours })} />
            <TimeScroll label="分钟" value={timerDraft.minutes} max={59} onChange={(minutes) => setTimerDraft({ ...timerDraft, minutes })} />
            <TimeScroll label="秒" value={timerDraft.seconds} max={59} onChange={(seconds) => setTimerDraft({ ...timerDraft, seconds })} />
          </div>
          <div className="modal-actions">
            <button className="toolbar-button" type="button" onClick={() => setTimerDraft(undefined)}>取消</button>
            <button className="toolbar-button" type="button" onClick={() => void confirmCountdownDraft()}>确认</button>
          </div>
        </section>
      </div>
    )}
    </>
  );
}

function TimeScroll({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="time-scroll">
      <span>{label}</span>
      <select size={5} value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {Array.from({ length: max + 1 }, (_, item) => (
          <option key={item} value={item}>{String(item).padStart(2, '0')}</option>
        ))}
      </select>
    </label>
  );
}

function LoginGate({ accountName, passwordHash, onUnlock }: { accountName: string; passwordHash: string; onUnlock: () => void }) {
  const [account, setAccount] = useState(() => localStorage.getItem(LAST_LOGIN_ACCOUNT_KEY) || accountName);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function submit() {
    if (account.trim() !== accountName.trim()) {
      setMessage('账号不正确。');
      return;
    }
    const inputHash = await hashPassword(password);
    if (inputHash !== passwordHash) {
      setMessage('密码不正确。');
      return;
    }
    localStorage.setItem(LAST_LOGIN_ACCOUNT_KEY, account.trim());
    setPassword('');
    setMessage('');
    onUnlock();
  }

  return (
    <div className="login-shell">
      <section className="login-panel">
        <h1>Private Memos</h1>
        <input
          value={account}
          onChange={(event) => setAccount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
          placeholder="账号"
          autoFocus
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
          placeholder="输入密码"
        />
        <button className="toolbar-button primary-action login-submit" onClick={() => void submit()}>登录</button>
        {message && <p className="muted">{message}</p>}
      </section>
    </div>
  );
}

function NotesPanel({ state, setState }: StatePanelProps) {
  const mobileApp = isMobileApp();
  const [selectedId, setSelectedId] = useState<string | undefined>(() => mobileApp ? undefined : state.notes[0]?.id);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>('list');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [calendarDate, setCalendarDate] = useState(todayIso());
  const [mobileDraft, setMobileDraft] = useState<QuickNote | undefined>();
  const filteredNotes = sortPinnedItems(state.notes).filter((note) => {
    const date = note.createdAt.slice(0, 10);
    const keyword = query.trim().toLowerCase();
    if (keyword && !note.body.toLowerCase().includes(keyword)) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
  const selected = state.notes.find((note) => note.id === selectedId) ?? (mobileApp ? undefined : filteredNotes[0] ?? state.notes[0]);

  function updateNote(id: string, patch: Partial<QuickNote>) {
    setState((current) => ({ ...current, notes: current.notes.map((note) => (note.id === id ? touch({ ...note, ...patch }) : note)) }));
  }

  function updateNoteDate(note: QuickNote, date: string) {
    if (!date) return;
    const time = note.createdAt.includes('T') ? note.createdAt.slice(10) : 'T00:00:00.000Z';
    updateNote(note.id, { createdAt: `${date}${time}` });
  }

  function addNote() {
    const note = createNote();
    if (mobileApp) {
      setMobileDraft(note);
      setView('list');
      return;
    }
    setState((current) => ({ ...current, notes: [note, ...current.notes] }));
    setSelectedId(note.id);
    setView('list');
  }

  function openMobileNote(note: QuickNote) {
    setSelectedId(note.id);
    setMobileDraft({ ...note });
  }

  function saveMobileNote(note: QuickNote) {
    setState((current) => ({
      ...current,
      notes: current.notes.some((item) => item.id === note.id)
        ? current.notes.map((item) => (item.id === note.id ? touch(note) : item))
        : [touch(note), ...current.notes]
    }));
    setSelectedId(note.id);
    setMobileDraft(undefined);
  }

  function copyNote(note: QuickNote) {
    const now = new Date().toISOString();
    const copy = { ...note, id: crypto.randomUUID(), body: note.body, createdAt: now, updatedAt: now };
    setState((current) => ({ ...current, notes: [copy, ...current.notes] }));
    setSelectedId(copy.id);
  }

  async function deleteNote(note: QuickNote) {
    if (!(await confirmDelete('这条记事'))) return;
    setState((current) => ({ ...current, notes: current.notes.filter((item) => item.id !== note.id) }));
    if (selectedId === note.id) setSelectedId(undefined);
  }

  function applyQuickRange(range: 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear') {
    const next = quickDateRange(range);
    setFrom(next.from);
    setTo(next.to);
    setView('list');
  }

  function selectNoteDate(date: string) {
    setFrom(date);
    setTo(date);
    setView('list');
    setSelectedId(sortPinnedItems(state.notes.filter((note) => note.createdAt.slice(0, 10) === date))[0]?.id);
  }

  function toggleChecked(id: string, checked: boolean) {
    setCheckedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  }

  async function exportCheckedNotes() {
    const notes = filteredNotes.filter((note) => checkedIds.includes(note.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (notes.length === 0) {
      await appAlert('请先勾选要导出的记事。');
      return;
    }
    if (!(await appConfirm(`确定导出 ${notes.length} 条记事吗？`, { title: '导出确认', confirmLabel: '导出' }))) return;
    const paragraphs: DocxParagraph[] = [{ text: '记事导出' }];
    for (const note of notes) {
      paragraphs.push({ text: note.body || '空记事', color: note.highlighted ? 'FF0000' : undefined });
      paragraphs.push({ text: formatDateTime(note.createdAt), color: note.highlighted ? 'FF0000' : undefined });
      paragraphs.push({ text: ' ' });
    }
    await exportFiles([{ filename: `记事导出-${todayIso()}.docx`, content: buildDocxFromParagraphs(paragraphs) }], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', state.defaultExportDirectory);
  }

  return (
    <>
    <SplitPanel
      title="记事"
      actions={<ModuleActions view={view} setView={setView} onAdd={addNote} />}
      list={<div className="module-list-surface"><div className="note-filter-row with-export"><label className="module-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索记事关键词" /></label><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} />{!mobileApp && <ToolbarButton onClick={() => void exportCheckedNotes()}><Download size={16} />导出</ToolbarButton>}</div>{!mobileApp && <label className="checkline select-all-line"><input type="checkbox" checked={filteredNotes.length > 0 && filteredNotes.every((note) => checkedIds.includes(note.id))} onChange={(event) => setCheckedIds(event.target.checked ? filteredNotes.map((note) => note.id) : [])} />全选</label>}<div className="quick-filter-row"><button className="toolbar-button" onClick={() => applyQuickRange('thisWeek')}>本周</button><button className="toolbar-button" onClick={() => applyQuickRange('lastWeek')}>上周</button><button className="toolbar-button" onClick={() => applyQuickRange('thisMonth')}>本月</button><button className="toolbar-button" onClick={() => applyQuickRange('lastMonth')}>上月</button><button className="toolbar-button" onClick={() => applyQuickRange('thisYear')}>本年度</button><button className="toolbar-button" onClick={() => { setQuery(''); setFrom(''); setTo(''); }}>全部</button></div>{view === 'list' ? <DatedList view={view} items={filteredNotes} selectedId={selected?.id} labelOf={(note) => note.body || '空记事'} leadingOf={mobileApp ? undefined : (note) => <input type="checkbox" checked={checkedIds.includes(note.id)} onClick={(event) => event.stopPropagation()} onChange={(event) => toggleChecked(note.id, event.target.checked)} aria-label="选择记事" />} inlineActionsOf={mobileApp ? (note) => <><button className="toolbar-button active" type="button" onClick={() => openMobileNote(note)}>编辑</button><ToolbarButton onClick={() => copyNote(note)}><Copy size={16} />复制</ToolbarButton></> : undefined} onSelect={setSelectedId} contextActions={(note) => [
        { label: '编辑', run: () => mobileApp ? openMobileNote(note) : setSelectedId(note.id) },
        { label: '复制', run: () => copyNote(note) },
        { label: '删除', run: () => void deleteNote(note), danger: true }
      ]} /> : <NoteCalendarView notes={filteredNotes} view={view} selectedDate={calendarDate} setSelectedDate={setCalendarDate} onSelectDate={selectNoteDate} />}</div>}
      editor={
        mobileApp ? <EmptyText>暂无记事</EmptyText> : selected ? (
          <div className="editor">
            <div className="editor-toolbar">
              <ToolbarButton active={selected.highlighted} className="pin-action" onClick={() => updateNote(selected.id, { highlighted: !selected.highlighted })}><Star size={16} />置顶</ToolbarButton>
              <input className="toolbar-date" type="date" value={selected.createdAt.slice(0, 10)} onChange={(event) => updateNoteDate(selected, event.target.value)} />
            </div>
            <textarea value={selected.body} onChange={(event) => updateNote(selected.id, { body: event.target.value })} placeholder="输入记事正文" />
          </div>
        ) : <EmptyText>新建一条记事后开始编辑</EmptyText>
      }
    />
    {mobileDraft && (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-panel mobile-edit-modal" role="dialog" aria-modal="true" aria-label="编辑记事">
          <h2>{state.notes.some((note) => note.id === mobileDraft.id) ? '编辑记事' : '新建记事'}</h2>
          <div className="editor-toolbar">
            <input className="toolbar-date" type="date" value={mobileDraft.createdAt.slice(0, 10)} onChange={(event) => {
              const date = event.target.value;
              if (!date) return;
              const time = mobileDraft.createdAt.includes('T') ? mobileDraft.createdAt.slice(10) : 'T00:00:00.000Z';
              setMobileDraft({ ...mobileDraft, createdAt: `${date}${time}` });
            }} />
          </div>
          <textarea value={mobileDraft.body} onChange={(event) => setMobileDraft({ ...mobileDraft, body: event.target.value })} placeholder="输入记事正文" autoFocus />
          <div className="modal-actions">
            <button className="toolbar-button" type="button" onClick={() => setMobileDraft(undefined)}>取消</button>
            <button className="toolbar-button active" type="button" onClick={() => saveMobileNote(mobileDraft)}>确认</button>
          </div>
        </section>
      </div>
    )}
    </>
  );
}

function PrivateNotesPanel({ state, setState }: StatePanelProps) {
  const mobileApp = isMobileApp();
  const text = useText();
  const [selectedId, setSelectedId] = useState<string | undefined>(() => mobileApp ? undefined : state.privateNotes[0]?.id);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [previewNote, setPreviewNote] = useState<PrivateNote | undefined>();
  const [pinnedNotes, setPinnedNotes] = useState<Array<{ id: string; note: PrivateNote }>>([]);
  const [previewImage, setPreviewImage] = useState<string | undefined>();
  const [bodyDraft, setBodyDraft] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [calendarDate, setCalendarDate] = useState(todayIso());
  const [mobileDraft, setMobileDraft] = useState<PrivateNote | undefined>();
  const privateNotes = sortPinnedItems(state.privateNotes).filter((note) => {
    const date = note.createdAt.slice(0, 10);
    const keyword = query.trim().toLowerCase();
    if (keyword && !`${note.title} ${note.body}`.toLowerCase().includes(keyword)) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
  const selected = state.privateNotes.find((note) => note.id === selectedId) ?? (mobileApp ? undefined : privateNotes[0] ?? state.privateNotes[0]);

  useEffect(() => {
    setBodyDraft(selected ? stripEmbeddedImages(selected.body).replace(/\n+$/g, '') : '');
  }, [selected?.id]);

  function updateNote(id: string, patch: Partial<PrivateNote>) {
    setState((current) => ({ ...current, privateNotes: current.privateNotes.map((note) => (note.id === id ? touch({ ...note, ...patch }) : note)) }));
  }

  function addNote() {
    const note = createPrivateNote();
    if (mobileApp) {
      setMobileDraft(note);
      setBodyDraft('');
      setView('list');
      return;
    }
    setState((current) => ({ ...current, privateNotes: [note, ...current.privateNotes] }));
    setSelectedId(note.id);
    setView('list');
  }

  function openMobilePrivateNote(note: PrivateNote) {
    setSelectedId(note.id);
    setMobileDraft({ ...note });
    setBodyDraft(stripEmbeddedImages(note.body).replace(/\n+$/g, ''));
  }

  function saveMobilePrivateNote(note: PrivateNote) {
    setState((current) => ({
      ...current,
      privateNotes: current.privateNotes.some((item) => item.id === note.id)
        ? current.privateNotes.map((item) => (item.id === note.id ? touch(note) : item))
        : [touch(note), ...current.privateNotes]
    }));
    setSelectedId(note.id);
    setMobileDraft(undefined);
  }

  function copyNote(note: PrivateNote) {
    const now = new Date().toISOString();
    const copy = { ...note, id: crypto.randomUUID(), title: `${note.title} 副本`, locked: false, createdAt: now, updatedAt: now };
    setState((current) => ({ ...current, privateNotes: [copy, ...current.privateNotes] }));
    setSelectedId(copy.id);
  }

  async function deleteNote(note: PrivateNote) {
    if (note.locked) {
      await appAlert('私人笔记已锁定，不能删除。');
      return;
    }
    if (!(await confirmDelete('这条私人笔记'))) return;
    setState((current) => ({ ...current, privateNotes: current.privateNotes.filter((item) => item.id !== note.id) }));
    if (selectedId === note.id) setSelectedId(undefined);
  }

  function applyQuickRange(range: 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear') {
    const next = quickDateRange(range);
    setFrom(next.from);
    setTo(next.to);
    setView('list');
  }

  function selectPrivateNoteDate(date: string) {
    setFrom(date);
    setTo(date);
    setView('list');
    setSelectedId(sortPinnedItems(state.privateNotes.filter((note) => note.createdAt.slice(0, 10) === date))[0]?.id);
  }

  function toggleChecked(id: string, checked: boolean) {
    setCheckedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  }

  async function insertImages(note: PrivateNote, files: FileList | File[]) {
    const images = await Promise.all([...files].filter((file) => file.type.startsWith('image/')).map(fileToDataUrl));
    if (images.length === 0) return;
    updateNote(note.id, { body: `${note.body}${note.body ? '\n' : ''}${images.map((src) => `![图片](${src})`).join('\n')}` });
  }

  async function exportCheckedPrivateNotes() {
    const notes = privateNotes.filter((note) => checkedIds.includes(note.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (notes.length === 0) {
      await appAlert('请先勾选要导出的笔记。');
      return;
    }
    if (!(await appConfirm(text.privateNotes.exportConfirm.replace('{count}', String(notes.length)), { title: '导出确认', confirmLabel: text.common.export }))) return;
    const files = notes.map((note) => ({
      filename: `${note.highlighted ? text.privateNotes.pinnedPrefix : ''}${note.createdAt.slice(0, 10)}-${safeFileName(note.title || text.privateNotes.title)}.docx`,
      content: buildDocx(note.title || text.privateNotes.title, stripEmbeddedImageLines(note.body))
    }));
    await exportFiles(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', state.defaultExportDirectory);
  }

  async function pinPrivateNote(note: PrivateNote) {
    if (window.assistantApp?.window?.pinNote) {
      await window.assistantApp.window.pinNote({ title: note.title || text.privateNotes.untitled, body: note.body });
      return;
    }
    setPinnedNotes((current) => [...current, { id: crypto.randomUUID(), note }]);
  }

  async function pinPreviewImage(src: string) {
    const now = new Date().toISOString();
    await pinPrivateNote({ id: crypto.randomUUID(), title: '笔记图片', body: `![图片](${src})`, highlighted: false, locked: true, createdAt: now, updatedAt: now });
  }

  return (
    <>
    <SplitPanel
      title={text.privateNotes.title}
      actions={<ModuleActions view={view} setView={setView} onAdd={addNote} />}
      list={<div className="module-list-surface"><div className="note-filter-row with-export"><label className="module-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.privateNotes.search} /></label><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} />{!mobileApp && <ToolbarButton onClick={() => void exportCheckedPrivateNotes()}><Download size={16} />{text.common.export}</ToolbarButton>}</div>{!mobileApp && <label className="checkline select-all-line"><input type="checkbox" checked={privateNotes.length > 0 && privateNotes.every((note) => checkedIds.includes(note.id))} onChange={(event) => setCheckedIds(event.target.checked ? privateNotes.map((note) => note.id) : [])} />{text.common.selectAll}</label>}<div className="quick-filter-row"><button className="toolbar-button" onClick={() => applyQuickRange('thisWeek')}>{text.common.thisWeek}</button><button className="toolbar-button" onClick={() => applyQuickRange('lastWeek')}>{text.common.lastWeek}</button><button className="toolbar-button" onClick={() => applyQuickRange('thisMonth')}>{text.common.thisMonth}</button><button className="toolbar-button" onClick={() => applyQuickRange('lastMonth')}>{text.common.lastMonth}</button><button className="toolbar-button" onClick={() => applyQuickRange('thisYear')}>{text.common.thisYear}</button><button className="toolbar-button" onClick={() => { setQuery(''); setFrom(''); setTo(''); }}>{text.common.all}</button></div>{view === 'list' ? <DatedList view={view} items={privateNotes} selectedId={selected?.id} labelOf={(note) => <span className="note-title-inline">{note.locked && <Lock size={15} />}<span>{note.title || text.privateNotes.untitled}</span></span>} leadingOf={mobileApp ? undefined : (note) => <input type="checkbox" checked={checkedIds.includes(note.id)} onClick={(event) => event.stopPropagation()} onChange={(event) => toggleChecked(note.id, event.target.checked)} aria-label={text.privateNotes.chooseNote} />} trailingOf={(note) => <button className="toolbar-button mini-action" type="button" onClick={(event) => { event.stopPropagation(); setPreviewNote(note); }}><Eye size={15} />{text.common.browse}</button>} inlineActionsOf={mobileApp ? (note) => <><button className="toolbar-button active" type="button" onClick={() => openMobilePrivateNote(note)}>编辑</button><ToolbarButton onClick={() => copyNote(note)}><Copy size={16} />复制</ToolbarButton></> : undefined} onSelect={setSelectedId} contextActions={(note) => [
        { label: '编辑', run: () => mobileApp ? openMobilePrivateNote(note) : setSelectedId(note.id) },
        { label: '复制', run: () => copyNote(note) },
        ...(note.locked ? [] : [{ label: '删除', run: () => void deleteNote(note), danger: true }])
      ]} /> : <NoteCalendarView notes={privateNotes} view={view} selectedDate={calendarDate} setSelectedDate={setCalendarDate} onSelectDate={selectPrivateNoteDate} />}</div>}
      editor={
        mobileApp ? <EmptyText>{text.privateNotes.empty}</EmptyText> : selected ? (
          <div className="editor">
            <div className="editor-toolbar">
              <ToolbarButton active={selected.highlighted} className="pin-action" onClick={() => updateNote(selected.id, { highlighted: !selected.highlighted })}><Star size={16} />{text.common.pin}</ToolbarButton>
              <ToolbarButton active={selected.locked} onClick={() => updateNote(selected.id, { locked: !selected.locked })}>{selected.locked ? <Lock size={16} /> : <Unlock size={16} />}{selected.locked ? text.common.locked : text.common.unlocked}</ToolbarButton>
              <label className="toolbar-button file-button"><Image size={16} />{text.common.image}<input type="file" accept="image/*" multiple disabled={selected.locked} onChange={(event) => { void insertImages(selected, event.target.files ?? []); event.currentTarget.value = ''; }} /></label>
            </div>
            <input value={selected.title} disabled={selected.locked} onChange={(event) => updateNote(selected.id, { title: event.target.value })} placeholder={text.privateNotes.titlePlaceholder} />
            <textarea value={bodyDraft} disabled={selected.locked} onPaste={(event) => { const files = [...event.clipboardData.files].filter((file) => file.type.startsWith('image/')); if (files.length > 0) { event.preventDefault(); void insertImages(selected, files); } }} onDrop={(event) => { event.preventDefault(); if (!selected.locked) void insertImages(selected, event.dataTransfer.files); }} onDragOver={(event) => event.preventDefault()} onChange={(event) => { setBodyDraft(event.target.value); updateNote(selected.id, { body: mergeNoteTextAndImages(event.target.value, selected.body) }); }} placeholder={text.privateNotes.bodyPlaceholder} />
            <NoteImageStrip body={selected.body} onOpen={setPreviewImage} onDelete={selected.locked ? undefined : (index) => updateNote(selected.id, { body: removeEmbeddedImageAt(selected.body, index) })} />
          </div>
        ) : <EmptyText>{text.privateNotes.empty}</EmptyText>
      }
    />
    {mobileDraft && (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-panel mobile-edit-modal" role="dialog" aria-modal="true" aria-label={text.privateNotes.title}>
          <h2>{state.privateNotes.some((note) => note.id === mobileDraft.id) ? '编辑私人笔记' : '新建私人笔记'}</h2>
          <div className="editor-toolbar">
            <ToolbarButton active={mobileDraft.locked} onClick={() => setMobileDraft((current) => current && { ...current, locked: !current.locked })}>{mobileDraft.locked ? <Lock size={16} /> : <Unlock size={16} />}{mobileDraft.locked ? text.common.locked : text.common.unlocked}</ToolbarButton>
          </div>
          <input value={mobileDraft.title} disabled={mobileDraft.locked} onChange={(event) => setMobileDraft({ ...mobileDraft, title: event.target.value })} placeholder={text.privateNotes.titlePlaceholder} autoFocus />
          <textarea value={stripEmbeddedImages(mobileDraft.body).replace(/\n+$/g, '')} disabled={mobileDraft.locked} onChange={(event) => setMobileDraft({ ...mobileDraft, body: mergeNoteTextAndImages(event.target.value, mobileDraft.body) })} placeholder={text.privateNotes.bodyPlaceholder} />
          <NoteImageStrip body={mobileDraft.body} onOpen={setPreviewImage} onDelete={mobileDraft.locked ? undefined : (index) => setMobileDraft({ ...mobileDraft, body: removeEmbeddedImageAt(mobileDraft.body, index) })} />
          <div className="modal-actions">
            <button className="toolbar-button" type="button" onClick={() => setMobileDraft(undefined)}>取消</button>
            <button className="toolbar-button active" type="button" onClick={() => saveMobilePrivateNote(mobileDraft)}>确认</button>
          </div>
        </section>
      </div>
    )}
    {previewNote && (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-panel note-preview-modal" role="dialog" aria-modal="true" aria-label={text.privateNotes.previewTitle}>
          <h2>{previewNote.title || text.privateNotes.untitled}</h2>
          <div className="note-preview-content">{renderNotePreview(previewNote.body)}</div>
          <div className="modal-actions">{!mobileApp && <button className="toolbar-button icon-only" type="button" aria-label={text.common.pin} onClick={() => { void pinPrivateNote(previewNote); setPreviewNote(undefined); }}><Pin size={16} /></button>}<button className="toolbar-button" type="button" onClick={() => setPreviewNote(undefined)}>{text.common.close}</button></div>
        </section>
      </div>
    )}
    {!mobileApp && pinnedNotes.map((pinned, index) => <PinnedNoteWindow key={pinned.id} note={pinned.note} index={index} onClose={() => setPinnedNotes((current) => current.filter((item) => item.id !== pinned.id))} />)}
    {previewImage && (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-panel note-preview-modal" role="dialog" aria-modal="true" aria-label="浏览笔记图片">
          <img className="note-image-full" src={previewImage} alt="笔记图片" />
          <div className="modal-actions">{!mobileApp && <button className="toolbar-button icon-only" type="button" aria-label="钉住图片" onClick={() => { void pinPreviewImage(previewImage); setPreviewImage(undefined); }}><Pin size={16} /></button>}<button className="toolbar-button" type="button" onClick={() => setPreviewImage(undefined)}>关闭</button></div>
        </section>
      </div>
    )}
    </>
  );
}

function NoteCalendarView({
  notes,
  view,
  selectedDate,
  setSelectedDate,
  onSelectDate
}: {
  notes: Array<{ createdAt: string }>;
  view: Exclude<ViewMode, 'list'>;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onSelectDate: (date: string) => void;
}) {
  const noteCountByDate = new Map<string, number>();
  for (const note of notes) {
    const date = note.createdAt.slice(0, 10);
    noteCountByDate.set(date, (noteCountByDate.get(date) ?? 0) + 1);
  }
  const days = makeCalendarDays(selectedDate, view);
  const visibleDates = new Set(days.map((day) => toLocalDateKey(day)));
  const visibleCount = notes.filter((note) => visibleDates.has(note.createdAt.slice(0, 10))).length;

  return (
    <div className="note-calendar">
      <div className="note-calendar-toolbar">
        <strong>{view === 'week' ? '本周' : '本月'}记事 {visibleCount} 条</strong>
        <input type="date" value={selectedDate} onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }} />
      </div>
      <div className="calendar-weekdays note-weekdays">{WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="calendar-grid compact-calendar-grid">
        {days.map((day) => {
          const date = toLocalDateKey(day);
          const count = noteCountByDate.get(date) ?? 0;
          return (
            <button key={date} className={date === selectedDate ? 'calendar-cell active' : 'calendar-cell'} onClick={() => onSelectDate(date)}>
              <strong>{date.slice(5)}</strong>
              <small>{formatLunarDate(day)}</small>
              {count > 0 && <span>{count} 条</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PinnedNoteWindow({ note, index, onClose }: { note: PrivateNote; index: number; onClose: () => void }) {
  const [position, setPosition] = useState({ x: 360 + index * 24, y: 140 + index * 24 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; left: number; top: number } | undefined>();

  useEffect(() => {
    if (!dragStart) return;
    const move = (event: PointerEvent) => setPosition({ x: Math.max(8, dragStart.left + event.clientX - dragStart.x), y: Math.max(8, dragStart.top + event.clientY - dragStart.y) });
    const up = () => setDragStart(undefined);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragStart]);

  return (
    <section className="pinned-note-window" style={{ left: position.x, top: position.y }}>
      <header onPointerDown={(event) => setDragStart({ x: event.clientX, y: event.clientY, left: position.x, top: position.y })}>
        <strong>{note.title || '无标题'}</strong>
        <button className="toolbar-button mini-action" type="button" onClick={onClose}>关闭</button>
      </header>
      <div className="note-preview-content">{note.body.trim() ? renderNotePreview(note.body) : <p className="empty">暂无正文</p>}</div>
    </section>
  );
}

function RemindersPanel({ state, setState }: StatePanelProps) {
  const mobileApp = isMobileApp();
  const [selectedId, setSelectedId] = useState<string | undefined>(() => mobileApp ? undefined : state.reminders[0]?.id);
  const [draftReminder, setDraftReminder] = useState<Reminder | undefined>();
  const [mobileReminderDraft, setMobileReminderDraft] = useState<Reminder | undefined>();
  const selected = draftReminder ?? state.reminders.find((reminder) => reminder.id === selectedId) ?? (mobileApp ? undefined : state.reminders[0]);
  const isDraft = Boolean(draftReminder && selected?.id === draftReminder.id);

  function updateReminder(id: string, patch: Partial<Reminder>) {
    if (draftReminder?.id === id) {
      setDraftReminder(touch({ ...draftReminder, ...patch }));
      return;
    }
    setState((current) => ({ ...current, reminders: current.reminders.map((reminder) => (reminder.id === id ? touch({ ...reminder, ...patch }) : reminder)) }));
  }

  function addReminder() {
    if (mobileApp) {
      setMobileReminderDraft(createReminder());
      setSelectedId(undefined);
      return;
    }
    setDraftReminder(createReminder());
    setSelectedId(undefined);
  }

  function openMobileReminder(reminder: Reminder) {
    setSelectedId(reminder.id);
    setMobileReminderDraft({ ...reminder });
  }

  function saveMobileReminder(reminder: Reminder) {
    setState((current) => ({
      ...current,
      reminders: current.reminders.some((item) => item.id === reminder.id)
        ? current.reminders.map((item) => (item.id === reminder.id ? touch(reminder) : item))
        : [touch(reminder), ...current.reminders]
    }));
    setSelectedId(reminder.id);
    setMobileReminderDraft(undefined);
  }

  async function confirmReminder() {
    if (draftReminder) {
      const reminder = touch(draftReminder);
      setState((current) => ({ ...current, reminders: [reminder, ...current.reminders] }));
      setSelectedId(reminder.id);
      setDraftReminder(undefined);
      await appAlert('新建提醒成功。');
      return;
    }

    if (!selected) return;
    setState((current) => ({
      ...current,
      reminders: current.reminders.map((reminder) => (reminder.id === selected.id ? touch(reminder) : reminder))
    }));
    await appAlert('提醒已更新。');
  }

  function copyReminder(reminder: Reminder) {
    const copy = { ...reminder, id: crypto.randomUUID(), memo: `${reminder.memo} 副本`.slice(0, 15), acknowledged: false };
    setState((current) => ({ ...current, reminders: [touch(copy), ...current.reminders] }));
    setSelectedId(copy.id);
  }

  async function deleteReminder(reminder: Reminder) {
    if (!(await confirmDelete('这个提醒'))) return;
    setState((current) => ({ ...current, reminders: current.reminders.filter((item) => item.id !== reminder.id) }));
    if (selectedId === reminder.id) setSelectedId(undefined);
  }

  return (
    <>
    <SplitPanel
      title="提醒"
      actions={<IconButton label="新建提醒" onClick={addReminder} icon={Plus} />}
      list={<SimpleListWithContext items={state.reminders} selectedId={isDraft ? undefined : selected?.id} labelOf={(item) => item.memo || '无备注提醒'} metaOf={(item) => formatDateTime(item.time)} doneOf={(item) => item.acknowledged} leadingOf={(item) => <input type="checkbox" checked={item.acknowledged} aria-label="已处理" onClick={(event) => event.stopPropagation()} onChange={(event) => updateReminder(item.id, { acknowledged: event.target.checked })} />} inlineActionsOf={mobileApp ? (item) => <><button className="toolbar-button active" type="button" onClick={() => openMobileReminder(item)}>编辑</button><ToolbarButton onClick={() => copyReminder(item)}><Copy size={16} />复制</ToolbarButton></> : undefined} onSelect={(id) => { setDraftReminder(undefined); setSelectedId(id); }} contextActions={(item) => [
        { label: '编辑', run: () => mobileApp ? openMobileReminder(item) : setSelectedId(item.id) },
        { label: '复制', run: () => copyReminder(item) },
        { label: '删除', run: () => void deleteReminder(item), danger: true }
      ]} />}
      editor={
        mobileApp ? <EmptyText>暂无提醒</EmptyText> : selected ? (
          <div className="editor">
            <div className="editor-toolbar">
              {!isDraft && <ToolbarButton onClick={() => copyReminder(selected)}><Copy size={16} />复制</ToolbarButton>}
              <ToolbarButton active={isDraft} onClick={() => void confirmReminder()}>确认</ToolbarButton>
            </div>
            <div className="reminder-inline-row"><input type="datetime-local" value={isoToDateTimeInput(selected.time)} onChange={(event) => { const time = inputDateToIso(event.target.value); if (time) updateReminder(selected.id, { time, acknowledged: false }); }} /><select value={selected.repeat} onChange={(event) => updateReminder(selected.id, { repeat: event.target.value as Reminder['repeat'], acknowledged: false })}>
              <option value="none">不重复</option><option value="daily">每日</option><option value="weekly">每周</option><option value="monthly">每月</option><option value="yearly">每年</option>
            </select></div>
            <textarea className="reminder-memo" value={selected.memo} maxLength={15} onChange={(event) => updateReminder(selected.id, { memo: event.target.value.slice(0, 15) })} placeholder="备注，最多 15 字" />
          </div>
        ) : <EmptyText>新建一个提醒后开始编辑</EmptyText>
      }
    />
    {mobileReminderDraft && (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-panel mobile-edit-modal" role="dialog" aria-modal="true" aria-label="编辑提醒">
          <h2>{state.reminders.some((reminder) => reminder.id === mobileReminderDraft.id) ? '编辑提醒' : '新建提醒'}</h2>
          <div className="reminder-inline-row">
            <input type="datetime-local" value={isoToDateTimeInput(mobileReminderDraft.time)} onChange={(event) => {
              const time = inputDateToIso(event.target.value);
              if (time) setMobileReminderDraft({ ...mobileReminderDraft, time, acknowledged: false });
            }} />
            <select value={mobileReminderDraft.repeat} onChange={(event) => setMobileReminderDraft({ ...mobileReminderDraft, repeat: event.target.value as Reminder['repeat'], acknowledged: false })}>
              <option value="none">不重复</option><option value="daily">每日</option><option value="weekly">每周</option><option value="monthly">每月</option><option value="yearly">每年</option>
            </select>
          </div>
          <textarea className="reminder-memo" value={mobileReminderDraft.memo} maxLength={15} onChange={(event) => setMobileReminderDraft({ ...mobileReminderDraft, memo: event.target.value.slice(0, 15) })} placeholder="备注，最多 15 字" autoFocus />
          <label className="checkline"><input type="checkbox" checked={mobileReminderDraft.acknowledged} onChange={(event) => setMobileReminderDraft({ ...mobileReminderDraft, acknowledged: event.target.checked })} />已处理</label>
          <div className="modal-actions">
            <button className="toolbar-button" type="button" onClick={() => setMobileReminderDraft(undefined)}>取消</button>
            <button className="toolbar-button active" type="button" onClick={() => saveMobileReminder(mobileReminderDraft)}>确认</button>
          </div>
        </section>
      </div>
    )}
    </>
  );
}

function taskTypeLabel(type: TaskType) {
  return {
    normal: '普通任务',
    daily: '每日任务',
    weekly: '每周任务',
    monthly: '每月任务',
    limited: '限时任务'
  }[type];
}

function formatDuration(start?: string, end?: string) {
  if (!start || !end) return '未完成';
  const diff = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  const minutes = Math.floor(diff / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return [days ? `${days}天` : '', hours ? `${hours}小时` : '', mins ? `${mins}分钟` : ''].filter(Boolean).join('') || '少于1分钟';
}

function countdownRemainingSeconds(timer: CountdownTimer) {
  const base = timer.remainingSeconds ?? timer.durationSeconds;
  if (!timer.running || !timer.startedAt) return base;
  const elapsed = Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000);
  return Math.max(0, base - elapsed);
}

function formatTimerSeconds(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, '0')).join(':');
}

function taskStars(rating?: number) {
  return rating ? `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}` : '未评级';
}

function TasksPanel({ state, setState }: StatePanelProps) {
  const mobileApp = isMobileApp();
  const [selectedId, setSelectedId] = useState<string | undefined>(() => mobileApp ? undefined : state.tasks[0]?.id);
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const [remindUnitByTask, setRemindUnitByTask] = useState<Record<string, 'hours' | 'days'>>({});
  const [completingTaskId, setCompletingTaskId] = useState<string | undefined>();
  const [dueDraft, setDueDraft] = useState<{ taskId: string; date: string; hour: number; minute: number } | undefined>();
  const [mobileTaskDraft, setMobileTaskDraft] = useState<Task | undefined>();
  const selected = state.tasks.find((task) => task.id === selectedId) ?? (mobileApp ? undefined : state.tasks[0]);
  const completingTask = state.tasks.find((task) => task.id === completingTaskId);
  const visibleTasks = [...state.tasks]
    .filter((task) => filter === 'all' || (filter === 'open' ? !task.completed : task.completed))
    .sort((a, b) => Number(Boolean(b.highlighted)) - Number(Boolean(a.highlighted)) || (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
  const remindUnitOfSelected = selected ? (remindUnitByTask[selected.id] ?? (selected.remindHoursBefore && selected.remindHoursBefore % 24 === 0 ? 'days' : 'hours')) : 'hours';
  const remindValue = selected?.remindHoursBefore ? (remindUnitOfSelected === 'days' ? selected.remindHoursBefore / 24 : selected.remindHoursBefore) : '';

  function updateTask(id: string, patch: Partial<Task>) {
    setState((current) => ({ ...current, tasks: current.tasks.map((task) => (task.id === id ? touch({ ...task, ...patch }) : task)) }));
  }

  function updateTaskTitle(task: Task, title: string) {
    updateTask(task.id, { title, startedAt: task.startedAt ?? (title.trim() ? new Date().toISOString() : undefined) });
  }

  function openDueDraft(task: Task) {
    const value = task.dueAt ? isoToDateTimeInput(task.dueAt) : `${todayIso()}T23:59`;
    setDueDraft({
      taskId: task.id,
      date: value.slice(0, 10),
      hour: Number(value.slice(11, 13)),
      minute: Number(value.slice(14, 16))
    });
  }

  function confirmDueDraft() {
    if (!dueDraft) return;
    updateTask(dueDraft.taskId, { dueAt: inputDateToIso(`${dueDraft.date}T${String(dueDraft.hour).padStart(2, '0')}:${String(dueDraft.minute).padStart(2, '0')}`) });
    setDueDraft(undefined);
  }

  function completeTask(task: Task, rating: number) {
    const now = new Date().toISOString();
    updateTask(task.id, { completed: true, startedAt: task.startedAt ?? now, completedAt: now, rating });
    setCompletingTaskId(undefined);
  }

  function requestCompleteTask(task: Task) {
    setCompletingTaskId(task.id);
  }

  async function reopenTask(task: Task) {
    if (!(await appConfirm('确定取消完成状态吗？取消后可继续编辑，并需要重新提交评级。', { title: '取消完成确认' }))) return;
    updateTask(task.id, { completed: false, completedAt: undefined, rating: undefined });
  }

  function updateRemindBefore(task: Task, value: string, unit = remindUnitOfSelected) {
    const amount = Number(value);
    updateTask(task.id, { remindHoursBefore: amount > 0 ? (unit === 'days' ? amount * 24 : amount) : undefined });
  }

  function updateRemindUnit(task: Task, unit: 'hours' | 'days') {
    setRemindUnitByTask((current) => ({ ...current, [task.id]: unit }));
    if (task.remindHoursBefore) {
      const currentValue = remindUnitOfSelected === 'days' ? task.remindHoursBefore / 24 : task.remindHoursBefore;
      updateTask(task.id, { remindHoursBefore: unit === 'days' ? currentValue * 24 : currentValue });
    }
  }

  function addTask(type: TaskType) {
    const task = createTask({ type, steps: [''] });
    if (mobileApp) {
      setMobileTaskDraft(task);
      return;
    }
    setState((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    setSelectedId(task.id);
  }

  function openMobileTask(task: Task) {
    setSelectedId(task.id);
    setMobileTaskDraft({ ...task, steps: task.steps.map((step) => ({ ...step })) });
  }

  function updateMobileTaskDraft(patch: Partial<Task>) {
    setMobileTaskDraft((current) => current ? touch({ ...current, ...patch }) : current);
  }

  function saveMobileTask(task: Task) {
    setState((current) => ({
      ...current,
      tasks: current.tasks.some((item) => item.id === task.id)
        ? current.tasks.map((item) => (item.id === task.id ? touch(task) : item))
        : [touch(task), ...current.tasks]
    }));
    setSelectedId(task.id);
    setMobileTaskDraft(undefined);
  }

  function copyTask(task: Task) {
    const copy = createTask({ title: `${task.title} 副本`, type: task.type, dueAt: task.dueAt, remindHoursBefore: task.remindHoursBefore, steps: task.steps.map((step) => step.body) });
    setState((current) => ({ ...current, tasks: [copy, ...current.tasks] }));
    setSelectedId(copy.id);
  }

  async function deleteTask(task: Task) {
    if (!(await confirmDelete('这个任务'))) return;
    setState((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }));
    if (selectedId === task.id) setSelectedId(undefined);
  }

  async function toggleTaskStep(task: Task, stepId: string, completed: boolean) {
    const steps = task.steps.map((item) => (item.id === stepId ? { ...item, completed } : item));
    const shouldOfferComplete = completed && !task.completed && steps.length > 0 && steps.every((step) => step.completed);
    updateTask(task.id, { steps });
    if (shouldOfferComplete && await appConfirm('所有子任务已完成，是否完成整个任务？', { title: '完成任务确认' })) requestCompleteTask({ ...task, steps });
  }

  function renderTaskDetail(task: Task) {
    const info = [
      `类型：${taskTypeLabel(task.type)}`,
      task.completed ? '状态：已完成' : '状态：未完成',
      task.dueAt ? `截止：${formatDateTime(task.dueAt)}` : undefined,
      task.remindHoursBefore ? `提醒：截止前 ${task.remindHoursBefore % 24 === 0 ? `${task.remindHoursBefore / 24} 天` : `${task.remindHoursBefore} 小时`}` : undefined,
      task.startedAt ? `开始：${formatDateTime(task.startedAt)}` : undefined,
      task.completedAt ? `完成：${formatDateTime(task.completedAt)}` : undefined,
      `耗时：${formatDuration(task.startedAt, task.completedAt)}`
    ].filter(Boolean);
    return (
      <span className="task-detail">
        <span className="task-detail-meta">{info.join(' / ')}</span>
        <span className="task-rating">{taskStars(task.rating)}</span>
        {task.steps.map((step) => (
          <span key={step.id} className={step.completed ? 'line-through' : ''}>{step.completed ? '✓' : '□'} {step.body || '未填写步骤'}</span>
        ))}
      </span>
    );
  }

  function renderTaskMeta(task: Task) {
    const status = task.completed ? '已完成' : task.dueAt ? formatDateTime(task.dueAt) : taskTypeLabel(task.type);
    return `${status} | 开始 ${task.startedAt ? formatDateTime(task.startedAt) : '未记录'} | 完成 ${task.completedAt ? formatDateTime(task.completedAt) : '未完成'} | 耗时 ${formatDuration(task.startedAt, task.completedAt)}\n${taskStars(task.rating)}`;
  }

  return (
    <>
    <SplitPanel
      title="任务"
      actions={<div className="toolbar"><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="open">未完成</option><option value="done">已完成</option><option value="all">所有</option></select><select onChange={(event) => addTask(event.target.value as TaskType)} value=""><option value="" disabled>新建任务</option><option value="normal">普通任务</option><option value="daily">每日任务</option><option value="weekly">每周任务</option><option value="monthly">每月任务</option><option value="limited">限时任务</option></select></div>}
      list={<SimpleListWithContext items={visibleTasks} selectedId={selected?.id} labelOf={(task) => task.title} metaOf={renderTaskMeta} detailOf={renderTaskDetail} urgentOf={(task) => shouldHighlightLimitedTask(task)} pinnedOf={mobileApp ? undefined : (task) => Boolean(task.highlighted)} doneOf={(task) => task.completed} inlineActionsOf={mobileApp ? (task) => <><button className="toolbar-button active" type="button" onClick={() => openMobileTask(task)}>编辑</button><ToolbarButton onClick={() => copyTask(task)}><Copy size={16} />复制</ToolbarButton></> : undefined} onSelect={setSelectedId} contextActions={(task) => [
        { label: '编辑', run: () => mobileApp ? openMobileTask(task) : setSelectedId(task.id) },
        ...(!mobileApp ? [{ label: task.highlighted ? '取消置顶' : '置顶', run: () => updateTask(task.id, { highlighted: !task.highlighted }) }] : []),
        { label: '复制', run: () => copyTask(task) },
        ...(!mobileApp ? [{ label: '导出', run: () => exportDoc(task.title, task.steps.map((step) => `${step.completed ? '[x]' : '[ ]'} ${step.body}`).join('\n')) }] : []),
        { label: '删除', run: () => void deleteTask(task), danger: true }
      ]} />}
      editor={
        mobileApp ? <EmptyText>暂无任务</EmptyText> : selected ? (
          <div className={['editor', selected.completed ? 'readonly-editor' : ''].join(' ')}>
            <div className="editor-toolbar">
              <label className="checkline"><input type="checkbox" checked={selected.completed} onChange={(event) => { if (event.target.checked) requestCompleteTask(selected); else void reopenTask(selected); }} />完成任务</label>
              <ToolbarButton active={Boolean(selected.highlighted)} className="pin-action" onClick={() => updateTask(selected.id, { highlighted: !selected.highlighted })}><Star size={16} />置顶</ToolbarButton>
              <ToolbarButton onClick={() => copyTask(selected)}><Copy size={16} />复制</ToolbarButton>
              {!mobileApp && <ToolbarButton onClick={() => exportDoc(selected.title, selected.steps.map((step) => `${step.completed ? '[x]' : '[ ]'} ${step.body}`).join('\n'))}><Download size={16} />导出</ToolbarButton>}
            </div>
            <input value={selected.title} disabled={selected.completed} onChange={(event) => updateTaskTitle(selected, event.target.value)} placeholder="任务标题" />
            <select value={selected.type} disabled={selected.completed} onChange={(event) => updateTask(selected.id, { type: event.target.value as TaskType })}><option value="normal">普通任务</option><option value="daily">每日任务</option><option value="weekly">每周任务</option><option value="monthly">每月任务</option><option value="limited">限时任务</option></select>
            <div className="task-time-summary"><span>开始：{selected.startedAt ? formatDateTime(selected.startedAt) : '未记录'}</span><span>完成：{selected.completedAt ? formatDateTime(selected.completedAt) : '未完成'}</span><span>总耗时：{formatDuration(selected.startedAt, selected.completedAt)}</span><span>评级：{taskStars(selected.rating)}</span></div>
            {selected.type === 'limited' && <div className="form-grid"><div className="due-picker-field"><button className="toolbar-button due-picker-trigger" type="button" disabled={selected.completed} onClick={() => openDueDraft(selected)}>{selected.dueAt ? formatDateTime(selected.dueAt) : '设置截止时间'}</button>{selected.dueAt && <button className="toolbar-button" type="button" disabled={selected.completed} onClick={() => updateTask(selected.id, { dueAt: undefined })}>清除</button>}</div><label className="remind-before-field"><input type="number" min={0} disabled={selected.completed} value={remindValue} onChange={(event) => updateRemindBefore(selected, event.target.value)} /><select value={remindUnitOfSelected} disabled={selected.completed} onChange={(event) => updateRemindUnit(selected, event.target.value as 'hours' | 'days')}><option value="hours">小时</option><option value="days">天</option></select><span>截止前提醒</span></label></div>}
            <div className="steps">
              {selected.steps.map((step, index) => (
                <label key={step.id} className="step-row">
                  <input type="checkbox" disabled={selected.completed} checked={step.completed} onChange={(event) => void toggleTaskStep(selected, step.id, event.target.checked)} />
                  <input value={step.body} disabled={selected.completed} className={step.completed ? 'line-through' : ''} onChange={(event) => updateTask(selected.id, { steps: selected.steps.map((item) => (item.id === step.id ? { ...item, body: event.target.value } : item)) })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); const steps = [...selected.steps]; steps.splice(index + 1, 0, createStep('')); updateTask(selected.id, { steps }); } }} placeholder="小步骤" />
                  <button className="icon-button danger-action" type="button" disabled={selected.completed} onClick={() => updateTask(selected.id, { steps: selected.steps.length > 1 ? selected.steps.filter((item) => item.id !== step.id) : [createStep('')] })} title="删除步骤" aria-label="删除步骤"><Trash2 size={15} /></button>
                </label>
              ))}
              <button className="toolbar-button" type="button" disabled={selected.completed} onClick={() => updateTask(selected.id, { steps: [...selected.steps, createStep('')] })}>增加计划步骤</button>
            </div>
          </div>
        ) : <EmptyText>新建一个任务后开始编辑</EmptyText>
      }
    />
      {completingTask && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel rating-modal" role="dialog" aria-modal="true" aria-label="任务评级">
            <h2>完成任务</h2>
            <p className="muted">{completingTask.title}</p>
            <div className="rating-picker">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button key={rating} type="button" className="toolbar-button" onClick={() => completeTask(completingTask, rating)}>
                  {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="toolbar-button" type="button" onClick={() => setCompletingTaskId(undefined)}>取消</button>
            </div>
          </section>
        </div>
      )}
      {mobileTaskDraft && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel mobile-edit-modal" role="dialog" aria-modal="true" aria-label="编辑任务">
            <h2>{state.tasks.some((task) => task.id === mobileTaskDraft.id) ? '编辑任务' : '新建任务'}</h2>
            <div className="editor-toolbar">
              <label className="checkline"><input type="checkbox" checked={mobileTaskDraft.completed} onChange={(event) => updateMobileTaskDraft({ completed: event.target.checked, completedAt: event.target.checked ? new Date().toISOString() : undefined })} />完成任务</label>
              <ToolbarButton onClick={() => { copyTask(mobileTaskDraft); setMobileTaskDraft(undefined); }}><Copy size={16} />复制</ToolbarButton>
            </div>
            <input value={mobileTaskDraft.title} onChange={(event) => updateMobileTaskDraft({ title: event.target.value, startedAt: mobileTaskDraft.startedAt ?? (event.target.value.trim() ? new Date().toISOString() : undefined) })} placeholder="任务标题" autoFocus />
            <select value={mobileTaskDraft.type} onChange={(event) => updateMobileTaskDraft({ type: event.target.value as TaskType })}><option value="normal">普通任务</option><option value="daily">每日任务</option><option value="weekly">每周任务</option><option value="monthly">每月任务</option><option value="limited">限时任务</option></select>
            {mobileTaskDraft.type === 'limited' && <input type="datetime-local" value={mobileTaskDraft.dueAt ? isoToDateTimeInput(mobileTaskDraft.dueAt) : ''} onChange={(event) => updateMobileTaskDraft({ dueAt: inputDateToIso(event.target.value) })} />}
            <div className="steps">
              {mobileTaskDraft.steps.map((step, index) => (
                <label key={step.id} className="step-row">
                  <input type="checkbox" checked={step.completed} onChange={(event) => updateMobileTaskDraft({ steps: mobileTaskDraft.steps.map((item) => item.id === step.id ? { ...item, completed: event.target.checked } : item) })} />
                  <input value={step.body} onChange={(event) => updateMobileTaskDraft({ steps: mobileTaskDraft.steps.map((item) => item.id === step.id ? { ...item, body: event.target.value } : item) })} placeholder="小步骤" />
                  <button className="icon-button danger-action" type="button" onClick={() => updateMobileTaskDraft({ steps: mobileTaskDraft.steps.length > 1 ? mobileTaskDraft.steps.filter((item) => item.id !== step.id) : [createStep('')] })} aria-label="删除步骤"><Trash2 size={15} /></button>
                </label>
              ))}
              <button className="toolbar-button" type="button" onClick={() => updateMobileTaskDraft({ steps: [...mobileTaskDraft.steps, createStep('')] })}>增加计划步骤</button>
            </div>
            <div className="modal-actions">
              <button className="toolbar-button" type="button" onClick={() => setMobileTaskDraft(undefined)}>取消</button>
              <button className="toolbar-button active" type="button" onClick={() => saveMobileTask(mobileTaskDraft)}>确认</button>
            </div>
          </section>
        </div>
      )}
      {dueDraft && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel due-picker-modal" role="dialog" aria-modal="true" aria-label="选择截止时间">
            <h2>选择截止时间</h2>
            <input type="date" value={dueDraft.date} onChange={(event) => setDueDraft({ ...dueDraft, date: event.target.value })} />
            <div className="time-scroll-grid">
              <TimeScroll label="小时" value={dueDraft.hour} max={23} onChange={(hour) => setDueDraft({ ...dueDraft, hour })} />
              <TimeScroll label="分钟" value={dueDraft.minute} max={59} onChange={(minute) => setDueDraft({ ...dueDraft, minute })} />
            </div>
            <div className="modal-actions">
              <button className="toolbar-button" type="button" onClick={() => setDueDraft(undefined)}>取消</button>
              <button className="toolbar-button active" type="button" onClick={confirmDueDraft}>确认</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function LedgerPanel({ state, setState }: StatePanelProps) {
  const mobileApp = isMobileApp();
  const [bookId, setBookId] = useState<string | 'all'>(state.ledgerBooks[0]?.id ?? 'all');
  const [selectedId, setSelectedId] = useState<string | undefined>(state.ledgerEntries[0]?.id);
  const [period, setPeriod] = useState<LedgerPeriod>('month');
  const [newBookName, setNewBookName] = useState('');
  const [ledgerQuery, setLedgerQuery] = useState('');
  const [ledgerType, setLedgerType] = useState<LedgerEntryType | 'all'>('all');
  const [ledgerCategoryId, setLedgerCategoryId] = useState<string | 'all'>('all');
  const [ledgerFrom, setLedgerFrom] = useState('');
  const [ledgerTo, setLedgerTo] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | undefined>();
  const [editingEntryId, setEditingEntryId] = useState<string | undefined>();
  const [draftEntry, setDraftEntry] = useState<LedgerEntry | undefined>();
  const [mobileLedgerView, setMobileLedgerView] = useState<'entries' | 'summary'>('entries');
  const entries = filterLedgerEntries(state, getLedgerEntries(state, bookId, period), {
    query: ledgerQuery,
    type: ledgerType,
    categoryId: ledgerCategoryId,
    from: ledgerFrom || undefined,
    to: ledgerTo || undefined
  });
  const visibleEntries = entries.filter((entry) => entry.amount > 0);
  const selected = state.ledgerEntries.find((entry) => entry.id === selectedId) ?? visibleEntries[0];
  const editingEntry = draftEntry ?? state.ledgerEntries.find((entry) => entry.id === editingEntryId);
  const summary = summarizeLedger(visibleEntries);
  const byCategory = summarizeLedgerByCategory(state, visibleEntries);
  const byDate = groupLedgerEntriesByDate(visibleEntries);
  const byPerson = summarizeLedgerByPerson(state, visibleEntries);
  const selectedPersonEntries = selectedPersonId ? visibleEntries.filter((entry) => entry.personId === selectedPersonId) : [];
  const totalFlow = summary.income + summary.expense;
  const expenseDegree = totalFlow > 0 ? Math.round((summary.expense / totalFlow) * 360) : 0;
  const maxCategoryFlow = Math.max(1, ...byCategory.map((item) => item.income + item.expense));

  useEffect(() => {
    if (!state.ledgerCategories.some((category) => category.icon === 'settings')) return;
    setState((current) => ({
      ...current,
      ledgerCategories: current.ledgerCategories.filter((category) => category.icon !== 'settings')
    }));
  }, [state.ledgerCategories, setState]);

  function updateEntry(id: string, patch: Partial<LedgerEntry>) {
    setState((current) => ({ ...current, ledgerEntries: current.ledgerEntries.map((entry) => (entry.id === id ? touch({ ...entry, ...patch }) : entry)) }));
  }

  function updateEditingEntry(id: string, patch: Partial<LedgerEntry>) {
    if (draftEntry?.id === id) {
      setDraftEntry(touch({ ...draftEntry, ...patch }));
      return;
    }
    updateEntry(id, patch);
  }

  const nextBookName = `账本 ${state.ledgerBooks.length + 1}`;

  function addEntry(type: LedgerEntryType) {
    const book = state.ledgerBooks.find((item) => item.id === bookId) ?? state.ledgerBooks[0] ?? createLedgerBook();
    const person = state.ledgerPeople[0] ?? createLedgerPerson();
    const category = state.ledgerCategories.find((item) => item.type === type) ?? createLedgerCategory(type === 'income' ? '工资' : '餐饮', type === 'income' ? '💼' : '🍚', type);
    const entry = createLedgerEntry({ bookId: book.id, personId: person.id, categoryId: category.id, type });
    setBookId(book.id);
    setSelectedId(entry.id);
    setDraftEntry(entry);
    setEditingEntryId(undefined);
    setSelectedPersonId(undefined);
  }

  function cancelLedgerEdit() {
    setDraftEntry(undefined);
    setEditingEntryId(undefined);
  }

  async function confirmLedgerEdit(entry: LedgerEntry) {
    if (entry.amount <= 0) {
      await appAlert('收支金额必须大于 0。');
      return;
    }
    if (draftEntry?.id === entry.id) {
      setState((current) => ({
        ...current,
        ledgerBooks: current.ledgerBooks.some((item) => item.id === entry.bookId) ? current.ledgerBooks : [state.ledgerBooks.find((item) => item.id === entry.bookId) ?? createLedgerBook(), ...current.ledgerBooks],
        ledgerPeople: current.ledgerPeople.some((item) => item.id === entry.personId) ? current.ledgerPeople : [state.ledgerPeople.find((item) => item.id === entry.personId) ?? createLedgerPerson(), ...current.ledgerPeople],
        ledgerCategories: current.ledgerCategories.some((item) => item.id === entry.categoryId) ? current.ledgerCategories : [state.ledgerCategories.find((item) => item.id === entry.categoryId) ?? createLedgerCategory(entry.type === 'income' ? '工资' : '餐饮', entry.type === 'income' ? 'wallet-cards' : 'utensils', entry.type), ...current.ledgerCategories],
        ledgerEntries: [touch(entry), ...current.ledgerEntries]
      }));
      setDraftEntry(undefined);
    }
    setSelectedId(entry.id);
    setEditingEntryId(undefined);
  }

  function startAddBook() {
    setNewBookName(nextBookName);
  }

  function confirmAddBook() {
    const name = (newBookName || nextBookName).trim();
    if (!name) return;
    const book = createLedgerBook(name);
    setState((current) => ({ ...current, ledgerBooks: [book, ...current.ledgerBooks] }));
    setBookId(book.id);
    setNewBookName('');
  }

  async function renameBook() {
    if (bookId === 'all') {
      await appAlert('请先选择一个账本。');
      return;
    }
    const book = state.ledgerBooks.find((item) => item.id === bookId);
    if (!book) return;
    const name = await appPrompt('账本名称', { defaultValue: book.name });
    if (!name?.trim()) return;
    setState((current) => ({
      ...current,
      ledgerBooks: current.ledgerBooks.map((item) => (item.id === book.id ? touch({ ...item, name: name.trim() }) : item))
    }));
  }

  async function requestDeleteBook() {
    if (bookId === 'all') {
      await appAlert('请先选择一个账本。');
      return;
    }
    const result = canDeleteLedgerBook(state, bookId);
    if (!result.ok) {
      await appAlert(result.reason ?? '当前账本不能删除。');
      return;
    }
    const book = state.ledgerBooks.find((item) => item.id === bookId);
    if (!book) return;
    const entryCount = state.ledgerEntries.filter((entry) => entry.bookId === bookId).length;
    const message = entryCount > 0
      ? `删除账本「${book.name}」会同时删除 ${entryCount} 笔账目，并同步到其他设备。请问是否删除？`
      : `删除账本「${book.name}」后会同步到其他设备。请问是否删除？`;
    if (!(await appConfirm(message, { title: '删除账本确认', confirmLabel: '删除', danger: true }))) {
      return;
    }
    const nextBook = state.ledgerBooks.find((book) => book.id !== bookId);
    setState((current) => ({
      ...current,
      ledgerBooks: current.ledgerBooks.filter((book) => book.id !== bookId),
      ledgerEntries: current.ledgerEntries.filter((entry) => entry.bookId !== bookId)
    }));
    setBookId(nextBook?.id ?? 'all');
    if (selected?.bookId === bookId) setSelectedId(undefined);
  }

  async function deleteEntry(entry: LedgerEntry) {
    if (!(await confirmDelete('这笔账目'))) return;
    setState((current) => ({ ...current, ledgerEntries: current.ledgerEntries.filter((item) => item.id !== entry.id) }));
    if (selectedId === entry.id) setSelectedId(undefined);
    if (editingEntryId === entry.id) setEditingEntryId(undefined);
  }

  function updateLedgerTypeFilter(type: LedgerEntryType | 'all') {
    setLedgerType(type);
    const selectedCategory = state.ledgerCategories.find((category) => category.id === ledgerCategoryId);
    if (type !== 'all' && selectedCategory && selectedCategory.type !== type) {
      setLedgerCategoryId('all');
    }
  }

  function copyEntry(entry: LedgerEntry) {
    const now = new Date().toISOString();
    const copy = { ...entry, id: crypto.randomUUID(), memo: entry.memo ? `${entry.memo} 副本` : '', createdAt: now, updatedAt: now };
    setState((current) => ({ ...current, ledgerEntries: [copy, ...current.ledgerEntries] }));
    setSelectedId(copy.id);
  }

  async function addLedgerPerson(entry: LedgerEntry, nameInput?: string) {
    const name = nameInput ?? await appPrompt('对象名称');
    if (!name?.trim()) return;
    const person = createLedgerPerson(name.trim());
    if (draftEntry?.id === entry.id) {
      setState((current) => ({ ...current, ledgerPeople: [person, ...current.ledgerPeople] }));
      setDraftEntry(touch({ ...entry, personId: person.id }));
      return;
    }
    setState((current) => ({
      ...current,
      ledgerPeople: [person, ...current.ledgerPeople],
      ledgerEntries: current.ledgerEntries.map((item) => (item.id === entry.id ? touch({ ...item, personId: person.id }) : item))
    }));
  }

  async function deleteLedgerPerson(personId: string) {
    if (!(await appConfirm('删除对象后，关联收支账本信息中的对象会被标记为无，请问是否删除？', { title: '删除对象确认', confirmLabel: '删除', danger: true }))) return;
    setState((current) => ({
      ...current,
      ledgerPeople: current.ledgerPeople.filter((person) => person.id !== personId)
    }));
  }

  const ledgerSummaryContent = <div onClick={() => setSelectedPersonId(undefined)}><div className="ledger-filter-row"><input value={ledgerQuery} onChange={(event) => setLedgerQuery(event.target.value)} placeholder="搜索备注/类目/对象" /><select value={ledgerType} onChange={(event) => updateLedgerTypeFilter(event.target.value as LedgerEntryType | 'all')}><option value="all">全部收支</option><option value="expense">支出</option><option value="income">收入</option></select><select value={ledgerCategoryId} onChange={(event) => setLedgerCategoryId(event.target.value)}><option value="all">全部类目</option>{state.ledgerCategories.filter((category) => ledgerType === 'all' || category.type === ledgerType).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input type="date" value={ledgerFrom} onChange={(event) => setLedgerFrom(event.target.value)} /><input type="date" value={ledgerTo} onChange={(event) => setLedgerTo(event.target.value)} /></div><div className="metric-grid ledger-metrics"><Metric label={getLedgerPeriodLabel(period)} value={visibleEntries.length} /><Metric label="收入" value={summary.income} /><Metric label="支出" value={summary.expense} /><Metric label="结余" value={summary.balance} /></div><div className="ledger-chart-row"><div className="ledger-pie" style={{ background: `conic-gradient(#c85d3f 0deg ${expenseDegree}deg, #315d4a ${expenseDegree}deg 360deg)` }}><span>{visibleEntries.length}</span></div><div><strong>收支占比</strong><small>绿色收入 / 红色支出</small></div></div><div className="ledger-person-summary" onClick={(event) => event.stopPropagation()}>{byPerson.map((item) => <button key={item.id} type="button" className={selectedPersonId === item.id ? 'person-chip active' : 'person-chip'} onClick={() => { setSelectedPersonId((current) => current === item.id ? undefined : item.id); setSelectedId(undefined); }}><strong>{item.name}</strong><small>收 {item.income} / 支 {formatExpenseNumber(item.expense)}</small></button>)}</div><div className="chart-list">{byCategory.map((item) => <div key={item.name} className="bar-row"><span>{item.name}</span><div><i style={{ width: `${Math.max(6, Math.round(((item.income + item.expense) / maxCategoryFlow) * 100))}%` }} /></div><small>收 {item.income} / 支 {formatExpenseNumber(item.expense)}</small></div>)}</div></div>;
  const ledgerEntriesContent = <div className="editor ledger-flow-panel"><div className="editor-toolbar"><ToolbarButton onClick={() => addEntry(ledgerType === 'income' ? 'income' : 'expense')}><Plus size={16} />记一笔</ToolbarButton></div>{selectedPersonId ? <LedgerPersonDetails state={state} entries={selectedPersonEntries} onSelect={(id) => { setSelectedId(id); setSelectedPersonId(undefined); }} /> : <LedgerEntryList state={state} byDate={byDate} selectedId={selected?.id} onSelect={(id) => { setSelectedId(id); setSelectedPersonId(undefined); }} contextActions={(entry) => [
        { label: '编辑', run: () => { setSelectedId(entry.id); setEditingEntryId(entry.id); } },
        { label: '复制', run: () => copyEntry(entry) },
        ...(!mobileApp ? [{ label: '导出', run: () => exportLedgerExcel(state, [entry]) }] : []),
        { label: '删除', run: () => void deleteEntry(entry), danger: true }
      ]} />}</div>;
  const mobileLedgerContent = (
    <div className="mobile-ledger-page">
      <div className="mobile-ledger-tabs" role="tablist" aria-label="记账视图">
        <button className={mobileLedgerView === 'entries' ? 'active' : ''} type="button" onClick={() => setMobileLedgerView('entries')}>记账</button>
        <button className={mobileLedgerView === 'summary' ? 'active' : ''} type="button" onClick={() => setMobileLedgerView('summary')}>汇总</button>
      </div>
      {mobileLedgerView === 'entries' ? ledgerEntriesContent : ledgerSummaryContent}
    </div>
  );

  return (
    <>
    <SplitPanel
      className="ledger-split"
      title="记账"
      actions={<div className="toolbar"><select value={bookId} onChange={(event) => { if (event.target.value === '__new__') startAddBook(); else setBookId(event.target.value); }}><option value="all">全部账本</option>{state.ledgerBooks.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}<option value="__new__">新增账本...</option></select>{newBookName && <><input className="inline-name-input" value={newBookName} onChange={(event) => setNewBookName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') confirmAddBook(); }} autoFocus /><button className="toolbar-button" type="button" onClick={confirmAddBook}>确认</button></>}<select value={period} onChange={(event) => setPeriod(event.target.value as LedgerPeriod)}><option value="day">日</option><option value="week">周</option><option value="month">月</option><option value="year">年</option></select><button className="toolbar-button" onClick={() => void renameBook()}>重命名账本</button><button className="toolbar-button danger-action" onClick={() => void requestDeleteBook()}>删除账本</button>{!mobileApp && <IconButton label="导出 Excel" onClick={() => exportLedgerExcel(state, visibleEntries)} icon={Download} />}</div>}
      list={mobileApp ? mobileLedgerContent : ledgerSummaryContent}
      editor={mobileApp ? <EmptyText>暂无内容</EmptyText> : ledgerEntriesContent}
    />
    {editingEntry && (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-panel ledger-entry-modal" role="dialog" aria-modal="true" aria-label="记一笔">
          <LedgerEditor state={state} selected={editingEntry} updateEntry={updateEditingEntry} deleteEntry={() => { if (draftEntry?.id === editingEntry.id) cancelLedgerEdit(); else { void deleteEntry(editingEntry); setEditingEntryId(undefined); } }} addEntry={() => addEntry(ledgerType === 'income' ? 'income' : 'expense')} addPerson={(name) => void addLedgerPerson(editingEntry, name)} deletePerson={() => void deleteLedgerPerson(editingEntry.personId)} />
          <div className="modal-actions">
            <button className="toolbar-button" type="button" onClick={cancelLedgerEdit}>取消</button>
            <button className="toolbar-button active" type="button" onClick={() => void confirmLedgerEdit(editingEntry)}>确认</button>
          </div>
        </section>
      </div>
    )}
    </>
  );
}

function LedgerEditor({
  state,
  selected,
  updateEntry,
  deleteEntry,
  addEntry,
  addPerson,
  deletePerson
}: {
  state: AppState;
  selected: LedgerEntry;
  updateEntry: (id: string, patch: Partial<LedgerEntry>) => void;
  deleteEntry: () => void;
  addEntry: () => void;
  addPerson: (name?: string) => void;
  deletePerson: () => void;
}) {
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const isAddingPerson = newPersonName !== '';
  const confirmAddPerson = () => {
    if (!newPersonName.trim()) return;
    addPerson(newPersonName);
    setNewPersonName('');
  };

  return (
    <div className="editor">
      <div className="ledger-editor-fields">
        <label className="field-row">
          <span>收支类型</span>
          <select value={selected.type} onChange={(event) => updateEntry(selected.id, buildLedgerTypePatch(state, selected, event.target.value as LedgerEntryType))}><option value="expense">支出</option><option value="income">收入</option></select>
        </label>
        <label className="field-row amount-field">
          <span>金额</span>
          <button className="amount-trigger" type="button" onClick={() => setCalculatorOpen(true)}>¥ {selected.amount}</button>
          {calculatorOpen && (
            <AmountCalculator
              value={selected.amount}
              onCancel={() => setCalculatorOpen(false)}
              onConfirm={async (amount) => {
                if (amount <= 0) {
                  await appAlert('收支金额必须大于 0。');
                  return;
                }
                updateEntry(selected.id, { amount });
                setCalculatorOpen(false);
              }}
            />
          )}
        </label>
        <label className="field-row">
          <span>发生日期</span>
          <input type="date" value={selected.date.slice(0, 10)} onChange={(event) => { const date = inputDateToIso(event.target.value); if (date) updateEntry(selected.id, { date }); }} />
        </label>
        <div className="field-row object-field">
          <span>记账对象</span>
          <div className="object-controls">
            <select value={selected.personId} onChange={(event) => updateEntry(selected.id, { personId: event.target.value })}>{state.ledgerPeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
            {isAddingPerson ? (
              <div className="inline-create-group">
                <input value={newPersonName} onChange={(event) => setNewPersonName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') confirmAddPerson(); }} autoFocus />
                <button className="toolbar-button active" type="button" onClick={confirmAddPerson}>确认</button>
              </div>
            ) : (
              <button className="toolbar-button" type="button" onClick={() => setNewPersonName('新对象')}>新建对象</button>
            )}
            <button className="toolbar-button danger-action" type="button" onClick={deletePerson}>删除对象</button>
          </div>
        </div>
        <label className="field-row">
          <span>备注</span>
          <input value={selected.memo} onChange={(event) => updateEntry(selected.id, { memo: event.target.value })} placeholder="备注" />
        </label>
      </div>
      <div className="category-section">
        <div className="category-section-header">
          <span>类目</span>
        </div>
        <div className="category-grid">
          {state.ledgerCategories.filter((category) => category.type === selected.type).map((category) => (
            <button
              key={category.id}
              className={category.id === selected.categoryId ? 'category-button active' : 'category-button'}
              onClick={() => updateEntry(selected.id, { categoryId: category.id })}
              type="button"
            >
              <LedgerIcon icon={category.icon} />
              <span>{category.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LedgerEntryList({
  state,
  byDate,
  selectedId,
  onSelect,
  contextActions
}: {
  state: AppState;
  byDate: ReturnType<typeof groupLedgerEntriesByDate>;
  selectedId?: string;
  onSelect: (id: string) => void;
  contextActions: (entry: LedgerEntry) => ContextAction[];
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; actions: ContextAction[] } | undefined>();

  function openMenu(event: MouseEvent, entry: LedgerEntry) {
    event.preventDefault();
    onSelect(entry.id);
    setMenu({ x: event.clientX, y: event.clientY, actions: contextActions(entry) });
  }

  return (
    <div className="ledger-entry-groups" onClick={() => setMenu(undefined)}>
      {byDate.map((bucket) => (
        <section key={bucket.date} className="ledger-date-group">
          <div className="ledger-date-divider"><strong>{bucket.date}</strong><span>收 {bucket.income} / 支 {formatExpenseNumber(bucket.expense)}</span></div>
          {bucket.items.map((entry) => {
            const category = state.ledgerCategories.find((item) => item.id === entry.categoryId);
            const person = state.ledgerPeople.find((item) => item.id === entry.personId);
            return (
              <button key={entry.id} type="button" className={['ledger-entry-row', selectedId === entry.id ? 'active' : ''].join(' ')} onClick={() => onSelect(entry.id)} onContextMenu={(event) => openMenu(event, entry)}>
                <span className="ledger-entry-person">{person?.name ?? '无'}</span>
                <span className="ledger-entry-main"><LedgerIcon icon={category?.icon ?? 'circle-dollar-sign'} /><span>{category?.name ?? '未知类型'}{entry.memo ? ` -- ${entry.memo}` : ''}</span></span>
                <strong className={entry.type === 'income' ? 'income-amount' : 'expense-amount'}>{formatSignedAmount(entry)}</strong>
              </button>
            );
          })}
        </section>
      ))}
      {byDate.length === 0 && <EmptyText>暂无内容</EmptyText>}
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          {menu.actions.map((action) => (
            <button key={action.label} className={action.danger ? 'danger' : ''} onClick={() => { action.run(); setMenu(undefined); }}>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LedgerPersonDetails({ state, entries, onSelect }: { state: AppState; entries: LedgerEntry[]; onSelect: (id: string) => void }) {
  const summary = summarizeLedger(entries);
  const name = entries[0] ? state.ledgerPeople.find((person) => person.id === entries[0].personId)?.name ?? '无' : '无';
  return (
    <div className="editor">
      <h2>{name} 明细</h2>
      <div className="metric-grid ledger-metrics"><Metric label="收入" value={summary.income} /><Metric label="支出" value={summary.expense} /><Metric label="结余" value={summary.balance} /></div>
      <div className="stack-list">{entries.map((entry) => {
        const category = state.ledgerCategories.find((item) => item.id === entry.categoryId);
        return <button key={entry.id} className="list-row" type="button" onClick={() => onSelect(entry.id)}><span>{category?.name ?? '未知类型'}{entry.memo ? ` -- ${entry.memo}` : ''}</span><small>{entry.date.slice(0, 10)} {formatSignedAmount(entry)}</small></button>;
      })}</div>
    </div>
  );
}

function AmountCalculator({ value, onConfirm, onCancel }: { value: number; onConfirm: (value: number) => void; onCancel: () => void }) {
  const [expression, setExpression] = useState(String(value || ''));
  const buttons = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '⌫', '+'];

  function append(token: string) {
    if (token === '⌫') {
      setExpression((current) => current.slice(0, -1));
      return;
    }
    setExpression((current) => `${current}${token}`);
  }

  async function confirm() {
    const amount = calculateAmount(expression);
    if (amount === undefined) {
      await appAlert('金额格式不正确。');
      return;
    }
    onConfirm(amount);
  }

  return (
    <div className="calculator-popover">
      <input value={expression} onChange={(event) => setExpression(event.target.value)} autoFocus />
      <div className="calculator-grid">
        {buttons.map((button) => <button key={button} type="button" onClick={() => append(button)}>{button}</button>)}
      </div>
      <div className="calculator-actions">
        <button className="toolbar-button" type="button" onClick={() => setExpression('')}>清空</button>
        <button className="toolbar-button" type="button" onClick={onCancel}>取消</button>
        <button className="toolbar-button active" type="button" onClick={() => void confirm()}>确认</button>
      </div>
    </div>
  );
}

function calculateAmount(expression: string): number | undefined {
  const input = expression.trim();
  if (!input || !/^[\d+\-*/. ()]+$/.test(input)) return undefined;
  try {
    const result = Function(`"use strict"; return (${input})`)();
    if (typeof result !== 'number' || !Number.isFinite(result) || result <= 0) return undefined;
    return Math.round(result * 100) / 100;
  } catch {
    return undefined;
  }
}

function CalendarPanel({ state, setState, targetDate }: StatePanelProps & { targetDate?: string }) {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [view, setView] = useState<'week' | 'month'>('month');
  const days = makeCalendarDays(selectedDate, view);
  const showLunar = state.showLunarCalendar ?? true;

  useEffect(() => {
    if (targetDate) setSelectedDate(targetDate);
  }, [targetDate]);

  function addSchedule() {
    const item = { ...createScheduleItem(), date: `${selectedDate}T00:00:00` };
    setState((current) => ({ ...current, schedules: [item, ...current.schedules] }));
  }

  function updateSchedule(id: string, patch: Partial<ScheduleItem>) {
    setState((current) => ({ ...current, schedules: current.schedules.map((item) => (item.id === id ? touch({ ...item, ...patch }) : item)) }));
  }

  async function deleteSchedule(id: string) {
    if (!(await confirmDelete('这个特殊日程'))) return;
    setState((current) => ({ ...current, schedules: current.schedules.filter((item) => item.id !== id) }));
  }

  return (
    <div className="calendar-panel">
      <section className="panel calendar-main">
        <div className="pane-header"><h1>日程表</h1><div className="toolbar"><label className="inline-label">显示方式<select value={view} onChange={(event) => setView(event.target.value as typeof view)}><option value="week">周</option><option value="month">月</option></select></label><label className="inline-label"><input type="checkbox" checked={showLunar} onChange={(event) => setState((current) => ({ ...current, showLunarCalendar: event.target.checked }))} />农历</label><input type="date" value={selectedDate} onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }} /><button className="toolbar-button" type="button" onClick={() => setSelectedDate(todayIso())}>今天</button><ToolbarButton className="primary-action" onClick={addSchedule}><Plus size={16} />标记特殊日子</ToolbarButton></div></div>
        <div className="calendar-weekdays">{WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}</div>
        <div className={['calendar-grid', view === 'week' ? 'week-scroll-calendar' : 'month-scroll-calendar'].join(' ')}>{days.map((day) => { const date = toLocalDateKey(day); const specials = state.schedules.filter((item) => isScheduleOnDate(item.date, item.repeat, date)); const special = specials[0]; return <button key={date} className={date === selectedDate ? 'calendar-cell active' : 'calendar-cell'} onClick={() => setSelectedDate(date)}><strong>{date.slice(5)}</strong>{showLunar && <small>{formatLunarDate(day)}</small>}{specials.length > 0 && <span>{specials.length} 项</span>}{special && <em>{special.title}</em>}</button>; })}</div>
      </section>
      <section className="panel calendar-side">
        <h2>{selectedDate} 事项</h2>
        <h2>特殊日程</h2>
        <div className="stack-list">{state.schedules.filter((item) => isScheduleOnDate(item.date, item.repeat, selectedDate)).map((item) => <div key={item.id} className="schedule-editor"><input value={item.title} maxLength={16} onChange={(event) => updateSchedule(item.id, { title: event.target.value.slice(0, 16) })} /><select value={item.repeat} onChange={(event) => updateSchedule(item.id, { repeat: event.target.value as ScheduleItem['repeat'] })}><option value="none">不重复</option><option value="monthlySolar">国历每月</option><option value="yearlySolar">国历每年</option><option value="monthlyLunar">农历每月</option><option value="yearlyLunar">农历每年</option></select><button className="toolbar-button danger-action" onClick={() => void deleteSchedule(item.id)}>删除</button></div>)}</div>
      </section>
    </div>
  );
}

function AccountPanelV2({ state, setState }: StatePanelProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');

  async function savePassword() {
    setMessage('');
    if (newPassword.length < 6) {
      setMessage('新密码至少 6 位。');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('两次输入的新密码不一致。');
      return;
    }
    if (state.passwordHash) {
      const currentHash = await hashPassword(currentPassword);
      if (currentHash !== state.passwordHash) {
        setMessage('当前密码不正确。');
        return;
      }
    }

    const passwordHash = await hashPassword(newPassword);
    setState((current) => ({ ...current, passwordHash, passwordUpdatedAt: new Date().toISOString() }));
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMessage('密码已更新。');
  }

  return (
    <section className="panel full-panel">
      <h1>账号</h1>
      <div className="settings-grid">
        <label>
          显示名称
          <input value={state.displayName} onChange={(event) => setState((current) => ({ ...current, displayName: event.target.value }))} />
        </label>
        <div>
          <span>密码状态</span>
          <strong>{state.passwordHash ? '已设置' : '未设置'}</strong>
          {state.passwordUpdatedAt && <small>{formatDateTime(state.passwordUpdatedAt)}</small>}
        </div>
      </div>
      <div className="password-panel">
        {state.passwordHash && <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="当前密码" />}
        <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="新密码，至少 6 位" />
        <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="确认新密码" />
        <button className="toolbar-button" onClick={savePassword}>保存密码</button>
        {message && <p className="muted">{message}</p>}
      </div>
    </section>
  );
}

interface SettingsPanelProps extends StatePanelProps {
  cloudRuntime: { passphrase: string };
  setCloudRuntime: Dispatch<SetStateAction<{ passphrase: string }>>;
  mobileApp?: boolean;
  onSyncRefresh: () => Promise<void>;
  cloudSyncing: boolean;
}

function SettingsPanelV2({ state, setState, cloudRuntime, setCloudRuntime, mobileApp = false, onSyncRefresh, cloudSyncing }: SettingsPanelProps) {
  const text = useText();
  const [dataStatus, setDataStatus] = useState<DataStoreStatus | undefined>();
  const [dataMessage, setDataMessage] = useState('');
  const [themeName, setThemeName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(state.ledgerCategories[0]?.id);
  const [categoryDraft, setCategoryDraft] = useState<{ name: string; type: LedgerEntryType } | undefined>();
  const [cloudMessage, setCloudMessage] = useState('');
  const [clipboardShortcutDraft, setClipboardShortcutDraft] = useState(state.clipboardShortcut ?? 'Ctrl+E');

  async function refreshDataStatus() {
    const status = await window.assistantApp?.data?.status();
    setDataStatus(status);
  }

  async function chooseDataStoreDirectory() {
    const directory = await window.assistantApp?.file?.chooseDirectory();
    if (!directory) {
      if (!window.assistantApp?.file) await appAlert('浏览器预览环境不能设置本地数据目录，请在桌面端使用。');
      return;
    }
    const status = await window.assistantApp?.data?.setDirectory?.(directory, JSON.stringify(state));
    setDataStatus(status);
    setDataMessage('本地数据保存目录已更新。');
  }

  async function clearDataStoreDirectory() {
    const status = await window.assistantApp?.data?.clearDirectory?.(JSON.stringify(state));
    setDataStatus(status);
    setDataMessage('已恢复默认本地数据目录。');
  }

  async function updateLaunchAtLogin(enabled: boolean) {
    if (!window.assistantApp?.appSettings) {
      await appAlert('浏览器预览环境不能设置开机自启动，请在桌面端使用。');
      return;
    }
    const actual = await window.assistantApp.appSettings.setLaunchAtLogin(enabled);
    setState((current) => ({ ...current, launchAtLogin: actual }));
  }

  function exportBackup() {
    downloadBlob(`Private Memos备份-${todayIso()}.json`, buildStateBackup(state), 'application/json;charset=utf-8');
    setDataMessage('备份已导出。');
  }

  function importBackup(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setState(parseStateBackup(String(reader.result ?? '')));
        setDataMessage('备份已导入。');
      } catch {
        setDataMessage('备份文件格式不正确。');
      }
    };
    reader.readAsText(file);
  }

  function updateTheme(patch: Partial<ThemePayload>) {
    setState((current) => ({ ...current, ...patch }));
  }

  function applyThemeSelection(value: string) {
    if (value === '暗黄' || value === '深色+黄') {
      setState((current) => ({ ...current, theme: 'amber', activeThemeName: '', ...themePalettes.amber }));
      return;
    }
    const savedTheme = (state.savedThemes ?? []).find((theme) => theme.name === value);
    if (savedTheme) {
      setState((current) => ({ ...current, ...savedTheme, activeThemeName: savedTheme.name }));
      return;
    }
    const theme = value as AppState['theme'];
    setState((current) => ({ ...current, theme, activeThemeName: '', ...themePalettes[theme] }));
  }

  async function saveThemePreset() {
    const name = themeName.trim();
    if (!name) {
      await appAlert('请输入新主题名称。');
      return;
    }
    const preset: ThemePreset = {
      name,
      theme: state.theme,
      themeAccent: themeValue(state, 'themeAccent'),
      themeBackground: themeValue(state, 'themeBackground'),
      themeForeground: themeValue(state, 'themeForeground'),
      uiFont: themeValue(state, 'uiFont'),
      contrast: themeValue(state, 'contrast'),
      uiFontSize: themeValue(state, 'uiFontSize')
    };
    setState((current) => ({ ...current, savedThemes: [preset, ...(current.savedThemes ?? []).filter((item) => item.name !== name)], activeThemeName: name }));
    setThemeName('');
  }

  function currentThemeSelection() {
    return builtInThemeNames.has(state.activeThemeName ?? '') ? 'amber' : state.activeThemeName || state.theme;
  }

  async function chooseDefaultExportDirectory() {
    const directory = await window.assistantApp?.file?.chooseDirectory();
    if (!directory) {
      if (!window.assistantApp?.file) await appAlert('浏览器预览环境不能选择固定本地目录，请在桌面端使用。');
      return;
    }
    setState((current) => ({ ...current, defaultExportDirectory: directory }));
  }

  async function chooseClipboardSaveDirectory() {
    const directory = await window.assistantApp?.clipboard?.chooseDirectory?.() ?? await window.assistantApp?.file?.chooseDirectory?.();
    if (!directory) {
      if (!window.assistantApp?.clipboard && !window.assistantApp?.file) await appAlert('浏览器预览环境不能选择固定本地目录，请在桌面端使用。');
      return;
    }
    setState((current) => ({ ...current, clipboardSaveDirectory: directory, clipboardLastError: '' }));
  }

  function saveClipboardShortcut() {
    const shortcut = clipboardShortcutDraft.trim() || 'Ctrl+E';
    setClipboardShortcutDraft(shortcut);
    setState((current) => ({ ...current, clipboardShortcut: shortcut }));
  }

  function updateCloudRuntime(patch: Partial<typeof cloudRuntime>) {
    setCloudRuntime((current) => ({ ...current, ...patch }));
    if (patch.passphrase !== undefined) {
      setState((current) => ({ ...current, cloudSyncSavedPassphrase: patch.passphrase ?? '' }));
    }
  }

  async function addFinanceCategory() {
    const name = await appPrompt('类目名称', { title: '新建类目' });
    if (!name?.trim()) return;
    const type = await appConfirm('确定创建为收入类目吗？取消则创建为支出类目。', { title: '类目类型', confirmLabel: '收入', cancelLabel: '支出' }) ? 'income' : 'expense';
    setCategoryDraft({ name: name.trim(), type });
  }

  function confirmFinanceCategory(icon: string) {
    if (!categoryDraft) return;
    const category = createLedgerCategory(categoryDraft.name, icon, categoryDraft.type);
    setState((current) => ({ ...current, ledgerCategories: [category, ...current.ledgerCategories] }));
    setSelectedCategoryId(category.id);
    setCategoryDraft(undefined);
  }

  async function renameFinanceCategory() {
    const category = state.ledgerCategories.find((item) => item.id === selectedCategoryId);
    if (!category) return;
    const name = await appPrompt('类目名称', { title: '修改类目名称', defaultValue: category.name });
    if (!name?.trim()) return;
    setState((current) => ({
      ...current,
      ledgerCategories: current.ledgerCategories.map((item) => (item.id === category.id ? touch({ ...item, name: name.trim() }) : item))
    }));
  }

  async function deleteFinanceCategory() {
    const category = state.ledgerCategories.find((item) => item.id === selectedCategoryId);
    if (!category) return;
    if (!(await appConfirm('删除会让已记账项目类目变为未知类型，请问是否删除？', { title: '删除类目确认', confirmLabel: '继续删除', danger: true }))) return;
    if (!state.passwordHash) {
      await appAlert('请先在账号模块设置密码。');
      return;
    }
    const password = await appPrompt('请输入密码确认删除当前类目', { title: '密码确认', inputType: 'password', confirmLabel: '确认删除' });
    if (!password) return;
    if (await hashPassword(password) !== state.passwordHash) {
      await appAlert('密码不正确。');
      return;
    }
    setState((current) => ({ ...current, ledgerCategories: current.ledgerCategories.filter((item) => item.id !== category.id) }));
    setSelectedCategoryId(state.ledgerCategories.find((item) => item.id !== category.id)?.id);
  }

  return (
    <section className="panel full-panel">
      <h1>设置</h1>
      {!mobileApp && <div className="theme-config">
        <div className="theme-row theme-title-row">
          <span>深色主题</span>
          <div className="toolbar">
            <input className="theme-name-input" value={themeName} onChange={(event) => setThemeName(event.target.value)} placeholder="输入新主题名称" />
            <button className="toolbar-button" type="button" onClick={() => void saveThemePreset()}>存为新主题</button>
            <select value={currentThemeSelection()} onChange={(event) => applyThemeSelection(event.target.value)}>
              <option value="system">系统</option>
              <option value="light">清爽</option>
              <option value="warm">暖色</option>
              <option value="dark">深色</option>
              <option value="amber">暗黄</option>
              {(state.savedThemes ?? [])
                .filter((theme) => !builtInThemeNames.has(theme.name))
                .map((theme) => <option key={theme.name} value={theme.name}>{theme.name}</option>)}
            </select>
          </div>
        </div>
        <label className="theme-row">
          <span>强调色</span>
          <ColorInput value={themeValue(state, 'themeAccent')} onChange={(value) => updateTheme({ themeAccent: value })} />
        </label>
        <label className="theme-row">
          <span>背景</span>
          <ColorInput value={themeValue(state, 'themeBackground')} onChange={(value) => updateTheme({ themeBackground: value })} />
        </label>
        <label className="theme-row">
          <span>前景</span>
          <ColorInput value={themeValue(state, 'themeForeground')} onChange={(value) => updateTheme({ themeForeground: value })} />
        </label>
        <label className="theme-row">
          <span>UI 字体</span>
          <input value={themeValue(state, 'uiFont')} onChange={(event) => updateTheme({ uiFont: event.target.value })} />
        </label>
        <label className="theme-row">
          <span>对比度</span>
          <input type="range" min={0} max={40} value={themeValue(state, 'contrast')} onChange={(event) => updateTheme({ contrast: Number(event.target.value) })} />
          <strong>{themeValue(state, 'contrast')}</strong>
        </label>
      </div>}
      <div className="theme-config">
        <label className="theme-row">
          <span><strong>UI 字号</strong><small>调整界面使用的基准字号</small></span>
          <input type="number" min={12} max={20} value={themeValue(state, 'uiFontSize')} onChange={(event) => updateTheme({ uiFontSize: Number(event.target.value) })} />
          <small>px</small>
        </label>
        <label className="theme-row">
          <span><strong>铃声选择</strong><small>用于提醒和倒计时结束弹窗</small></span>
          <select value={state.ringtone ?? 'chime'} onChange={(event) => setState((current) => ({ ...current, ringtone: event.target.value }))}>
            {ringtoneOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <button className="toolbar-button" type="button" onClick={() => playRingtone(state.ringtone)}>试听</button>
        </label>
        <label className="theme-row">
          <span><strong>{text.settings.languageTitle}</strong><small>{text.settings.languageHint}</small></span>
          <select value={state.language ?? 'zh-CN'} onChange={(event) => setState((current) => ({ ...current, language: event.target.value as LanguageCode }))}>
            {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div className="settings-grid">
        <div>
          <span>版本信息</span>
          <strong>{mobileApp ? '0.3.1 安卓同步版' : '0.3.1 桌面端supabase自动同步版本'}</strong>
        </div>
        {!mobileApp && <label>
          <span>开机自启动</span>
          <select value={state.launchAtLogin ? 'on' : 'off'} onChange={(event) => void updateLaunchAtLogin(event.target.value === 'on')}>
            <option value="off">关闭</option>
            <option value="on">开启</option>
          </select>
        </label>}
      </div>
      {!mobileApp && <section className="sync-panel export-path-settings">
        <h2>默认导出目录</h2>
        <div className="export-path-row">
          <strong>{state.defaultExportDirectory || '未设置'}</strong>
          <div className="toolbar">
            <button className="toolbar-button" type="button" onClick={() => void chooseDefaultExportDirectory()}>选择导出位置</button>
            {state.defaultExportDirectory && <button className="toolbar-button" type="button" onClick={() => setState((current) => ({ ...current, defaultExportDirectory: '' }))}>清除</button>}
          </div>
        </div>
        <small>桌面端导出功能会优先使用这里设置的文件夹；浏览器预览仍使用浏览器下载。</small>
      </section>}
      {!mobileApp && <section className="sync-panel export-path-settings">
        <h2>剪贴板保存目录</h2>
        <div className="export-path-row">
          <strong>{state.clipboardSaveDirectory || '未设置，桌面端会自动使用默认目录'}</strong>
          <div className="toolbar">
            <button className="toolbar-button" type="button" onClick={() => void chooseClipboardSaveDirectory()}>选择保存目录</button>
            {state.clipboardSaveDirectory && <button className="toolbar-button" type="button" onClick={() => setState((current) => ({ ...current, clipboardSaveDirectory: '' }))}>恢复默认</button>}
          </div>
        </div>
        <small>剪贴板集合会自动保存文字、链接和图片；图片保存为 PNG，文字和链接保存为 TXT。</small>
        {state.clipboardLastError && <small className="danger-text">{state.clipboardLastError}</small>}
      </section>}
      {!mobileApp && <section className="sync-panel export-path-settings">
        <h2>剪贴板快捷键</h2>
        <div className="export-path-row">
          <strong>{state.clipboardShortcut || 'Ctrl+E'}</strong>
          <div className="toolbar">
            <input className="inline-name-input" value={clipboardShortcutDraft} onChange={(event) => setClipboardShortcutDraft(event.target.value)} placeholder="Ctrl+E" />
            <button className="toolbar-button" type="button" onClick={saveClipboardShortcut}>保存快捷键</button>
          </div>
        </div>
        <small>按下快捷键会显示主窗口并打开剪贴板集合模块。</small>
        {state.clipboardShortcutLastError && <small className="danger-text">{state.clipboardShortcutLastError}</small>}
      </section>}
      <section className="sync-panel cloud-sync-settings">
        <div className="section-heading-row">
          <h2>云端同步</h2>
          <button className={cloudSyncing ? 'toolbar-button icon-only syncing' : 'toolbar-button icon-only'} type="button" aria-label="刷新同步" onClick={() => void onSyncRefresh()} disabled={cloudSyncing}>
            <RotateCcw size={16} />
          </button>
        </div>
        <p className="muted">只需要填写 Supabase URL、publishable key 和同步口令。电脑和手机使用同一个同步口令后，软件处于活跃状态时会自动逐条同步{mobileApp ? '。' : '，剪贴板集合仅保存在本机。'}</p>
        <div className="settings-grid">
          <label>
            <span>Supabase URL</span>
            <input value={state.cloudSyncUrl ?? ''} onChange={(event) => setState((current) => ({ ...current, cloudSyncUrl: event.target.value }))} placeholder="https://your-project-id.supabase.co" />
          </label>
          <label>
            <span>Publishable key</span>
            <input type="password" value={state.cloudSyncPublishableKey ?? ''} onChange={(event) => setState((current) => ({ ...current, cloudSyncPublishableKey: event.target.value }))} placeholder="粘贴 Supabase publishable key" />
          </label>
          <label>
            <span>同步口令</span>
            <input type="password" value={cloudRuntime.passphrase} onChange={(event) => updateCloudRuntime({ passphrase: event.target.value })} placeholder="电脑和手机填写同一个同步口令" />
            <small>同步口令只保存在本设备，不会上传；丢失后无法解密云端记录。</small>
          </label>
        </div>
        <div className="sync-status">
          <span>{cloudSyncing ? '正在同步...' : state.cloudSyncLastSyncedAt ? `上次自动同步：${formatDateTime(state.cloudSyncLastSyncedAt)}` : '填写完整后自动同步'}</span>
          {(cloudMessage || state.cloudSyncLastError) && <small>{cloudMessage || state.cloudSyncLastError}</small>}
        </div>
      </section>
      <section className="sync-panel finance-type-settings">
        <h2>财务类型设置</h2>
        <div className="toolbar">
          <button className="toolbar-button" type="button" onClick={() => void addFinanceCategory()}>新建类目</button>
          <button className="toolbar-button" type="button" onClick={() => void renameFinanceCategory()}>修改类目名称</button>
          <button className="toolbar-button danger-action" type="button" onClick={() => void deleteFinanceCategory()}>删除当前类目</button>
        </div>
        <div className="category-grid">
          {state.ledgerCategories.map((category) => (
            <button key={category.id} type="button" className={category.id === selectedCategoryId ? 'category-button active' : 'category-button'} onClick={() => setSelectedCategoryId(category.id)}>
              <LedgerIcon icon={category.icon} />
              <span>{category.name}</span>
              <small>{category.type === 'income' ? '收入' : '支出'}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="sync-panel">
        <h2>本地数据</h2>
        <div className="toolbar">
          {!mobileApp && <button className="toolbar-button" onClick={refreshDataStatus}>刷新保存位置</button>}
          {!mobileApp && <button className="toolbar-button" onClick={() => void chooseDataStoreDirectory()}>设置保存目录</button>}
          {!mobileApp && dataStatus?.customDirectory && <button className="toolbar-button" onClick={() => void clearDataStoreDirectory()}>恢复默认目录</button>}
          {!mobileApp && <button className="toolbar-button" onClick={exportBackup}>导出备份</button>}
          <label className="toolbar-button file-button">
            导入备份
            <input type="file" accept="application/json,.json" onChange={(event) => { importBackup(event.target.files?.[0]); event.currentTarget.value = ''; }} />
          </label>
        </div>
        <div className="sync-status">
          <span>{mobileApp ? '手机端使用 App 私有存储' : dataStatus?.exists ? '已保存' : '等待桌面端保存'}</span>
          <strong>{mobileApp ? '数据保存在当前安卓应用内，卸载应用会清除本地数据。' : dataStatus?.path ?? '浏览器预览使用 localStorage；Electron 桌面端使用 JSON 文件。'}</strong>
          {dataMessage && <small>{dataMessage}</small>}
        </div>
      </section>
      {categoryDraft && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-label="选择类目图标">
            <h2>选择类目图标</h2>
            <p className="muted">{categoryDraft.name}</p>
            <div className="category-grid icon-picker-grid">
              {Object.keys(ledgerIconMap).map((icon) => (
                <button key={icon} className="category-button" type="button" onClick={() => confirmFinanceCategory(icon)}>
                  <LedgerIcon icon={icon} />
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="toolbar-button" type="button" onClick={() => setCategoryDraft(undefined)}>取消</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
function SplitPanel({ title, actions, list, editor, className = '' }: { title: string; actions: ReactNode; list: ReactNode; editor: ReactNode; className?: string }) {
  return <div className={['split-panel', className].join(' ')}><section className="list-pane"><div className="pane-header"><h1>{title}</h1>{actions}</div>{list}</section><section className="editor-pane">{editor}</section></div>;
}

function MobileItemDetail({ title, meta, actions, onEdit }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; onEdit: () => void }) {
  return (
    <div className="mobile-item-detail">
      <strong>{title}</strong>
      {meta && <small>{meta}</small>}
      <div className="toolbar">
        <button className="toolbar-button active" type="button" onClick={onEdit}>编辑</button>
        {actions}
      </div>
    </div>
  );
}

function DatedList<T extends { id: string; createdAt: string; updatedAt: string }>({
  items,
  selectedId,
  labelOf,
  leadingOf,
  trailingOf,
  inlineActionsOf,
  onSelect,
  view,
  contextActions
}: {
  items: T[];
  selectedId?: string;
  labelOf: (item: T) => ReactNode;
  leadingOf?: (item: T) => ReactNode;
  trailingOf?: (item: T) => ReactNode;
  inlineActionsOf?: (item: T) => ReactNode;
  onSelect: (id: string) => void;
  view: ViewMode;
  contextActions?: (item: T) => ContextAction[];
}) {
  if (view === 'list' && contextActions) return <SimpleListWithContext items={items} selectedId={selectedId} labelOf={labelOf} metaOf={(item) => formatDateTime(item.createdAt)} urgentOf={isHighlightedItem} leadingOf={leadingOf} trailingOf={trailingOf} inlineActionsOf={inlineActionsOf} onSelect={onSelect} contextActions={contextActions} />;
  if (view === 'list') return <SimpleList items={items} selectedId={selectedId} labelOf={labelOf} metaOf={(item) => formatDateTime(item.createdAt)} urgentOf={isHighlightedItem} onSelect={onSelect} />;
  return <div className="date-buckets">{groupByView(items, view).map((bucket) => <button key={bucket.date} className="date-bucket" onClick={() => onSelect(bucket.items[0].id)}><strong>{bucket.date}</strong><span>{bucket.items.length} 条记录</span></button>)}</div>;
}

function isHighlightedItem(item: unknown) {
  return Boolean(item && typeof item === 'object' && 'highlighted' in item && item.highlighted);
}

function SimpleList<T extends { id: string }>({ items, selectedId, labelOf, metaOf, urgentOf, doneOf, onSelect }: { items: T[]; selectedId?: string; labelOf: (item: T) => ReactNode; metaOf?: (item: T) => string; urgentOf?: (item: T) => boolean; doneOf?: (item: T) => boolean; onSelect: (id: string) => void }) {
  return <div className="stack-list">{items.map((item) => <button key={item.id} className={['list-row', selectedId === item.id ? 'active' : '', urgentOf?.(item) ? 'urgent' : '', doneOf?.(item) ? 'done' : ''].join(' ')} onClick={() => onSelect(item.id)} onDoubleClick={() => onSelect(item.id)}><span>{labelOf(item)}</span>{metaOf && <small>{metaOf(item)}</small>}</button>)}{items.length === 0 && <EmptyText>暂无内容</EmptyText>}</div>;
}

interface ContextAction {
  label: string;
  run: () => void;
  danger?: boolean;
}

function SimpleListWithContext<T extends { id: string }>({
  items,
  selectedId,
  labelOf,
  metaOf,
  detailOf,
  urgentOf,
  pinnedOf,
  doneOf,
  leadingOf,
  trailingOf,
  inlineActionsOf,
  onSelect,
  contextActions
}: {
  items: T[];
  selectedId?: string;
  labelOf: (item: T) => ReactNode;
  metaOf?: (item: T) => string;
  detailOf?: (item: T) => ReactNode;
  urgentOf?: (item: T) => boolean;
  pinnedOf?: (item: T) => boolean;
  doneOf?: (item: T) => boolean;
  leadingOf?: (item: T) => ReactNode;
  trailingOf?: (item: T) => ReactNode;
  inlineActionsOf?: (item: T) => ReactNode;
  onSelect: (id: string) => void;
  contextActions: (item: T) => ContextAction[];
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; actions: ContextAction[] } | undefined>();

  function openMenu(event: MouseEvent, item: T) {
    event.preventDefault();
    onSelect(item.id);
    setMenu({ x: event.clientX, y: event.clientY, actions: contextActions(item) });
  }

  return (
    <div className="stack-list" onClick={() => setMenu(undefined)}>
      {items.map((item) => (
        <button
          key={item.id}
          className={['list-row', selectedId === item.id ? 'active' : '', pinnedOf?.(item) ? 'pinned' : '', urgentOf?.(item) ? 'urgent' : '', doneOf?.(item) ? 'done' : ''].join(' ')}
          onClick={() => onSelect(item.id)}
          onDoubleClick={() => onSelect(item.id)}
          onContextMenu={(event) => openMenu(event, item)}
        >
          {leadingOf && <span className="list-leading">{leadingOf(item)}</span>}
          <span className="list-main-text">{labelOf(item)}</span>
          {metaOf && <small>{metaOf(item)}</small>}
          {selectedId === item.id && detailOf?.(item)}
          {selectedId === item.id && inlineActionsOf?.(item) && <span className="mobile-inline-actions" onClick={(event) => event.stopPropagation()}>{inlineActionsOf(item)}</span>}
          {trailingOf && <span className="list-trailing">{trailingOf(item)}</span>}
        </button>
      ))}
      {items.length === 0 && <EmptyText>暂无内容</EmptyText>}
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          {menu.actions.map((action) => (
            <button
              key={action.label}
              className={action.danger ? 'danger' : ''}
              onClick={() => {
                action.run();
                setMenu(undefined);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleActions({ view, setView, onAdd }: { view: ViewMode; setView: (view: ViewMode) => void; onAdd: () => void }) {
  return <div className="toolbar"><select value={view} onChange={(event) => setView(event.target.value as ViewMode)}><option value="list">列表</option><option value="week">周</option><option value="month">月</option></select><IconButton label="新建" onClick={onAdd} icon={Plus} /></div>;
}

function IconButton({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: typeof Plus }) {
  return <button className="icon-button" type="button" onClick={onClick} title={label} aria-label={label}><Icon size={17} /></button>;
}

function ToolbarButton({ children, active, className = '', onClick }: { children: ReactNode; active?: boolean; className?: string; onClick: () => void }) {
  return <button className={['toolbar-button', active ? 'active' : '', className].join(' ')} type="button" onClick={onClick}>{children}</button>;
}

function ColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <span className="color-input">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} aria-label="选择颜色" />
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const displayValue = label === '支出' ? formatExpenseNumber(value) : Math.round(value * 100) / 100;
  return <div className="metric"><strong>{displayValue}</strong><span>{label}</span></div>;
}

function formatExpenseNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? `-${rounded}` : String(rounded);
}

function summarizeLedgerByPerson(state: AppState, entries: LedgerEntry[]) {
  const totals = new Map<string, { id: string; name: string; income: number; expense: number }>();
  for (const entry of entries) {
    const person = state.ledgerPeople.find((item) => item.id === entry.personId);
    const current = totals.get(entry.personId) ?? { id: entry.personId, name: person?.name ?? '无', income: 0, expense: 0 };
    current[entry.type] += entry.amount;
    totals.set(entry.personId, current);
  }
  return [...totals.values()].sort((a, b) => b.income + b.expense - (a.income + a.expense));
}

function formatSignedAmount(entry: LedgerEntry) {
  const value = Math.round(entry.amount * 100) / 100;
  return `${entry.type === 'income' ? '+' : '-'}${value}`;
}

function LedgerIcon({ icon }: { icon: string }) {
  const Icon = ledgerIconMap[icon] ?? CircleDollarSign;
  return <Icon size={24} strokeWidth={1.9} />;
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

function makeCalendarDays(selectedDate: string, view: 'week' | 'month') {
  const base = new Date(`${selectedDate}T00:00:00`);
  const start = new Date(base);
  if (view === 'week') {
    start.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }
  start.setDate(1);
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), index + 1));
}

function exportDoc(title: string, body: string) {
  downloadBlob(`${safeFileName(title)}.docx`, buildDocx(title, body), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

async function exportFiles(files: Array<{ filename: string; content: Uint8Array }>, type: string, directory?: string) {
  if (window.assistantApp?.file?.saveFiles) {
    const result = await window.assistantApp.file.saveFiles(files, directory);
    if (!result.canceled) await appAlert(`已导出 ${result.paths.length} 个文件。`);
    return;
  }
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<{ getFileHandle: (name: string, options: { create: boolean }) => Promise<{ createWritable: () => Promise<{ write: (blob: Blob) => Promise<void>; close: () => Promise<void> }> }> }> }).showDirectoryPicker;
  if (picker) {
    try {
      const directory = await picker();
      for (const file of files) {
        const handle = await directory.getFileHandle(file.filename, { create: true });
        const writable = await handle.createWritable();
        await writable.write(new Blob([file.content.buffer.slice(file.content.byteOffset, file.content.byteOffset + file.content.byteLength) as ArrayBuffer], { type }));
        await writable.close();
      }
      return;
    } catch {
      return;
    }
  }
  for (const file of files) {
    downloadBlob(file.filename, file.content, type);
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const embeddedImagePattern = /!\[图片]\((data:image\/[^)]+)\)/g;

function extractEmbeddedImages(body: string) {
  return [...body.matchAll(embeddedImagePattern)].map((match) => match[1]);
}

function stripEmbeddedImages(body: string) {
  return body.replace(embeddedImagePattern, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

function mergeNoteTextAndImages(text: string, previousBody: string) {
  const images = extractEmbeddedImages(previousBody);
  const normalizedText = text.replace(/\r\n/g, '\n');
  if (images.length === 0) return normalizedText;
  const imageLines = images.map((src) => `![图片](${src})`).join('\n');
  return normalizedText ? `${normalizedText.replace(/\n+$/g, '')}\n${imageLines}` : imageLines;
}

function removeEmbeddedImageAt(body: string, index: number) {
  const images = extractEmbeddedImages(body).filter((_, itemIndex) => itemIndex !== index);
  const text = stripEmbeddedImages(body).replace(/\n+$/g, '');
  if (images.length === 0) return text;
  const imageLines = images.map((src) => `![图片](${src})`).join('\n');
  return text ? `${text}\n${imageLines}` : imageLines;
}

function stripEmbeddedImageLines(body: string) {
  return stripEmbeddedImages(body);
}

function NoteImageStrip({ body, onOpen, onDelete }: { body: string; onOpen: (src: string) => void; onDelete?: (index: number) => void }) {
  const images = extractEmbeddedImages(body);
  if (images.length === 0) return null;
  return (
    <div className="note-image-strip">
      {images.map((src, index) => (
        <button key={`${src.slice(0, 32)}-${index}`} type="button" onClick={() => onOpen(src)}>
          <img src={src} alt={`笔记图片 ${index + 1}`} />
          {onDelete && <span className="note-image-delete" role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onDelete(index); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); onDelete(index); } }}>删除</span>}
        </button>
      ))}
    </div>
  );
}

function renderNotePreview(body: string) {
  const parts = body.split(/(!\[图片]\(data:image\/[^)]+\))/g).filter(Boolean);
  return parts.map((part, index) => {
    const image = /^!\[图片]\((data:image\/[^)]+)\)$/.exec(part);
    if (image) return <img key={index} src={image[1]} alt="笔记图片" />;
    return <p key={index}>{part}</p>;
  });
}

function exportLedgerExcel(state: AppState, entries: LedgerEntry[]) {
  const rows = entries.map((entry) => [
    entry.date.slice(0, 10),
    state.ledgerBooks.find((book) => book.id === entry.bookId)?.name ?? '',
    entry.type === 'income' ? '收入' : '支出',
    state.ledgerCategories.find((category) => category.id === entry.categoryId)?.name ?? '',
    state.ledgerPeople.find((person) => person.id === entry.personId)?.name ?? '',
    String(entry.amount),
    entry.memo
  ]);
  const tableRows = [['日期', '账本', '类型', '类目', '对象', '金额', '备注'], ...rows]
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  const html = `<html><head><meta charset="utf-8"></head><body><table>${tableRows}</table></body></html>`;
  downloadBlob('账本导出.xls', html, 'application/vnd.ms-excel;charset=utf-8');
}

function downloadBlob(filename: string, content: string | Uint8Array, type: string) {
  const blobContent = typeof content === 'string' ? content : content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
  const blob = new Blob([blobContent], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function safeFileName(value: string) {
  return (value || '导出').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
}

async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface StatePanelProps {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}

