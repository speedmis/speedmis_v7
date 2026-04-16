import { useState, useCallback } from 'react';

const KEY = 'mis_view_mode';

function detectMobile() {
  const url = new URLSearchParams(window.location.search);
  const urlMode = url.get('mode');
  if (urlMode === 'mobile') return true;
  if (urlMode === 'pc') return false;
  const saved = localStorage.getItem(KEY);
  if (saved) return saved === 'mobile';
  return window.innerWidth <= 768 && navigator.maxTouchPoints > 0;
}

export default function useMobileMode() {
  const [isMobile, setIsMobile] = useState(detectMobile);

  const toggleMode = useCallback(() => {
    const next = !isMobile;
    localStorage.setItem(KEY, next ? 'mobile' : 'pc');
    setIsMobile(next);
    // URL에 mode 파라미터 업데이트
    const p = new URLSearchParams(window.location.search);
    p.set('mode', next ? 'mobile' : 'pc');
    window.history.replaceState(null, '', '?' + decodeURIComponent(p.toString()));
  }, [isMobile]);

  return { isMobile, toggleMode };
}
