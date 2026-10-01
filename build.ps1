$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

npm ci --silent --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$version = node -p "require('./package.json').version"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$buildDirectory = Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Force -Path $buildDirectory | Out-Null
$outputPath = Join-Path $buildDirectory "codex-profiles-$version.vsix"

npm run --silent check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run --silent build -- --logLevel warn
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run --silent package -- --out $outputPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Built: $outputPath"
