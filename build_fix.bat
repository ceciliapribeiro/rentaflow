@echo off
title Build - RentaFlow v1.0
echo ==================================================
echo   BUILD - RENTAFLOW v1.0
echo   Gestao de Dividendos com Foco em Renda Passiva
echo ==================================================
echo.

:: Verifica Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python nao encontrado no PATH.
    echo Instale o Python em https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Verifica/instala PyInstaller
echo Verificando PyInstaller...
python -c "import PyInstaller" >nul 2>&1
if errorlevel 1 (
    echo Instalando PyInstaller...
    python -m pip install pyinstaller
    if errorlevel 1 (
        echo [ERRO] Falha ao instalar PyInstaller.
        pause
        exit /b 1
    )
)
echo PyInstaller OK.
echo.
echo Empacotando o executavel - aguarde alguns minutos...
echo.

python -m PyInstaller ^
    --onefile ^
    --noconsole ^
    --name "Gestao_Dividendos" ^
    --paths "." ^
    --hidden-import "caca_dividendos" ^
    --hidden-import "atualizador" ^
    --hidden-import "leitor_notas" ^
    --hidden-import "smart_aporte" ^
    --hidden-import "extrator_ir" ^
    --hidden-import "setup" ^
    --hidden-import "config_loader" ^
    --hidden-import "openpyxl" ^
    --hidden-import "openpyxl.cell" ^
    --hidden-import "openpyxl.styles" ^
    --hidden-import "openpyxl.utils" ^
    --hidden-import "pandas" ^
    --hidden-import "pdfplumber" ^
    --hidden-import "pdfminer" ^
    --hidden-import "pdfminer.high_level" ^
    --hidden-import "pdfminer.layout" ^
    --hidden-import "requests" ^
    --hidden-import "bs4" ^
    --hidden-import "yfinance" ^
    --hidden-import "lxml" ^
    --hidden-import "lxml.etree" ^
    --hidden-import "pkg_resources" ^
    --hidden-import "charset_normalizer" ^
    --collect-all "yfinance" ^
    --collect-all "pdfplumber" ^
    --collect-all "pdfminer" ^
    --collect-all "bs4" ^
    --collect-all "openpyxl" ^
    --noconfirm ^
    main.py

if errorlevel 1 (
    echo.
    echo [ERRO] O build falhou. Verifique as mensagens acima.
    pause
    exit /b 1
)

echo.
echo ==================================================
echo   MONTANDO PACOTE DE ENTREGA RentaFlow...
echo ==================================================

:: Cria pasta de entrega
if not exist "dist\RentaFlow" mkdir "dist\RentaFlow"

:: Move o .exe
move /Y "dist\Gestao_Dividendos.exe" "dist\RentaFlow\Gestao_Dividendos.exe"

:: Copia planilha protegida (se existir a versao CLIENTE, usa ela)
if exist "RentaFlow_Planilha_CLIENTE.xlsx" (
    copy /Y "RentaFlow_Planilha_CLIENTE.xlsx" "dist\RentaFlow\RentaFlow_Planilha.xlsx"
    echo Planilha protegida copiada.
) else if exist "RentaFlow_Planilha.xlsx" (
    copy /Y "RentaFlow_Planilha.xlsx" "dist\RentaFlow\RentaFlow_Planilha.xlsx"
    echo Planilha copiada ^(sem protecao - rode preparar_planilha.py antes do build^).
)

:: Copia manual
if exist "Manual_RentaFlow.docx" (
    copy /Y "Manual_RentaFlow.docx" "dist\RentaFlow\Manual_RentaFlow.docx"
)

:: Copia LEIA-ME
if exist "LEIA-ME.txt" (
    copy /Y "LEIA-ME.txt" "dist\RentaFlow\LEIA-ME.txt"
)

:: Cria pasta de notas vazia
if not exist "dist\RentaFlow\Notas_Corretagem" (
    mkdir "dist\RentaFlow\Notas_Corretagem"
)

echo.
echo ==================================================
echo   BUILD CONCLUIDO COM SUCESSO!
echo ==================================================
echo.
echo Pacote gerado em:
echo   dist\RentaFlow\
echo.
echo Conteudo do pacote:
dir "dist\RentaFlow" /b
echo.
echo PROXIMOS PASSOS:
echo   1. Teste o Gestao_Dividendos.exe na pasta dist\RentaFlow
echo   2. Compacte a pasta dist\RentaFlow em .zip para entrega
echo   3. Envie o .zip para o cliente
echo.
pause
