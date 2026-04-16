<?php

namespace App;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

class AuthMiddleware implements MiddlewareInterface
{
    /** act= 값 중 인증 불필요 목록 */
    private const PUBLIC_ACTS = ['login', 'logout', 'refresh', 'ping', 'csrf'];

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $params = $request->getQueryParams();
        $act    = $params['act'] ?? '';

        if (in_array($act, self::PUBLIC_ACTS, true)) {
            return $handler->handle($request);
        }

        $token = $this->extractToken($request);
        if (!$token) {
            return $this->unauthorized('토큰이 없습니다.');
        }

        try {
            $secret  = $_ENV['APP_PWD_KEY'] ?? 'secret';
            $payload = JWT::decode($token, new Key($secret, JWT_ALGO));

            if (($payload->type ?? '') !== 'access') {
                return $this->unauthorized('유효하지 않은 토큰 유형입니다.');
            }

            // DB에서 is_admin / use_yn 최신값으로 덮어쓰기 (JWT 캐시 방지)
            try {
                $pdo  = \App\Config\Database::getInstance();
                $stmt = $pdo->prepare(
                    'SELECT is_admin, use_yn, theme FROM mis_users WHERE user_id = ? LIMIT 1'
                );
                $stmt->execute([$payload->uid ?? '']);
                $row = $stmt->fetch();
                if ($row) {
                    $payload->is_admin = $row['is_admin'];
                    $payload->theme    = $row['theme'] ?? 'light';
                    if ($row['use_yn'] !== '1') {
                        return $this->unauthorized('사용이 중지된 계정입니다.');
                    }
                }
            } catch (\Throwable) {}

            $request = $request->withAttribute('user', $payload);
        } catch (\Throwable $e) {
            return $this->unauthorized('토큰이 만료되었거나 유효하지 않습니다.');
        }

        return $handler->handle($request);
    }

    private function extractToken(ServerRequestInterface $request): ?string
    {
        // 1) Authorization: Bearer {token}
        $auth = $request->getHeaderLine('Authorization');
        if (str_starts_with($auth, 'Bearer ')) {
            return substr($auth, 7);
        }

        // 2) HttpOnly 쿠키
        $cookies = $request->getCookieParams();
        return $cookies['access_token'] ?? null;
    }

    private function unauthorized(string $message): ResponseInterface
    {
        $response = new Response(401);
        $response->getBody()->write(json_encode([
            'success' => false,
            'message' => $message,
        ], JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
