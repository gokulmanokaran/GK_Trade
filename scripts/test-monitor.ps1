# PowerShell test script for OptionPulse Watchdog endpoint: POST /api/monitor/nifty
param (
    [string]$Url = "http://localhost:3000",
    [string]$Secret = "",
    [switch]$Force
)

$target = "$Url/api/monitor/nifty"
if ($Force) {
    $target += "?force=true"
}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "OptionPulse: NIFTY Market Monitor Watchdog Test" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Target URL : $target"
Write-Host "Force Run  : $Force"
Write-Host "----------------------------------------------------"

$headers = @{
    "Content-Type" = "application/json"
}

if ($Secret) {
    $headers["Authorization"] = "Bearer $Secret"
}

$body = @{
    source = "powershell_test_script"
    force = $Force.IsPresent
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json

try {
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-RestMethod -Uri $target -Method Post -Headers $headers -Body $body -ErrorAction Stop
    $stopwatch.Stop()

    Write-Host "Success in $($stopwatch.ElapsedMilliseconds)ms" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 6)
} catch {
    Write-Host "Request Failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host $reader.ReadToEnd() -ForegroundColor Yellow
    }
}
