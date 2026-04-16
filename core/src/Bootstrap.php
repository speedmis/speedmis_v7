<?php

namespace App;

use DI\ContainerBuilder;
use Monolog\Handler\RotatingFileHandler;
use Monolog\Logger;
use Psr\Log\LoggerInterface;
use Slim\Factory\AppFactory;

class Bootstrap
{
    public static function createApp(): \Slim\App
    {
        // ── 환경변수 로드 ─────────────────────────────────────────────────────
        $dotenv = \Dotenv\Dotenv::createImmutable(BASE_PATH);
        $dotenv->safeLoad();

        // ── DI 컨테이너 ───────────────────────────────────────────────────────
        $builder = new ContainerBuilder();
        $builder->addDefinitions(self::definitions());
        $container = $builder->build();

        AppFactory::setContainer($container);
        $app = AppFactory::create();

        // ── 미들웨어 ──────────────────────────────────────────────────────────
        $app->addBodyParsingMiddleware();
        $app->addRoutingMiddleware();

        // CORS — 요청 Origin을 동적으로 반영 (같은 서버 내 IP 접근 허용)
        $app->add(function ($request, $handler) {
            $response    = $handler->handle($request);
            $reqOrigin   = $request->getHeaderLine('Origin');
            $allowOrigin = $reqOrigin !== '' ? $reqOrigin : ($_ENV['APP_URL'] ?? '*');
            return $response
                ->withHeader('Access-Control-Allow-Origin', $allowOrigin)
                ->withHeader('Access-Control-Allow-Credentials', 'true')
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
                ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
        });

        // CSRF 검증 (POST)
        $app->add(function ($request, $handler) {
            if ($request->getMethod() === 'OPTIONS') {
                $response = new \Slim\Psr7\Response(200);
                return $response;
            }
            if ($request->getMethod() === 'POST') {
                $act = $request->getQueryParams()['act'] ?? '';
                if (!in_array($act, ['login', 'refresh'], true)) {
                    $csrf = $request->getHeaderLine('X-CSRF-Token');
                    $sessionCsrf = $_COOKIE['csrf_token'] ?? '';
                    if ($csrf === '' || $sessionCsrf === '' || !hash_equals($sessionCsrf, $csrf)) {
                        $response = new \Slim\Psr7\Response(403);
                        $response->getBody()->write(json_encode([
                            'success' => false, 'message' => 'CSRF 검증 실패',
                        ], JSON_UNESCAPED_UNICODE));
                        return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
                    }
                }
            }
            return $handler->handle($request);
        });

        // JWT 인증
        $app->add($container->get(AuthMiddleware::class));

        $errorMiddleware = $app->addErrorMiddleware(
            $_ENV['APP_ENV'] === 'development',
            true,
            true,
            $container->get(LoggerInterface::class)
        );

        // JSON 에러 핸들러
        $errorMiddleware->setDefaultErrorHandler(
            function ($request, \Throwable $e, bool $displayDetails) use ($container) {
                try { $container->get(LoggerInterface::class)->error('Unhandled exception', [
                    'msg'   => $e->getMessage(),
                    'file'  => $e->getFile() . ':' . $e->getLine(),
                    'uri'   => (string)$request->getUri(),
                ]); } catch (\Throwable $ignored) {}
                $response = new \Slim\Psr7\Response(500);
                $body     = ['success' => false, 'message' => '서버 오류가 발생했습니다.', 'detail' => $e->getMessage()];
                $response->getBody()->write(json_encode($body, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
            }
        );

        return $app;
    }

    // -------------------------------------------------------------------------
    private static function definitions(): array
    {
        return [
            LoggerInterface::class => function () {
                $log = new Logger('speedmis');
                $log->pushHandler(new RotatingFileHandler(
                    LOGS_PATH . '/app.log', 30, Logger::DEBUG
                ));
                return $log;
            },

            \PDO::class => function () {
                return \App\Config\Database::getInstance();
            },

            QueryBuilder::class   => \DI\create(QueryBuilder::class),
            MisCache::class       => \DI\create(MisCache::class),

            DataHandler::class => \DI\create(DataHandler::class)->constructor(
                \DI\get(\PDO::class),
                \DI\get(QueryBuilder::class),
                \DI\get(MisCache::class),
                \DI\get(LoggerInterface::class),
                \DI\get(FileManager::class)
            ),

            MenuRouter::class => \DI\create(MenuRouter::class)->constructor(
                \DI\get(\PDO::class),
                \DI\get(LoggerInterface::class)
            ),

            FileManager::class => \DI\create(FileManager::class)->constructor(
                \DI\get(\PDO::class),
                \DI\get(LoggerInterface::class)
            ),

            AuthMiddleware::class => \DI\create(AuthMiddleware::class),
        ];
    }
}
