<?php
/**
 * SpeedMIS v7 — SPA 프론트 컨트롤러
 * 정적 파일은 web.config/Apache 가 먼저 처리 → 여기 오는 건 HTML 껍데기만
 */

define('BASE_PATH', __DIR__);
require_once BASE_PATH . '/config/constants.php';
require_once BASE_PATH . '/vendor/autoload.php';

use Dotenv\Dotenv;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

// 환경변수 로드
$dotenv = Dotenv::createImmutable(BASE_PATH);
$dotenv->safeLoad();

// ─── 단축 URL 리다이렉트 (?s=XXXXXXX) ───────────────────────────────────────
if (isset($_GET['s']) && preg_match('/^[A-Za-z0-9]{4,10}$/', $_GET['s'])) {
    try {
        $pdo  = \App\Config\Database::getInstance();
        $stmt = $pdo->prepare('SELECT long_url FROM mis_urls WHERE short_code = ? LIMIT 1');
        $stmt->execute([trim($_GET['s'])]);
        $row  = $stmt->fetch();
        if ($row) {
            header('Location: ' . $row['long_url'], true, 302);
            exit;
        }
    } catch (\Throwable) {}
    // 코드 없으면 메인 이동
    header('Location: /', true, 302);
    exit;
}

// ─── SSR: 초기 데이터 구성 ──────────────────────────────────────────────────
$initialData = [];
$appConfig   = [
    'siteTitle'       => $_ENV['SITE_TITLE']          ?? 'SpeedMIS',
    'apiUrl'          => (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http')
                        . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . '/api.php',
    'autoLogoutMin'   => (int)($_ENV['AUTO_LOGOUT_MINUTE'] ?? 30),
    'defaultPageSize' => DEFAULT_PAGE_SIZE,
    'maxPageSize'     => MAX_PAGE_SIZE,
    'appEnv'          => $_ENV['APP_ENV']              ?? 'production',
];

// 쿠키에서 access_token 검증 → 사용자 정보 주입 (SPA 초기 렌더 최적화)
$cookieToken = $_COOKIE['access_token'] ?? '';
if ($cookieToken) {
    try {
        $secret  = $_ENV['APP_PWD_KEY'] ?? 'secret';
        $payload = JWT::decode($cookieToken, new Key($secret, JWT_ALGO));
        if (($payload->type ?? '') === 'access') {
            $appConfig['user'] = [
                'uid'           => $payload->uid           ?? '',
                'name'          => $payload->name          ?? '',
                'is_admin'      => $payload->is_admin      ?? 'N',
                'position_code' => $payload->position_code ?? '',
            ];
        }
    } catch (\Throwable) {
        // 만료/무효 토큰 → 로그인 화면으로
    }
}

// REAL_PID_HOME: 기본 진입 메뉴 설정
$realPidHome = $_ENV['REAL_PID_HOME'] ?? '';
if ($realPidHome !== '') {
    try {
        $pdo  = \App\Config\Database::getInstance();
        $stmt = $pdo->prepare(
            'SELECT idx, real_pid, auto_gubun, up_real_pid FROM mis_menus WHERE real_pid = ? AND use_yn = \'1\' LIMIT 1'
        );
        $stmt->execute([$realPidHome]);
        $homeMenu = $stmt->fetch();
        if ($homeMenu) {
            $appConfig['homeGubun'] = (int)$homeMenu['idx'];
            // 최상위 real_pid: auto_gubun 앞 2자리와 일치하는 메뉴 찾기
            $topCode = substr($homeMenu['auto_gubun'], 0, 2);
            $stmt2 = $pdo->prepare(
                'SELECT real_pid FROM mis_menus WHERE auto_gubun = ? AND idx <> 1 AND use_yn = \'1\' LIMIT 1'
            );
            $stmt2->execute([$topCode]);
            $topRow = $stmt2->fetch();
            $appConfig['homeTopRealPid'] = $topRow['real_pid'] ?? '';
        }
    } catch (\Throwable) {}
}

// CSRF 쿠키 발급 (없으면 새로 생성)
if (empty($_COOKIE['csrf_token'])) {
    $csrfToken = bin2hex(random_bytes(32));
    setcookie('csrf_token', $csrfToken, [
        'expires'  => time() + 3600,
        'path'     => '/',
        'httponly' => false,
        'samesite' => 'Strict',
    ]);
}

// ─── HTML 출력 ─────────────────────────────────────────────────────────────
require_once BASE_PATH . '/layout/base.php';
