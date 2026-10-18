$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
  & node scripts/build.mjs
  if ($LASTEXITCODE -ne 0) { throw '构建失败；请按 README 配置 MoonBit 工具链。' }
  Write-Host '浏览器打开 http://127.0.0.1:4321 ，按 Ctrl+C 停止。'
  & node server/index.mjs
} finally { Pop-Location }
