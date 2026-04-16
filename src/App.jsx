import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import api from './api';
import Login from './components/Login';
import Layout from './components/Layout';
import MainContent from './components/MainContent';
import Toast from './components/Toast';
import useMobileMode from './hooks/useMobileMode';

const MobileLayout = lazy(() => import('./components/mobile/MobileLayout'));

const cfg = window.__APP_CONFIG__ ?? {};

export default function App() {
  // 사이트 이탈 방지 (뒤로가기/새로고침/탭 닫기)
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // data-opentab 버튼 전역 클릭 위임 (cell-html 안의 버튼 지원)
  useEffect(() => {
    const handler = (e) => {
      const btn = e.target.closest('[data-opentab]');
      if (!btn) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      try {
        const detail = JSON.parse(btn.dataset.opentab);
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+클릭: 새 창으로 열기
          const g = detail.gubun || '';
          const rp = detail.realPid || '';
          const idx = detail.idx || '';
          const params = new URLSearchParams();
          if (g) params.set('gubun', g);
          else if (rp) params.set('realPid', rp);
          if (idx) params.set('idx', idx);
          params.set('isMenuIn', 'Y');
          window.open('?' + params.toString(), '_blank');
        } else {
          window.dispatchEvent(new CustomEvent('mis:openTab', { detail }));
        }
      } catch {}
    };
    document.addEventListener('click', handler, true); // capture phase
    return () => document.removeEventListener('click', handler, true);
  }, []);

  const [user, setUser]       = useState(cfg.user ?? null);
  const [ready, setReady]     = useState(false);
  const [menuTree, setMenuTree] = useState([]);

  // ── 초기화: 서버 주입 user 있으면 바로 사용, 없으면 /me 시도 ──────────────
  useEffect(() => {
    async function init() {
      if (cfg.user) {
        setUser(cfg.user);
        await loadMenu();
      } else {
        try {
          const data = await api.me();
          setUser(data.user);
          await loadMenu();
        } catch {
          // 미인증 → 로그인 화면
        }
      }
      setReady(true);
    }
    init();
  }, []);

  // 강제 로그아웃 이벤트 (401)
  useEffect(() => {
    const handler = () => { setUser(null); setMenuTree([]); };
    window.addEventListener('mis:logout', handler);
    return () => window.removeEventListener('mis:logout', handler);
  }, []);

  // 로딩 화면 숨기기
  useEffect(() => {
    if (ready) {
      document.getElementById('loading-screen')?.classList.add('hidden');
    }
  }, [ready]);

  async function loadMenu() {
    try {
      const data = await api.menu();
      setMenuTree(data.data ?? []);
    } catch {
      setMenuTree([]);
    }
  }

  const handleLogin = useCallback(async (uid, pass) => {
    const data = await api.login(uid, pass);
    setUser(data.user);
    await loadMenu();
    return data;
  }, []);

  const handleLogout = useCallback(async () => {
    try { await api.logout(); } catch {}
    setUser(null);
    setMenuTree([]);
  }, []);

  if (!ready) return null;

  if (!user) {
    return <Login onLogin={handleLogin} siteTitle={cfg.siteTitle ?? 'SpeedMIS'} />;
  }

  // isMenuIn 이 Y 가 아닌 경우 → 몸통만 표시 (상단/좌측 메뉴 숨김)
  const urlParams  = new URLSearchParams(window.location.search);
  const isMenuIn   = urlParams.get('isMenuIn') ?? '';
  const urlGubun   = parseInt(urlParams.get('gubun') || '0', 10);

  if (urlGubun > 0 && isMenuIn !== 'Y') {
    // isMenuIn=S → child iframe 모드 (완전 스트립, 메뉴삽입 버튼 없음)
    const isSubFrame = isMenuIn === 'S';
    return (
      <div className="h-screen flex flex-col overflow-hidden bg-base">
        <MainContent gubun={urlGubun} user={user} key={urlGubun} />
        {!isSubFrame && (
          <button
            id="mis-menu-insert"
            className={menuInsertBtnCls}
            onClick={() => {
              const p = new URLSearchParams(window.location.search);
              p.set('isMenuIn', 'Y');
              window.location.href = '?' + p.toString();
            }}
          >
            메뉴삽입
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <AppContent
        user={user}
        menuTree={menuTree}
        onLogout={handleLogout}
        siteTitle={cfg.siteTitle ?? 'SpeedMIS'}
        homeGubun={cfg.homeGubun ?? 0}
        homeTopRealPid={cfg.homeTopRealPid ?? ''}
      />
      <Toast />
    </>
  );
}

function AppContent({ user, menuTree, onLogout, siteTitle, homeGubun, homeTopRealPid }) {
  const { isMobile, toggleMode } = useMobileMode();

  if (isMobile) {
    return (
      <Suspense fallback={<div className="h-screen flex items-center justify-center text-muted">로딩 중...</div>}>
        <MobileLayout
          user={user}
          menuTree={menuTree}
          onLogout={onLogout}
          siteTitle={siteTitle}
          toggleMode={toggleMode}
        />
      </Suspense>
    );
  }

  return (
    <Layout
      user={user}
      menuTree={menuTree}
      onLogout={onLogout}
      siteTitle={siteTitle}
      homeGubun={homeGubun}
      homeTopRealPid={homeTopRealPid}
      toggleMode={toggleMode}
    />
  );
}

const menuInsertBtnCls = [
  'hidden md:block',
  'fixed top-3 right-3 z-50',
  'h-btn-sm px-3 text-sm rounded border border-solid cursor-pointer',
  'bg-surface border-border-base text-secondary shadow-sm',
  'hover:bg-surface-2 hover:text-primary hover:border-accent transition-colors',
].join(' ');
