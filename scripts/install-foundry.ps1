# Cài Foundry (bản Windows chính thức) vào %USERPROFILE%\.foundry\bin, kiểm tra SHA256 trước khi giải nén.
$ErrorActionPreference = 'Stop'
$v = 'v1.9.0'
$base = "https://github.com/foundry-rs/foundry/releases/download/$v"
$name = "foundry_${v}_win32_amd64"
$dir = Join-Path $env:USERPROFILE '.foundry'
$bin = Join-Path $dir 'bin'
New-Item -ItemType Directory -Force $bin | Out-Null
$zip = Join-Path $dir 'foundry.zip'
$sum = Join-Path $dir 'foundry.sha256'
Invoke-WebRequest "$base/$name.zip" -OutFile $zip
Invoke-WebRequest "$base/$name.sha256" -OutFile $sum
$expected = ((Get-Content $sum -Raw).Trim() -split '\s+')[0].ToLower()
$actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if ($expected -ne $actual) { throw "SHA256 không khớp: $actual != $expected" }
Expand-Archive -Force $zip $bin
Remove-Item $zip, $sum
Write-Host "Foundry $v đã cài vào $bin"
