# Generate Newma Desktop app icon: concrete-gray rounded rect + CJK glyph (matches newma-web favicon)
# Outputs resources/icons/icon.ico (multi-size PNG entries) and icon.png (256)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/gen-icon.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\resources\icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-IconPng([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  # rounded rect background #33322f
  $bg = [System.Drawing.Color]::FromArgb(0x33, 0x32, 0x2F)
  $brush = New-Object System.Drawing.SolidBrush($bg)
  $radius = [float]($size * 0.22)
  $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
  $path2 = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path2.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path2.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path2.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path2.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path2.CloseFigure()
  $g.FillPath($brush, $path2)

  # glyph #d8d5cd (U+725B)
  $fg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0xD8, 0xD5, 0xCD))
  $fontSize = [float]($size * 0.58)
  $font = New-Object System.Drawing.Font("Microsoft YaHei UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textRect = New-Object System.Drawing.RectangleF(0, ($size * 0.02), $size, $size)
  $g.DrawString([string][char]0x725B, $font, $fg, $textRect, $fmt)

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "icon-$size -> $path"
}

$sizes = @(256, 128, 64, 48, 32, 16)
$pngs = @{}
foreach ($s in $sizes) {
  $p = Join-Path $outDir "icon-$s.png"
  New-IconPng $s $p
  $pngs[$s] = [System.IO.File]::ReadAllBytes($p)
}

# pack ICO (PNG entries, Vista+)
$icoPath = Join-Path $outDir "icon.ico"
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
foreach ($s in $sizes) {
  $data = $pngs[$s]
  $dim = if ($s -ge 256) { 0 } else { $s }
  $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32)
  $bw.Write([uint32]$data.Length); $bw.Write([uint32]$offset)
  $offset += $data.Length
}
foreach ($s in $sizes) { $bw.Write($pngs[$s]) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$bw.Dispose()
Copy-Item (Join-Path $outDir "icon-256.png") (Join-Path $outDir "icon.png") -Force
Write-Host "ico + png done"
