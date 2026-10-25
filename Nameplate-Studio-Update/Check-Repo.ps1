param([string]$Repo = 'C:\Users\SOwil\CODING SHIT\8BitGPU')
$ErrorActionPreference = 'Stop'
try {
    if (-not (Test-Path -LiteralPath (Join-Path $Repo '.git'))) { throw 'This is not the intended Git repo.' }
    $baseline = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'baseline.json') -Raw | ConvertFrom-Json
    foreach ($entry in $baseline.PSObject.Properties) {
        $target = Join-Path $Repo $entry.Name
        if (-not (Test-Path -LiteralPath $target)) { throw "Missing existing file: $($entry.Name)" }
        if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value) { throw "Changed since packaging: $($entry.Name). Stop and ask for an updated package." }
    }
    $payload = Join-Path $PSScriptRoot 'files'
    foreach ($file in Get-ChildItem -LiteralPath $payload -File -Recurse) {
        $relative = $file.FullName.Substring($payload.Length + 1).Replace('\','/')
        if ($null -eq $baseline.PSObject.Properties[$relative] -and (Test-Path -LiteralPath (Join-Path $Repo $relative))) { throw "New path already exists: $relative. Stop before replacing it." }
    }
    Write-Host 'PASS: This package matches your repo files. No files were copied or changed.' -ForegroundColor Green
} catch {
    Write-Host "STOP: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    Read-Host 'Press Enter to close'
}
