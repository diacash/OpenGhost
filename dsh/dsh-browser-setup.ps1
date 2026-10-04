# Настройка управления браузером (Playwright) для DeepSeek Harness.
# Ничего не удаляет: перед любым изменением делает копию файла в .dsh\backup-<дата>.
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Say($t, $c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Stop-Here($t) { Say "СТОП: $t" 'Red'; Say 'Ничего сверх перечисленного выше не изменено. Пришлите этот вывод в чат.' 'Yellow'; exit 1 }

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
if (-not (Test-Path $dshHome)) { Stop-Here "не найдена папка $dshHome" }
$backup = Join-Path $dshHome ('backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Say "Папка DSH: $dshHome"
Say "Копии файлов: $backup"

# --- 1. Команда dsh и её версия ---------------------------------------------
$dsh = Get-Command dsh.cmd -ErrorAction SilentlyContinue
if (-not $dsh) { $dsh = Get-Command dsh -ErrorAction SilentlyContinue }
if (-not $dsh) { Stop-Here 'команда dsh не найдена в PATH' }
$verText = (& $dsh.Source --version 2>&1 | Out-String).Trim()
$ver = if ($verText -match '(\d+\.\d+\.\d+(-[0-9A-Za-z\.]+)?)') { $Matches[1] } else { '' }
Say "dsh: $($dsh.Source), версия: $verText"

# --- 2. Профиль ---------------------------------------------------------------
$profilesDir = Join-Path $dshHome 'profiles'
$names = @()
if (Test-Path $profilesDir) { $names = @(Get-ChildItem $profilesDir -Directory | ForEach-Object { $_.Name }) }
Say ("Профили: " + ($names -join ', '))
$profile1 = $null
foreach ($n in @('web', 'desktop')) { if ($names -contains $n) { $profile1 = $n; break } }
if (-not $profile1) { Stop-Here 'не найден профиль web или desktop' }
Say "Работаю с профилем: $profile1" 'Cyan'
$profileDir = Join-Path $profilesDir $profile1
foreach ($f in @('package.json', 'cordis.patch.yml')) {
  $p = Join-Path $profileDir $f
  if (Test-Path $p) { Copy-Item $p (Join-Path $backup "profile-$profile1-$f") }
}

# --- 3. pnpm (нужен команде dsh plugin) --------------------------------------
if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue) -and -not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Say 'pnpm не найден, ставлю через npm...' 'Yellow'
  & npm.cmd install -g pnpm
  if ($LASTEXITCODE -ne 0) { Stop-Here 'не удалось установить pnpm' }
}

# --- 4. Установка двух пакетов ------------------------------------------------
$pkgs = @('@deepseek-ai/dsh-browser-use', '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp')
$specs = if ($ver) { $pkgs | ForEach-Object { "$_@$ver" } } else { $pkgs }
Say ("Ставлю: " + ($specs -join ' ')) 'Cyan'
& $dsh.Source plugin --profile $profile1 add @specs
if ($LASTEXITCODE -ne 0 -and $ver) {
  Say 'С точной версией не получилось, пробую без неё...' 'Yellow'
  & $dsh.Source plugin --profile $profile1 add @pkgs
}
if ($LASTEXITCODE -ne 0) { Stop-Here 'пакеты не установились; настройки не тронуты' }

# --- 5. Запись в cordis.patch.yml ---------------------------------------------
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$patch = Join-Path $dshHome 'cordis.patch.yml'
$old = ''
if (Test-Path $patch) { Copy-Item $patch (Join-Path $backup 'cordis.patch.yml'); $old = [IO.File]::ReadAllText($patch, $utf8) }
if ($old -match 'browser-use-playwright-mcp') {
  Say 'В cordis.patch.yml уже есть запись про Playwright, файл не меняю.' 'Yellow'
} else {
  $body = ($old -replace '^﻿', '')
  $meaningful = @($body -split "`r?`n" | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') })
  if ($meaningful.Count -gt 0 -and -not ($meaningful[0].StartsWith('- '))) { Stop-Here 'cordis.patch.yml имеет незнакомый формат, не решаюсь дописывать' }
  $add = @(
    '# Управление браузером через Playwright: свой отдельный браузер, окно видно.'
    '- insert:'
    '    - id: browser-use'
    "      name: '@deepseek-ai/dsh-browser-use'"
    '    - id: browser-use-playwright'
    "      name: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp'"
    '      config:'
    '        mode: launch'
    '        headless: false'
  )
  if ($chrome) { $add += "        executablePath: '$chrome'" }
  $new = $body.TrimEnd() + $(if ($body.Trim()) { "`n`n" } else { '' }) + ($add -join "`n") + "`n"
  [IO.File]::WriteAllText($patch, $new, $utf8)
  Say "Дописал настройки в $patch" 'Green'
}

# --- 6. AGENTS.md: вместо раздела про Cua Driver — раздел про браузер ---------
$agents = Join-Path $dshHome 'AGENTS.md'
if (Test-Path $agents) {
  Copy-Item $agents (Join-Path $backup 'AGENTS.md')
  $t = [IO.File]::ReadAllText($agents, $utf8) -replace "`r`n", "`n"
  $t = [regex]::Replace($t, '(?ms)^# Управление компьютером \(Cua Driver\)\n.*?(?=^# |\z)', '')
  if ($t -notmatch '(?m)^# Браузер') {
    $t = $t.TrimEnd() + "`n`n" + (@(
      '# Браузер'
      ''
      '- Для сайтов используй инструменты `mcp__playwright-mcp__*`: открыть страницу, нажать, ввести текст, прочитать содержимое. Не запускай браузер через PowerShell.'
      '- У тебя свой отдельный браузер с чистым профилем; входы на сайты между чатами не сохраняются.'
      '- «Открой браузер» без уточнений значит: открой этот браузер и спроси, какой сайт нужен.'
      '- Никогда не вводи пароли, платёжные данные и ключи, не отправляй сообщения и не совершай покупок без явного подтверждения пользователя.'
    ) -join "`n") + "`n"
  }
  [IO.File]::WriteAllText($agents, $t, $utf8)
  Say "Обновил $agents" 'Green'
}

Say ''
Say 'ГОТОВО. Теперь полностью закройте DeepSeek Harness, запустите заново и начните НОВЫЙ чат.' 'Green'
Say "Откатить: скопируйте файлы из $backup обратно на место."
