<?php
/**
 * HTML 쉘 — React SPA 진입점
 * window.__INITIAL_DATA__ 와 window.__APP_CONFIG__ 주입
 */

/** @var array $initialData */
/** @var array $appConfig */
$initialData = $initialData ?? [];
$appConfig   = $appConfig   ?? [];

$siteTitle = htmlspecialchars($_ENV['SITE_TITLE'] ?? 'SpeedMIS', ENT_QUOTES);
$appUrl    = rtrim($_ENV['APP_URL'] ?? '', '/');

// Vite manifest 읽기 (production)
function getViteAssets(): array
{
    $manifestPath = PUBLIC_PATH . '/build/.vite/manifest.json';
    if (!file_exists($manifestPath)) {
        $manifestPath = PUBLIC_PATH . '/build/manifest.json';
    }
    if (!file_exists($manifestPath)) return ['js' => '', 'css' => ''];

    $manifest = json_decode(file_get_contents($manifestPath), true) ?? [];
    $entry    = $manifest['src/main.jsx'] ?? $manifest['index.html'] ?? null;
    if (!$entry) return ['js' => '', 'css' => ''];

    $js  = '/public/build/' . ($entry['file']    ?? '');
    $css = !empty($entry['css'][0]) ? '/public/build/' . $entry['css'][0] : '';
    return compact('js', 'css');
}

$isProd  = ($_ENV['APP_ENV'] ?? '') === 'production';
$assets  = $isProd ? getViteAssets() : null;
$vitePort = 5173;
?>
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title><?= $siteTitle ?></title>
    <meta name="robots" content="noindex, nofollow">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0E1117" media="(prefers-color-scheme: dark)">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">

    <!-- FOUC 방지: 페이지 렌더 전에 테마 적용 (인라인 필수) -->
    <script>
        (function(){
            var t = localStorage.getItem('mis_theme');
            if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        })();
    </script>

    <!-- 폰트 -->
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">

    <!-- 디자인 시스템 -->
    <link rel="stylesheet" href="/public/css/design-system.css">
    <link rel="stylesheet" href="/public/css/layout.css">
    <link rel="stylesheet" href="/public/css/components.css">
    <link rel="stylesheet" href="/public/css/mobile.css">

    <?php if ($isProd && $assets && $assets['css']): ?>
    <link rel="stylesheet" href="<?= htmlspecialchars($assets['css']) ?>">
    <?php endif; ?>

    <style>
        #loading-screen {
            position: fixed; inset: 0; display: flex;
            align-items: center; justify-content: center;
            background: var(--color-bg, #0F1117); z-index: 9999;
        }
        #loading-screen.hidden { display: none; }
        #loading-screen__inner { text-align: center; color: var(--color-text-3, #5C6389); }
        #loading-screen__icon  { font-size: 28px; margin-bottom: 10px; }
        #loading-screen__label { font-size: 13px; font-family: var(--font-sans, sans-serif); }
    </style>
</head>
<body>

<div id="loading-screen">
    <div id="loading-screen__inner">
        <div id="loading-screen__icon">⚡</div>
        <div id="loading-screen__label"><?= $siteTitle ?></div>
    </div>
</div>

<div id="root"></div>

<script>
window.__APP_CONFIG__ = <?= json_encode($appConfig, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>;
window.__INITIAL_DATA__ = <?= json_encode($initialData, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>;
</script>

<?php if ($isProd && $assets && $assets['js']): ?>
    <script type="module" src="<?= htmlspecialchars($assets['js']) ?>"></script>
<?php else: ?>
    <!-- @vitejs/plugin-react preamble (커스텀 백엔드 필수) -->
    <script type="module">
        import RefreshRuntime from 'http://localhost:<?= $vitePort ?>/@react-refresh'
        RefreshRuntime.injectIntoGlobalHook(window)
        window.$RefreshReg$ = () => {}
        window.$RefreshSig$ = () => (type) => type
        window.__vite_plugin_react_preamble_installed__ = true
    </script>
    <!-- Vite HMR (개발) -->
    <script type="module" src="http://localhost:<?= $vitePort ?>/@vite/client"></script>
    <script type="module" src="http://localhost:<?= $vitePort ?>/src/main.jsx"></script>
<?php endif; ?>

</body>
</html>
