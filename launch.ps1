# Gets the newest Hive code and starts the app. See scripts/start.ts.
Set-Location $PSScriptRoot
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/start.ts @args
exit $LASTEXITCODE
