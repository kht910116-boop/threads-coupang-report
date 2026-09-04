# 포장이 끝난 exe에 아이콘 리소스를 직접 써 넣는다.
#
# electron-builder가 해주는 일인데 이 PC에서는 못 한다. signAndEditExecutable을 켜면
# winCodeSign 도구를 내려받아 푸는데, 그 압축 안의 macOS 심볼릭 링크를 Windows에서
# 관리자 권한 없이 만들 수 없어 **압축 해제 단계에서 빌드가 통째로 실패한다.**
# app-builder의 rcedit도 같은 도구를 받으려 해서 같은 벽에 부딪힌다.
#
# 그래서 rcedit이 하는 일을 직접 한다. Windows에 원래 있는 API 세 개면 된다.
# 인터넷도, 추가 바이너리도 필요 없다.
#
# ICO 파일과 exe 안의 아이콘 리소스는 **구조가 다르다.** 파일 쪽 항목은 이미지가
# 파일 어디에 있는지(4바이트 오프셋)를 들고 있고, 리소스 쪽 항목은 그 자리에
# 리소스 번호(2바이트)를 들고 있다. 이 차이를 놓치면 아이콘이 깨져 보인다.

param(
    [string]$Exe  = (Join-Path $PSScriptRoot "..\dist\win-unpacked\AutoTube Studio.exe"),
    [string]$Icon = (Join-Path $PSScriptRoot "..\build\icon.ico")
)

if (-not (Test-Path $Exe))  { "  아이콘 건너뜀 — 실행 파일이 없습니다: $Exe"; exit 0 }
if (-not (Test-Path $Icon)) { "  아이콘 건너뜀 — 아이콘이 없습니다: $Icon"; exit 0 }

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Res {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern IntPtr BeginUpdateResource(string fileName, bool deleteExisting);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool UpdateResource(IntPtr h, IntPtr type, IntPtr name,
                                           ushort lang, byte[] data, uint size);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool EndUpdateResource(IntPtr h, bool discard);
}
"@

$RT_ICON = [IntPtr]3
$RT_GROUP_ICON = [IntPtr]14
$LANG_NEUTRAL = 0

$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $Icon))
$count = [BitConverter]::ToUInt16($bytes, 4)

# 파일 쪽 항목을 읽어두고, 리소스용 디렉터리(6 + 14 * n)를 새로 짠다.
$group = New-Object byte[] (6 + 14 * $count)
[Array]::Copy($bytes, 0, $group, 0, 6)   # 예약·종류·개수는 그대로

$images = @()
for ($i = 0; $i -lt $count; $i++) {
    $e = 6 + 16 * $i          # 파일 항목
    $g = 6 + 14 * $i          # 리소스 항목
    # 앞 12바이트(폭·높이·색·예약·평면·비트수·바이트수)는 두 구조가 같다.
    [Array]::Copy($bytes, $e, $group, $g, 12)
    # 마지막 4바이트만 다르다: 파일은 오프셋, 리소스는 번호.
    [Array]::Copy([BitConverter]::GetBytes([UInt16]($i + 1)), 0, $group, $g + 12, 2)

    $size = [BitConverter]::ToUInt32($bytes, $e + 8)
    $off  = [BitConverter]::ToUInt32($bytes, $e + 12)
    $img = New-Object byte[] $size
    [Array]::Copy($bytes, $off, $img, 0, $size)
    $images += ,$img
}

$h = [Res]::BeginUpdateResource($Exe, $false)
if ($h -eq [IntPtr]::Zero) {
    "  아이콘 박기 실패 — 실행 파일을 열 수 없습니다 (앱이 실행 중인가요?)"
    exit 0
}

$ok = $true
for ($i = 0; $i -lt $count; $i++) {
    $img = $images[$i]
    if (-not [Res]::UpdateResource($h, $RT_ICON, [IntPtr]($i + 1), $LANG_NEUTRAL, $img, $img.Length)) {
        $ok = $false
    }
}
# 아이콘 그룹 1번이 앱 아이콘이다. Windows는 번호가 가장 작은 그룹을 쓴다.
if (-not [Res]::UpdateResource($h, $RT_GROUP_ICON, [IntPtr]1, $LANG_NEUTRAL, $group, $group.Length)) {
    $ok = $false
}

if (-not [Res]::EndUpdateResource($h, -not $ok)) { $ok = $false }

if ($ok) { "  아이콘 박음 ($count 크기) → $(Split-Path $Exe -Leaf)" }
else { "  아이콘 박기 실패 (앱은 돕니다)" }
