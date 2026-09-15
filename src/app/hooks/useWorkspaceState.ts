import { useCallback, useEffect, useRef, useState } from 'react';
import { loadAgentPreferences } from '../../features/agents/lib/agents';
import { useRunConfigurations } from '../../features/runs/hooks/useRunConfigurations';
import { loadSettings } from '../../features/settings/lib/settings';
import { readStored, store } from '../../platform/storage/preferences';
import type { DialogSpec } from '../../shared/contracts/dialog';
import type {
  AgentObservation,
  AgentUsage,
  DiffTab,
  Entry,
  GitSnapshot,
  Layout,
  OpenFile,
  Pane,
  PaneState,
  Project,
} from '../../shared/contracts/workspace';
import { useLatest } from '../../shared/hooks/useLatest';
export function useWorkspaceState() {
  const [project, setProject] = useState<Project | null>(null);
  const [directories, setDirectories] = useState<Record<string, Entry[]>>({});
  const [expanded, setExpanded] = useState(new Set<string>());
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [active, setActive] = useState('');
  const [settings, setSettings] = useState(loadSettings);
  const [sidebar, setSidebar] = useState<'files' | 'git'>('files');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [git, setGit] = useState<GitSnapshot | null>(null);
  const [gitRevision, setGitRevision] = useState(0);
  const [gitBusy, setGitBusy] = useState(false);
  const [branchMenu, setBranchMenu] = useState(false);
  const [panes, setPanes] = useState<Pane[]>([]);
  const [paneStates, setPaneStates] = useState<Record<string, PaneState>>({});
  const [agentPreferences, setAgentPreferences] = useState(loadAgentPreferences);
  const [agentObservations, setAgentObservations] = useState<Record<string, AgentObservation>>({});
  const [agentUsage, setAgentUsage] = useState<Record<string, AgentUsage>>({});
  const [selectedPane, setSelectedPane] = useState<string | null>(null);
  const [paneFocus, setPaneFocus] = useState({ id: '', sequence: 0 });
  const [reveal, setReveal] = useState<{
    path: string;
    line: number;
    column?: number;
    sequence: number;
  } | null>(null);
  const [layout, setLayout] = useState<Layout>(() => readStored('relay:layout', 'columns'));
  const [terminalVisible, setTerminalVisible] = useState(true);
  const [terminalFull, setTerminalFull] = useState(false);
  const [maxPane, setMaxPane] = useState<string | null>(null);
  const [terminalHeight, setTerminalHeight] = useState(() =>
    readStored('relay:terminal-height', 310)
  );
  const [sidebarWidth, setSidebarWidth] = useState(() => readStored('relay:sidebar-width', 240));
  const workspaceArea = useRef<HTMLElement>(null);
  const terminalPanel = useRef<HTMLElement>(null);
  const sidebarShown =
    sidebarVisible &&
    !(terminalVisible && terminalFull && settings.terminalPlacement === 'workspace');
  const toggleSidebar = () => {
    if (!sidebarShown && terminalFull && settings.terminalPlacement === 'workspace') {
      setTerminalFull(false);
      setSidebarVisible(true);
    } else setSidebarVisible(visible => !visible);
  };
  const [agentMenu, setAgentMenu] = useState(false);
  const runs = useRunConfigurations(project, settings.detectRunScripts);
  const [runsOpen, setRunsOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const pendingDialog = useRef<DialogSpec['resolve'] | null>(null);
  const [context, setContext] = useState<{
    entry: Entry;
    x: number;
    y: number;
  } | null>(null);
  const [clipboard, setClipboard] = useState<{
    root: string;
    path: string;
  } | null>(null);
  const [toast, setToast] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [diffTabs, setDiffTabs] = useState<DiffTab[]>([]);
  const [activeDiffId, setActiveDiffId] = useState<string | null>(null);
  const [worktreesOpen, setWorktreesOpen] = useState(false);
  const [worktreesActive, setWorktreesActive] = useState(false);
  const [worktreeSeed, setWorktreeSeed] = useState<{
    reference: string;
    revision: number;
  } | null>(null);
  const activeDiff = worktreesActive ? undefined : diffTabs.find(tab => tab.id === activeDiffId);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [recent, setRecent] = useState<Project[]>(() => readStored('relay:recent', []));
  const [conflictRequest, setConflictRequest] = useState<{ root: string; path?: string } | null>(
    null
  );
  const mergeDraftDirty = useRef(false);
  const setMergeDraftDirty = useCallback((dirty: boolean) => {
    mergeDraftDirty.current = dirty;
  }, []);
  const latest = useLatest({ project, files, panes, expanded, settings });

  const gitLock = useRef(false),
    opening = useRef(false),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const file = files.find(f => f.path === active);
  const notify = useCallback((text: string, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 14000 : 4500);
  }, []);
  const fail = useCallback(
    (e: unknown) => notify(String(e).replace(/^Error: /, ''), true),
    [notify]
  );
  const ask = useCallback(
    (spec: Omit<DialogSpec, 'resolve'>) =>
      new Promise<Record<string, string> | null>(resolve => {
        // A native close request may replace a confirmation. Cancel its promise
        // so the interrupted operation can release its busy state and locks.
        pendingDialog.current?.(null);
        const settle: DialogSpec['resolve'] = value => {
          if (pendingDialog.current === settle) pendingDialog.current = null;
          resolve(value);
        };
        pendingDialog.current = settle;
        setDialog({ ...spec, resolve: settle });
      }),
    []
  );
  const confirm = useCallback(
    async (title: string, description: string, submit = 'Continue', danger = false) =>
      Boolean(await ask({ title, description, submit, danger })),
    [ask]
  );
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--accent', settings.accent);
    store('relay:settings', settings);
  }, [settings]);
  useEffect(() => {
    store('relay:layout', layout);
  }, [layout]);
  useEffect(() => {
    store('relay:agents', agentPreferences);
  }, [agentPreferences]);
  useEffect(() => {
    store('relay:terminal-height', terminalHeight);
    store('relay:sidebar-width', sidebarWidth);
  }, [terminalHeight, sidebarWidth]);
  return {
    conflictRequest,
    setConflictRequest,
    mergeDraftDirty,
    setMergeDraftDirty,
    project,
    setProject,
    directories,
    setDirectories,
    expanded,
    setExpanded,
    files,
    setFiles,
    active,
    setActive,
    settings,
    setSettings,
    sidebar,
    setSidebar,
    sidebarVisible,
    setSidebarVisible,
    settingsOpen,
    setSettingsOpen,
    helpOpen,
    setHelpOpen,
    git,
    setGit,
    gitRevision,
    setGitRevision,
    gitBusy,
    setGitBusy,
    branchMenu,
    setBranchMenu,
    panes,
    setPanes,
    paneStates,
    setPaneStates,
    agentPreferences,
    setAgentPreferences,
    agentObservations,
    setAgentObservations,
    agentUsage,
    setAgentUsage,
    selectedPane,
    setSelectedPane,
    paneFocus,
    reveal,
    setReveal,
    setPaneFocus,
    layout,
    setLayout,
    terminalVisible,
    setTerminalVisible,
    terminalFull,
    setTerminalFull,
    maxPane,
    setMaxPane,
    terminalHeight,
    setTerminalHeight,
    sidebarWidth,
    setSidebarWidth,
    workspaceArea,
    terminalPanel,
    sidebarShown,
    toggleSidebar,
    agentMenu,
    setAgentMenu,
    runs,
    runsOpen,
    setRunsOpen,
    palette,
    setPalette,
    paletteQuery,
    setPaletteQuery,
    dialog,
    setDialog,
    context,
    setContext,
    clipboard,
    setClipboard,
    toast,
    setToast,
    diffTabs,
    setDiffTabs,
    activeDiffId,
    setActiveDiffId,
    worktreesOpen,
    setWorktreesOpen,
    worktreesActive,
    setWorktreesActive,
    worktreeSeed,
    setWorktreeSeed,
    activeDiff,
    cursor,
    setCursor,
    recent,
    setRecent,
    latest,
    gitLock,
    opening,
    toastTimer,
    file,
    notify,
    fail,
    ask,
    confirm,
  };
}
