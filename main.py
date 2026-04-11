"""
main.py
Tela principal do sistema RentaFlow — launcher moderno e responsivo.
"""
import sys
import os
import subprocess
import tkinter as tk
from tkinter import messagebox
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config_loader import carregar_config

# ── Paleta ─────────────────────────────────────────────────────────────
VERDE       = '#1a6b45'
VERDE_ESC   = '#145535'
CINZA_BG    = '#f4f4f1'
CINZA_BORDA = '#e0e0da'
BRANCO      = '#ffffff'
TEXTO       = '#1f2937'
TEXTO_SEC   = '#6b7280'
SOMBRA      = '#e5e7eb'

CORES_MOD = {
    'atualizador':     '#1e3a5f',
    'leitor_notas':    '#7c3d0e',
    'caca_dividendos': '#1a6b45',
    'smart_aporte':    '#374151',
    'extrator_ir':     '#5b21b6',
}


# ── Utilitários ────────────────────────────────────────────────────────
def abrir_modulo(nome_modulo):
    try:
        if nome_modulo == 'atualizador':
            from atualizador import AtualizadorApp as Cls
        elif nome_modulo == 'leitor_notas':
            from leitor_notas import LeitorNotasApp as Cls
        elif nome_modulo == 'caca_dividendos':
            from caca_dividendos import CacaDividendosApp as Cls
        elif nome_modulo == 'smart_aporte':
            from smart_aporte import SmartAporteApp as Cls
        elif nome_modulo == 'extrator_ir':
            from extrator_ir import ExtratorIRApp as Cls
        else:
            raise ImportError(f'Módulo desconhecido: {nome_modulo}')
        janela = tk.Toplevel()
        Cls(janela)
        janela.focus_force()
    except Exception as e:
        messagebox.showerror('Erro ao abrir módulo',
                             f'Não foi possível abrir "{nome_modulo}":\n\n{e}')


def abrir_planilha():
    try:
        cfg   = carregar_config()
        excel = cfg['arquivo_excel']
        if not os.path.isfile(excel):
            messagebox.showwarning('Arquivo não encontrado',
                                   f'Planilha não encontrada:\n{excel}')
            return
        if sys.platform == 'win32':
            os.startfile(excel)
        elif sys.platform == 'darwin':
            subprocess.call(['open', excel])
        else:
            subprocess.call(['xdg-open', excel])
    except Exception as e:
        messagebox.showerror('Erro', str(e))


# ── Card de módulo ─────────────────────────────────────────────────────
class ModuloCard(tk.Frame):
    def __init__(self, parent, numero, titulo, descricao,
                 icone, cor, comando, **kwargs):
        super().__init__(parent, bg=BRANCO, cursor='hand2',
                         highlightthickness=1,
                         highlightbackground=CINZA_BORDA, **kwargs)
        self.comando = comando
        self._cor_mod = cor

        # Faixa colorida esquerda
        lado = tk.Frame(self, bg=cor, width=56)
        lado.pack(side='left', fill='y')
        lado.pack_propagate(False)
        tk.Label(lado, text=str(numero), bg=cor, fg=BRANCO,
                 font=('Segoe UI', 16, 'bold')).pack(expand=True)
        tk.Label(lado, text=icone, bg=cor, fg=BRANCO,
                 font=('Segoe UI', 14)).pack(pady=(0, 8))

        # Conteúdo
        content = tk.Frame(self, bg=BRANCO, padx=16, pady=12)
        content.pack(side='left', fill='both', expand=True)
        tk.Label(content, text=titulo, bg=BRANCO, fg=TEXTO,
                 font=('Segoe UI', 11, 'bold'),
                 anchor='w').pack(fill='x')
        tk.Label(content, text=descricao, bg=BRANCO, fg=TEXTO_SEC,
                 font=('Segoe UI', 9), justify='left',
                 anchor='w', wraplength=360).pack(fill='x', pady=(4, 0))

        # Seta
        self._seta = tk.Label(self, text='›', bg=BRANCO,
                              fg='#c4c4bc', font=('Segoe UI', 24))
        self._seta.pack(side='right', padx=14)

        # Bind recursivo
        self._bind_rec(self)

    def _bind_rec(self, w):
        w.bind('<Enter>',    self._on)
        w.bind('<Leave>',    self._off)
        w.bind('<Button-1>', self._click)
        for c in w.winfo_children():
            self._bind_rec(c)

    def _on(self, _=None):
        self._set_bg('#f0faf4')
        self.configure(highlightbackground=VERDE)
        self._seta.configure(fg=VERDE)

    def _off(self, _=None):
        self._set_bg(BRANCO)
        self.configure(highlightbackground=CINZA_BORDA)
        self._seta.configure(fg='#c4c4bc')

    def _set_bg(self, cor):
        PROTEGIDAS = set(CORES_MOD.values())
        def _rec(w):
            try:
                if w.cget('bg') not in PROTEGIDAS:
                    w.configure(bg=cor)
            except Exception:
                pass
            for c in w.winfo_children():
                _rec(c)
        _rec(self)

    def _click(self, _=None):
        self.configure(highlightbackground=VERDE_ESC)
        self.after(120, self.comando)


# ── Launcher ────────────────────────────────────────────────────────────
class LauncherApp:

    MODULOS = [
        dict(numero=1, modulo='atualizador',
             titulo='Atualizar Cotações',
             icone='📈', cor=CORES_MOD['atualizador'],
             descricao='Busca preços, DY, P/VP e Short Name via Yahoo Finance '
                       'e Status Invest. Prioriza os ativos da sua carteira.'),
        dict(numero=2, modulo='leitor_notas',
             titulo='Importar Notas de Corretagem',
             icone='📄', cor=CORES_MOD['leitor_notas'],
             descricao='Lê PDFs de notas de corretagem, resolve tickers pelo '
                       'nome de pregão e exibe preview para revisão antes de gravar.'),
        dict(numero=3, modulo='caca_dividendos',
             titulo='Buscar Dividendos Recebidos',
             icone='💰', cor=CORES_MOD['caca_dividendos'],
             descricao='Consulta o Status Invest e registra proventos na aba '
                       'DIVIDENDOS, respeitando a data EX e a liquidação D+2.'),
        dict(numero=4, modulo='smart_aporte',
             titulo='Smart Aporte',
             icone='🧠', cor=CORES_MOD['smart_aporte'],
             descricao='Calcula a boleta de compra ideal priorizando ativos com '
                       'maior DY e maior défice de rebalanceamento.'),
        dict(numero=5, modulo='extrator_ir',
             titulo='Relatório de IR',
             icone='🧾', cor=CORES_MOD['extrator_ir'],
             descricao='Gera a planilha fiscal com Bens e Direitos e Rendimentos '
                       'Anuais, pronta para a declaração do IRPF.'),
    ]

    def __init__(self, root):
        self.root = root
        self.root.title('RentaFlow — Gestão de Dividendos')
        self.root.configure(bg=CINZA_BG)
        self.root.minsize(480, 580)
        self.root.resizable(True, True)
        self._centralizar(530, 720)
        self._build()

    def _build(self):
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(1, weight=1)

        # ── Cabeçalho ─────────────────────────────────────────────────
        header = tk.Frame(self.root, bg=VERDE)
        header.grid(row=0, column=0, sticky='ew')
        header.columnconfigure(0, weight=1)

        topo = tk.Frame(header, bg=VERDE, padx=20, pady=14)
        topo.grid(row=0, column=0, sticky='ew')
        topo.columnconfigure(0, weight=1)

        tk.Label(topo, text='RentaFlow', bg=VERDE, fg=BRANCO,
                 font=('Segoe UI', 20, 'bold'), anchor='w'
                 ).grid(row=0, column=0, sticky='w')
        tk.Label(topo, text='Gestão de Dividendos', bg=VERDE, fg='#a7f3d0',
                 font=('Segoe UI', 9), anchor='w'
                 ).grid(row=1, column=0, sticky='w')

        # Botão abrir planilha no cabeçalho
        tk.Button(topo, text='📊 Abrir Planilha',
                  command=abrir_planilha,
                  bg=VERDE_ESC, fg=BRANCO,
                  font=('Segoe UI', 9, 'bold'),
                  padx=12, pady=5, relief='flat',
                  cursor='hand2',
                  activebackground='#0f4028',
                  activeforeground=BRANCO,
                  ).grid(row=0, column=1, rowspan=2, sticky='e', padx=(0, 0))

        # Barra de status
        status = tk.Frame(header, bg=VERDE_ESC, padx=20, pady=7)
        status.grid(row=1, column=0, sticky='ew')
        status.columnconfigure(0, weight=1)

        self.var_arquivo = tk.StringVar()
        self.var_att     = tk.StringVar()

        tk.Label(status, textvariable=self.var_arquivo,
                 bg=VERDE_ESC, fg='#d1fae5',
                 font=('Segoe UI', 8), anchor='w'
                 ).grid(row=0, column=0, sticky='ew')

        self.lbl_att = tk.Label(status, textvariable=self.var_att,
                                bg=VERDE_ESC, fg='#a7f3d0',
                                font=('Segoe UI', 8), anchor='w')
        self.lbl_att.grid(row=1, column=0, sticky='ew')

        self._atualizar_status()

        # ── Cards ──────────────────────────────────────────────────────
        area = tk.Frame(self.root, bg=CINZA_BG)
        area.grid(row=1, column=0, sticky='nsew', padx=14, pady=12)
        area.columnconfigure(0, weight=1)

        for i, mod in enumerate(self.MODULOS):
            card = ModuloCard(
                area,
                numero   = mod['numero'],
                titulo   = mod['titulo'],
                descricao= mod['descricao'],
                icone    = mod['icone'],
                cor      = mod['cor'],
                comando  = lambda m=mod['modulo']: abrir_modulo(m),
            )
            card.grid(row=i, column=0, sticky='ew', pady=(0, 6))

        # ── Rodapé ────────────────────────────────────────────────────
        rodape = tk.Frame(self.root, bg=CINZA_BG, padx=14, pady=10)
        rodape.grid(row=2, column=0, sticky='ew')
        rodape.columnconfigure(1, weight=1)

        tk.Button(rodape, text='⚙  Configurações',
                  command=self._abrir_setup,
                  bg=CINZA_BG, fg=TEXTO_SEC,
                  font=('Segoe UI', 9),
                  padx=12, pady=5, relief='flat',
                  cursor='hand2',
                  activebackground=SOMBRA,
                  ).grid(row=0, column=0, sticky='w')

        tk.Label(rodape, text='Desenvolvido por Cecília Ribeiro',
                 bg=CINZA_BG, fg=TEXTO_SEC,
                 font=('Segoe UI', 8, 'italic')
                 ).grid(row=0, column=1, sticky='ew')

        tk.Label(rodape, text='RentaFlow v1.0',
                 bg=CINZA_BG, fg='#c4c4bc',
                 font=('Segoe UI', 8)
                 ).grid(row=0, column=2, sticky='e')

    # ------------------------------------------------------------------
    def _atualizar_status(self):
        self.lbl_att.unbind('<Button-1>')
        self.lbl_att.config(cursor='')
        try:
            cfg   = carregar_config()
            excel = cfg['arquivo_excel']
            mtime = datetime.fromtimestamp(os.path.getmtime(excel))
            delta = datetime.now() - mtime
            horas = int(delta.total_seconds() // 3600)

            self.var_arquivo.set(f'📁  {os.path.basename(excel)}')

            if horas > 24:
                self.var_att.set(
                    f'⚠  Cotações desatualizadas há {horas}h — '
                    f'rode "Atualizar Cotações" antes de calcular aportes.')
                self.lbl_att.config(fg='#fcd34d')
            else:
                self.var_att.set(
                    f'✓  Última atualização: {mtime.strftime("%d/%m/%Y %H:%M")}')
                self.lbl_att.config(fg='#a7f3d0')
        except Exception:
            self.var_arquivo.set('⚠  Planilha não configurada.')
            self.var_att.set('▶  Clique aqui para configurar o sistema.')
            self.lbl_att.config(fg='#fca5a5', cursor='hand2')
            self.lbl_att.bind('<Button-1>', lambda e: self._abrir_setup())

    def _abrir_setup(self):
        try:
            from setup import SetupApp
            janela = tk.Toplevel()
            janela.grab_set()
            SetupApp(janela)
            self.root.wait_window(janela)
            self._atualizar_status()
        except Exception as e:
            messagebox.showerror('Erro ao abrir configurações', str(e))

    def _centralizar(self, largura, altura):
        self.root.update_idletasks()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.root.geometry(
            f'{largura}x{altura}+{(sw - largura)//2}+{(sh - altura)//2}')


# ── Entry point ────────────────────────────────────────────────────────
def main():
    try:
        root = tk.Tk()
        LauncherApp(root)
        root.mainloop()
    except Exception as e:
        import traceback
        try:
            err = tk.Tk()
            err.withdraw()
            messagebox.showerror(
                'Erro ao iniciar',
                f'Ocorreu um erro ao iniciar o sistema:\n\n{e}\n\n'
                f'Detalhes:\n{traceback.format_exc()[-600:]}'
            )
        except Exception:
            pass


if __name__ == '__main__':
    main()
