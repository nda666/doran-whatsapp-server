$ErrorActionPreference = 'Stop'
$kasirRoot = 'D:\laragon\www\kasir'
$packageRoot = $PSScriptRoot
$baseline = Get-Content -LiteralPath (Join-Path $packageRoot 'baseline.json') -Raw | ConvertFrom-Json
foreach ($entry in $baseline.PSObject.Properties) {
    $path = Join-Path $kasirRoot $entry.Name
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value) {
        throw "Source berubah sejak baseline: $($entry.Name)"
    }
}
$backup = Join-Path $packageRoot ('backup-local-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
$before = @{}
foreach ($folder in @('app', 'resources', 'tests')) {
    $sourceRoot = Join-Path $packageRoot $folder
    foreach ($file in Get-ChildItem -LiteralPath $sourceRoot -File -Recurse) {
        $relative = $file.FullName.Substring($packageRoot.Length + 1)
        $target = Join-Path $kasirRoot $relative
        $before[$relative] = Test-Path -LiteralPath $target
        if ($before[$relative]) {
            $saved = Join-Path $backup $relative
            New-Item -ItemType Directory -Path (Split-Path -Parent $saved) -Force | Out-Null
            Copy-Item -LiteralPath $target -Destination $saved
        }
    }
}
$before | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'existing-files.json')
foreach ($relative in $before.Keys) {
    $target = Join-Path $kasirRoot $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $packageRoot $relative) -Destination $target -Force
}
Write-Output "APPLIED; BACKUP=$backup"
