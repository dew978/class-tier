# 보안 규칙 만들기: rules.template.json 의 {{이름}} 을 rules.fragments.txt 의 조각으로 바꿔 database.rules.json 생성
# 사용법: powershell -ExecutionPolicy Bypass -File tools\build-rules.ps1
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$utf8 = New-Object Text.UTF8Encoding $false

$frag = @{}
$name = $null
$buf = New-Object System.Collections.Generic.List[string]
foreach ($line in [IO.File]::ReadAllLines((Join-Path $here 'rules.fragments.txt'), $utf8)) {
  if ($line -match '^\s*#') { continue }
  if ($line -match '^@(\w+)\s*$') {
    if ($name) { $frag[$name] = ($buf -join ' ').Trim() }
    $name = $Matches[1]
    $buf.Clear()
    continue
  }
  if ($line.Trim()) { $buf.Add($line.Trim()) }
}
if ($name) { $frag[$name] = ($buf -join ' ').Trim() }

$text = [IO.File]::ReadAllText((Join-Path $here 'rules.template.json'), $utf8)
$eval = [System.Text.RegularExpressions.MatchEvaluator] {
  param($m)
  $k = $m.Groups[1].Value
  if (-not $frag.ContainsKey($k)) { throw "없는 조각: $k" }
  $frag[$k]
}
for ($i = 0; $i -lt 30 -and $text -match '\{\{\w+\}\}'; $i++) {
  $text = [regex]::Replace($text, '\{\{(\w+)\}\}', $eval)
}
if ($text -match '\{\{') { throw '바꾸지 못한 조각이 남아 있습니다.' }

$null = $text | ConvertFrom-Json   # JSON 문법 검사
$out = Join-Path (Split-Path $here) 'database.rules.json'
[IO.File]::WriteAllText($out, $text, $utf8)
$longest = ([regex]::Matches($text, '"(?:[^"\\]|\\.)*"') | ForEach-Object { $_.Value.Length } | Measure-Object -Maximum).Maximum
Write-Host ("database.rules.json 생성: {0:N0}자 (가장 긴 규칙 {1:N0}자)" -f $text.Length, $longest)
