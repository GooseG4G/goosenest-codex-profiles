$ErrorActionPreference = 'Stop'

Set-Location (Split-Path -Parent $PSScriptRoot)

npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run package
exit $LASTEXITCODE
