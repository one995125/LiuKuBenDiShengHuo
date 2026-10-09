param(
  [string]$EnvId = ''
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AppConfigPath = Join-Path $ProjectRoot 'config\liuku-app-config.json'
$AppConfig = Get-Content -LiteralPath $AppConfigPath -Raw | ConvertFrom-Json
if (-not $EnvId) {
  $EnvId = $AppConfig.cloud.environmentId
}
$FunctionName = 'liuku-seed-public-data'
$FunctionDir = Join-Path $ProjectRoot 'cloudfunctions\liuku-seed-public-data'
$SeedSource = Join-Path $ProjectRoot 'cloudfunctions\seeds\public-data.js'
$SeedTarget = Join-Path $FunctionDir 'seed-data.js'
$RequestFile = Join-Path $FunctionDir 'seed-request.json'
$NodeModulesDir = Join-Path $FunctionDir 'node_modules'
$Deployed = $false

$ResolvedProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
$ResolvedFunctionDir = [System.IO.Path]::GetFullPath($FunctionDir)
if (-not $ResolvedFunctionDir.StartsWith($ResolvedProjectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Seed function directory is outside the project workspace.'
}

Push-Location $ProjectRoot
try {
  Write-Host "Checking CloudBase environment: $EnvId"
  & npx.cmd --yes --package '@cloudbase/cli' tcb env:list | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw 'CloudBase CLI is not authenticated.'
  }

  Copy-Item -LiteralPath $SeedSource -Destination $SeedTarget -Force

  Write-Host 'Installing temporary seed function dependencies.'
  & npm.cmd --prefix $FunctionDir install --omit=dev --ignore-scripts
  if ($LASTEXITCODE -ne 0) {
    throw 'Temporary seed function dependency installation failed.'
  }

  Write-Host "Deploying temporary seed function: $FunctionName"
  'y' | & npx.cmd --yes --package '@cloudbase/cli' tcb fn deploy $FunctionName `
    --force `
    --dir $FunctionDir `
    --deployMode zip `
    --runtime Nodejs18.15 `
    --json `
    --env-id $EnvId
  if ($LASTEXITCODE -ne 0) {
    throw 'Temporary seed function deployment failed.'
  }
  $Deployed = $true

  Write-Host 'Importing and verifying public seed data.'
  & npx.cmd --yes --package '@cloudbase/cli' tcb fn invoke $FunctionName `
    --data "@$RequestFile" `
    --json `
    --env-id $EnvId
  if ($LASTEXITCODE -ne 0) {
    throw 'Public seed data import failed.'
  }
} finally {
  if ($Deployed) {
    Write-Host "Removing temporary cloud function: $FunctionName"
    & npx.cmd --yes --package '@cloudbase/cli' tcb fn delete $FunctionName --env-id $EnvId --json | Out-Host
  }

  if (Test-Path -LiteralPath $SeedTarget) {
    Remove-Item -LiteralPath $SeedTarget -Force
  }

  # Remove one-time local dependencies after deleting the temporary cloud function.
  if (Test-Path -LiteralPath $NodeModulesDir) {
    $ResolvedNodeModulesDir = [System.IO.Path]::GetFullPath($NodeModulesDir)
    if (-not $ResolvedNodeModulesDir.StartsWith($ResolvedFunctionDir, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'Temporary seed function node_modules is outside the seed function directory.'
    }
    Remove-Item -LiteralPath $ResolvedNodeModulesDir -Recurse -Force
  }

  Pop-Location
}
