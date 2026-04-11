"""
build.py
========
Script de empacotamento do sistema "Gestão de Dividendos".

Executa as seguintes etapas automaticamente:
  1. Verifica dependências necessárias (PyInstaller, PyArmor)
  2. Ofusca o código-fonte com PyArmor (proteção do produto)
  3. Empacota tudo em um único .exe com PyInstaller
  4. Copia os arquivos de dados (Excel, config) para a pasta de saída
  5. Exibe um resumo do que foi gerado

Como usar:
  python build.py

Requisitos:
  pip install pyinstaller pyarmor

Saída:
  dist/
  └── Gestao_Dividendos/
      ├── Gestao_Dividendos.exe   ← executável principal
      ├── config.json             ← criado pelo setup na primeira execução
      └── Notas_Corretagem/       ← pasta para os PDFs das notas
"""

import os
import sys
import shutil
import subprocess
import textwrap
from datetime import datetime

# ══════════════════════════════════════════════════════════════════════
# CONFIGURAÇÃO DO BUILD
# ══════════════════════════════════════════════════════════════════════

NOME_APP      = 'Gestao_Dividendos'
VERSAO        = '1.0.0'
SCRIPT_ENTRY  = 'main.py'          # ponto de entrada do launcher
PASTA_DIST    = 'dist'
PASTA_BUILD   = 'build'
PASTA_OFUSC   = 'dist_ofuscado'    # saída temporária do PyArmor
USAR_PYARMOR  = True               # mude para False para build sem ofuscação

# Arquivos e pastas que acompanham o .exe na pasta final
ARQUIVOS_DADOS = [
    'config.json',          # se existir — senão é criado pelo setup
]
PASTAS_DADOS = [
    'Notas_Corretagem',     # pasta de PDFs
]

# Módulos que o PyInstaller precisa importar explicitamente
# (alguns são carregados dinamicamente via importlib no launcher)
HIDDEN_IMPORTS = [
    'caca_dividendos',
    'atualizador',
    'leitor_notas',
    'smart_aporte',
    'extrator_ir',
    'setup',
    'config_loader',
    'openpyxl',
    'openpyxl.cell',
    'openpyxl.styles',
    'openpyxl.utils',
    'pandas',
    'pdfplumber',
    'pdfminer',
    'pdfminer.high_level',
    'pdfminer.layout',
    'requests',
    'bs4',
    'yfinance',
    'yfinance.base',
    'lxml',
    'lxml.etree',
    'PIL',
    'pkg_resources',
    'charset_normalizer',
]

# ══════════════════════════════════════════════════════════════════════
# UTILITÁRIOS
# ══════════════════════════════════════════════════════════════════════

def log(msg, nivel='INFO'):
    cores = {'INFO': '\033[96m', 'OK': '\033[92m',
             'WARN': '\033[93m', 'ERR': '\033[91m', 'RESET': '\033[0m'}
    prefixo = cores.get(nivel, '') + f'[{nivel}]' + cores['RESET']
    print(f"{prefixo} {msg}")


def executar(cmd, descricao):
    log(f'{descricao}...')
    resultado = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if resultado.returncode != 0:
        log(f'Falhou: {resultado.stderr[:300]}', 'ERR')
        sys.exit(1)
    log(f'{descricao} — OK', 'OK')
    return resultado


def verificar_instalado(pacote, import_nome=None):
    nome = import_nome or pacote
    try:
        __import__(nome)
        return True
    except ImportError:
        return False


# ══════════════════════════════════════════════════════════════════════
# ETAPAS DO BUILD
# ══════════════════════════════════════════════════════════════════════

def etapa_verificar_dependencias():
    log('=== ETAPA 1/5: Verificando dependências ===')

    faltando = []
    for pacote, import_nome in [
        ('pyinstaller', 'PyInstaller'),
        ('openpyxl',    'openpyxl'),
        ('pandas',      'pandas'),
        ('pdfplumber',  'pdfplumber'),
        ('requests',    'requests'),
        ('bs4',         'bs4'),
        ('yfinance',    'yfinance'),
    ]:
        if verificar_instalado(pacote, import_nome):
            log(f'  {pacote} — encontrado', 'OK')
        else:
            log(f'  {pacote} — NÃO encontrado', 'WARN')
            faltando.append(pacote)

    if faltando:
        log('Instale os pacotes faltando antes de continuar:', 'ERR')
        log(f'  pip install {" ".join(faltando)}', 'ERR')
        sys.exit(1)

    # PyArmor é opcional
    if USAR_PYARMOR:
        if verificar_instalado('pyarmor'):
            log('  pyarmor — encontrado', 'OK')
        else:
            log('PyArmor não encontrado — build continuará SEM ofuscação.', 'WARN')
            global USAR_PYARMOR
            USAR_PYARMOR = False


def etapa_limpar():
    log('=== ETAPA 2/5: Limpando builds anteriores ===')
    for pasta in (PASTA_BUILD, PASTA_DIST, PASTA_OFUSC, f'{NOME_APP}.spec'):
        if os.path.isdir(pasta):
            shutil.rmtree(pasta)
            log(f'  Removido: {pasta}', 'OK')
        elif os.path.isfile(pasta):
            os.remove(pasta)
            log(f'  Removido: {pasta}', 'OK')


def etapa_ofuscar():
    log('=== ETAPA 3/5: Ofuscando código-fonte com PyArmor ===')

    if not USAR_PYARMOR:
        log('PyArmor desativado — etapa pulada.', 'WARN')
        return None

    scripts = [
        'main.py', 'config_loader.py', 'setup.py',
        'caca_dividendos.py', 'atualizador.py',
        'leitor_notas.py', 'smart_aporte.py', 'extrator_ir.py',
    ]

    # Verifica se todos os scripts existem
    faltando = [s for s in scripts if not os.path.isfile(s)]
    if faltando:
        log(f'Scripts não encontrados: {faltando}', 'ERR')
        sys.exit(1)

    scripts_str = ' '.join(scripts)
    executar(
        f'pyarmor gen --output {PASTA_OFUSC} {scripts_str}',
        'Ofuscando scripts'
    )

    log(f'Código ofuscado em: {PASTA_OFUSC}/', 'OK')
    return PASTA_OFUSC


def etapa_pyinstaller(pasta_fonte):
    log('=== ETAPA 4/5: Empacotando com PyInstaller ===')

    # Define de onde pegar o entry point
    if pasta_fonte:
        entry = os.path.join(pasta_fonte, SCRIPT_ENTRY)
        paths = f'--paths "{pasta_fonte}"'
    else:
        entry = SCRIPT_ENTRY
        paths = '--paths "."'

    # Monta hidden imports
    hidden = ' '.join(f'--hidden-import "{h}"' for h in HIDDEN_IMPORTS)

    # Adiciona os módulos como dados se vier do PyArmor
    datas = ''
    if pasta_fonte:
        for script in ['caca_dividendos', 'atualizador', 'leitor_notas',
                       'smart_aporte', 'extrator_ir', 'setup', 'config_loader']:
            src = os.path.join(pasta_fonte, f'{script}.py')
            if os.path.isfile(src):
                datas += f' --add-data "{src}{os.pathsep}."'

    cmd = (
        f'pyinstaller '
        f'--onefile '                          # tudo em um único .exe
        f'--windowed '                          # sem janela de terminal
        f'--name "{NOME_APP}" '
        f'--distpath "{PASTA_DIST}" '
        f'--workpath "{PASTA_BUILD}" '
        f'{paths} '
        f'{hidden} '
        f'{datas} '
        f'--noconfirm '
        f'"{entry}"'
    )

    executar(cmd, f'Gerando {NOME_APP}.exe')


def etapa_montar_pacote():
    log('=== ETAPA 5/5: Montando pacote final ===')

    pasta_final = os.path.join(PASTA_DIST, NOME_APP)

    # O PyInstaller com --onefile gera o .exe direto em dist/
    # Reorganiza para dist/Gestao_Dividendos/
    exe_origem = os.path.join(PASTA_DIST, f'{NOME_APP}.exe')
    if not os.path.isfile(exe_origem):
        # Tenta sem extensão (Linux/Mac)
        exe_origem = os.path.join(PASTA_DIST, NOME_APP)

    os.makedirs(pasta_final, exist_ok=True)

    if os.path.isfile(exe_origem):
        shutil.move(exe_origem, os.path.join(pasta_final, f'{NOME_APP}.exe'))
        log(f'  Executável movido para: {pasta_final}/', 'OK')

    # Copia config.json se existir (senão o setup cria na primeira execução)
    for arquivo in ARQUIVOS_DADOS:
        if os.path.isfile(arquivo):
            shutil.copy2(arquivo, os.path.join(pasta_final, arquivo))
            log(f'  Copiado: {arquivo}', 'OK')
        else:
            log(f'  {arquivo} não encontrado — será criado pelo setup.', 'WARN')

    # Cria pastas de dados vazias
    for pasta in PASTAS_DADOS:
        destino = os.path.join(pasta_final, pasta)
        os.makedirs(destino, exist_ok=True)
        # Cria um .gitkeep para a pasta não ficar invisível
        with open(os.path.join(destino, '.gitkeep'), 'w') as f:
            f.write('')
        log(f'  Pasta criada: {pasta}/', 'OK')

    # Cria README rápido na pasta de saída
    readme = textwrap.dedent(f"""\
        GESTÃO DE DIVIDENDOS v{VERSAO}
        ==============================
        Build: {datetime.now().strftime('%d/%m/%Y %H:%M')}

        COMO USAR:
        1. Execute "Gestao_Dividendos.exe"
        2. Na primeira abertura, clique em "Configurações" (rodapé)
        3. Informe o caminho da sua planilha Excel e a senha dos PDFs
        4. Use o menu principal para acessar os módulos

        ESTRUTURA:
        Gestao_Dividendos.exe  — aplicativo principal
        config.json            — configurações (gerado pelo setup)
        Notas_Corretagem/      — coloque aqui os PDFs das notas
    """)
    with open(os.path.join(pasta_final, 'LEIA-ME.txt'), 'w', encoding='utf-8') as f:
        f.write(readme)
    log('  LEIA-ME.txt criado', 'OK')

    return pasta_final


# ══════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════

def main():
    inicio = datetime.now()

    print()
    print('=' * 58)
    print(f'  BUILD — {NOME_APP} v{VERSAO}')
    print(f'  {inicio.strftime("%d/%m/%Y %H:%M")}')
    print('=' * 58)
    print()

    etapa_verificar_dependencias()
    print()
    etapa_limpar()
    print()
    pasta_fonte = etapa_ofuscar()
    print()
    etapa_pyinstaller(pasta_fonte)
    print()
    pasta_final = etapa_montar_pacote()
    print()

    duracao = (datetime.now() - inicio).seconds
    print('=' * 58)
    log(f'BUILD CONCLUÍDO em {duracao}s', 'OK')
    log(f'Saída: {os.path.abspath(pasta_final)}', 'OK')
    print('=' * 58)
    print()

    # Lista o conteúdo da pasta final
    print('Conteúdo da pasta de distribuição:')
    for item in sorted(os.listdir(pasta_final)):
        tamanho = ''
        caminho = os.path.join(pasta_final, item)
        if os.path.isfile(caminho):
            kb = os.path.getsize(caminho) / 1024
            tamanho = f'  ({kb:,.0f} KB)' if kb < 1024 else f'  ({kb/1024:,.1f} MB)'
        print(f'  {"📁" if os.path.isdir(caminho) else "📄"} {item}{tamanho}')
    print()


if __name__ == '__main__':
    main()
