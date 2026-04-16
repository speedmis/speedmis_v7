import React, { useState, useEffect, useReducer, useRef, useCallback } from 'react';
import api from '../api';
import Sidebar from './Sidebar';
import MainContent from './MainContent';

function findTopRealPid(menuTree, gubun) {
  for (const top of menuTree) {
    if (top.idx === gubun) return top.real_pid;
    if (searchChildren(top.children, gubun)) return top.real_pid;
  }
  return null;
}
function searchChildren(children, gubun) {
  for (const c of children ?? []) {
    if (c.idx === gubun) return true;
    if (searchChildren(c.children, gubun)) return true;
  }
  return false;
}
function findMenuName(tree, gubun) {
  for (const node of tree ?? []) {
    if (node.idx === gubun) return node.menu_name;
    const found = findMenuName(node.children, gubun);
    if (found) return found;
  }
  return null;
}

const MAX_TABS = 10;

function tabReducer(state, action) {
  switch (action.type) {
    case 'OPEN': {
      const { gubun, label, openIdx, openLinkVal, forceNew, iframeUrl, openFull } = action;
      if (!forceNew) {
        const existing = state.tabs.find(t => t.gubun === gubun);
        if (existing) return { ...state, activeTabId: existing.id };
      }
      const id = Date.now() + Math.random();
      const newTab = { id, gubun, label: label || String(gubun), locked: false, openIdx, openLinkVal, iframeUrl: iframeUrl ?? null, openFull: !!openFull };
      let next = [...state.tabs, newTab];
      while (next.length > MAX_TABS) {
        const ui = next.findIndex(t => !t.locked);
        if (ui === -1) break;
        next = next.filter((_, i) => i !== ui);
      }
      return { tabs: next, activeTabId: id };
    }
    case 'CLOSE': {
      const next = state.tabs.filter(t => t.id !== action.tabId);
      let newActiveId = state.activeTabId;
      if (action.tabId === state.activeTabId) {
        newActiveId = next.length > 0 ? next[next.length - 1].id : null;
      }
      return { tabs: next, activeTabId: newActiveId };
    }
    case 'CLOSE_ALL':
      return { tabs: [], activeTabId: null };
    case 'TOGGLE_LOCK':
      return { ...state, tabs: state.tabs.map(t => t.id === action.tabId ? { ...t, locked: !t.locked } : t) };
    case 'ACTIVATE':
      return { ...state, activeTabId: action.tabId };
    case 'REPLACE': {
      // 현재 활성 탭의 gubun/label을 교체 (탭 ID 유지, 내용만 변경)
      const { gubun, label, openIdx, openLinkVal } = action;
      return {
        ...state,
        tabs: state.tabs.map(t =>
          t.id === state.activeTabId
            ? { ...t, gubun, label: label || String(gubun), openIdx, openLinkVal, openFull: false }
            : t
        ),
      };
    }
    case 'UPDATE_LABELS':
      return {
        ...state,
        tabs: state.tabs.map(t => {
          if (t.label === String(t.gubun)) {
            const name = findMenuName(action.menuTree, t.gubun);
            if (name) return { ...t, label: name };
          }
          return t;
        }),
      };
    default: return state;
  }
}

export default function Layout({ user, menuTree, onLogout, siteTitle, homeGubun = 0, homeTopRealPid = '', toggleMode }) {
  const urlParams  = new URLSearchParams(window.location.search);
  const urlGubun   = parseInt(urlParams.get('gubun') || '0', 10);
  const urlRealPid = urlParams.get('realPid') || '';
  const urlIdx     = urlParams.get('idx') || null;
  const initGubun  = urlGubun || homeGubun || 0;

  // ── 탭 상태 ─────────────────────────────────────────────────────────────────
  const [tabState, dispatch] = useReducer(tabReducer, null, () => {
    if (!initGubun) return { tabs: [], activeTabId: null };
    const id = Date.now();
    const parsedIdx = urlIdx ? (/^\d+$/.test(urlIdx) ? Number(urlIdx) : urlIdx) : null;
    return { tabs: [{ id, gubun: initGubun, label: String(initGubun), locked: false, openIdx: parsedIdx, openLinkVal: urlIdx || null }], activeTabId: id };
  });
  const { tabs, activeTabId } = tabState;

  // ?realPid= 파라미터 → gubun 변환 후 탭 열기
  useEffect(() => {
    if (!urlRealPid || urlGubun) return;
    api.menuItemByRealPid(urlRealPid).then(res => {
      const gid = res.data?.idx;
      if (gid) {
        const parsedIdx2 = urlIdx ? (/^\d+$/.test(urlIdx) ? Number(urlIdx) : urlIdx) : null;
        dispatch({ type: 'ADD', gubun: Number(gid), label: res.data?.menu_name || urlRealPid, openIdx: parsedIdx2, openLinkVal: urlIdx || null });
        const p = new URLSearchParams(window.location.search);
        p.set('gubun', gid); p.delete('realPid'); p.set('isMenuIn', 'Y');
        history.replaceState(null, '', '?' + decodeURIComponent(p.toString()));
      }
    }).catch(() => {});
  }, []);

  // ── 분할 상태 ───────────────────────────────────────────────────────────────
  const [splitTabId, setSplitTabId]   = useState(null);   // 분할 시 보조탭 id
  const [splitDir,   setSplitDir]     = useState('h');    // 'h'=좌우, 'v'=상하
  const [splitRatio, setSplitRatio]   = useState(0.5);    // 0~1

  // menuTree 로드 후 초기 탭 레이블 갱신
  useEffect(() => {
    if (!menuTree.length) return;
    dispatch({ type: 'UPDATE_LABELS', menuTree });
  }, [menuTree]);

  // 분할 중인 탭이 닫히면 분할 해제
  useEffect(() => {
    if (splitTabId && !tabs.find(t => t.id === splitTabId)) {
      setSplitTabId(null);
    }
  }, [tabs, splitTabId]);

  // ── 파생값 ──────────────────────────────────────────────────────────────────
  const activeTab    = tabs.find(t => t.id === activeTabId) ?? null;
  const currentGubun = activeTab?.gubun ?? 0;

  const [activeTopIdx, setActiveTopIdx] = useState(urlGubun ? null : (homeTopRealPid || null));
  const [sidebarOpen, setSidebarOpen]   = useState(() => window.innerWidth > 767);

  // ── 탭 조작 ─────────────────────────────────────────────────────────────────
  function openTab(gubun, label, openIdx = null, openLinkVal = null, forceNew = false, iframeUrl = null, openFull = false, addUrl = null) {
    dispatch({ type: 'OPEN', gubun, label: label || String(gubun), openIdx, openLinkVal, forceNew, iframeUrl, openFull });
    // addUrl이 있으면 URL에 추가 파라미터 반영
    if (addUrl) {
      const p = new URLSearchParams();
      p.set('gubun', gubun);
      p.set('isMenuIn', 'Y');
      // addUrl 파싱하여 병합
      const extra = new URLSearchParams(addUrl.startsWith('&') ? addUrl.slice(1) : addUrl);
      for (const [k, v] of extra) p.set(k, v);
      history.pushState(null, '', '?' + decodeURIComponent(p.toString()));
    } else {
      updateUrl(gubun, openIdx);
    }
  }

  function closeTab(tabId) {
    const closing = tabs.find(t => t.id === tabId);
    dispatch({ type: 'CLOSE', tabId });
    if (tabId === activeTabId) {
      const remaining = tabs.filter(t => t.id !== tabId);
      const next = remaining.length > 0 ? remaining[remaining.length - 1] : null;
      if (next) updateUrl(next.gubun); else updateUrl(0);
    } else if (closing) {
      // 활성탭 유지
    }
  }

  function toggleLock(tabId) {
    dispatch({ type: 'TOGGLE_LOCK', tabId });
  }

  // Ctrl+클릭 → 분할 / 일반 클릭 → 분할 해제 후 활성화
  function handleTabClick(tab, e) {
    if (e?.ctrlKey) {
      if (tab.id === activeTabId) return; // 활성탭 자기 자신 클릭 무시
      if (splitTabId === tab.id) {
        // 같은 탭 다시 Ctrl+클릭 → 방향 전환
        setSplitDir(d => d === 'h' ? 'v' : 'h');
      } else {
        // 새 분할
        setSplitTabId(tab.id);
        setSplitDir('h');
        setSplitRatio(0.5);
      }
    } else {
      // 일반 클릭 → 분할 해제, 탭 활성화
      setSplitTabId(null);
      dispatch({ type: 'ACTIVATE', tabId: tab.id });
      updateUrl(tab.gubun);
      if (menuTree.length) {
        const pid = findTopRealPid(menuTree, tab.gubun);
        if (pid) { setActiveTopIdx(pid); setSidebarOpen(true); }
      }
    }
  }

  function updateUrl(gubun, idx = null) {
    const params = new URLSearchParams();
    if (gubun) {
      params.set('gubun', gubun);
      params.set('isMenuIn', 'Y');
      if (idx != null) params.set('idx', String(idx));
    }
    history.pushState(null, '', '?' + decodeURIComponent(params.toString()));
  }

  function selectGubun(gubun, label, forceNew = false, iframeUrl = null) {
    const name = label || findMenuName(menuTree, gubun) || String(gubun);
    openTab(gubun, name, null, null, forceNew, iframeUrl);
    if (menuTree.length) {
      const pid = findTopRealPid(menuTree, gubun);
      if (pid) setActiveTopIdx(pid);
    }
    if (window.innerWidth <= 767) setSidebarOpen(false);
  }

  function openTabWithRecord(gubun, label, pk, linkVal) {
    openTab(gubun, label, pk, linkVal, true);
  }

  // 글로벌 탭 열기 이벤트 (MainContent 등에서 다른 gubun 탭을 열 때 사용)
  useEffect(() => {
    const handler = async (e) => {
      const { gubun: g, realPid, label, idx, linkVal, openFull, addUrl } = e.detail ?? {};
      if (g) {
        openTab(Number(g), label || String(g), idx ?? null, linkVal ?? null, true, null, !!openFull, addUrl ?? null);
      } else if (realPid) {
        // realPid → gubun 변환 후 탭 열기
        try {
          const res = await api.menuItemByRealPid(realPid);
          const gid = res.data?.idx;
          if (gid) openTab(Number(gid), label || res.data?.menu_name || realPid, idx ?? null, linkVal ?? null, true, null, !!openFull);
        } catch {}
      }
    };
    window.addEventListener('mis:openTab', handler);
    return () => window.removeEventListener('mis:openTab', handler);
  }, []);

  // 글로벌 탭 리다이렉트 이벤트 (현재 탭을 다른 프로그램으로 교체)
  useEffect(() => {
    const handler = (e) => {
      const { gubun: g, label, idx, linkVal } = e.detail ?? {};
      if (!g) return;
      dispatch({ type: 'REPLACE', gubun: Number(g), label: label || String(g), openIdx: idx ?? null, openLinkVal: linkVal ?? null });
      updateUrl(Number(g), idx ?? null);
      if (menuTree.length) {
        const pid = findTopRealPid(menuTree, Number(g));
        if (pid) { setActiveTopIdx(pid); setSidebarOpen(true); }
      }
    };
    window.addEventListener('mis:redirectTab', handler);
    return () => window.removeEventListener('mis:redirectTab', handler);
  }, [menuTree]);

  useEffect(() => {
    function onPopState() {
      const g = parseInt(new URLSearchParams(window.location.search).get('gubun') || '0', 10);
      if (g) {
        const found = tabs.find(t => t.gubun === g);
        if (found) dispatch({ type: 'ACTIVATE', tabId: found.id });
        if (menuTree.length) {
          const pid = findTopRealPid(menuTree, g);
          if (pid) { setActiveTopIdx(pid); setSidebarOpen(true); }
        }
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [menuTree, tabs]);

  useEffect(() => {
    if (homeGubun && !urlGubun) {
      const params = new URLSearchParams(window.location.search);
      params.set('gubun', homeGubun);
      params.set('isMenuIn', 'Y');
      history.replaceState(null, '', '?' + decodeURIComponent(params.toString()));
    }
  }, []);

  useEffect(() => {
    if (!menuTree.length || !currentGubun || activeTopIdx) return;
    const pid = findTopRealPid(menuTree, currentGubun);
    if (pid) setActiveTopIdx(pid);
  }, [menuTree, currentGubun]);

  function handleTopMenu(node) {
    if (activeTopIdx === node.real_pid) {
      setSidebarOpen(v => !v);
    } else {
      setActiveTopIdx(node.real_pid);
      setSidebarOpen(true);
    }
    if (!node.children || node.children.length === 0) {
      selectGubun(node.idx, node.menu_name);
    }
  }

  // ── 분할 구분선 드래그 ───────────────────────────────────────────────────────
  const contentAreaRef = useRef(null);

  const handleDividerMouseDown = useCallback((e) => {
    e.preventDefault();
    const el = contentAreaRef.current;
    if (!el) return;

    const onMouseMove = (mv) => {
      const rect = el.getBoundingClientRect();
      let ratio;
      if (splitDir === 'h') {
        ratio = (mv.clientX - rect.left) / rect.width;
      } else {
        ratio = (mv.clientY - rect.top) / rect.height;
      }
      setSplitRatio(Math.max(0.15, Math.min(0.85, ratio)));
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [splitDir]);

  // ── 콘텐츠 레이아웃 계산 ────────────────────────────────────────────────────
  const activeTop    = menuTree.find(n => n.real_pid === activeTopIdx);
  const sidebarMenus = activeTop?.children ?? [];

  // 분할 모드일 때 그리드 스타일
  const splitGridStyle = splitTabId ? (
    splitDir === 'h'
      ? { gridTemplateColumns: `${splitRatio * 100}% 4px 1fr`, gridTemplateRows: '1fr' }
      : { gridTemplateColumns: '1fr', gridTemplateRows: `${splitRatio * 100}% 4px 1fr` }
  ) : {};

  function renderTabContent(tab) {
    if (tab.iframeUrl) {
      return (
        <iframe
          src={tab.iframeUrl}
          className="w-full flex-1 border-0"
          style={{ height: '100%' }}
          title={tab.label}
          allow="fullscreen"
        />
      );
    }
    return (
      <MainContent
        gubun={tab.gubun}
        user={user}
        openIdx={tab.openIdx}
        openLinkVal={tab.openLinkVal}
        openFull={tab.openFull}
        onOpenTab={(pk, linkVal, label) => openTabWithRecord(tab.gubun, label, pk, linkVal)}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-base">

      {/* ── Topbar ── */}
      <header className="flex items-center justify-between h-topbar bg-nav-bg border-b border-nav-border px-3 flex-shrink-0 gap-2 z-30 relative">
        {/* 좌측: 햄버거 + 로고 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="w-9 h-9 flex items-center justify-center rounded bg-transparent border-0 text-nav-text hover:bg-nav-hover hover:text-white cursor-pointer transition-colors text-xl flex-shrink-0"
            onClick={() => {
              if (!activeTopIdx && menuTree.length > 0) {
                setActiveTopIdx(menuTree[0].real_pid);
                setSidebarOpen(true);
              } else {
                setSidebarOpen(v => !v);
              }
            }}
          >
            ☰
          </button>
          <button
            className="text-lg font-bold text-nav-logo whitespace-nowrap pr-3 mr-1 border-r border-nav-border bg-transparent border-l-0 border-t-0 border-b-0 cursor-pointer hover:opacity-80 transition-opacity"
            style={{ fontFamily: 'inherit' }}
            onClick={() => {
              dispatch({ type: 'CLOSE_ALL' });
              updateUrl(0);
              setActiveTopIdx(homeTopRealPid || null);
            }}
          >
            {siteTitle}
          </button>
        </div>
        {/* 우측: 상단메뉴 + 사용자 영역 */}
        <div className="flex items-center gap-1 flex-1 justify-end overflow-hidden min-w-0">
          <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide h-topbar">
            {menuTree.map(node => (
              <button
                key={node.real_pid}
                className={[
                  'h-topbar px-4 bg-transparent border-0 border-b text-base cursor-pointer whitespace-nowrap transition-colors',
                  activeTopIdx === node.real_pid
                    ? 'text-white border-nav-logo font-semibold'
                    : 'text-nav-text border-transparent hover:text-white hover:bg-nav-hover',
                ].join(' ')}
                onClick={() => handleTopMenu(node)}
              >
                {node.menu_name}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2 flex-shrink-0 pl-2 border-l border-nav-border ml-1">
          <span className="text-sm text-nav-text whitespace-nowrap">{user.name}</span>
          {user.is_admin === 'Y' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger text-white font-semibold whitespace-nowrap">관리자</span>
          )}
          <SettingsButton user={user} toggleMode={toggleMode} onLogout={onLogout} />
          </div>{/* 사용자 영역 닫기 */}
        </div>{/* 우측 전체 닫기 */}
      </header>

      {/* ── 바디 ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 모바일 오버레이: 사이드바 열린 상태에서 외부 클릭 시 닫기 */}
        {sidebarOpen && sidebarMenus.length > 0 && window.innerWidth <= 767 && (
          <div
            className="absolute inset-0 z-10 bg-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {sidebarOpen && sidebarMenus.length > 0 && (
          <div className={window.innerWidth <= 767 ? 'absolute top-0 left-0 bottom-0 z-20' : ''}>
            <Sidebar
              menuTree={sidebarMenus}
              currentGubun={currentGubun}
              onSelect={selectGubun}
            />
          </div>
        )}

        <main className="flex-1 overflow-hidden flex flex-col bg-base min-w-0">
          {/* 프로그램 탭 바 */}
          {tabs.length > 0 && (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              splitTabId={splitTabId}
              splitDir={splitDir}
              onTabClick={handleTabClick}
              onClose={closeTab}
              onToggleLock={toggleLock}
            />
          )}

          {/* 콘텐츠 영역 */}
          {tabs.length > 0 ? (
            <div
              ref={contentAreaRef}
              className={splitTabId ? 'grid flex-1 min-h-0 overflow-hidden' : 'flex flex-col flex-1 min-h-0 overflow-hidden'}
              style={splitGridStyle}
            >
              {tabs.map(tab => {
                const isActive = tab.id === activeTabId;
                const isSplit  = tab.id === splitTabId;

                if (splitTabId) {
                  if (isActive) {
                    return (
                      <div key={tab.id} style={{ gridColumn: 1, gridRow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
                        {renderTabContent(tab)}
                      </div>
                    );
                  }
                  if (isSplit) {
                    return (
                      <div key={tab.id} style={{ gridColumn: splitDir === 'h' ? 3 : 1, gridRow: splitDir === 'h' ? 1 : 3, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
                        {renderTabContent(tab)}
                      </div>
                    );
                  }
                  // 분할에 포함되지 않은 탭은 hidden (상태 보존)
                  return <div key={tab.id} style={{ display: 'none' }}>{renderTabContent(tab)}</div>;
                }

                // 분할 없는 일반 모드
                return (
                  <div key={tab.id} className={isActive ? 'flex-1 overflow-hidden flex flex-col min-h-0' : 'hidden'}>
                    {renderTabContent(tab)}
                  </div>
                );
              })}

              {/* 분할 구분선 */}
              {splitTabId && (
                <SplitDivider
                  dir={splitDir}
                  onMouseDown={handleDividerMouseDown}
                  style={{
                    gridColumn: splitDir === 'h' ? 2 : 1,
                    gridRow:    splitDir === 'h' ? 1 : 2,
                  }}
                />
              )}
            </div>
          ) : (
            <WelcomeScreen user={user} siteTitle={siteTitle} />
          )}
        </main>
      </div>
    </div>
  );
}

/* ── 분할 구분선 ────────────────────────────────────────────────────────────── */
function SplitDivider({ dir, onMouseDown, style }) {
  const isH = dir === 'h';
  return (
    <div
      onMouseDown={onMouseDown}
      style={style}
      className={[
        'flex-shrink-0 z-10 group',
        isH
          ? 'cursor-col-resize w-1 hover:w-1 relative'
          : 'cursor-row-resize h-1 relative',
      ].join(' ')}
    >
      {/* 실제 드래그 영역 (넓게) */}
      <div className={[
        'absolute inset-0 z-10',
        isH ? '-left-1 -right-1' : '-top-1 -bottom-1',
      ].join(' ')} />
      {/* 시각적 라인 */}
      <div className={[
        'absolute bg-border-base group-hover:bg-accent transition-colors duration-fast',
        isH ? 'inset-y-0 left-0 right-0' : 'inset-x-0 top-0 bottom-0',
      ].join(' ')} />
      {/* 중앙 핸들 아이콘 */}
      <div className={[
        'absolute z-20 flex items-center justify-center',
        'bg-surface border border-border-base rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity',
        isH
          ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-8'
          : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-8',
      ].join(' ')}>
        <span className={['text-muted text-[9px] leading-none', isH ? '' : 'rotate-90'].join(' ')}>⋮⋮</span>
      </div>
    </div>
  );
}

/* ── 탭 바 ──────────────────────────────────────────────────────────────────── */
function TabBar({ tabs, activeTabId, splitTabId, splitDir, onTabClick, onClose, onToggleLock }) {
  return (
    <div className="flex items-end gap-0 px-2 pt-1 bg-surface border-b border-border-base flex-shrink-0 overflow-x-auto scrollbar-hide">
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
        const isSplit  = tab.id === splitTabId;
        return (
          <div
            key={tab.id}
            title={isSplit
              ? `분할 표시 중 (${splitDir === 'h' ? '좌우' : '상하'}) — Ctrl+클릭: 방향 전환 | 클릭: 분할 해제`
              : isActive ? '현재 탭' : 'Ctrl+클릭: 분할 보기'
            }
            className={[
              'flex items-center gap-1 px-2.5 h-[30px] text-sm rounded-t border border-b-0 cursor-pointer select-none whitespace-nowrap flex-shrink-0 transition-colors',
              isActive
                ? 'bg-base border-border-base text-primary font-semibold -mb-px z-10 relative'
                : isSplit
                  ? 'bg-accent-dim border-accent text-link font-medium -mb-px z-10 relative'
                  : 'bg-surface-2 border-transparent text-secondary hover:bg-surface hover:text-primary',
            ].join(' ')}
            onClick={e => onTabClick(tab, e)}
          >
            {/* 분할 방향 아이콘 */}
            {isSplit && (
              <SplitIcon dir={splitDir} />
            )}
            {tab.iframeUrl && !isSplit && (
              <span className="text-muted text-[10px] flex-shrink-0" title="iframe">⧉</span>
            )}
            <span className="max-w-[120px] truncate">{tab.label}</span>
            {/* 잠금 */}
            <button
              title={tab.locked ? '잠금 해제' : '탭 고정'}
              className={[
                'flex-shrink-0 flex items-center justify-center w-4 h-4 rounded border-0 bg-transparent cursor-pointer transition-colors',
                tab.locked ? 'text-accent hover:text-accent-hover' : 'text-muted hover:text-secondary',
              ].join(' ')}
              onClick={e => { e.stopPropagation(); onToggleLock(tab.id); }}
            >
              {tab.locked ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 8h-1V6A5 5 0 0 0 7 6h2a3 3 0 0 1 6 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
                </svg>
              )}
            </button>
            {/* 닫기 */}
            <button
              title="탭 닫기"
              className="flex-shrink-0 flex items-center justify-center w-4 h-4 rounded border-0 bg-transparent cursor-pointer text-muted hover:text-danger hover:bg-danger-dim transition-colors text-xs leading-none"
              onClick={e => { e.stopPropagation(); onClose(tab.id); }}
            >×</button>
          </div>
        );
      })}
    </div>
  );
}

/* 분할 아이콘 */
function SplitIcon({ dir }) {
  return (
    <svg
      width="11" height="11"
      viewBox="0 0 12 12"
      fill="none"
      className="flex-shrink-0 text-link"
    >
      {dir === 'h' ? (
        /* 좌우 분할 */
        <>
          <rect x="0.5" y="0.5" width="4.5" height="11" rx="1" fill="currentColor" opacity="0.35"/>
          <rect x="7"   y="0.5" width="4.5" height="11" rx="1" fill="currentColor" opacity="0.35"/>
          <line x1="6" y1="0" x2="6" y2="12" stroke="currentColor" strokeWidth="1.5"/>
        </>
      ) : (
        /* 상하 분할 */
        <>
          <rect x="0.5" y="0.5" width="11" height="4.5" rx="1" fill="currentColor" opacity="0.35"/>
          <rect x="0.5" y="7"   width="11" height="4.5" rx="1" fill="currentColor" opacity="0.35"/>
          <line x1="0" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1.5"/>
        </>
      )}
    </svg>
  );
}

/* ── 설정 버튼 + 패널 ── */
function SettingsButton({ user, toggleMode, onLogout }) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(document.documentElement.getAttribute('data-theme') === 'dark');
  const [devMode, setDevMode] = useState(localStorage.getItem('mis_dev_mode') === '1');
  const [viewPref, setViewPref] = useState(localStorage.getItem('mis_view_pref') || 'auto'); // auto|list|custom


  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next === 'dark' ? 'dark' : '');
    if (next === 'light') document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('mis_theme', next);
    setDark(!dark);
    fetch('/api.php?act=saveTheme', { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: next }) }).catch(() => {});
  };

  const toggleDev = () => {
    const next = !devMode;
    localStorage.setItem('mis_dev_mode', next ? '1' : '0');
    setDevMode(next);
    window.dispatchEvent(new Event('mis:settingsChanged'));
  };

  const changeViewPref = (v) => {
    localStorage.setItem('mis_view_pref', v);
    setViewPref(v);
    window.dispatchEvent(new Event('mis:settingsChanged'));
  };

  const optCls = (active) => [
    'flex-1 py-1.5 text-xs text-center rounded cursor-pointer border-0 transition-colors font-medium',
    active ? 'bg-accent text-white' : 'bg-surface-2 text-secondary hover:text-primary',
  ].join(' ');

  return (
    <div className="relative">
      <button
        className="w-8 h-8 flex items-center justify-center rounded border-0 bg-transparent text-nav-text hover:bg-nav-hover cursor-pointer transition-colors"
        onClick={() => setOpen(v => !v)}
        title="설정"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </button>
      {open && (
        <>
        <div className="fixed inset-0 z-[199]" onClick={() => setOpen(false)} />
        <div className="fixed right-3 top-[52px] z-[200] w-[260px] rounded-lg border border-border-light bg-surface shadow-pop modal-box p-4 flex flex-col gap-3">
          <div className="text-xs font-bold text-primary border-b border-border-light pb-2">설정</div>

          {/* 뷰 모드 */}
          <div>
            <div className="text-[11px] text-secondary font-semibold mb-1.5">뷰 모드</div>
            <div className="flex gap-1.5">
              <button className={optCls(true)} onClick={() => {}}>🖥 PC</button>
              {toggleMode && <button className={optCls(false)} onClick={() => { setOpen(false); toggleMode(); }}>📱 모바일</button>}
            </div>
          </div>

          {/* 테마 */}
          <div>
            <div className="text-[11px] text-secondary font-semibold mb-1.5">테마</div>
            <div className="flex gap-1.5">
              <button className={optCls(!dark)} onClick={() => { if (dark) toggleTheme(); }}>☀ 라이트</button>
              <button className={optCls(dark)} onClick={() => { if (!dark) toggleTheme(); }}>🌙 다크</button>
            </div>
          </div>

          {/* 개발자/실사용 모드 */}
          <div>
            <div className="text-[11px] text-secondary font-semibold mb-1.5">운영 모드</div>
            <div className="flex gap-1.5">
              <button className={optCls(!devMode)} onClick={() => { if (devMode) toggleDev(); }}>실사용</button>
              <button className={optCls(devMode)} onClick={() => { if (!devMode) toggleDev(); }}>개발자</button>
            </div>
          </div>

          {/* 조회 설정 */}
          <div>
            <div className="text-[11px] text-secondary font-semibold mb-1.5">조회 설정</div>
            <div className="flex gap-1.5">
              <button className={optCls(viewPref === 'list')} onClick={() => changeViewPref('list')}>목록만</button>
              <button className={optCls(viewPref === 'auto')} onClick={() => changeViewPref('auto')}>자동열림</button>
              <button className={optCls(viewPref === 'custom')} onClick={() => changeViewPref('custom')}>개별</button>
            </div>
          </div>

          {/* 로그아웃 */}
          <button
            className="w-full py-2 text-sm rounded border border-danger text-danger bg-transparent cursor-pointer hover:bg-danger-dim transition-colors font-medium mt-1"
            onClick={() => { setOpen(false); onLogout(); }}
          >로그아웃</button>
        </div>
        </>
      )}
    </div>
  );
}

/* 테마 토글 버튼 (레거시 — SettingsButton으로 통합됨) */
function ThemeToggle({ user }) {
  const [dark, setDark] = useState(
    document.documentElement.hasAttribute('data-theme') &&
    document.documentElement.getAttribute('data-theme') === 'dark'
  );

  function toggle() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next === 'dark' ? 'dark' : '');
    if (next === 'light') document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('mis_theme', next);
    setDark(!dark);
    fetch('/api.php?act=saveTheme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  }

  return (
    <button
      onClick={toggle}
      title={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="w-8 h-8 flex items-center justify-center rounded border-0 bg-transparent text-secondary hover:bg-surface-2 hover:text-primary cursor-pointer transition-colors"
    >
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

function WelcomeScreen({ user, siteTitle }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16 px-10">
      <div className="text-5xl mb-4">⚡</div>
      <h2 className="text-xl font-semibold text-primary mb-2">{siteTitle}에 오신 것을 환영합니다</h2>
      <p className="text-secondary text-base">{user.name}님, 상단 메뉴를 선택해주세요.</p>
    </div>
  );
}
