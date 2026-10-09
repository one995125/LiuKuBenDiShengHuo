param(
  [string]$EnvId = '',
  [switch]$Functions,
  [switch]$Hosting,
  [string[]]$OnlyFunction = @()
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AppConfigPath = Join-Path $ProjectRoot 'config\liuku-app-config.json'
$CloudBaseConfigPath = Join-Path $ProjectRoot 'cloudbaserc.json'
$AppConfig = Get-Content -LiteralPath $AppConfigPath -Raw | ConvertFrom-Json
$TemporaryCloudBaseConfigPath = ''

if (-not $EnvId) {
  $EnvId = $AppConfig.cloud.environmentId
}

if (-not $Functions -and -not $Hosting) {
  throw 'Specify -Functions or -Hosting. Example: .\tools\deploy-cloudbase.ps1 -Functions'
}

Push-Location $ProjectRoot
try {
  Write-Host "Checking CloudBase CLI login and environment: $EnvId"
  & npx.cmd --yes --package '@cloudbase/cli' tcb env:list | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw 'CloudBase CLI is not authenticated. Run: npx.cmd --yes --package @cloudbase/cli tcb login'
  }

  if ($Functions) {
    $SourceAppIdEnvVar = $AppConfig.cloud.sourceAppIdEnvVar
    $ProtectedFunctionNames = @(
      $AppConfig.cloud.functionNames.publicApi,
      $AppConfig.cloud.functionNames.userApi,
      $AppConfig.cloud.functionNames.adminApi
    )
    $CloudBaseConfig = Get-Content -LiteralPath $CloudBaseConfigPath -Raw | ConvertFrom-Json

    # Keep the AppID in the shared config only. Generate a temporary cloudbaserc so
    # protected API functions receive the source-AppID variable on every deployment.
    foreach ($FunctionConfig in $CloudBaseConfig.functions) {
      if ($ProtectedFunctionNames -contains $FunctionConfig.name) {
        $EnvironmentVariables = [ordered]@{}
        if ($FunctionConfig.PSObject.Properties.Name -contains 'envVariables') {
          foreach ($Property in $FunctionConfig.envVariables.PSObject.Properties) {
            $EnvironmentVariables[$Property.Name] = $Property.Value
          }
        }
        $EnvironmentVariables[$SourceAppIdEnvVar] = $AppConfig.appId
        $FunctionConfig | Add-Member -MemberType NoteProperty -Name 'envVariables' -Value ([pscustomobject]$EnvironmentVariables) -Force
      }
    }

    $TemporaryConfigName = "liuku-cloudbaserc-{0}.json" -f [Guid]::NewGuid().ToString('N')
    $TemporaryCloudBaseConfigPath = Join-Path ([System.IO.Path]::GetTempPath()) $TemporaryConfigName
    $TemporaryConfigJson = $CloudBaseConfig | ConvertTo-Json -Depth 12
    $Utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($TemporaryCloudBaseConfigPath, $TemporaryConfigJson, $Utf8WithoutBom)
    Write-Host "Prepared temporary CloudBase config with ${SourceAppIdEnvVar} for protected API functions."

    $AvailableFunctionNames = @(
      $AppConfig.cloud.functionNames.publicApi,
      $AppConfig.cloud.functionNames.userApi,
      $AppConfig.cloud.functionNames.adminApi,
      $AppConfig.cloud.functionNames.maintenance
    )
    $UnknownFunctionNames = @($OnlyFunction | Where-Object { $AvailableFunctionNames -notcontains $_ })
    if ($UnknownFunctionNames.Count -gt 0) {
      throw "Unknown cloud function: $($UnknownFunctionNames -join ', ')"
    }
    $FunctionNames = if ($OnlyFunction.Count -gt 0) {
      @($OnlyFunction)
    } else {
      $AvailableFunctionNames
    }

    foreach ($FunctionName in $FunctionNames) {
      $FunctionDir = Join-Path './cloudfunctions' $FunctionName
      Write-Host "Deploying cloud function: $FunctionName"
      $DeployArguments = @(
        '--yes',
        '--package',
        '@cloudbase/cli',
        'tcb',
        '--config-file',
        $TemporaryCloudBaseConfigPath,
        'fn',
        'deploy',
        $FunctionName,
        '--force',
        '--dir',
        $FunctionDir,
        '--deployMode',
        'zip',
        '--env-id',
        $EnvId
      )
      & npx.cmd @DeployArguments
      if ($LASTEXITCODE -ne 0) {
        throw "Cloud function deployment failed: $FunctionName"
      }
    }
  }

  if ($Hosting) {
    Write-Host 'Building admin web.'
    & npm.cmd --prefix admin-web run build
    if ($LASTEXITCODE -ne 0) {
      throw 'Admin web build failed.'
    }

    Write-Host 'Removing old liuku-admin hosting files.'
    & npx.cmd --yes --package '@cloudbase/cli' tcb hosting delete liuku-admin `
      --dir `
      --yes `
      --env-id $EnvId
    if ($LASTEXITCODE -ne 0) {
      Write-Warning 'The old liuku-admin directory was not removed. Continuing with overwrite upload.'
    }

    Write-Host 'Deploying admin-web/dist to CloudBase hosting path /liuku-admin.'
    & npx.cmd --yes --package '@cloudbase/cli' tcb hosting deploy ./admin-web/dist liuku-admin -e $EnvId
    if ($LASTEXITCODE -ne 0) {
      throw 'Static hosting deployment failed.'
    }
  }
} finally {
  if ($TemporaryCloudBaseConfigPath -and (Test-Path -LiteralPath $TemporaryCloudBaseConfigPath)) {
    Remove-Item -LiteralPath $TemporaryCloudBaseConfigPath -Force
  }
  Pop-Location
}
