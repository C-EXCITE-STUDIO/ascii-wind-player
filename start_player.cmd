@echo off
setlocal
set "ASCII_PLAYER_HOME=%~dp0"
set "ASCII_PLAYER_MODE=%~1"
powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -Command "$ErrorActionPreference='Stop'; $page=Join-Path $env:ASCII_PLAYER_HOME 'index.html'; if(!(Test-Path -LiteralPath $page -PathType Leaf)){throw 'index.html not found'}; $uri=([System.Uri]$page).AbsoluteUri; if($env:ASCII_PLAYER_MODE -eq '--print-url'){[Console]::WriteLine($uri); exit 0}; $candidates=@(); foreach($base in @($env:ProgramW6432,$env:ProgramFiles,${env:ProgramFiles(x86)})){if($base){$candidates+=(Join-Path $base 'Google\Chrome\Application\chrome.exe'); $candidates+=(Join-Path $base 'Microsoft\Edge\Application\msedge.exe')}}; if($env:LOCALAPPDATA){$candidates+=(Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')}; $browser=$candidates | Where-Object {Test-Path -LiteralPath $_ -PathType Leaf} | Select-Object -First 1; if($browser){$browserArgs=@(); $browserArgs+=('--app='+$uri); $browserArgs+='--window-size=1440,1000'; Start-Process -FilePath $browser -ArgumentList $browserArgs} else {Start-Process -FilePath $page}"
exit /b %errorlevel%
