# 앱 아이콘을 그린다.
#
# 이미지 라이브러리를 안 쓴다. 이 앱은 electron-builder로 포장되는데 의존성을
# 늘릴수록 번들이 커지고, node_modules 문제로 앱이 창도 못 띄운 적이 있다.
# System.Drawing은 Windows에 기본으로 있고 아이콘은 한 번 만들면 끝이다.
#
# 16px에서 읽히는 것이 전부다. 작업표시줄에서 다른 앱과 구분되어야 하므로
# 색(보라)과 실루엣(재생 삼각형)을 뚜렷하게 두고, 잔무늬는 큰 크기에서만 넣는다.

Add-Type -AssemblyName System.Drawing

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$out = Join-Path $PSScriptRoot "..\build"
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

function New-IconBitmap([int]$s) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)

    # 둥근 사각형 바탕. 반지름은 크기에 비례해야 16px에서도 모서리가 보인다.
    $r = [Math]::Max(2, [int]($s * 0.22))
    $pad = [Math]::Max(0, [int]($s * 0.02))
    $w = $s - ($pad * 2)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($pad, $pad, $r * 2, $r * 2, 180, 90)
    $path.AddArc($pad + $w - $r * 2, $pad, $r * 2, $r * 2, 270, 90)
    $path.AddArc($pad + $w - $r * 2, $pad + $w - $r * 2, $r * 2, $r * 2, 0, 90)
    $path.AddArc($pad, $pad + $w - $r * 2, $r * 2, $r * 2, 90, 90)
    $path.CloseFigure()

    # 앱의 강조색(#7c6cff)에서 시작해 더 짙은 남보라로 떨어뜨린다.
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point($pad, $pad)),
        (New-Object System.Drawing.Point(($pad + $w), ($pad + $w))),
        [System.Drawing.Color]::FromArgb(255, 140, 124, 255),
        [System.Drawing.Color]::FromArgb(255, 79, 60, 190))
    $g.FillPath($brush, $path)

    # 재생 삼각형. 눈으로 보는 무게중심이 오른쪽으로 쏠리므로 살짝 왼쪽에 놓는다.
    $cx = $s * 0.46
    $cy = $s * 0.44
    $tw = $s * 0.30
    $th = $s * 0.34
    $tri = @(
        (New-Object System.Drawing.PointF(($cx - $tw * 0.45), ($cy - $th / 2))),
        (New-Object System.Drawing.PointF(($cx - $tw * 0.45), ($cy + $th / 2))),
        (New-Object System.Drawing.PointF(($cx + $tw * 0.65), $cy))
    )
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPolygon($white, $tri)

    # 자막 줄 세 개. 이게 '영상'과 '대본'을 같이 말해주는 부분이다.
    # 16px에서는 뭉개져서 삼각형만 흐려지므로 32px 이상에서만 넣는다.
    if ($s -ge 32) {
        $bx = $s * 0.26
        $bw = $s * 0.48
        $bh = [Math]::Max(1.0, $s * 0.055)
        $gap = $bh * 1.9
        $y = $s * 0.68
        $widths = @(1.0, 0.78, 0.45)
        for ($i = 0; $i -lt 3; $i++) {
            $alpha = 255 - ($i * 55)
            $b = New-Object System.Drawing.SolidBrush(
                [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
            $g.FillRectangle($b, $bx, ($y + $gap * $i), ($bw * $widths[$i]), $bh)
            $b.Dispose()
        }
    }

    $white.Dispose(); $brush.Dispose(); $path.Dispose(); $g.Dispose()
    return $bmp
}

# ── PNG들을 만들고 ICO 한 덩이로 묶는다 ──────────────────────
# Vista 이후의 ICO는 안에 PNG를 그대로 담을 수 있다. BMP로 담으면 알파 마스크를
# 따로 만들어야 해서 훨씬 복잡하다.
$pngs = @{}
foreach ($s in $sizes) {
    $bmp = New-IconBitmap $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs[$s] = $ms.ToArray()
    $ms.Dispose()
    # 512는 electron-builder가 mac·linux용으로 쓸 수 있게 따로 남긴다.
    if ($s -eq 256) { $bmp.Save((Join-Path $out "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png) }
    $bmp.Dispose()
}

$icoPath = Join-Path $out "icon.ico"
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)

$bw.Write([UInt16]0)               # 예약
$bw.Write([UInt16]1)               # 1 = 아이콘
$bw.Write([UInt16]$sizes.Count)

# 이미지 데이터는 디렉터리 뒤에 이어 붙는다.
$offset = 6 + (16 * $sizes.Count)
foreach ($s in $sizes) {
    $data = $pngs[$s]
    # 256은 0으로 적는 것이 규격이다.
    $bw.Write([Byte]($(if ($s -ge 256) { 0 } else { $s })))
    $bw.Write([Byte]($(if ($s -ge 256) { 0 } else { $s })))
    $bw.Write([Byte]0)             # 색상 수 (0 = 256색 초과)
    $bw.Write([Byte]0)             # 예약
    $bw.Write([UInt16]1)           # 색 평면
    $bw.Write([UInt16]32)          # 비트 깊이
    $bw.Write([UInt32]$data.Length)
    $bw.Write([UInt32]$offset)
    $offset += $data.Length
}
foreach ($s in $sizes) { $bw.Write($pngs[$s]) }

$bw.Flush(); $bw.Close(); $fs.Close()

"icon.ico  $([math]::Round((Get-Item $icoPath).Length / 1KB, 1)) KB · 크기 $($sizes -join ', ')"
"icon.png  256x256"
