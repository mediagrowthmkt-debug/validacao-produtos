<?php
/**
 * Backend da GALERIA DE VALIDAÇÃO DE PRODUTOS — MediaGrowth.
 *
 * Segurança (CHECKLIST-SEGURANCA-APPS-PRODUCAO):
 *  - Autorização por CHAVE por slug (anti IDOR, itens 16/18): o link do cliente leva ?k=<chave do cliente>
 *    (lê e grava); o painel interno usa a chave admin (só lê). As chaves ficam só como SHA-256,
 *    FORA do web root, e são comparadas com hash_equals (timing-safe, E7).
 *  - Dados e chaves FORA do public_html (item 12): <dominio>/produtos-private/{tokens.json,data/,backup/}.
 *  - CORS com origem explícita (E1), só POST form-urlencoded (E22), limite de corpo (E10),
 *    whitelist de campos (item 13), rate limit (item 23), sem stack trace (item 30),
 *    headers de segurança (item 32), backup diário por slug (item 14 / E13).
 *
 * Endpoints:
 *   GET  api.php?action=get&slug=<slug>&k=<chave>              -> estado (cliente ou admin)
 *   POST api.php  action=save     slug k pid decisao qtd obs by  -> grava 1 produto (só chave do cliente)
 *   POST api.php  action=finish   slug k by                      -> marca "revisão enviada" (só cliente)
 */
ini_set('display_errors', '0');
error_reporting(0);

$ALLOWED_ORIGINS = ['https://mediagrowthmkt-debug.github.io', 'http://127.0.0.1:8841'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $ALLOWED_ORIGINS, true)) {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  header('Access-Control-Max-Age: 600');
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
header('Strict-Transport-Security: max-age=31536000; includeSubDomains');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if ($origin !== '' && !in_array($origin, $ALLOWED_ORIGINS, true)) { http_response_code(403); echo '{"erro":"origem"}'; exit; }
require __DIR__ . '/_ratelimit.php';

function out($code, $arr) { http_response_code($code); echo json_encode($arr, JSON_UNESCAPED_UNICODE); exit; }
function bad($msg) { out(400, ['erro' => $msg]); }
function clip($s, $n) { $s = is_string($s) ? $s : ''; return mb_substr(trim($s), 0, $n); }

if ($method === 'POST') {
  if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 16384) out(413, ['erro' => 'corpo grande demais']);
  $ct = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
  if (strpos($ct, 'application/x-www-form-urlencoded') !== 0) out(415, ['erro' => 'content-type']);
} elseif ($method !== 'GET') {
  out(405, ['erro' => 'metodo']);
}

$PRIV = getenv('VP_PRIVATE_DIR') ?: dirname(__DIR__, 2) . '/produtos-private';
$slug = $_REQUEST['slug'] ?? '';
if (!is_string($slug) || !preg_match('/^[a-z0-9\-]{1,64}$/', $slug)) bad('slug invalido');

/* ---- autorização por chave ---- */
$tokens = @json_decode(@file_get_contents("$PRIV/tokens.json"), true);
$key = is_string($_REQUEST['k'] ?? null) ? $_REQUEST['k'] : '';
$role = null;
if (is_array($tokens) && isset($tokens[$slug]) && strlen($key) >= 20 && strlen($key) <= 128) {
  $h = hash('sha256', $key);
  if (!empty($tokens[$slug]['client']) && hash_equals($tokens[$slug]['client'], $h)) $role = 'client';
  elseif (!empty($tokens[$slug]['admin']) && hash_equals($tokens[$slug]['admin'], $h)) $role = 'admin';
}
if ($role === null) { usleep(300000); out(403, ['erro' => 'acesso negado']); }

$DATA = "$PRIV/data"; $BAK = "$PRIV/backup";
foreach ([$DATA, $BAK] as $d) { if (!is_dir($d)) @mkdir($d, 0700, true); }
$file = "$DATA/$slug.json";

function norm($j) {
  if (!is_array($j)) $j = [];
  if (!isset($j['items']) || !is_array($j['items'])) $j['items'] = [];
  if (!isset($j['reviewer']) || !is_string($j['reviewer'])) $j['reviewer'] = '';
  if (!isset($j['finished'])) $j['finished'] = null;
  return ['items' => $j['items'], 'reviewer' => $j['reviewer'], 'finished' => $j['finished']];
}
function public_state($st) { if (!$st['items']) $st['items'] = new stdClass(); return $st; }

$action = $_REQUEST['action'] ?? 'get';

if ($action === 'get') {
  if ($method !== 'GET') bad('metodo');
  $st = file_exists($file) ? norm(json_decode(file_get_contents($file), true)) : norm([]);
  out(200, public_state($st) + ['role' => $role]);
}

/* ---- escrita: só o cliente, só POST, trava exclusiva ---- */
if ($method !== 'POST') bad('metodo');
if ($role !== 'client') out(403, ['erro' => 'somente leitura']);

$fp = fopen($file, 'c+');
if (!$fp) out(500, ['erro' => 'io']);
flock($fp, LOCK_EX);
$st = norm(json_decode(stream_get_contents($fp), true));

function commit($fp, $st, $file, $BAK, $slug) {
  $json = json_encode($st, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
  ftruncate($fp, 0); rewind($fp); fwrite($fp, $json); fflush($fp);
  flock($fp, LOCK_UN); fclose($fp);
  $b = "$BAK/$slug-" . date('Y-m-d') . ".json";          // 1 backup por dia (último estado do dia)
  @file_put_contents($b, $json, LOCK_EX);
  out(200, ['ok' => true, 'finished' => $st['finished']]);
}
function abort_lock($fp, $msg) { flock($fp, LOCK_UN); fclose($fp); bad($msg); }

if ($action === 'save') {
  $pid = clip($_POST['pid'] ?? '', 32);
  if (!preg_match('/^[0-9]{1,20}$/', $pid)) abort_lock($fp, 'pid invalido');
  $dec = clip($_POST['decisao'] ?? '', 10);
  if (!in_array($dec, ['manter', 'remover', ''], true)) abort_lock($fp, 'decisao invalida');
  $obs = clip($_POST['obs'] ?? '', 1000);
  $by  = clip($_POST['by'] ?? '', 80);
  $qin = json_decode(is_string($_POST['qtd'] ?? null) ? $_POST['qtd'] : '{}', true);
  $qtd = [];
  if (is_array($qin)) {
    foreach ($qin as $k => $v) {
      if (count($qtd) >= 60) break;
      if (!preg_match('/^[0-9]{1,20}$/', (string)$k)) continue;
      if (!is_int($v) && !(is_string($v) && preg_match('/^[0-9]{1,5}$/', $v))) continue;
      $qtd[(string)$k] = max(0, min(99999, (int)$v));
    }
  }
  if (!isset($st['items'][$pid]) && count($st['items']) >= 3000) abort_lock($fp, 'limite de itens');
  if ($by !== '') $st['reviewer'] = $by;
  if ($dec === '' && !$qtd && $obs === '') {
    unset($st['items'][$pid]);
  } else {
    $st['items'][$pid] = ['decisao' => $dec, 'qtd' => (object)$qtd, 'obs' => $obs, 'by' => $by, 'at' => date('c')];
  }
  commit($fp, $st, $file, $BAK, $slug);
}

if ($action === 'finish') {
  $by = clip($_POST['by'] ?? '', 80);
  if ($by !== '') $st['reviewer'] = $by;
  $st['finished'] = ['by' => $by, 'at' => date('c')];
  commit($fp, $st, $file, $BAK, $slug);
}

abort_lock($fp, 'action invalida');
