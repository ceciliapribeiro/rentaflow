"""
config_loader.py
Módulo compartilhado por todos os scripts.
Lê as configurações do config.json gerado pelo setup.py.
"""
import json
import os
import sys

def _pasta_exe():
    """
    Retorna a pasta onde o executável (ou script) reside.
    Dentro de um .exe PyInstaller --onefile, sys.executable aponta
    para o .exe real — não para a pasta temporária de extração.
    """
    if getattr(sys, 'frozen', False):
        # Rodando como .exe gerado pelo PyInstaller
        return os.path.dirname(sys.executable)
    # Rodando como script Python normal
    return os.path.dirname(os.path.abspath(__file__))

CONFIG_FILE = os.path.join(_pasta_exe(), 'config.json')

DEFAULTS = {
    'arquivo_excel':     'Inter s2 - Investimentos.xlsx',
    'senha_pdf':         '',
    'pasta_notas':       'Notas_Corretagem',
    'janela_busca_dias': 365,
}

def carregar_config():
    """
    Lê o config.json e retorna um dict com todas as configurações.
    Se o arquivo não existir ou estiver incompleto, usa os valores padrão
    e orienta o usuário a rodar o setup.
    """
    if not os.path.exists(CONFIG_FILE):
        print("=" * 52)
        print("  CONFIGURAÇÃO NÃO ENCONTRADA")
        print("  Execute o 'Setup - Configurar Sistema.exe'")
        print("  antes de usar este módulo.")
        print("=" * 52)
        sys.exit(1)

    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            dados = json.load(f)
    except json.JSONDecodeError:
        print("ERRO: config.json está corrompido. Rode o setup novamente.")
        sys.exit(1)

    # Preenche campos ausentes com os padrões
    config = {**DEFAULTS, **dados}
    return config


def salvar_config(config: dict):
    """Persiste o dict de configurações no config.json."""
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=4)


def fazer_backup(arquivo_excel: str, log_cb=None) -> str:
    """
    Cria um backup do arquivo Excel na pasta Backups/, que fica
    no mesmo diretório do arquivo original.

    Retorna o caminho do backup criado, ou '' em caso de falha.
    A pasta Backups/ é criada automaticamente se não existir.

    log_cb: opcional — função(msg, tag) para logar na UI.
    """
    try:
        pasta_origem = os.path.dirname(os.path.abspath(arquivo_excel))
        pasta_backup = os.path.join(pasta_origem, 'Backups')
        os.makedirs(pasta_backup, exist_ok=True)

        nome_base = os.path.splitext(os.path.basename(arquivo_excel))[0]
        timestamp = __import__('datetime').datetime.now().strftime('%Y%m%d_%H%M%S')
        destino   = os.path.join(pasta_backup, f'{nome_base}_backup_{timestamp}.xlsx')

        import shutil
        shutil.copy2(arquivo_excel, destino)

        msg = f'Backup salvo em Backups/{os.path.basename(destino)}'
        if log_cb:
            log_cb(msg, 'info')
        return destino

    except Exception as e:
        msg = f'Aviso: não foi possível criar backup — {e}'
        if log_cb:
            log_cb(msg, 'aviso')
        return ''
