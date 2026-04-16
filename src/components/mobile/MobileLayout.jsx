import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api';
import { showToast } from '../Toast';
import MobileCardList from './MobileCardList';
import MobileFormView from './MobileFormView';

// 키워드 → 아이콘 매핑 (메뉴명 기반 자동 배정)
const ICON_RULES = [
  // 사람/인사/직원
  { keywords: ['인사','직원','사원','근태','급여','출근','퇴근','연차','휴가','조직','인력'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  // 거래처/고객/업체
  { keywords: ['거래처','고객','업체','회사','기업','파트너','협력'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg> },
  // 매출/매입/영업/수금/정산
  { keywords: ['매출','매입','영업','수금','정산','수익','손익','실적','청구'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
  // 차트/현황/통계/분석/리포트
  { keywords: ['현황','통계','분석','리포트','보고','대시보드','차트','집계','요약'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-5"/></svg> },
  // 재고/자재/창고/입고/출고
  { keywords: ['재고','자재','창고','입고','출고','입출고','물류','배송','운송','택배'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg> },
  // 상품/제품/품목/카탈로그
  { keywords: ['상품','제품','품목','카탈로그','품명','단가','가격'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> },
  // 주문/발주/수주/계약
  { keywords: ['주문','발주','수주','계약','견적','오더','Order'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg> },
  // 게시판/공지/커뮤니티/문의
  { keywords: ['게시판','공지','커뮤니티','문의','Q&A','QnA','FAQ','알림','소통','의견'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
  // 일정/캘린더/스케줄
  { keywords: ['일정','캘린더','스케줄','예약','달력','schedule','calendar'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> },
  // 설정/관리/시스템/환경
  { keywords: ['설정','시스템','환경','기초','코드','권한','메뉴관리','마스터'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
  // 결재/승인/전자결재
  { keywords: ['결재','승인','전자결재','품의','기안'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
  // 파일/자료/문서/첨부
  { keywords: ['파일','자료','문서','첨부','다운로드','업로드','아카이브'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> },
  // 등록/접수/신청/입력
  { keywords: ['등록','접수','신청','입력','작성','추가'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
  // 생산/공정/작업/제조
  { keywords: ['생산','공정','작업','제조','라인','BOM','설비','검사','품질'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3l-4 4-4-4"/><path d="M12 7v6M8 17h8"/></svg> },
  // 회계/세금/부가세/세무
  { keywords: ['회계','세금','부가세','세무','장부','전표','원장','세금계산서'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 9h20M2 15h20M10 3v18"/></svg> },
  // 프로젝트/과제/업무
  { keywords: ['프로젝트','과제','업무','태스크','task','진행','이슈','todo'], icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
];

// 기본 아이콘 (매칭 안 될 때)
const DEFAULT_ICON = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>;

function getTabIcon(index, menuName) {
  if (!menuName) return DEFAULT_ICON;
  const name = menuName.toLowerCase();
  for (const rule of ICON_RULES) {
    if (rule.keywords.some(kw => name.includes(kw.toLowerCase()))) return rule.icon;
  }
  return DEFAULT_ICON;
}

export default function MobileLayout({ user, menuTree, onLogout, siteTitle, toggleMode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTop, setActiveTop]   = useState(null);
  const [activeChild, setActiveChild] = useState(null);
  const [activeGubun, setActiveGubun] = useState(0);
  const [menu, setMenu] = useState(null);
  const [showSubList, setShowSubList] = useState(false);
  const [viewIdx, setViewIdx] = useState(null);
  const [viewLinkVal, setViewLinkVal] = useState(null);
  const [viewMode, setViewMode] = useState('view');
  const [reloadKey, setReloadKey] = useState(0);
  const [customButtons, setCustomButtons] = useState(null);
  const [onlyList, setOnlyList] = useState(false);
  const [buttonText, setButtonText] = useState(null);

  const updateUrl = useCallback((gubun, idx) => {
    const p = new URLSearchParams();
    if (gubun) { p.set('gubun', gubun); p.set('isMenuIn', 'Y'); }
    p.set('mode', 'mobile');
    if (idx) p.set('idx', String(idx));
    history.replaceState(null, '', '?' + decodeURIComponent(p.toString()));
  }, []);

  const runProgram = useCallback((gubun, menuNode) => {
    // menu_type=11: 현재 창 이동, 12: 새 창
    const type = menuNode?.menu_type ?? '';
    const url = menuNode?.add_url ?? '';
    if (type === '11' && url) { window.location.href = url; return; }
    if (type === '12' && url) { window.open(url, '_blank'); return; }

    setActiveGubun(gubun);
    setViewIdx(null);
    setShowSubList(false);
    setMenu(null);
    setCustomButtons(null);
    setOnlyList(false);
    setButtonText(null);
    updateUrl(gubun);
    api.menuItem(gubun).then(d => setMenu(d.data)).catch(() => {});
  }, [updateUrl]);

  const handleTopSelect = useCallback((node) => {
    setDrawerOpen(false);
    setActiveTop(node);
    setActiveChild(null);
    setViewIdx(null);
    setShowSubList(false);
    setMenu(null);
    setActiveGubun(0);
    const ch = (node.children ?? []).filter(c => c.is_menu_hidden !== 'Y');
    if (ch.length === 1) handleChildSelect(ch[0], node);
    else if (ch.length === 0) runProgram(node.idx, node);
    else handleChildSelect(ch[0], node);
  }, [runProgram]);

  const handleChildSelect = useCallback((childNode, topNode) => {
    setActiveChild(childNode);
    setViewIdx(null);
    const gc = (childNode.children ?? []).filter(c => c.is_menu_hidden !== 'Y');
    if (gc.length === 0) runProgram(childNode.idx, childNode);
    else if (gc.length === 1) runProgram(gc[0].idx, gc[0]);
    else { setShowSubList(true); setActiveGubun(0); setMenu(null); }
  }, [runProgram]);

  const handleBack = useCallback(() => {
    if (viewIdx != null) { setViewIdx(null); updateUrl(activeGubun); return; }
    const gc = (activeChild?.children ?? []).filter(c => c.is_menu_hidden !== 'Y');
    if (activeGubun > 0 && gc.length > 1) {
      setShowSubList(true); setActiveGubun(0); setMenu(null); updateUrl(0);
    } else if (activeGubun > 0) {
      setActiveGubun(0); setMenu(null); updateUrl(0);
    }
  }, [viewIdx, activeGubun, activeChild, updateUrl]);

  const handleCardClick  = useCallback((pk, lv) => { setViewIdx(pk); setViewLinkVal(lv ?? pk); setViewMode('view'); updateUrl(activeGubun, pk); }, [updateUrl, activeGubun]);
  const handleWrite      = useCallback(() => { setViewIdx(0); setViewLinkVal(null); setViewMode('write'); }, []);
  const handleModify     = useCallback(() => setViewMode('modify'), []);
  const handleSaved      = useCallback(() => { setViewMode('view'); setViewIdx(null); setReloadKey(k => k + 1); }, []);
  const handleDeleted    = useCallback(() => { setViewIdx(null); setReloadKey(k => k + 1); }, []);
  const handleMeta       = useCallback((meta) => { setCustomButtons(meta.buttons); setOnlyList(meta.onlyList); setButtonText(meta.buttonText); }, []);

  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current || menuTree.length === 0) return;
    initDone.current = true;
    const p = new URLSearchParams(window.location.search);
    const g = parseInt(p.get('gubun') || '0', 10);
    if (g > 0) {
      for (const top of menuTree) {
        if (top.idx === g) { handleTopSelect(top); return; }
        for (const child of (top.children ?? [])) {
          if (child.idx === g) { setActiveTop(top); setActiveChild(child); runProgram(g); return; }
          for (const gc of (child.children ?? [])) {
            if (gc.idx === g) { setActiveTop(top); setActiveChild(child); runProgram(g); return; }
          }
        }
      }
    }
    handleTopSelect(menuTree[0]);
  }, [menuTree]);

  const children = (activeTop?.children ?? []).filter(c => c.is_menu_hidden !== 'Y');
  const grandChildren = (activeChild?.children ?? []).filter(c => c.is_menu_hidden !== 'Y');
  const showTabs = children.length > 1 && viewIdx == null && (showSubList || activeGubun === 0);
  const showBack = viewIdx != null || activeGubun > 0;

  const headerTitle = viewIdx != null ? (menu?.menu_name ?? '')
    : activeGubun > 0 ? (menu?.menu_name ?? '')
    : showSubList ? (activeChild?.menu_name ?? '')
    : (activeTop?.menu_name ?? siteTitle);

  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';

  return (
    <div className="m-app" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── 헤더 ── */}
      <header className="m-header">
        <button className="m-header-btn" onClick={showBack ? handleBack : () => setDrawerOpen(true)}>
          {showBack ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h12"/></svg>
          )}
        </button>
        <span className="m-header-title">{headerTitle}</span>
        <div className="m-header-actions">
          {/* 사용자정의 버튼 */}
          {activeGubun > 0 && viewIdx == null && customButtons && customButtons.map((btn, i) => (
            <button key={i} className="m-header-action" onClick={() => {
              window.__mis_custom_action = btn.action ?? btn.label;
              setReloadKey(k => k + 1);
            }}>{btn.label}</button>
          ))}
          {/* +등록 버튼 */}
          {activeGubun > 0 && viewIdx == null && !onlyList && menu?.g01 !== 'simple_list' && (
            <button className="m-header-action m-header-action--primary" onClick={handleWrite}>
              {buttonText?.write ?? '+등록'}
            </button>
          )}
          <button className="m-header-btn" onClick={toggleMode} title="PC 버전">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          </button>
        </div>
      </header>

      {/* ── 콘텐츠 ── */}
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {viewIdx != null ? (
          <MobileFormView
            gubun={activeGubun} idx={viewIdx} linkVal={viewLinkVal} mode={viewMode}
            user={user} menu={menu}
            onBack={handleBack} onModify={handleModify} onSaved={handleSaved} onDeleted={handleDeleted}
          />
        ) : showSubList && grandChildren.length > 0 ? (
          <div className="m-scroll" style={{ height: '100%' }}>
            <div className="m-submenu">
              {grandChildren.map(gc => (
                <button key={gc.idx} className="m-submenu-item" onClick={() => runProgram(gc.idx, gc)}>
                  <span className="m-submenu-dot" />
                  <span style={{ flex: 1 }}>{gc.menu_name}</span>
                  {gc.brief_title && <span className="m-card-badge">{gc.brief_title}</span>}
                </button>
              ))}
            </div>
          </div>
        ) : activeGubun > 0 && menu?.menu_type === '13' && menu?.add_url ? (
          /* iframe 프로그램 */
          <iframe
            src={menu.add_url}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title={menu.menu_name ?? ''}
            allow="fullscreen"
          />
        ) : activeGubun > 0 ? (
          <MobileCardList key={`${activeGubun}-${reloadKey}`} gubun={activeGubun} user={user} menu={menu} onCardClick={handleCardClick} onWrite={handleWrite} onMeta={handleMeta} />
        ) : (
          <div className="m-empty">
            <svg className="m-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <span className="m-empty-text">메뉴를 선택해주세요</span>
          </div>
        )}
      </main>

      {/* ── 하단 탭바 (2행) ── */}
      {showTabs && (() => {
        const half = Math.ceil(children.length / 2);
        const row1 = children.slice(0, half);
        const row2 = children.slice(half);
        const cols = Math.max(row1.length, row2.length);
        return (
          <nav className="m-tabbar-2row">
            <div className="m-tabbar-scroll" style={{ gridTemplateColumns: `repeat(${cols}, minmax(76px, 1fr))` }}>
              {row1.map((c, ci) => (
                <button key={c.idx}
                  className={`m-tab2 ${activeChild?.idx === c.idx ? 'm-tab2--active' : ''}`}
                  style={{ gridRow: 1, gridColumn: ci + 1 }}
                  onClick={() => handleChildSelect(c)}>
                  <span className="m-tab2-icon">{getTabIcon(ci, c.menu_name)}</span>
                  <span className="m-tab2-label">{c.menu_name}</span>
                </button>
              ))}
              {row2.map((c, ci) => (
                <button key={c.idx}
                  className={`m-tab2 ${activeChild?.idx === c.idx ? 'm-tab2--active' : ''}`}
                  style={{ gridRow: 2, gridColumn: ci + 1 }}
                  onClick={() => handleChildSelect(c)}>
                  <span className="m-tab2-icon">{getTabIcon(half + ci, c.menu_name)}</span>
                  <span className="m-tab2-label">{c.menu_name}</span>
                </button>
              ))}
            </div>
          </nav>
        );
      })()}

      {/* ── 드로어 ── */}
      {drawerOpen && (
        <>
          <div className="m-drawer-overlay" onClick={() => setDrawerOpen(false)} />
          <div className="m-drawer">
            <div className="m-drawer-header">
              <span className="m-drawer-logo">{siteTitle}</span>
            </div>
            <div className="m-scroll" style={{ flex: 1 }}>
              {menuTree.map(node => (
                <button
                  key={node.idx}
                  className={`m-drawer-item ${activeTop?.idx === node.idx ? 'm-drawer-item--active' : ''}`}
                  onClick={() => handleTopSelect(node)}
                >{node.menu_name}</button>
              ))}
            </div>
            <div className="m-drawer-footer">
              <span className="m-drawer-user">{user?.user_name ?? user?.uid}</span>
              <div className="m-drawer-actions">
                <button className="m-drawer-btn" onClick={() => {
                  const html = document.documentElement;
                  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                  html.setAttribute('data-theme', next);
                  localStorage.setItem('mis_theme', next);
                }}>
                  {isDark ? '☀ 라이트' : '🌙 다크'}
                </button>
                <button className="m-drawer-btn" onClick={toggleMode}>🖥 PC</button>
              </div>
              <button className="m-drawer-btn m-drawer-btn--danger" onClick={onLogout}>로그아웃</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
