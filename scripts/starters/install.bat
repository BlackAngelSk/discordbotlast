@echo off
echo Installing Node modules...
npm install
if %errorlevel% equ 0 (
    echo.
    echo Installation completed successfully!
) else (
    echo.
    echo Installation failed. Please check the errors above.
    exit /b 1
)
pause
