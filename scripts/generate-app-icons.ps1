param(
    [string]$StoreSource = (Join-Path $PSScriptRoot '..\docs\app-icon-final.png'),
    [string]$AndroidSource = (Join-Path $PSScriptRoot '..\docs\app-icon-android.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$storeSourcePath = (Resolve-Path $StoreSource).Path
$androidSourcePath = (Resolve-Path $AndroidSource).Path

function Save-Icon([string]$SourcePath, [string]$Target, [int]$Size) {
    $directory = Split-Path -Parent $Target
    New-Item -ItemType Directory -Force -Path $directory | Out-Null

    $sourceImage = [System.Drawing.Image]::FromFile($SourcePath)
    try {
        $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.Clear([System.Drawing.Color]::Transparent)
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.DrawImage($sourceImage, [System.Drawing.Rectangle]::new(0, 0, $Size, $Size))
                $bitmap.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)
            } finally {
                $graphics.Dispose()
            }
        } finally {
            $bitmap.Dispose()
        }
    } finally {
        $sourceImage.Dispose()
    }
}

$androidSizes = @{
    'mdpi' = 48
    'hdpi' = 72
    'xhdpi' = 96
    'xxhdpi' = 144
    'xxxhdpi' = 192
}

foreach ($entry in $androidSizes.GetEnumerator()) {
    $folder = Join-Path $root "android\app\src\main\res\mipmap-$($entry.Key)"
    foreach ($name in 'ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png') {
        Save-Icon $androidSourcePath (Join-Path $folder $name) $entry.Value
    }
}

$targets = @{
    'public\favicon-16.png' = 16
    'public\favicon-32.png' = 32
    'public\apple-touch-icon.png' = 180
    'public\icons\app-icon-192.png' = 192
    'public\icons\app-icon-512.png' = 512
    'public\icons\app-icon-512-under-250kb.png' = 512
    'public\icons\app-icon-1024.png' = 1024
    'public\icons\family-platform-icon-source.png' = 1024
    'play-store-assets\app-icon-512.png' = 512
    'ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png' = 1024
}

foreach ($entry in $targets.GetEnumerator()) {
    Save-Icon $storeSourcePath (Join-Path $root $entry.Key) $entry.Value
}

Write-Host "Updated Android icons from $androidSourcePath"
Write-Host "Updated Play Store and web icons from $storeSourcePath"
