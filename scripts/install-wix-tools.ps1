# Prefetch WiX 3.14 for Tauri MSI bundling when GitHub download via CLI fails
# (e.g. proxy / "protocol: http response missing version"). After this, restore
# bundle.targets to include "msi" or "all" in tauri config if you need an .msi.
$ErrorActionPreference = "Stop"
$destRoot = Join-Path $env:LOCALAPPDATA "tauri\WixTools314"
$zipUrl = "https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip"
$zipPath = Join-Path $env:TEMP "wix314-binaries-$([guid]::NewGuid().ToString('n')).zip"

Write-Host "Installing WiX tools under: $destRoot"
New-Item -ItemType Directory -Force -Path $destRoot | Out-Null

Write-Host "Downloading $zipUrl ..."
try {
  Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
} catch {
  Write-Error "Download failed. Try a VPN/proxy or set TAURI_BUNDLER_TOOLS_GITHUB_MIRROR. $_"
  exit 1
}

Write-Host "Extracting..."
Expand-Archive -Path $zipPath -DestinationPath $destRoot -Force
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

# Zip often contains a single top-level folder; flatten if needed for Tauri layout.
$nested = Join-Path $destRoot "wix314-binaries"
if (Test-Path $nested) {
  Get-ChildItem $nested -Force | Move-Item -Destination $destRoot -Force
  Remove-Item $nested -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Done. You can now enable MSI in tauri.windows.conf.json bundle.targets if needed."
