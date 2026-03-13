param(
    [string]$ConfigPath = ""
)

function Resolve-RepoPath {
    param(
        [string]$Value,
        [string]$BaseDir
    )

    $expanded = [Environment]::ExpandEnvironmentVariables($Value)
    if ($expanded.StartsWith("~/") -or $expanded.StartsWith("~\\")) {
        $homePath = [Environment]::GetFolderPath("UserProfile")
        $expanded = Join-Path $homePath $expanded.Substring(2)
    }

    if ([System.IO.Path]::IsPathRooted($expanded)) {
        return [System.IO.Path]::GetFullPath($expanded)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $BaseDir $expanded))
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

if (-not $ConfigPath -or [string]::IsNullOrWhiteSpace($ConfigPath)) {
    $localConfig = Join-Path $repoRoot "config\\install.local.json"
    if (Test-Path $localConfig) {
        $ConfigPath = $localConfig
    }
    else {
        $ConfigPath = Join-Path $repoRoot "config\\install.example.json"
    }
}

$resolvedConfigPath = Resolve-RepoPath -Value $ConfigPath -BaseDir $repoRoot
$config = Get-Content -Raw $resolvedConfigPath | ConvertFrom-Json

$skillName = $config.skill.name
$sourceDir = Resolve-RepoPath -Value $config.skill.source_dir -BaseDir $repoRoot
$codexHome = Resolve-RepoPath -Value $config.codex.codex_home -BaseDir $repoRoot
$targetRoot = Join-Path $codexHome "skills"
$targetDir = Join-Path $targetRoot $skillName
$installNodeDependencies = $false
if ($config.install -and $null -ne $config.install.install_node_dependencies) {
    $installNodeDependencies = [bool]$config.install.install_node_dependencies
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

if (Test-Path $targetDir) {
    Remove-Item -Recurse -Force $targetDir
}

Copy-Item -Recurse -Force $sourceDir $targetDir

$packageJson = Join-Path $targetDir "package.json"
$nodeDependenciesInstalled = $false
if ($installNodeDependencies -and (Test-Path $packageJson)) {
    Push-Location $targetDir
    try {
        npm install --omit=dev | Out-Host
        $nodeDependenciesInstalled = $true
    }
    finally {
        Pop-Location
    }
}

$result = [ordered]@{
    skill_name = $skillName
    source_dir = $sourceDir
    target_dir = $targetDir
    config_path = $resolvedConfigPath
    node_dependencies_installed = $nodeDependenciesInstalled
}

$result | ConvertTo-Json -Depth 5
