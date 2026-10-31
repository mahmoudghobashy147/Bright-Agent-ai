$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force artifacts | Out-Null
$target = Join-Path $env:RUNNER_TEMP 'BrightAiInstallSmoke'
$installer = (Resolve-Path 'desktop/dist/Bright-Ai-Setup.exe').Path
$process = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$target") -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "Installer exit code $($process.ExitCode)" }
$executable = Join-Path $target 'Bright Ai.exe'
if (-not (Test-Path $executable)) { throw 'Installed EXE missing' }
$env:BRIGHT_INSTALLED_EXE = $executable
node scripts/windows-ui-smoke.js
if ($LASTEXITCODE -ne 0) { throw 'Installed UI smoke failed' }
$hash = (Get-FileHash $installer -Algorithm SHA256).Hash
@{ installer='Bright-Ai-Setup.exe'; sha256=$hash; installed=$true; launched=$true; scope='Clean Windows runner setup screen only; no real integrations'; time=(Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content artifacts/windows-install-result.json
$uninstaller = Join-Path $target 'Uninstall Bright Ai.exe'
if (Test-Path $uninstaller) { Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait }
