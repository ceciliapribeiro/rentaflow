"""
setup.py
Assistente de configuração inicial do sistema.
Roda uma única vez para gerar o config.json.
Pode ser reaberto a qualquer momento para alterar as configurações.
"""
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import os
import sys

# Importa o loader para ler/salvar config
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config_loader import carregar_config, salvar_config, CONFIG_FILE


class SetupApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Configuração do Sistema — Gestão de Dividendos")
        self.root.resizable(False, False)
        self._centralizar(540, 380)

        # Carrega config existente (ou defaults)
        try:
            self.config = carregar_config()
        except SystemExit:
            self.config = {
                'arquivo_excel':     'Inter s2 - Investimentos.xlsx',
                'senha_pdf':         '',
                'pasta_notas':       'Notas_Corretagem',
                'janela_busca_dias': 365,
            }

        self._construir_ui()

    # ------------------------------------------------------------------
    # Layout
    # ------------------------------------------------------------------
    def _construir_ui(self):
        pad = {'padx': 20, 'pady': 8}

        # Cabeçalho
        header = tk.Frame(self.root, bg='#1a6b45', height=64)
        header.pack(fill='x')
        tk.Label(
            header,
            text='  Gestão de Dividendos — Configuração Inicial',
            bg='#1a6b45', fg='white',
            font=('Segoe UI', 13, 'bold'),
            anchor='w'
        ).pack(fill='x', padx=20, pady=18)

        # Container principal
        frame = tk.Frame(self.root, padx=20, pady=10)
        frame.pack(fill='both', expand=True)

        # ── Arquivo Excel ──────────────────────────────────────────────
        tk.Label(frame, text='Arquivo Excel da planilha:', anchor='w',
                 font=('Segoe UI', 9)).grid(row=0, column=0, columnspan=2,
                                             sticky='w', pady=(10, 2))

        self.var_excel = tk.StringVar(value=self.config['arquivo_excel'])
        entry_excel = tk.Entry(frame, textvariable=self.var_excel,
                               width=46, font=('Segoe UI', 9))
        entry_excel.grid(row=1, column=0, sticky='ew', pady=2)

        tk.Button(frame, text='Procurar...', command=self._procurar_excel,
                  font=('Segoe UI', 9), cursor='hand2'
                  ).grid(row=1, column=1, padx=(8, 0), pady=2)

        # ── Senha PDF ─────────────────────────────────────────────────
        tk.Label(frame,
                 text='Senha dos PDFs de corretagem\n(normalmente os 3 primeiros dígitos do CPF):',
                 anchor='w', justify='left',
                 font=('Segoe UI', 9)).grid(row=2, column=0, columnspan=2,
                                             sticky='w', pady=(14, 2))

        self.var_senha = tk.StringVar(value=self.config['senha_pdf'])
        tk.Entry(frame, textvariable=self.var_senha, show='*',
                 width=16, font=('Segoe UI', 9)
                 ).grid(row=3, column=0, sticky='w', pady=2)

        # ── Pasta Notas ───────────────────────────────────────────────
        tk.Label(frame, text='Pasta das notas de corretagem (PDFs):', anchor='w',
                 font=('Segoe UI', 9)).grid(row=4, column=0, columnspan=2,
                                             sticky='w', pady=(14, 2))

        self.var_pasta = tk.StringVar(value=self.config['pasta_notas'])
        entry_pasta = tk.Entry(frame, textvariable=self.var_pasta,
                               width=46, font=('Segoe UI', 9))
        entry_pasta.grid(row=5, column=0, sticky='ew', pady=2)

        tk.Button(frame, text='Procurar...', command=self._procurar_pasta,
                  font=('Segoe UI', 9), cursor='hand2'
                  ).grid(row=5, column=1, padx=(8, 0), pady=2)

        # ── Janela de dividendos ──────────────────────────────────────
        tk.Label(frame,
                 text='Janela de busca de dividendos (dias retroativos):',
                 anchor='w', font=('Segoe UI', 9)
                 ).grid(row=6, column=0, columnspan=2, sticky='w', pady=(14, 2))

        self.var_janela = tk.IntVar(value=self.config['janela_busca_dias'])
        spin = tk.Spinbox(frame, from_=30, to=730, increment=30,
                          textvariable=self.var_janela,
                          width=8, font=('Segoe UI', 9))
        spin.grid(row=7, column=0, sticky='w', pady=2)
        tk.Label(frame, text='(365 = 1 ano   |   730 = 2 anos)',
                 fg='gray', font=('Segoe UI', 8)
                 ).grid(row=7, column=1, sticky='w', padx=8)

        frame.columnconfigure(0, weight=1)

        # ── Botões ────────────────────────────────────────────────────
        btn_frame = tk.Frame(self.root)
        btn_frame.pack(fill='x', padx=20, pady=(0, 16))

        tk.Button(
            btn_frame, text='Salvar configuração',
            command=self._salvar,
            bg='#1a6b45', fg='white',
            font=('Segoe UI', 10, 'bold'),
            padx=20, pady=8, cursor='hand2',
            relief='flat', activebackground='#145535'
        ).pack(side='right')

        tk.Button(
            btn_frame, text='Cancelar',
            command=self.root.destroy,
            font=('Segoe UI', 10),
            padx=16, pady=8, cursor='hand2',
            relief='flat'
        ).pack(side='right', padx=(0, 8))

    # ------------------------------------------------------------------
    # Ações
    # ------------------------------------------------------------------
    def _procurar_excel(self):
        caminho = filedialog.askopenfilename(
            title='Selecione a planilha Excel',
            filetypes=[('Arquivos Excel', '*.xlsx *.xlsm'), ('Todos', '*.*')]
        )
        if caminho:
            self.var_excel.set(caminho)

    def _procurar_pasta(self):
        caminho = filedialog.askdirectory(title='Selecione a pasta das notas de corretagem')
        if caminho:
            self.var_pasta.set(caminho)

    def _salvar(self):
        excel  = self.var_excel.get().strip()
        senha  = self.var_senha.get().strip()
        pasta  = self.var_pasta.get().strip()
        janela = self.var_janela.get()

        # Validações básicas
        if not excel:
            messagebox.showerror('Campo obrigatório', 'Informe o caminho da planilha Excel.')
            return
        if not os.path.isfile(excel):
            messagebox.showwarning(
                'Arquivo não encontrado',
                f'O arquivo:\n{excel}\nnão foi encontrado. Verifique o caminho e tente novamente.'
            )
            return
        if not senha:
            messagebox.showerror('Campo obrigatório', 'Informe a senha dos PDFs.')
            return

        nova_config = {
            'arquivo_excel':     excel,
            'senha_pdf':         senha,
            'pasta_notas':       pasta or 'Notas_Corretagem',
            'janela_busca_dias': janela,
        }

        salvar_config(nova_config)

        messagebox.showinfo(
            'Configuração salva',
            'Tudo certo!\n\nAs configurações foram salvas.\n'
            'Agora você pode usar os outros módulos normalmente.'
        )
        self.root.destroy()

    # ------------------------------------------------------------------
    # Utilitários
    # ------------------------------------------------------------------
    def _centralizar(self, largura, altura):
        self.root.update_idletasks()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x  = (sw - largura) // 2
        y  = (sh - altura) // 2
        self.root.geometry(f'{largura}x{altura}+{x}+{y}')


def main():
    root = tk.Tk()
    SetupApp(root)
    root.mainloop()


if __name__ == '__main__':
    main()
