import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  Bell,
  BookLock,
  CalendarDays,
  CheckSquare,
  Copy,
  FileText,
  Home,
  Landmark,
  Lock,
  Plus,
  Search,
  Settings,
  Star,
  Unlock,
  User
} from 'lucide-react';
import { formatDateTime, groupByDate } from './domain/date';
import {
  createFocusNote,
  createNote,
  createPrivateNote,
  createReminder,
  createStep,
  createTask,
  loadState,
  saveState,
  touch
} from './domain/store';
import {
  getMonthSchedules,
  getOpenTasks,
  getUpcomingWeekTasks,
  getTodayReminders,
  getYesterdaySummary,
  searchState,
  shouldHighlightLimitedTask
} from './domain/selectors';
import type { AppState, ModuleKey, PrivateNote, QuickNote, Reminder, Task, TaskType, ViewMode } from './domain/types';

const modules: Array<{ key: ModuleKey; label: string; icon: typeof Home }> = [
  { key: 'home', label: '首页', icon: Home },
  { key: 'notes', label: '记事', icon: FileText },
  { key: 'privateNotes', label: '私人笔记', icon: BookLock },
  { key: 'reminders', label: '提醒', icon: Bell },
  { key: 'tasks', label: '任务', icon: CheckSquare },
  { key: 'ledger', label: '记账', icon: Landmark },
  { key: 'calendar', label: '日程表', icon: CalendarDays },
  { key: 'settings', label: '设置', icon: Settings },
  { key: 'account', label: '账号', icon: User }
];

export function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [activeModule, setActiveModule] = useState<ModuleKey>('home');
  const [globalQuery, setGlobalQuery] = useState('');

  useEffect(() => saveState(state), [state]);

  const globalResults = useMemo(() => searchState(state, globalQuery), [state, globalQuery]);

  return (
    <div className="app-shell" style={{ fontSize: `${state.fontScale}rem` }}>
      <header className="topbar">
        <div className="brand-stack">
          <div className="brand">Private Memos</div>
          <div className="brand-version">version:0.1.0</div>
        </div>
        <label className="global-search">
          <Search size={18} />
          <input
            value={globalQuery}
            onChange={(event) => setGlobalQuery(event.target.value)}
            placeholder="全局搜索"
            aria-label="全局搜索"
          />
        </label>
        <div className="account-pill">{state.displayName}</div>
      </header>

      {globalResults.length > 0 && (
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
        <nav className="sidebar" aria-label="主模块">
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={activeModule === item.key ? 'nav-item active' : 'nav-item'}
                onClick={() => setActiveModule(item.key)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <section className="workspace">
          {activeModule === 'home' && <HomePanel state={state} setState={setState} setActiveModule={setActiveModule} />}
          {activeModule === 'notes' && <NotesPanel state={state} setState={setState} />}
          {activeModule === 'privateNotes' && <PrivateNotesPanel state={state} setState={setState} />}
          {activeModule === 'reminders' && <RemindersPanel state={state} setState={setState} />}
          {activeModule === 'tasks' && <TasksPanel state={state} setState={setState} />}
          {activeModule === 'settings' && <SettingsPanel state={state} setState={setState} />}
          {activeModule === 'account' && <AccountPanel state={state} setState={setState} />}
          {activeModule === 'ledger' && <Placeholder title="记账" body="第二阶段将实现多账本、收支类目、对象、汇总图表和 Excel 导出。" />}
          {activeModule === 'calendar' && <Placeholder title="日程表" body="第二阶段将实现周/月视图、农历、特殊日程和多模块事项聚合。" />}
        </section>
      </main>
    </div>
  );
}

function HomePanel({ state, setState, setActiveModule }: StatePanelProps & { setActiveModule: (module: ModuleKey) => void }) {
  const summary = getYesterdaySummary(state);
  const openTasks = getOpenTasks(state);
  const reminders = getTodayReminders(state);
  const upcomingWeekTasks = getUpcomingWeekTasks(state);
  const monthSchedules = getMonthSchedules(state);

  function addFocusNote() {
    const title = window.prompt('重点标题');
    if (!title?.trim()) return;
    const body = window.prompt('重点内容') ?? '';
    const note = createFocusNote(title.trim(), body.trim());
    setState((current) => ({ ...current, focusNotes: [note, ...current.focusNotes] }));
  }

  function editFocusNote(id: string) {
    const note = state.focusNotes.find((item) => item.id === id);
    if (!note) return;
    const title = window.prompt('重点标题', note.title);
    if (!title?.trim()) return;
    const body = window.prompt('重点内容', note.body) ?? note.body;
    setState((current) => ({
      ...current,
      focusNotes: current.focusNotes.map((item) => (item.id === id ? touch({ ...item, title: title.trim(), body: body.trim() }) : item))
    }));
  }

  function deleteFocusNote(id: string) {
    if (!window.confirm('确定删除这条重点笔记吗？此操作不能撤销。')) return;
    setState((current) => ({ ...current, focusNotes: current.focusNotes.filter((item) => item.id !== id) }));
  }

  return (
    <div className="dashboard">
      <section className="panel">
        <h1>昨日总结</h1>
        <div className="metric-grid">
          <Metric label="总更新" value={summary.total} />
          <Metric label="记事" value={summary.notes} />
          <Metric label="私人笔记" value={summary.privateNotes} />
          <Metric label="提醒" value={summary.reminders} />
          <Metric label="任务" value={summary.tasks} />
        </div>
      </section>

      <section className="panel">
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
      </section>

      <section className="panel">
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
      </section>

      <section className="panel warn-panel">
        <h2>需要关注</h2>
        <div className="stack-list">
          {upcomingWeekTasks.map((task) => (
            <button key={task.id} className="summary-row urgent" onClick={() => setActiveModule('tasks')}>
              <span>{task.title}</span>
              <small>{task.dueAt ? formatDateTime(task.dueAt) : '近一周内'}</small>
            </button>
          ))}
          {upcomingWeekTasks.length === 0 && <EmptyText>近一周没有任务</EmptyText>}
        </div>
      </section>
      <section className="panel focus-panel">
        <div className="pane-header"><h2>重点</h2><button className="toolbar-button" type="button" onClick={addFocusNote}>新增重点</button></div>
        <div className="stack-list">
          {state.focusNotes.map((note) => (
            <article key={note.id} className="focus-note">
              <button type="button" onClick={() => editFocusNote(note.id)}>
                <strong>{note.title}</strong>
                {note.body && <span>{note.body}</span>}
              </button>
              <button className="focus-delete" type="button" onClick={() => deleteFocusNote(note.id)}>删除</button>
            </article>
          ))}
          {state.focusNotes.length === 0 && <EmptyText>暂无重点笔记</EmptyText>}
        </div>
      </section>
      <section className="panel">
        <h2>本月关注</h2>
        <div className="stack-list">
          {monthSchedules.map((schedule) => (
            <button key={`${schedule.id}-${schedule.date}`} className="summary-row" onClick={() => setActiveModule('calendar')}>
              <span>{schedule.title}</span>
              <small>{schedule.date.slice(5)}</small>
            </button>
          ))}
          {monthSchedules.length === 0 && <EmptyText>本月没有特殊日程</EmptyText>}
        </div>
      </section>
    </div>
  );
}

function NotesPanel({ state, setState }: StatePanelProps) {
  const [selectedId, setSelectedId] = useState(state.notes[0]?.id);
  const [view, setView] = useState<ViewMode>('list');
  const selected = state.notes.find((note) => note.id === selectedId) ?? state.notes[0];

  function updateNote(id: string, patch: Partial<QuickNote>) {
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) => (note.id === id ? touch({ ...note, ...patch }) : note))
    }));
  }

  return (
    <SplitPanel
      title="记事"
      actions={<ModuleActions view={view} setView={setView} onAdd={() => setState((s) => ({ ...s, notes: [createNote(), ...s.notes] }))} />}
      list={<DatedList view={view} items={state.notes} selectedId={selected?.id} labelOf={(note) => note.body || '空记事'} onSelect={setSelectedId} />}
      editor={
        selected ? (
          <div className="editor">
            <ToolbarButton active={selected.highlighted} onClick={() => updateNote(selected.id, { highlighted: !selected.highlighted })}>
              <Star size={16} />
              高亮
            </ToolbarButton>
            <textarea
              value={selected.body}
              onChange={(event) => updateNote(selected.id, { body: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) event.currentTarget.blur();
              }}
              placeholder="输入记事正文"
            />
          </div>
        ) : (
          <EmptyText>新建一条记事后开始编辑</EmptyText>
        )
      }
    />
  );
}

function PrivateNotesPanel({ state, setState }: StatePanelProps) {
  const [selectedId, setSelectedId] = useState(state.privateNotes[0]?.id);
  const [view, setView] = useState<ViewMode>('list');
  const selected = state.privateNotes.find((note) => note.id === selectedId) ?? state.privateNotes[0];

  function updateNote(id: string, patch: Partial<PrivateNote>) {
    setState((current) => ({
      ...current,
      privateNotes: current.privateNotes.map((note) => (note.id === id ? touch({ ...note, ...patch }) : note))
    }));
  }

  return (
    <SplitPanel
      title="私人笔记"
      actions={<ModuleActions view={view} setView={setView} onAdd={() => setState((s) => ({ ...s, privateNotes: [createPrivateNote(), ...s.privateNotes] }))} />}
      list={
        <DatedList
          view={view}
          items={state.privateNotes}
          selectedId={selected?.id}
          labelOf={(note) => note.title || '无标题'}
          onSelect={setSelectedId}
        />
      }
      editor={
        selected ? (
          <div className="editor">
            <div className="editor-toolbar">
              <ToolbarButton active={selected.highlighted} onClick={() => updateNote(selected.id, { highlighted: !selected.highlighted })}>
                <Star size={16} />
                高亮
              </ToolbarButton>
              <ToolbarButton active={selected.locked} onClick={() => updateNote(selected.id, { locked: !selected.locked })}>
                {selected.locked ? <Lock size={16} /> : <Unlock size={16} />}
                {selected.locked ? '已锁定' : '未锁定'}
              </ToolbarButton>
            </div>
            <input
              value={selected.title}
              disabled={selected.locked}
              onChange={(event) => updateNote(selected.id, { title: event.target.value })}
              placeholder="标题"
            />
            <textarea
              value={selected.body}
              disabled={selected.locked}
              onChange={(event) => updateNote(selected.id, { body: event.target.value })}
              placeholder="正文"
            />
          </div>
        ) : (
          <EmptyText>新建一条私人笔记后开始编辑</EmptyText>
        )
      }
    />
  );
}

function RemindersPanel({ state, setState }: StatePanelProps) {
  const [selectedId, setSelectedId] = useState(state.reminders[0]?.id);
  const selected = state.reminders.find((reminder) => reminder.id === selectedId) ?? state.reminders[0];

  function updateReminder(id: string, patch: Partial<Reminder>) {
    setState((current) => ({
      ...current,
      reminders: current.reminders.map((reminder) => (reminder.id === id ? touch({ ...reminder, ...patch }) : reminder))
    }));
  }

  function copyReminder(reminder: Reminder) {
    const copy = { ...reminder, id: crypto.randomUUID(), memo: `${reminder.memo} 副本`.slice(0, 15), acknowledged: false };
    setState((current) => ({ ...current, reminders: [touch(copy), ...current.reminders] }));
    setSelectedId(copy.id);
  }

  return (
    <SplitPanel
      title="提醒"
      actions={<IconButton label="新建提醒" onClick={() => setState((s) => ({ ...s, reminders: [createReminder(), ...s.reminders] }))} icon={Plus} />}
      list={
        <SimpleList
          items={state.reminders}
          selectedId={selected?.id}
          labelOf={(item) => item.memo || '无备注提醒'}
          metaOf={(item) => formatDateTime(item.time)}
          onSelect={setSelectedId}
        />
      }
      editor={
        selected ? (
          <div className="editor">
            <div className="editor-toolbar">
              <ToolbarButton onClick={() => copyReminder(selected)}>
                <Copy size={16} />
                复制
              </ToolbarButton>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={selected.acknowledged}
                  onChange={(event) => updateReminder(selected.id, { acknowledged: event.target.checked })}
                />
                已处理
              </label>
            </div>
            <input
              type="datetime-local"
              value={selected.time.slice(0, 16)}
              onChange={(event) => updateReminder(selected.id, { time: new Date(event.target.value).toISOString() })}
            />
            <input
              value={selected.memo}
              maxLength={15}
              onChange={(event) => updateReminder(selected.id, { memo: event.target.value.slice(0, 15) })}
              placeholder="备注，最多 15 字"
            />
            <select value={selected.repeat} onChange={(event) => updateReminder(selected.id, { repeat: event.target.value as Reminder['repeat'] })}>
              <option value="none">不重复</option>
              <option value="daily">每日</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
              <option value="yearly">每年</option>
            </select>
          </div>
        ) : (
          <EmptyText>新建一个提醒后开始编辑</EmptyText>
        )
      }
    />
  );
}

function TasksPanel({ state, setState }: StatePanelProps) {
  const [selectedId, setSelectedId] = useState(state.tasks[0]?.id);
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const selected = state.tasks.find((task) => task.id === selectedId) ?? state.tasks[0];
  const visibleTasks = state.tasks.filter((task) => filter === 'all' || (filter === 'open' ? !task.completed : task.completed));

  function updateTask(id: string, patch: Partial<Task>) {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === id ? touch({ ...task, ...patch }) : task))
    }));
  }

  function copyTask(task: Task) {
    const copy = createTask({
      title: `${task.title} 副本`,
      type: task.type,
      dueAt: task.dueAt,
      remindHoursBefore: task.remindHoursBefore,
      steps: task.steps.map((step) => step.body)
    });
    setState((current) => ({ ...current, tasks: [copy, ...current.tasks] }));
    setSelectedId(copy.id);
  }

  function addTask(type: TaskType) {
    const task = createTask({ type, steps: [''] });
    setState((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    setSelectedId(task.id);
  }

  return (
    <SplitPanel
      title="任务"
      actions={
        <div className="toolbar">
          <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="open">未完成</option>
            <option value="done">已完成</option>
            <option value="all">所有</option>
          </select>
          <select onChange={(event) => addTask(event.target.value as TaskType)} value="">
            <option value="" disabled>
              新建任务
            </option>
            <option value="normal">普通任务</option>
            <option value="daily">每日任务</option>
            <option value="weekly">每周任务</option>
            <option value="monthly">每月任务</option>
            <option value="limited">限时任务</option>
          </select>
        </div>
      }
      list={
        <SimpleList
          items={visibleTasks}
          selectedId={selected?.id}
          labelOf={(task) => task.title}
          metaOf={(task) => (task.completed ? '已完成' : task.dueAt ? formatDateTime(task.dueAt) : task.type)}
          urgentOf={(task) => shouldHighlightLimitedTask(task)}
          doneOf={(task) => task.completed}
          onSelect={setSelectedId}
        />
      }
      editor={
        selected ? (
          <div className="editor">
            <div className="editor-toolbar">
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={selected.completed}
                  onChange={(event) =>
                    updateTask(selected.id, {
                      completed: event.target.checked,
                      completedAt: event.target.checked ? new Date().toISOString() : undefined
                    })
                  }
                />
                完成任务
              </label>
              <ToolbarButton onClick={() => copyTask(selected)}>
                <Copy size={16} />
                复制
              </ToolbarButton>
            </div>
            <input value={selected.title} onChange={(event) => updateTask(selected.id, { title: event.target.value })} placeholder="任务标题" />
            <select value={selected.type} onChange={(event) => updateTask(selected.id, { type: event.target.value as TaskType })}>
              <option value="normal">普通任务</option>
              <option value="daily">每日任务</option>
              <option value="weekly">每周任务</option>
              <option value="monthly">每月任务</option>
              <option value="limited">限时任务</option>
            </select>
            {selected.type === 'limited' && (
              <div className="form-grid">
                <input
                  type="datetime-local"
                  value={selected.dueAt?.slice(0, 16) ?? ''}
                  onChange={(event) => updateTask(selected.id, { dueAt: new Date(event.target.value).toISOString() })}
                />
                <input
                  type="number"
                  min={0}
                  value={selected.remindHoursBefore ?? ''}
                  onChange={(event) => updateTask(selected.id, { remindHoursBefore: Number(event.target.value) || undefined })}
                  placeholder="提前提醒小时"
                />
              </div>
            )}
            <div className="steps">
              {selected.steps.map((step, index) => (
                <label key={step.id} className="step-row">
                  <input
                    type="checkbox"
                    checked={step.completed}
                    onChange={(event) =>
                      updateTask(selected.id, {
                        steps: selected.steps.map((item) => (item.id === step.id ? { ...item, completed: event.target.checked } : item))
                      })
                    }
                  />
                  <input
                    value={step.body}
                    className={step.completed ? 'line-through' : ''}
                    onChange={(event) =>
                      updateTask(selected.id, {
                        steps: selected.steps.map((item) => (item.id === step.id ? { ...item, body: event.target.value } : item))
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        const steps = [...selected.steps];
                        steps.splice(index + 1, 0, createStep(''));
                        updateTask(selected.id, { steps });
                      }
                    }}
                    placeholder="小步骤"
                  />
                </label>
              ))}
            </div>
          </div>
        ) : (
          <EmptyText>新建一个任务后开始编辑</EmptyText>
        )
      }
    />
  );
}

function SettingsPanel({ state, setState }: StatePanelProps) {
  return (
    <section className="panel full-panel">
      <h1>设置</h1>
      <div className="settings-grid">
        <label>
          字体大小
          <input
            type="range"
            min={0.9}
            max={1.2}
            step={0.05}
            value={state.fontScale}
            onChange={(event) => setState((current) => ({ ...current, fontScale: Number(event.target.value) }))}
          />
        </label>
        <label>
          UI 风格
          <select value={state.theme} onChange={(event) => setState((current) => ({ ...current, theme: event.target.value as AppState['theme'] }))}>
            <option value="system">系统</option>
            <option value="light">清爽</option>
            <option value="warm">暖色</option>
            <option value="dark">深色</option>
            <option value="amber">暗黄</option>
            <option value="codex">Codex</option>
          </select>
        </label>
        <div>
          <span>版本信息</span>
          <strong>0.1.0 MVP</strong>
        </div>
      </div>
    </section>
  );
}

function AccountPanel({ state, setState }: StatePanelProps) {
  return (
    <section className="panel full-panel">
      <h1>账号</h1>
      <div className="settings-grid">
        <label>
          显示名称
          <input value={state.displayName} onChange={(event) => setState((current) => ({ ...current, displayName: event.target.value }))} />
        </label>
        <label>
          修改密码
          <input type="password" placeholder="本地 MVP 暂不保存密码明文" />
        </label>
      </div>
    </section>
  );
}

function SplitPanel({ title, actions, list, editor }: { title: string; actions: React.ReactNode; list: React.ReactNode; editor: React.ReactNode }) {
  return (
    <div className="split-panel">
      <section className="list-pane">
        <div className="pane-header">
          <h1>{title}</h1>
          {actions}
        </div>
        {list}
      </section>
      <section className="editor-pane">{editor}</section>
    </div>
  );
}

function DatedList<T extends { id: string; createdAt: string; updatedAt: string; highlighted?: boolean }>({
  items,
  selectedId,
  labelOf,
  onSelect,
  view
}: {
  items: T[];
  selectedId?: string;
  labelOf: (item: T) => string;
  onSelect: (id: string) => void;
  view: ViewMode;
}) {
  if (view === 'list') {
    return <SimpleList items={items} selectedId={selectedId} labelOf={labelOf} metaOf={(item) => formatDateTime(item.createdAt)} onSelect={onSelect} />;
  }

  return (
    <div className="date-buckets">
      {groupByDate(items).map((bucket) => (
        <button key={bucket.date} className="date-bucket" onClick={() => onSelect(bucket.items[0].id)}>
          <strong>{bucket.date}</strong>
          <span>{bucket.items.length} 条记录</span>
        </button>
      ))}
    </div>
  );
}

function SimpleList<T extends { id: string }>({
  items,
  selectedId,
  labelOf,
  metaOf,
  urgentOf,
  doneOf,
  onSelect
}: {
  items: T[];
  selectedId?: string;
  labelOf: (item: T) => string;
  metaOf?: (item: T) => string;
  urgentOf?: (item: T) => boolean;
  doneOf?: (item: T) => boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="stack-list">
      {items.map((item) => (
        <button
          key={item.id}
          className={[
            'list-row',
            selectedId === item.id ? 'active' : '',
            urgentOf?.(item) ? 'urgent' : '',
            doneOf?.(item) ? 'done' : ''
          ].join(' ')}
          onClick={() => onSelect(item.id)}
        >
          <span>{labelOf(item)}</span>
          {metaOf && <small>{metaOf(item)}</small>}
        </button>
      ))}
      {items.length === 0 && <EmptyText>暂无内容</EmptyText>}
    </div>
  );
}

function ModuleActions({ view, setView, onAdd }: { view: ViewMode; setView: (view: ViewMode) => void; onAdd: () => void }) {
  return (
    <div className="toolbar">
      <select value={view} onChange={(event) => setView(event.target.value as ViewMode)}>
        <option value="list">列表</option>
        <option value="week">周</option>
        <option value="month">月</option>
      </select>
      <IconButton label="新建" onClick={onAdd} icon={Plus} />
    </div>
  );
}

function IconButton({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: typeof Plus }) {
  return (
    <button className="icon-button" type="button" onClick={onClick} title={label} aria-label={label}>
      <Icon size={17} />
    </button>
  );
}

function ToolbarButton({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button className={active ? 'toolbar-button active' : 'toolbar-button'} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <section className="panel full-panel">
      <h1>{title}</h1>
      <p className="muted">{body}</p>
    </section>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}

interface StatePanelProps {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
}
