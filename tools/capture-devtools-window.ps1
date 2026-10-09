param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class DevToolsWindowCapture {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@

$devTools = Get-Process -Name 'wechatdevtools' -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1

if (-not $devTools) {
  throw 'WeChat DevTools main window was not found'
}

# PrintWindow returns a blank image for NW.js, so capture the visible window area.
[void][DevToolsWindowCapture]::ShowWindow($devTools.MainWindowHandle, 9)
[void][DevToolsWindowCapture]::SetForegroundWindow($devTools.MainWindowHandle)
Start-Sleep -Milliseconds 350

$rect = New-Object DevToolsWindowCapture+RECT
if (-not [DevToolsWindowCapture]::GetWindowRect($devTools.MainWindowHandle, [ref]$rect)) {
  throw 'Unable to read the WeChat DevTools window bounds'
}

$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) {
  throw "Invalid WeChat DevTools window size: ${width}x${height}"
}

$directory = Split-Path -Parent $OutputPath
if ($directory -and -not (Test-Path $directory)) {
  New-Item -ItemType Directory -Force $directory | Out-Null
}

$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $size = New-Object System.Drawing.Size $width, $height
  $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $size)
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
