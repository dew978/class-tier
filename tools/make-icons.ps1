# 앱 아이콘 만들기 (금색 티어 방패 + 별) → icons/ 폴더
# 사용법: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$out = Join-Path (Split-Path $PSScriptRoot) 'icons'
New-Item -ItemType Directory -Force $out | Out-Null

function Color([string]$hex, [int]$a = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  return [System.Drawing.Color]::FromArgb($a, $c.R, $c.G, $c.B)
}
# 24칸 좌표를 그림 좌표로
function Pt([float]$x, [float]$y) { return New-Object System.Drawing.PointF(($script:ox + $x * $script:k), ($script:oy + $y * $script:k)) }

function Draw-Icon([int]$S, [float]$frac, [bool]$rounded, [string]$file) {
  $bmp = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  # 배경 (둥근 네모 또는 꽉 찬 네모)
  $bg = New-Object System.Drawing.Drawing2D.GraphicsPath
  if ($rounded) {
    $r = [float]($S * 0.22); $d = $r * 2
    $bg.AddArc(0, 0, $d, $d, 180, 90); $bg.AddArc($S - $d, 0, $d, $d, 270, 90)
    $bg.AddArc($S - $d, $S - $d, $d, $d, 0, 90); $bg.AddArc(0, $S - $d, $d, $d, 90, 90); $bg.CloseFigure()
  } else { $bg.AddRectangle((New-Object System.Drawing.RectangleF(0, 0, $S, $S))) }
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.PointF(0, 0)), (New-Object System.Drawing.PointF($S, $S)), (Color '#2b3c7c'), (Color '#0c1120'))
  $g.FillPath($bgBrush, $bg)

  # 방패 뒤 은은한 빛
  $glowR = [float]($S * $frac * 0.62)
  $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glow.AddEllipse([float]($S / 2 - $glowR), [float]($S / 2 - $glowR), [float]($glowR * 2), [float]($glowR * 2))
  $gb = New-Object System.Drawing.Drawing2D.PathGradientBrush($glow)
  $gb.CenterColor = Color '#f2bf3c' 110
  $gb.SurroundColors = @((Color '#f2bf3c' 0))
  $g.FillPath($gb, $glow)

  # 방패 (크기: 그림 높이의 frac)
  $script:k = [float]($S * $frac / 20.6)
  $script:ox = [float]($S / 2 - 12 * $script:k)
  $script:oy = [float]($S / 2 - 12.1 * $script:k)
  $sh = New-Object System.Drawing.Drawing2D.GraphicsPath
  $sh.AddLine((Pt 12 1.8), (Pt 20.5 5)); $sh.AddLine((Pt 20.5 5), (Pt 20.5 11.2))
  $sh.AddBezier((Pt 20.5 11.2), (Pt 20.5 16.8), (Pt 16.9 20.9), (Pt 12 22.4))
  $sh.AddBezier((Pt 12 22.4), (Pt 7.1 20.9), (Pt 3.5 16.8), (Pt 3.5 11.2))
  $sh.AddLine((Pt 3.5 11.2), (Pt 3.5 5)); $sh.CloseFigure()
  $gold = New-Object System.Drawing.Drawing2D.LinearGradientBrush((Pt 12 1.8), (Pt 12 22.4), (Color '#fff2b0'), (Color '#a86b0c'))
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
  $blend.Colors = @((Color '#fff2b0'), (Color '#f2bf3c'), (Color '#a86b0c'))
  $blend.Positions = @([float]0, [float]0.5, [float]1)
  $gold.InterpolationColors = $blend
  $g.FillPath($gold, $sh)
  $pen = New-Object System.Drawing.Pen((Color '#7a4a05'), [float](0.8 * $script:k))
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPath($pen, $sh)

  # 별
  $star = New-Object System.Drawing.Drawing2D.GraphicsPath
  $pts = @((Pt 12 6.4), (Pt 13.6 9.7), (Pt 17.2 10.2), (Pt 14.6 12.7), (Pt 15.2 16.3), (Pt 12 14.6), (Pt 8.8 16.3), (Pt 9.4 12.7), (Pt 6.8 10.2), (Pt 10.4 9.7))
  $star.AddPolygon([System.Drawing.PointF[]]$pts)
  $g.FillPath((New-Object System.Drawing.SolidBrush((Color '#fff6cf'))), $star)
  $spen = New-Object System.Drawing.Pen((Color '#9a6308'), [float](0.6 * $script:k))
  $spen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPath($spen, $star)

  $g.Dispose()
  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "$file ($S x $S)"
}

Draw-Icon 512 0.64 $true 'icon-512.png'
Draw-Icon 192 0.64 $true 'icon-192.png'
Draw-Icon 512 0.50 $false 'icon-maskable-512.png'
Draw-Icon 180 0.62 $false 'apple-touch-icon.png'
