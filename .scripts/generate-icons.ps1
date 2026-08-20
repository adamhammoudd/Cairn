Copy-Item -Path ".\Cairn-selection.png" -Destination ".\public\source-icon.png" -Force
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile(".\public\source-icon.png")
function Save-Resized([int]$w,[int]$h,[string]$out){
  $bmp = New-Object System.Drawing.Bitmap $w,$h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src,0,0,$w,$h)
  $bmp.Save($out,[System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}
Save-Resized 180 180 ".\public\apple-touch-icon.png"
Save-Resized 32 32 ".\public\favicon-32x32.png"
Save-Resized 16 16 ".\public\favicon-16x16.png"
# create favicon.ico from 32x32
$bmp = New-Object System.Drawing.Bitmap ".\public\favicon-32x32.png"
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::OpenWrite(".\public\favicon.ico")
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$bmp.Dispose()
$src.Dispose()
Write-Host "Icons generated."
