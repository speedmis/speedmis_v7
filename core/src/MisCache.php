<?php

namespace App;

class MisCache
{
    private bool   $useApcu;
    private string $cacheDir;

    public function __construct()
    {
        $this->useApcu  = extension_loaded('apcu') && apcu_enabled() && PHP_SAPI !== 'cli';
        $this->cacheDir = CACHE_PATH;
        if (!$this->useApcu && !is_dir($this->cacheDir)) {
            @mkdir($this->cacheDir, 0755, true);
        }
    }

    public function get(string $key): mixed
    {
        if ($this->useApcu) {
            $v = apcu_fetch($key, $ok);
            return $ok ? $v : null;
        }
        return $this->fileGet($key);
    }

    public function set(string $key, mixed $value, int $ttl = CACHE_TTL): void
    {
        if ($this->useApcu) {
            apcu_store($key, $value, $ttl);
            // real_pid 인덱스 등록
            $realPid = explode('_', $key)[0] ?? '';
            if ($realPid) {
                $idx = apcu_fetch("__idx_{$realPid}") ?: [];
                $idx[$key] = true;
                apcu_store("__idx_{$realPid}", $idx, $ttl + 60);
            }
            return;
        }
        $this->fileSet($key, $value, $ttl);
    }

    public function delete(string $key): void
    {
        if ($this->useApcu) { apcu_delete($key); return; }
        @unlink($this->getFilePath($key));
        @unlink($this->getFilePath($key) . '.meta');
    }

    public function invalidateByRealPid(string $real_pid): void
    {
        if ($this->useApcu) {
            $idx = apcu_fetch("__idx_{$real_pid}") ?: [];
            foreach (array_keys($idx) as $k) apcu_delete($k);
            apcu_delete("__idx_{$real_pid}");
            return;
        }
        foreach (glob($this->cacheDir . '/*.meta') ?: [] as $meta) {
            $m = @unserialize((string)@file_get_contents($meta));
            if (is_array($m) && ($m['real_pid'] ?? '') === $real_pid) {
                @unlink(str_replace('.meta', '', $meta));
                @unlink($meta);
            }
        }
    }

    public function makeKey(string $real_pid, string $userid, string $extra): string
    {
        return "{$real_pid}_{$userid}_" . md5($extra);
    }

    // -------------------------------------------------------------------------
    private function fileGet(string $key): mixed
    {
        $path = $this->getFilePath($key);
        if (!file_exists($path)) return null;
        $meta = @unserialize((string)@file_get_contents($path . '.meta'));
        if (!is_array($meta) || time() > $meta['expires_at']) {
            @unlink($path); @unlink($path . '.meta');
            return null;
        }
        $raw = @file_get_contents($path);
        return $raw !== false ? unserialize($raw) : null;
    }

    private function fileSet(string $key, mixed $value, int $ttl): void
    {
        $path    = $this->getFilePath($key);
        $realPid = explode('_', $key)[0] ?? '';
        @file_put_contents($path, serialize($value), LOCK_EX);
        @file_put_contents($path . '.meta', serialize([
            'real_pid'   => $realPid,
            'expires_at' => time() + $ttl,
        ]), LOCK_EX);
    }

    private function getFilePath(string $key): string
    {
        return $this->cacheDir . '/' . sha1($key) . '.cache';
    }
}
