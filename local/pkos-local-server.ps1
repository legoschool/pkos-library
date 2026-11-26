# PKOS 내 컴퓨터 서버
# 받은 PKOS 폴더를 http://localhost:5180 으로 열어 줍니다. 설치할 것이 없고, 이 컴퓨터 밖으로는 열리지 않습니다.
# 창을 닫으면 서버도 꺼집니다. 브라우저 저장 공간은 주소마다 따로라서 늘 같은 번호(5180)를 씁니다.
param([int]$Port = 5180, [switch]$NoBrowser)
$wanted = $Port
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path (Join-Path $root 'index.html'))) { Write-Host 'index.html을 찾지 못했습니다. ZIP 압축을 푼 PKOS 폴더 안에서 실행해 주세요.'; exit 1 }

$types = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'
  '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.webmanifest'='application/manifest+json; charset=utf-8'
  '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.gif'='image/gif'; '.webp'='image/webp'; '.ico'='image/x-icon'
  '.wasm'='application/wasm'; '.woff'='font/woff'; '.woff2'='font/woff2'; '.ttf'='font/ttf'; '.txt'='text/plain; charset=utf-8'; '.md'='text/plain; charset=utf-8'
  '.pdf'='application/pdf'; '.mp4'='video/mp4'; '.webm'='video/webm'; '.mp3'='audio/mpeg'; '.wav'='audio/wav'; '.onnx'='application/octet-stream'; '.gz'='application/gzip'
}

$listener = $null
foreach ($p in @($Port) + (($Port + 1)..($Port + 9))) {
  $try = New-Object System.Net.HttpListener
  $try.Prefixes.Add("http://localhost:$p/")
  try { $try.Start(); $listener = $try; $Port = $p; break } catch { $try.Close() }
}
if (-not $listener) { Write-Host "포트 $Port~$($Port+9)를 모두 쓰고 있어 열지 못했습니다. 다른 PKOS 창이 켜져 있는지 확인해 주세요."; exit 1 }
$url = "http://localhost:$Port/"
Write-Host ''
Write-Host '  PKOS · 나의지식서재 (내 컴퓨터)'
Write-Host "  주소: $url"
if ($Port -ne $wanted) { Write-Host "  주의: $($wanted)번이 이미 쓰이고 있어 다른 번호로 열었습니다. 브라우저 저장 공간이 달라 지난 기록이 안 보일 수 있습니다." }
Write-Host '  이 창을 닫으면 PKOS도 닫힙니다. 쓰는 동안 켜 두세요.'
Write-Host ''

if (-not $NoBrowser) {
  $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LocalAppData\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($chrome) { Start-Process $chrome $url } elseif ($edge) { Start-Process $edge $url } else { Start-Process $url }
}

$rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $res = $ctx.Response
  try {
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path.EndsWith('/')) { $path += 'index.html' }
    $file = [System.IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/') -replace '/', '\')))
    if (-not $file.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or $file -like '*\.git\*' -or $file -like '*\.git') { $res.StatusCode = 403; $res.Close(); continue }
    if ((Test-Path $file -PathType Container)) { $res.StatusCode = 301; $res.RedirectLocation = $ctx.Request.Url.AbsolutePath + '/'; $res.Close(); continue }
    if (-not (Test-Path $file -PathType Leaf)) { $res.StatusCode = 404; $b = [System.Text.Encoding]::UTF8.GetBytes('찾는 파일이 없습니다.'); $res.ContentType = 'text/plain; charset=utf-8'; $res.OutputStream.Write($b, 0, $b.Length); $res.Close(); continue }
    $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
    $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
    $res.Headers['Cache-Control'] = 'no-cache'
    $res.Headers['X-Content-Type-Options'] = 'nosniff'
    $fs = [System.IO.File]::OpenRead($file)
    try { $res.ContentLength64 = $fs.Length; if ($ctx.Request.HttpMethod -ne 'HEAD') { $fs.CopyTo($res.OutputStream) } } finally { $fs.Close() }
    $res.Close()
  } catch {
    try { $res.Abort() } catch {}
  }
}
