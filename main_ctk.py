"""LOW — editor de código con agente IA multi-proveedor (versión CustomTkinter).

UI según design_handoff_low_editor sobre CustomTkinter: layout tipo VS Code,
tokens dark/light, bordes redondeados (pills, tarjetas, burbujas), panel del
agente con tarjetas Aceptar/Rechazar.
"""
import tkinter as tk
import tkinter.font as tkfont
import threading, os, sys, subprocess, re, json
import http.server, socketserver, webbrowser, datetime, time, difflib, requests
from tkinter import ttk, filedialog, messagebox
from pathlib import Path

import customtkinter as ctk

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import Config
from providers import get_provider, PROVIDERS
from code_runner import CodeRunner

# Tokens del handoff. Tk no soporta rgba: los colores translúcidos (line,
# greensoft, redsoft) están pre-compuestos sobre su fondo típico.
THEMES = {
    "dark": dict(bg="#0B0B0C", panel="#131315", panel2="#19191C",
                 line="#262628", line2="#1C1C1E",
                 txt="#F4F4F2", mut="#98988F", faint="#5C5C57",
                 red="#E5322D", redh="#F0453F", redsoft="#271010",
                 green="#4E8C5F", greensoft="#151E18",
                 kw="#F07E79", str_="#93C6A4", com="#63635E",
                 fn="#E3C989", num="#C9A0DC"),
    "light": dict(bg="#F5F4F1", panel="#FFFFFF", panel2="#EDECE8",
                  line="#E3E2DF", line2="#ECEBE8",
                  txt="#171716", mut="#6E6E67", faint="#A5A59D",
                  red="#D22823", redh="#B91F1B", redsoft="#F2E2DE",
                  green="#3E7A4F", greensoft="#DFE5DE",
                  kw="#C03530", str_="#2F7A47", com="#9A9A92",
                  fn="#9A6F00", num="#7B3FA0"),
}

IGNORE_DIRS = {".git", "__pycache__", "node_modules", ".venv", "venv",
               "dist", "build", ".idea", ".vscode"}
CODE_EXT = {".py", ".js", ".ts", ".tsx", ".jsx", ".md", ".txt", ".json",
            ".html", ".css", ".sh", ".ps1", ".yml", ".yaml", ".toml",
            ".sql", ".c", ".cpp", ".h", ".rs", ".go", ".java"}
LANG_BY_EXT = {".py": "python", ".js": "javascript", ".ts": "javascript",
               ".sh": "bash", ".ps1": "powershell"}
PH_INP = "Ordena algo a LOW…"
PH_Q = "⌕  Buscar o dar una orden…  (Ctrl+K)"

RE_KW = re.compile(r"\b(def|class|return|import|from|as|if|elif|else|for|while|try|except|finally|with|lambda|pass|break|continue|yield|async|await|raise|assert|del|in|is|not|and|or|None|True|False|self|const|let|var|function|new|this|typeof|export|default|extends|interface|type|public|private|static|void|switch|case|null|undefined|true|false)\b")
RE_FN = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\(")
RE_STR = re.compile(r"'[^'\n]*'|\"[^\"\n]*\"|`[^`]*`")
RE_COM = re.compile(r"//[^\n]*|#[^\n]*|/\*.*?\*/", re.S)
RE_NUM = re.compile(r"\b\d+\.?\d*\b")


class LineNumbers(tk.Canvas):
    def __init__(s, parent, app, **kw):
        super().__init__(parent, width=52, highlightthickness=0, **kw)
        s.app = app; s.tw = None

    def attach(s, tw):
        s.tw = tw
        for ev in ("<KeyRelease>", "<ButtonRelease-1>", "<Configure>"):
            tw.bind(ev, s._redraw, True)
        tw.bind("<MouseWheel>", lambda e: s.after_idle(s._redraw), True)

    def _redraw(s, e=None):
        s.delete("all")
        if not s.tw:
            return
        t = s.app.T
        try:
            i = s.tw.index("@0,0")
        except tk.TclError:
            return
        # Límite de seguridad para evitar bucles infinitos en casos extremos
        max_lines = 10000
        line_count = 0
        while line_count < max_lines:
            b = s.tw.bbox(i)
            if not b:
                break
            s.create_text(44, b[1] + b[3] // 2, anchor="e", text=str(int(float(i))),
                          fill=t["faint"], font=(s.app.MONO, 8))
            i = s.tw.index(f"{i}+1line")
            line_count += 1


class LOWApp:
    def __init__(s):
        ctk.set_appearance_mode("dark")
        s.root = ctk.CTk()
        s.root.title("LOW")
        try:
            base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
            ico = os.path.join(base, "low.ico")
            if os.path.exists(ico):
                s.root.iconbitmap(ico)
        except tk.TclError:
            pass
        s.cfg = Config()
        s.theme = s.cfg.theme if s.cfg.theme in THEMES else "dark"
        fams = set(tkfont.families())
        s.UI = "Figtree" if "Figtree" in fams else "Segoe UI"
        s.MONO = next((f for f in ("JetBrains Mono", "Cascadia Code", "Consolas")
                       if f in fams), "Courier New")
        s.root.minsize(1000, 620)
        s.root.update_idletasks()
        sw, sh = s.root.winfo_screenwidth(), s.root.winfo_screenheight()
        w, h = min(1500, sw - 40), min(950, sh - 80)
        s.root.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")
        s.sty = ttk.Style(); s.sty.theme_use("clam")

        s.prov = None; s.ws = None
        s.tabs = {}; s.order = []; s.cur = None
        s.untitled = 0; s.pending = None
        s.reg = []; s.minilogos = []
        s._loading = False; s._inp_ph = False
        s.tree_paths = {}

        s.ses_dir = Path(os.environ.get('APPDATA', '.')) / 'LOW/historial'
        s.ses_dir.mkdir(parents=True, exist_ok=True)
        s.ses_id = datetime.datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        s.ses_msgs = []
        s._mem = []  # memoria de conversación para contexto del modelo

        s._initp(); s._ui(); s._apply_theme()
        s._new_tab()
        s.amsg("system", "Bienvenido a LOW —  para las API keys ·  para abrir un proyecto\n"
                         "Comandos: /compare /history /resume /browse /form /scrape /preview "
                         "/ssh /upload /read /write /exec /run /files")
        s.root.protocol("WM_DELETE_WINDOW", s._close)

    # ── tema ──────────────────────────────────────────────
    @property
    def T(s):
        return THEMES[s.theme]

    def _c(s, tok):
        return s.T.get(tok, tok)

    def _reg(s, w, **roles):
        s.reg.append((w, roles))
        try:
            # Asegurarse de que roles es un diccionario antes de llamar a .items()
            if isinstance(roles, dict):
                w.configure(**{k: s._c(v) for k, v in roles.items()})
        except (tk.TclError, ValueError):
            pass
        return w

    def _setrole(s, w, **roles):
        for ww, rr in s.reg:
            if ww is w:
                rr.update(roles)
                break
        try:
            # Asegurarse de que roles es un diccionario antes de llamar a .items()
            if isinstance(roles, dict):
                w.configure(**{k: s._c(v) for k, v in roles.items()})
        except (tk.TclError, ValueError):
            pass

    def _toggle_theme(s):
        s.theme = "light" if s.theme == "dark" else "dark"
        s.cfg.data["theme"] = s.theme; s.cfg.save()
        s._apply_theme()

    def _apply_theme(s):
        t = s.T
        s.reg = [(w, r) for w, r in s.reg if w.winfo_exists()]
        # Límite de seguridad para evitar problemas con demasiados widgets
        max_widgets = 5000
        for i, (w, roles) in enumerate(s.reg):
            if i >= max_widgets:
                break
            try:
                # Asegurarse de que roles es un diccionario antes de llamar a .items()
                if isinstance(roles, dict):
                    w.configure(**{k: s._c(v) for k, v in roles.items()})
            except (tk.TclError, ValueError):
                pass
        s.sty.configure("LOW.Treeview", background=t["panel"], fieldbackground=t["panel"],
                        foreground=t["mut"], borderwidth=0, relief="flat",
                        bordercolor=t["panel"], lightcolor=t["panel"], darkcolor=t["panel"],
                        rowheight=26, font=(s.UI, 9))
        s.sty.map("LOW.Treeview", background=[("selected", t["panel2"])],
                  foreground=[("selected", t["txt"])])
        # sintaxis
        s.ed.tag_configure("kw", foreground=t["kw"])
        s.ed.tag_configure("fn", foreground=t["fn"])
        s.ed.tag_configure("num", foreground=t["num"])
        s.ed.tag_configure("str", foreground=t["str_"])
        s.ed.tag_configure("com", foreground=t["com"])
        s.ed.tag_configure("agent", background=t["greensoft"])
        s.ed.tag_lower("agent")
        for tg in ("fn", "num", "kw", "str", "com"):
            s.ed.tag_raise(tg)
        # terminal
        s.out.tag_configure("p", foreground=t["green"])
        s.out.tag_configure("err", foreground=t["red"])
        # logos
        s._draw_logo(s.logo, 26)
        s.minilogos = [c for c in s.minilogos if c.winfo_exists()]
        for cv in s.minilogos:
            cv.configure(bg=t["panel"]); s._draw_logo(cv, 18)
        s.thbtn.configure(text="" if s.theme == "dark" else "")
        if s._inp_ph:
            s.inp.configure(text_color=t["faint"])
        s._retabs(); s.ln._redraw()

    # ── helpers de construcción ───────────────────────────
    def _ibtn(s, p, ch, cmd, size=12):
        return s._reg(ctk.CTkButton(p, text=ch, width=32, height=32, corner_radius=9,
                                    border_width=1, font=(s.UI, size), command=cmd),
                      fg_color="transparent", text_color="mut",
                      border_color="line", hover_color="panel2")

    def _abtn(s, p, ch, cmd, active=False, red=False):
        b = s._reg(ctk.CTkButton(p, text=ch, width=32, height=32, corner_radius=9,
                                 font=(s.UI, 13), command=cmd),
                   fg_color=("panel2" if active else "transparent"),
                   text_color=("red" if red else ("txt" if active else "mut")),
                   hover_color="panel2")
        b.pack(pady=3)
        return b

    def _round_rect(s, cv, x1, y1, x2, y2, r, **kw):
        pts = [x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r, x2, y2 - r, x2, y2,
               x2 - r, y2, x1 + r, y2, x1, y2, x1, y2 - r, x1, y1 + r, x1, y1]
        return cv.create_polygon(pts, smooth=True, **kw)

    def _draw_logo(s, cv, size):
        cv.delete("all")
        s._round_rect(cv, 1, 1, size - 1, size - 1, int(size * 0.3), fill=s.T["green"])
        cv.create_text(size // 2, size // 2 + 1, text="", fill="#E5322D",
                       font=(s.UI, max(7, int(size * 0.42)), "bold"))

    def _mini_logo(s, parent):
        cv = tk.Canvas(parent, width=18, height=18, highlightthickness=0, bg=s.T["panel"])
        s._draw_logo(cv, 18)
        s.minilogos.append(cv)
        return cv

    def _sep(s, parent, **grid_kw):
        f = s._reg(ctk.CTkFrame(parent, corner_radius=0), fg_color="line")
        f.grid(**grid_kw)
        return f

    # ── construcción de UI ────────────────────────────────
    def _ui(s):
        r = s.root
        s._reg(r, fg_color="bg")
        r.columnconfigure(0, weight=1); r.rowconfigure(2, weight=1)

        # ══ Header ══
        hd = s._reg(ctk.CTkFrame(r, corner_radius=0), fg_color="panel")
        hd.grid(row=0, column=0, sticky="ew")
        s._sep(r, row=1, column=0, sticky="ew").configure(height=1)
        hdi = s._reg(ctk.CTkFrame(hd, corner_radius=0), fg_color="panel")
        hdi.pack(fill="x", padx=14, pady=8)
        s.logo = tk.Canvas(hdi, width=26, height=26, highlightthickness=0)
        s._reg(s.logo, bg="panel")
        s.logo.pack(side="left")
        s._reg(ctk.CTkLabel(hdi, text="LOW", font=(s.UI, 13, "bold")),
               fg_color="transparent", text_color="txt").pack(side="left", padx=(9, 12))
        s._reg(ctk.CTkFrame(hdi, width=1, height=20, corner_radius=0),
               fg_color="line").pack(side="left", padx=(0, 12))
        # pill proveedor/modelo
        pill = s._reg(ctk.CTkFrame(hdi, corner_radius=9, border_width=1),
                      fg_color="panel2", border_color="line")
        pill.pack(side="left")
        s._reg(ctk.CTkLabel(pill, text="", font=(s.UI, 8), width=10),
               fg_color="transparent", text_color="green").pack(side="left", padx=(10, 4), pady=4)
        s.pv = tk.StringVar(value=s.cfg.get_active_provider())
        s.pb = s._reg(ctk.CTkComboBox(pill, values=list(PROVIDERS.keys()), variable=s.pv,
                                      state="readonly", width=104, height=24,
                                      corner_radius=6, border_width=0, font=(s.UI, 9),
                                      command=s._provch),
                      fg_color="panel2", button_color="panel2", button_hover_color="line",
                      text_color="txt", dropdown_fg_color="panel2",
                      dropdown_text_color="txt", dropdown_hover_color="line")
        s.pb.pack(side="left", pady=4)
        s.mv = tk.StringVar(value=s.cfg.get_model(s.pv.get()))
        s.mb = s._reg(ctk.CTkComboBox(pill, values=[], variable=s.mv, width=200, height=24,
                                      corner_radius=6, border_width=0, font=(s.UI, 9),
                                      command=s._modelch),
                      fg_color="panel2", button_color="panel2", button_hover_color="line",
                      text_color="txt", dropdown_fg_color="panel2",
                      dropdown_text_color="txt", dropdown_hover_color="line")
        s.mb.pack(side="left", padx=(4, 10), pady=4)
        try:
            s.mb._entry.bind("<Return>", s._modelch)
        except AttributeError:
            pass
        s._rmodels()
        # buscador Ctrl+K
        s.q = s._reg(ctk.CTkEntry(hdi, width=250, height=30, corner_radius=9,
                                  border_width=1, font=(s.UI, 9), placeholder_text=PH_Q),
                     fg_color="panel", border_color="line",
                     text_color="txt", placeholder_text_color="faint")
        s.q.pack(side="left", padx=(12, 0))
        s.q.bind("<Return>", s._qsend)
        s.q.bind("<Escape>", lambda e: s.ed.focus_set())
        # botones derecha
        runb = s._reg(ctk.CTkButton(hdi, text=" Ejecutar", height=32, corner_radius=9,
                                    font=(s.UI, 10, "bold"), command=s._run),
                      fg_color="red", hover_color="redh", text_color="#FFFFFF")
        runb.pack(side="right")
        for ch, cmd in (("", s._save), ("", s._open), ("", s._setws), ("", s._set)):
            s._ibtn(hdi, ch, cmd).pack(side="right", padx=(0, 6))
        s.thbtn = s._ibtn(hdi, "", s._toggle_theme)
        s.thbtn.pack(side="right", padx=(0, 6))

        # ══ Cuerpo ══
        bd = s._reg(ctk.CTkFrame(r, corner_radius=0), fg_color="bg")
        bd.grid(row=2, column=0, sticky="nsew")
        bd.rowconfigure(0, weight=1); bd.columnconfigure(4, weight=1)

        # barra de actividad
        act = s._reg(ctk.CTkFrame(bd, width=46, corner_radius=0), fg_color="panel")
        act.grid(row=0, column=0, sticky="ns"); act.pack_propagate(False)
        s._sep(bd, row=0, column=1, sticky="ns").configure(width=1)
        s.ab_exp = s._abtn(act, "", s._toggle_tree, active=True)
        s._abtn(act, "⌕", lambda: s.q.focus_set())
        s._abtn(act, "⑂", s._git_info)
        s.ab_ag = s._abtn(act, "", s._toggle_agent, red=True)

        # árbol de archivos
        s.treewrap = s._reg(ctk.CTkFrame(bd, width=200, corner_radius=0), fg_color="panel")
        s.treewrap.grid(row=0, column=2, sticky="ns"); s.treewrap.pack_propagate(False)
        s.tsep = s._sep(bd, row=0, column=3, sticky="ns")
        s.tsep.configure(width=1)
        s.proj_lbl = s._reg(ctk.CTkLabel(s.treewrap, text="SIN PROYECTO", anchor="w",
                                         font=(s.UI, 8, "bold")),
                            fg_color="transparent", text_color="faint")
        s.proj_lbl.pack(fill="x", padx=12, pady=(12, 6))
        s.tree = ttk.Treeview(s.treewrap, show="tree", style="LOW.Treeview",
                              selectmode="browse")
        s.tree.pack(fill="both", expand=True, padx=8, pady=(0, 10))
        s.tree.bind("<<TreeviewSelect>>", s._tree_open)

        # editor
        edw = s._reg(ctk.CTkFrame(bd, corner_radius=0), fg_color="bg")
        edw.grid(row=0, column=4, sticky="nsew")
        edw.columnconfigure(0, weight=1); edw.rowconfigure(2, weight=1)
        s.tabbar = s._reg(ctk.CTkFrame(edw, corner_radius=0), fg_color="bg")
        s.tabbar.grid(row=0, column=0, sticky="ew", padx=10, pady=(8, 0))
        s._sep(edw, row=1, column=0, sticky="ew").configure(height=1)
        edf = s._reg(ctk.CTkFrame(edw, corner_radius=0), fg_color="bg")
        edf.grid(row=2, column=0, sticky="nsew")
        edf.columnconfigure(1, weight=1); edf.rowconfigure(0, weight=1)
        s.ln = LineNumbers(edf, s); s._reg(s.ln, bg="bg")
        s.ln.grid(row=0, column=0, sticky="ns")
        s.ed = tk.Text(edf, wrap="none", undo=True, font=(s.MONO, 10), padx=10, pady=12,
                       relief="flat", borderwidth=0, highlightthickness=0,
                       spacing1=3, tabs=("1c",))
        s._reg(s.ed, bg="bg", fg="txt", insertbackground="red",
               selectbackground="panel2", selectforeground="txt")
        s.ed.grid(row=0, column=1, sticky="nsew")
        s.ln.attach(s.ed)
        s.ed.bind("<KeyRelease>", s._on_key)
        s.ed.bind("<ButtonRelease-1>", lambda e: s._linecol())
        s.ed.bind("<Return>", s._autoindent, True)
        s.ed.bind("<<Modified>>", s._on_modified)
        s._sep(edw, row=3, column=0, sticky="ew").configure(height=1)

        # terminal
        s.termwrap = s._reg(ctk.CTkFrame(edw, corner_radius=0), fg_color="panel")
        s.termwrap.grid(row=4, column=0, sticky="ew")
        th = s._reg(ctk.CTkFrame(s.termwrap, corner_radius=0), fg_color="panel")
        th.pack(fill="x", padx=14, pady=(6, 2))
        s._reg(ctk.CTkLabel(th, text="Terminal", font=(s.UI, 9, "bold")),
               fg_color="transparent", text_color="txt").pack(side="left")
        s._reg(ctk.CTkLabel(th, text="Problemas · Salida", font=(s.UI, 9)),
               fg_color="transparent", text_color="faint").pack(side="left", padx=10)
        s.termtog = s._reg(ctk.CTkButton(th, text="", width=24, height=20,
                                         corner_radius=6, font=(s.UI, 10),
                                         command=s._toggle_term),
                           fg_color="transparent", text_color="mut", hover_color="panel2")
        s.termtog.pack(side="right")
        s.out = tk.Text(s.termwrap, height=4, wrap="word", state="disabled",
                        font=(s.MONO, 9), relief="flat", borderwidth=0, padx=14)
        s._reg(s.out, bg="panel", fg="mut")
        s.out.pack(fill="x")

        # ══ Panel del agente ══
        s.agsep = s._sep(bd, row=0, column=5, sticky="ns")
        s.agsep.configure(width=1)
        s.agent = s._reg(ctk.CTkFrame(bd, width=360, corner_radius=0), fg_color="panel")
        s.agent.grid(row=0, column=6, sticky="ns"); s.agent.pack_propagate(False)
        ah = s._reg(ctk.CTkFrame(s.agent, corner_radius=0), fg_color="panel")
        ah.pack(fill="x", padx=14, pady=10)
        s._reg(ctk.CTkLabel(ah, text="Agente", font=(s.UI, 11, "bold")),
               fg_color="transparent", text_color="txt").pack(side="left")
        s.badge = s._reg(ctk.CTkLabel(ah, text="activo", corner_radius=8, height=20,
                                      font=(s.MONO, 8)),
                         fg_color="greensoft", text_color="green")
        s.badge.pack(side="left", padx=8)
        for ch, cmd in (("", s._new_chat), ("", s._history), ("⚖", s._cmp_ui)):
            s._reg(ctk.CTkButton(ah, text=ch, width=26, height=24, corner_radius=6,
                                 font=(s.UI, 11), command=cmd),
                   fg_color="transparent", text_color="mut", hover_color="panel2")\
                .pack(side="right", padx=2)
        s._reg(ctk.CTkFrame(s.agent, height=1, corner_radius=0), fg_color="line")\
            .pack(fill="x")
        s.chat = s._reg(ctk.CTkScrollableFrame(s.agent, corner_radius=0),
                        fg_color="panel", scrollbar_button_color="line",
                        scrollbar_button_hover_color="mut")
        s.chat.pack(fill="both", expand=True, padx=(6, 0))
        s._reg(ctk.CTkFrame(s.agent, height=1, corner_radius=0), fg_color="line")\
            .pack(fill="x")
        iz = s._reg(ctk.CTkFrame(s.agent, corner_radius=0), fg_color="panel")
        iz.pack(fill="x", padx=14, pady=10)
        chips = s._reg(ctk.CTkFrame(iz, corner_radius=0), fg_color="panel")
        chips.pack(fill="x", pady=(0, 8))
        for name, cmd in (("/compare", s._cmp_ui), ("/run", s._run), ("/files", s._ws_files)):
            s._reg(ctk.CTkButton(chips, text=name, width=14 + 7 * len(name), height=20,
                                 corner_radius=99, border_width=1, font=(s.MONO, 8),
                                 command=cmd),
                   fg_color="transparent", text_color="mut", border_color="line",
                   hover_color="panel2").pack(side="left", padx=(0, 6))
        inw = s._reg(ctk.CTkFrame(iz, corner_radius=12, border_width=1),
                     fg_color="panel2", border_color="line")
        inw.pack(fill="x"); inw.columnconfigure(0, weight=1)
        s.inp = s._reg(ctk.CTkTextbox(inw, height=42, corner_radius=12, border_width=0,
                                      font=(s.UI, 9), wrap="word",
                                      activate_scrollbars=False),
                       fg_color="panel2", text_color="txt")
        s.inp.grid(row=0, column=0, sticky="ew", padx=(4, 0), pady=3)
        send = s._reg(ctk.CTkButton(inw, text="", width=32, height=32, corner_radius=9,
                                    font=(s.UI, 13, "bold"), command=s._send),
                      fg_color="red", hover_color="redh", text_color="#FFFFFF")
        send.grid(row=0, column=1, sticky="se", padx=6, pady=5)
        s.inp.bind("<Return>", lambda e: (s._send(), "break")[1])
        s.inp.bind("<Shift-Return>", lambda e: s.inp.insert("insert", "\n"))
        s._tph()

        # ══ Barra de estado ══
        s._sep(r, row=3, column=0, sticky="ew").configure(height=1)
        ftw = s._reg(ctk.CTkFrame(r, corner_radius=0), fg_color="panel")
        ftw.grid(row=4, column=0, sticky="ew")
        ft = s._reg(ctk.CTkFrame(ftw, corner_radius=0), fg_color="panel")
        ft.pack(fill="x", padx=14, pady=3)
        s.apidot = s._reg(ctk.CTkLabel(ft, text="", font=(s.UI, 8), width=10),
                          fg_color="transparent", text_color="green")
        s.apidot.pack(side="left")
        s.apis = s._reg(ctk.CTkLabel(ft, text="0 APIs conectadas", font=(s.UI, 9)),
                        fg_color="transparent", text_color="mut")
        s.apis.pack(side="left", padx=(4, 14))
        s.branch = s._reg(ctk.CTkLabel(ft, text="", font=(s.UI, 9)),
                          fg_color="transparent", text_color="mut")
        s.branch.pack(side="left")
        s.st = s._reg(ctk.CTkLabel(ft, text="Listo", font=(s.UI, 9)),
                      fg_color="transparent", text_color="mut")
        s.st.pack(side="left", expand=True)
        s.lincol = s._reg(ctk.CTkLabel(ft, text="Ln 1, Col 1", font=(s.UI, 9)),
                          fg_color="transparent", text_color="mut")
        s.lincol.pack(side="right")
        s._reg(ctk.CTkLabel(ft, text="UTF-8", font=(s.UI, 9)),
               fg_color="transparent", text_color="mut").pack(side="right", padx=14)
        s.lv = tk.StringVar(value="python")
        s._reg(ctk.CTkComboBox(ft, values=CodeRunner.supported_languages(),
                               variable=s.lv, state="readonly", width=110, height=22,
                               corner_radius=6, border_width=0, font=(s.UI, 9)),
               fg_color="panel2", button_color="panel2", button_hover_color="line",
               text_color="mut", dropdown_fg_color="panel2",
               dropdown_text_color="txt", dropdown_hover_color="line")\
            .pack(side="right")

        r.bind("<Control-s>", lambda e: (s._save(), "break")[1])
        r.bind("<Control-k>", lambda e: (s.q.focus_set(), "break")[1])
        r.bind("<Control-Return>", lambda e: (s._run(), "break")[1])
        s._update_apis()

    # ── placeholder del input (CTkTextbox no trae) ────────
    def _tph(s):
        s._inp_ph = True
        s.inp.insert("1.0", PH_INP); s.inp.configure(text_color=s.T["faint"])

        def fin(e):
            if s._inp_ph:
                s.inp.delete("1.0", "end"); s._inp_ph = False
                s.inp.configure(text_color=s.T["txt"])

        def fout(e):
            if not s.inp.get("1.0", "end-1c").strip():
                s._inp_ph = True
                s.inp.delete("1.0", "end"); s.inp.insert("1.0", PH_INP)
                s.inp.configure(text_color=s.T["faint"])
        s.inp.bind("<FocusIn>", fin); s.inp.bind("<FocusOut>", fout)

    # ── toggles de paneles ────────────────────────────────
    def _toggle_tree(s):
        if s.treewrap.winfo_ismapped():
            s.treewrap.grid_remove(); s.tsep.grid_remove()
            s._setrole(s.ab_exp, fg_color="transparent", text_color="mut")
        else:
            s.treewrap.grid(); s.tsep.grid()
            s._setrole(s.ab_exp, fg_color="panel2", text_color="txt")

    def _toggle_agent(s):
        if s.agent.winfo_ismapped():
            s.agent.grid_remove(); s.agsep.grid_remove()
            s._setrole(s.ab_ag, fg_color="transparent")
        else:
            s.agent.grid(); s.agsep.grid()
            s._setrole(s.ab_ag, fg_color="panel2")

    def _toggle_term(s):
        if s.out.winfo_manager():
            s.out.pack_forget(); s.termtog.configure(text="")
        else:
            s.out.pack(fill="x"); s.termtog.configure(text="")

    # ── proveedor / modelos ───────────────────────────────
    def _initp(s):
        n = s.cfg.get_active_provider()
        kw = {"model": s.cfg.get_model(n)}
        bu = s.cfg.data.get("providers", {}).get(n, {}).get("base_url", "")
        if bu:
            kw["base_url"] = bu
        try:
            s.prov = get_provider(n, api_key=s.cfg.get_api_key(n), **kw)
        except Exception:
            s.prov = None

    def _rmodels(s):
        try:
            n = s.pv.get()
            kw = {"model": s.cfg.get_model(n)}
            bu = s.cfg.data.get("providers", {}).get(n, {}).get("base_url", "")
            if bu:
                kw["base_url"] = bu
            p = get_provider(n, api_key=s.cfg.get_api_key(n) or "x", **kw)
            models = p.list_models()
            s.mb.configure(values=models)
            # si el modelo guardado no está en la lista, elegir el primero
            cur = s.mv.get()
            if cur and cur not in models:
                s.mv.set(models[0] if models else cur)
        except Exception:
            s.mb.configure(values=["(configura la key)"])

    def _provch(s, e=None):
        n = s.pv.get()
        s.cfg.set_active_provider(n); s._initp(); s._rmodels()
        s.mv.set(s.cfg.get_model(n) or (s.prov.model if s.prov else ""))
        s._update_apis()
        s.amsg("system", f"Proveedor  {n} · {s.mv.get()}")

    def _modelch(s, e=None):
        s.cfg.set_model(s.pv.get(), s.mv.get().strip())
        s._initp()
        s.st.configure(text=f"Modelo  {s.mv.get()}")

    def _update_apis(s):
        provs = s.cfg.data.get("providers", {})
        n = sum(1 for d in provs.values() if d.get("api_key"))
        s.apis.configure(text=f"{n} API{'s' if n != 1 else ''} conectada{'s' if n != 1 else ''}")
        s._setrole(s.apidot, text_color=("green" if n else "faint"))
        active = s.cfg.get_active_provider()
        ok = bool(s.cfg.get_api_key(active)) or active == "custom"
        s.badge.configure(text="activo" if ok else "sin key")
        s._setrole(s.badge, fg_color=("greensoft" if ok else "panel2"),
                   text_color=("green" if ok else "mut"))

    # ── workspace / árbol ─────────────────────────────────
    def _setws(s):
        p = filedialog.askdirectory()
        if not p:
            return
        s.ws = str(p)
        s._tree_fill(); s._update_branch()
        s.amsg("system", f" Workspace: {p}")

    def _tree_fill(s):
        s.tree.delete(*s.tree.get_children()); s.tree_paths = {}
        if not s.ws:
            s.proj_lbl.configure(text="SIN PROYECTO")
            return
        root = Path(s.ws)
        s.proj_lbl.configure(text=root.name.upper()[:24])

        def add(dirp, parent, depth, max_items=1000):
            item_count = 0
            try:
                entries = sorted(dirp.iterdir(), key=lambda x: (x.is_file(), x.name.lower()))
            except OSError:
                return
            for p in entries:
                if item_count >= max_items:
                    return
                if p.name.startswith("."):
                    continue
                if p.is_dir():
                    if p.name in IGNORE_DIRS:
                        continue
                    node = s.tree.insert(parent, "end", text=" " + p.name, open=False)
                    if depth < 3:
                        add(p, node, depth + 1, max_items)
                    item_count += 1
                elif p.suffix.lower() in CODE_EXT:
                    node = s.tree.insert(parent, "end", text=p.name)
                    s.tree_paths[node] = str(p)
                    item_count += 1
        add(root, "", 0)

    def _tree_open(s, e=None):
        sel = s.tree.selection()
        if sel and sel[0] in s.tree_paths:
            s._open_tab(s.tree_paths[sel[0]])

    def _git_branch(s):
        if not s.ws:
            return ""
        head = Path(s.ws) / ".git" / "HEAD"
        try:
            txt = head.read_text(encoding="utf-8").strip()
            return txt.rsplit("/", 1)[-1] if txt.startswith("ref:") else txt[:8]
        except OSError:
            return ""

    def _update_branch(s):
        b = s._git_branch()
        s.branch.configure(text=f"⑂ {b}" if b else "")

    def _git_info(s):
        b = s._git_branch()
        s.amsg("system", f"⑂ rama: {b}" if b else "⑂ El workspace no es un repo git")

    # ── tabs ──────────────────────────────────────────────
    def _new_tab(s):
        s.untitled += 1
        name = "sin título" if s.untitled == 1 else f"sin título {s.untitled}"
        s._add_tab(f"*untitled{s.untitled}", name, "// Nuevo archivo\n")

    def _add_tab(s, tid, name, content):
        if tid in s.tabs:
            s._switch(tid)
            return
        f = s._reg(ctk.CTkFrame(s.tabbar, corner_radius=9), fg_color="transparent")
        nl = s._reg(ctk.CTkLabel(f, text=name, font=(s.UI, 9), width=0),
                    fg_color="transparent", text_color="mut")
        dl = s._reg(ctk.CTkLabel(f, text="", font=(s.UI, 9, "bold"), width=0),
                    fg_color="transparent", text_color="red")
        nl.pack(side="left", padx=(12, 0), pady=4)
        dl.pack(side="left", padx=(2, 12))
        f.pack(side="left", padx=(0, 4))
        for w in (f, nl, dl):
            w.bind("<Button-1>", lambda e, t=tid: s._switch(t))
            w.bind("<Button-2>", lambda e, t=tid: s._close_tab(t))
            w.bind("<Button-3>", lambda e, t=tid: s._close_tab(t))
        s.tabs[tid] = dict(name=name, frame=f, nl=nl, dl=dl, content=content,
                           modified=False, path=None if tid.startswith("*") else tid)
        s.order.append(tid)
        s._switch(tid)

    def _switch(s, tid):
        if s.cur and s.cur in s.tabs:
            s.tabs[s.cur]["content"] = s.ed.get("1.0", "end-1c")
        s.cur = tid
        tab = s.tabs[tid]
        s._loading = True
        s.ed.delete("1.0", "end"); s.ed.insert("1.0", tab["content"])
        s.ed.edit_reset(); s.ed.edit_modified(False)
        s._loading = False
        if tab["path"]:
            ext = os.path.splitext(tab["path"])[1].lower()
            if ext in LANG_BY_EXT:
                s.lv.set(LANG_BY_EXT[ext])
        s.root.title(f"LOW — {tab['name']}")
        s._retabs(); s._highlight(); s._linecol(); s.ln._redraw()

    def _retabs(s):
        for tid, tab in s.tabs.items():
            active = tid == s.cur
            s._setrole(tab["frame"], fg_color=("panel2" if active else "transparent"))
            s._setrole(tab["nl"], text_color=("txt" if active else "mut"))
            tab["dl"].configure(text="" if tab["modified"] else "")

    def _close_tab(s, tid):
        tab = s.tabs.get(tid)
        if not tab:
            return
        if tab["modified"] and not messagebox.askyesno(
                "LOW", f"{tab['name']} tiene cambios sin guardar. ¿Cerrar igual?"):
            return
        tab["frame"].destroy()
        del s.tabs[tid]; s.order.remove(tid)
        if s.cur == tid:
            s.cur = None
            if s.order:
                s._switch(s.order[-1])
            else:
                s._new_tab()

    def _open_tab(s, path):
        p = str(path)
        if p in s.tabs:
            s._switch(p)
            return
        try:
            content = Path(p).read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            s.amsg("system", f" No pude abrir {p}: {e}")
            return
        s._add_tab(p, os.path.basename(p), content)

    def _on_modified(s, e=None):
        if not s.ed.edit_modified():
            return
        if not s._loading and s.cur in s.tabs and not s.tabs[s.cur]["modified"]:
            s.tabs[s.cur]["modified"] = True
            s.tabs[s.cur]["dl"].configure(text="")
        s.ed.edit_modified(False)

    # ── editor ────────────────────────────────────────────
    def _on_key(s, e=None):
        s._highlight(); s._linecol()

    def _linecol(s, e=None):
        try:
            ln, col = s.ed.index("insert").split(".")
            s.lincol.configure(text=f"Ln {ln}, Col {int(col) + 1}")
        except tk.TclError:
            pass

    def _highlight(s, e=None):
        for tag in ("kw", "fn", "num", "str", "com"):
            s.ed.tag_remove(tag, "1.0", "end")
        t = s.ed.get("1.0", "end-1c")
        if len(t) > 200_000:
            return
        for m in RE_KW.finditer(t):
            s.ed.tag_add("kw", f"1.0+{m.start()}c", f"1.0+{m.end()}c")
        for m in RE_FN.finditer(t):
            s.ed.tag_add("fn", f"1.0+{m.start(1)}c", f"1.0+{m.end(1)}c")
        for m in RE_NUM.finditer(t):
            s.ed.tag_add("num", f"1.0+{m.start()}c", f"1.0+{m.end()}c")
        for m in RE_STR.finditer(t):
            s.ed.tag_add("str", f"1.0+{m.start()}c", f"1.0+{m.end()}c")
        for m in RE_COM.finditer(t):
            s.ed.tag_add("com", f"1.0+{m.start()}c", f"1.0+{m.end()}c")

    def _autoindent(s, e=None):
        ln = int(float(s.ed.index("insert")))
        p = s.ed.get(f"{ln}.0", f"{ln}.0 lineend")
        m = re.match(r"^(\s*)", p)
        i = m.group(1) if m else ""
        if p.rstrip().endswith(":") or p.rstrip().endswith("{"):
            i += "    "
        if p.rstrip().endswith("}"):
            i = i[:-4] if len(i) >= 4 else ""
        s.ed.insert("insert", "\n" + i)
        return "break"

    # ── burbujas del chat ─────────────────────────────────
    def _scroll_end(s):
        s.chat.update_idletasks()
        try:
            s.chat._parent_canvas.yview_moveto(1.0)
        except Exception:
            pass

    def _bubble_user(s, text):
        bub = s._reg(ctk.CTkFrame(s.chat, corner_radius=12), fg_color="panel2")
        lbl = s._reg(ctk.CTkLabel(bub, text=text, font=(s.UI, 9), wraplength=225,
                                  justify="left"),
                     fg_color="transparent", text_color="txt")
        lbl.pack(padx=13, pady=8)
        bub.pack(anchor="e", pady=(10, 0), padx=(40, 8))

    def _bubble_agent(s, text):
        head = s._reg(ctk.CTkFrame(s.chat, corner_radius=0), fg_color="transparent")
        s._mini_logo(head).pack(side="left")
        s._reg(ctk.CTkLabel(head, text=f"Fidel · {s.mv.get() or '?'}", font=(s.UI, 8)),
               fg_color="transparent", text_color="mut").pack(side="left", padx=7)
        head.pack(anchor="w", pady=(12, 2), padx=2)
        s._reg(ctk.CTkLabel(s.chat, text=text, font=(s.UI, 9), wraplength=300,
                            justify="left"),
               fg_color="transparent", text_color="txt")\
            .pack(anchor="w", padx=(4, 12))

    def _bubble_sys(s, text):
        s._reg(ctk.CTkLabel(s.chat, text=" " + text, font=(s.UI, 8), wraplength=300,
                            justify="left"),
               fg_color="transparent", text_color="mut")\
            .pack(anchor="w", pady=(8, 0), padx=4)

    def _tmsg(s, name, res):
        s._reg(ctk.CTkLabel(s.chat, text=f" {name}  {res}", font=(s.MONO, 8),
                            wraplength=290, justify="left"),
               fg_color="transparent", text_color="mut")\
            .pack(anchor="w", pady=(4, 0), padx=(16, 4))
        s._scroll_end()

    def amsg(s, sender, text):
        if sender == "user":
            s._bubble_user(text)
        elif sender == "Fidel":
            s._bubble_agent(text)
        else:
            s._bubble_sys(text)
        s._scroll_end()
        try:
            s.ses_msgs.append({"role": sender, "content": text,
                               "ts": datetime.datetime.now().isoformat()})
            (s.ses_dir / f"{s.ses_id}.json").write_text(
                json.dumps(s.ses_msgs, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass

    # ── propuesta de cambios del agente ───────────────────
    def _propose(s, new):
        old = s.ed.get("1.0", "end-1c")
        if new.strip() == old.strip():
            return
        tab = s.tabs.get(s.cur)
        sm = difflib.SequenceMatcher(None, old.splitlines(), new.splitlines())
        adds = dels = 0
        ranges = []
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op in ("replace", "insert"):
                adds += j2 - j1; ranges.append((j1, j2))
            if op in ("replace", "delete"):
                dels += i2 - i1
        s.ed.delete("1.0", "end"); s.ed.insert("1.0", new)
        s._highlight()
        for j1, j2 in ranges:
            s.ed.tag_add("agent", f"{j1 + 1}.0", f"{j2 + 1}.0")
        s.pending = {"old": old, "tid": s.cur}
        s.ln._redraw()

        name = tab["name"] if tab else "editor"
        card = s._reg(ctk.CTkFrame(s.chat, corner_radius=11, border_width=1),
                      fg_color="panel", border_color="line")
        top = s._reg(ctk.CTkFrame(card, corner_radius=0), fg_color="transparent")
        top.pack(fill="x", padx=12, pady=(9, 0))
        s._reg(ctk.CTkLabel(top, text="", font=(s.UI, 9), width=0),
               fg_color="transparent", text_color="red").pack(side="left")
        s._reg(ctk.CTkLabel(top, text=name, font=(s.MONO, 8), width=0),
               fg_color="transparent", text_color="txt").pack(side="left", padx=6)
        s._reg(ctk.CTkLabel(top, text=f"+{adds}", font=(s.MONO, 8), width=0),
               fg_color="transparent", text_color="green").pack(side="left")
        s._reg(ctk.CTkLabel(top, text=f"−{dels}", font=(s.MONO, 8), width=0),
               fg_color="transparent", text_color="red").pack(side="left", padx=(4, 0))
        btns = s._reg(ctk.CTkFrame(card, corner_radius=0), fg_color="transparent")
        btns.pack(fill="x", padx=12, pady=(8, 10))
        btns.columnconfigure((0, 1), weight=1)

        def done(msg):
            ok.configure(state="disabled"); no.configure(state="disabled")
            s._setrole(ok, fg_color="panel2", text_color="faint")
            s._setrole(no, text_color="faint")
            s.st.configure(text=msg)
        ok = s._reg(ctk.CTkButton(btns, text="Aceptar", height=28, corner_radius=8,
                                  font=(s.UI, 9, "bold"),
                                  command=lambda: (s._accept(), done(" Cambios aceptados"))),
                    fg_color="red", hover_color="redh", text_color="#FFFFFF")
        no = s._reg(ctk.CTkButton(btns, text="Rechazar", height=28, corner_radius=8,
                                  border_width=1, font=(s.UI, 9),
                                  command=lambda: (s._reject(), done("↩ Cambios rechazados"))),
                    fg_color="transparent", text_color="mut", border_color="line",
                    hover_color="panel2")
        ok.grid(row=0, column=0, sticky="ew", padx=(0, 4))
        no.grid(row=0, column=1, sticky="ew", padx=(4, 0))
        card.pack(fill="x", pady=(10, 0), padx=(4, 10))
        s._scroll_end()

    def _accept(s):
        s.ed.tag_remove("agent", "1.0", "end")
        s.pending = None

    def _reject(s):
        if not s.pending:
            return
        old, tid = s.pending["old"], s.pending["tid"]
        if s.cur == tid:
            s.ed.delete("1.0", "end"); s.ed.insert("1.0", old)
            s._highlight(); s.ln._redraw()
        elif tid in s.tabs:
            s.tabs[tid]["content"] = old
        s.pending = None

    # ── COMPARE ───────────────────────────────────────────
    def _cmp_ui(s):
        t = s.T
        w = ctk.CTkToplevel(s.root); w.title("Comparar modelos")
        w.configure(fg_color=t["bg"]); w.resizable(False, False)
        w.attributes("-topmost", True)
        box = ctk.CTkFrame(w, fg_color="transparent")
        box.pack(padx=20, pady=16)
        ctk.CTkLabel(box, text="Comparar modelos", font=(s.UI, 12, "bold"),
                     text_color=t["txt"]).pack(anchor="w")
        ctk.CTkLabel(box, text="El código del editor se envía a cada modelo en paralelo",
                     font=(s.UI, 8), text_color=t["faint"]).pack(anchor="w", pady=(0, 10))
        vars = {}
        for pr, d in s.cfg.data.get("providers", {}).items():
            if not d.get("api_key"):
                continue
            v = tk.BooleanVar(value=True)
            ctk.CTkCheckBox(box, text=f"{pr}  ·  {d.get('model', '?')}", variable=v,
                            font=(s.UI, 9), text_color=t["txt"], fg_color=t["green"],
                            hover_color=t["green"], border_color=t["line"],
                            checkmark_color="#FFFFFF", corner_radius=6,
                            checkbox_width=18, checkbox_height=18)\
                .pack(anchor="w", pady=3)
            vars[pr] = v
        if not vars:
            ctk.CTkLabel(box, text="Ningún proveedor tiene API key configurada",
                         font=(s.UI, 9), text_color=t["mut"]).pack(pady=8)

        def run():
            sel = [k for k, v in vars.items() if v.get()]
            if sel:
                w.destroy(); s._compare(" ".join(sel))
        ctk.CTkButton(box, text="Comparar", height=32, corner_radius=9,
                      font=(s.UI, 10, "bold"), fg_color=t["red"], hover_color=t["redh"],
                      text_color="#FFFFFF", command=run).pack(pady=(14, 0), fill="x")

    def _compare(s, models_str):
        cod = s.ed.get("1.0", "end").strip()
        if not cod or cod == "// Nuevo archivo":
            s.amsg("system", "Escribe código primero")
            return
        provs = s.cfg.data.get("providers", {})
        models = [m for m in models_str.split()
                  if m in provs and (provs[m].get("api_key") or m == "custom")]
        if not models:
            s.amsg("system", "Sin proveedores con key")
            return
        prompt = cod[:800]
        s.amsg("system", f"⚖ Comparando {len(models)} modelos en paralelo…")

        def worker():
            results = []

            def run_one(pn):
                try:
                    cfg = provs[pn]
                    kw = {"model": cfg.get("model", "") or None}
                    if cfg.get("base_url"):
                        kw["base_url"] = cfg["base_url"]
                    p = get_provider(pn, api_key=cfg.get("api_key", ""), **kw)
                    t0 = time.time()
                    r = p.chat([{"role": "user",
                                 "content": f"Analiza brevemente:\n```\n{prompt}\n```"}],
                               system_prompt="Responde en una línea.")
                    res = {"prov": pn, "model": r.model, "tokens": r.tokens_used,
                           "lat_ms": int((time.time() - t0) * 1000),
                           "costo": r.cost, "resp": r.content[:200]}
                    results.append(res)
                    s.root.after(0, lambda r=res: s.amsg(
                        "system", f" {r['prov']} · {r['model']}: {r['lat_ms']}ms · "
                                  f"{r['tokens']}t · ${r['costo']:.4f}\n   {r['resp'][:120]}"))
                except Exception as e:
                    s.root.after(0, lambda pn=pn, e=e: s.amsg("system", f" {pn}: {e}"))

            ts = [threading.Thread(target=run_one, args=(m,), daemon=True) for m in models]
            for th in ts:
                th.start()
            for th in ts:
                th.join(timeout=90)
            cmp_dir = Path(os.environ.get('APPDATA', '.')) / 'Fidel/comparativas'
            cmp_dir.mkdir(parents=True, exist_ok=True)
            fp = cmp_dir / f"cmp_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            fp.write_text(json.dumps({"prompt": prompt, "resultados": results,
                                      "ts": time.time()}, indent=2, ensure_ascii=False),
                          encoding="utf-8")
            s.root.after(0, lambda: s.amsg("system", f" Guardado: {fp.name}"))
        threading.Thread(target=worker, daemon=True).start()

    # ── HISTORY ───────────────────────────────────────────
    def _history(s):
        try:
            files = sorted(s.ses_dir.glob("*.json"), reverse=True)[:15]
            if not files:
                s.amsg("system", "Sin historial")
                return
            for f in files[:8]:
                try:
                    msgs = json.loads(f.read_text(encoding="utf-8"))
                    first = msgs[0]["content"][:80] if msgs else "(vacía)"
                except Exception:
                    first = "(error)"
                s.amsg("system", f" {f.stem}: {first}")
            s.amsg("system", " /resume <id> para restaurar")
        except Exception as e:
            s.amsg("system", f" {e}")

    def _resume(s, sid):
        f = s.ses_dir / f"{sid}.json"
        if not f.exists():
            s.amsg("system", f"No existe: {sid}")
            return
        try:
            msgs = json.loads(f.read_text(encoding="utf-8"))
            s._clear_chat()
            s.ses_msgs = []; s.ses_id = sid
            # Reconstruir _mem para que el modelo tenga contexto de la conversación
            s._mem = []
            for m in msgs:
                role = m.get("role", "system")
                s.amsg(role if role in ("user", "Fidel") else "system", m.get("content", ""))
                if role in ("user", "Fidel"):
                    s._mem.append({"role": "user" if role == "user" else "assistant",
                                  "content": m.get("content", "")})
            # Mantener solo los últimos 16 turnos para no saturar el contexto
            s._mem = s._mem[-16:]
            s.ses_msgs = msgs
            s.amsg("system", f" Restaurada ({len(msgs)} msgs)")
        except Exception as e:
            s.amsg("system", f" {e}")

    def _clear_chat(s):
        for w in s.chat.winfo_children():
            w.destroy()

    def _new_chat(s):
        s.ses_id = datetime.datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        s.ses_msgs = []
        s._mem = []  # limpiar memoria de contexto
        s._clear_chat()
        s.amsg("system", "Nueva conversación")

    # ── COMMANDS / CHAT ───────────────────────────────────
    def _send(s):
        if s._inp_ph:
            return
        msg = s.inp.get("1.0", "end").strip()
        if not msg:
            return
        s.inp.delete("1.0", "end")
        if msg.startswith("/"):
            c = msg[1:].strip()
            p = c.split(maxsplit=1)
            cmd = p[0].lower(); arg = p[1] if len(p) > 1 else ""
            {"run": s._run, "files": s._ws_files, "ls": s._ws_files,
             "preview": s._preview, "history": s._history}.get(cmd, lambda: 0)()
            if cmd == "read" and arg: s._read(arg)
            if cmd == "exec" and arg: s._exec(arg)
            if cmd == "ssh" and arg: s._ssh(arg)
            if cmd == "upload" and arg: s._upload(arg)
            if cmd == "browse" and arg: s._browse(arg)
            if cmd == "compare":
                s._compare(arg) if arg else s._cmp_ui()
            if cmd == "resume" and arg: s._resume(arg)
            if cmd == "form" and arg:
                s._form(arg, c[len("form "):] if len(c) > 5 else "")
            if cmd == "scrape" and arg: s._scrape(arg)
            if cmd == "write" and arg and " " in c:
                fn, _, ct = c[6:].strip().partition(" ")
                s._write(fn, ct)
            return
        cod = s.ed.get("1.0", "end").strip()
        s.amsg("user", msg)
        if not s.prov or not (s.cfg.get_api_key(s.cfg.get_active_provider())
                              or s.cfg.get_active_provider() == "custom"):
            s.amsg("Fidel", "Configura la API key () para empezar")
            return
        s.st.configure(text=" Pensando…")
        threading.Thread(target=s._chat_worker, args=(msg, cod), daemon=True).start()

    def _get_tools(s):
        return [
            {"type": "function", "function": {"name": "read_file", "description": "Lee archivo del workspace", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
            {"type": "function", "function": {"name": "write_file", "description": "Escribe archivo", "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}}},
            {"type": "function", "function": {"name": "exec_cmd", "description": "Ejecuta comando shell", "parameters": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}}},
            {"type": "function", "function": {"name": "run_code", "description": "Corre codigo del editor", "parameters": {"type": "object", "properties": {"language": {"type": "string"}}, "required": ["language"]}}},
            {"type": "function", "function": {"name": "list_files", "description": "Lista archivos del workspace", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}}}},
        ]

    def _exec_tool(s, name, args):
        try:
            if name == "read_file":
                p = Path(s.ws if s.ws else ".") / args["path"]
                return p.read_text(encoding="utf-8", errors="replace")[:5000] \
                    if p.exists() else " No existe"
            if name == "write_file":
                p = Path(s.ws if s.ws else ".") / args["path"]
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(args["content"], encoding="utf-8")
                return f" Escrito ({len(args['content'])}c)"
            if name == "exec_cmd":
                r = subprocess.run(args["command"], shell=True, capture_output=True,
                                   text=True, timeout=30, cwd=s.ws)
                return f" exit={r.returncode}\n" + ((r.stdout + "\n" + r.stderr).strip()[:3000])
            if name == "run_code":
                c = s.ed.get("1.0", "end").strip()
                if not c or c == "// Nuevo archivo":
                    return " Editor vacio"
                return json.dumps(CodeRunner.run(c, args.get("language", s.lv.get())),
                                  indent=2)[:3000]
            if name == "list_files":
                if not s.ws:
                    return "Sin workspace"
                return "\n".join(str(f.relative_to(s.ws))
                                 for f in sorted(Path(s.ws).rglob("*"))
                                 if f.is_file() and f.suffix in CODE_EXT)[:3000]
        except Exception as e:
            return f" {e}"

    def _chat_worker(s, msg, cod):
        r = None
        try:
            ctx = ""
            if cod.strip() and not cod.startswith("//"):
                ctx += f"Editor ({s.lv.get()}):\n```{s.lv.get()}\n{cod[:3000]}\n```\n"
            if s.ws:
                cf = [f for f in sorted(Path(s.ws).rglob("*"))[:200]
                      if f.is_file() and f.suffix in CODE_EXT]
                if cf:
                    ctx += "Proyecto:\n" + "\n".join(
                        f"  {f.relative_to(s.ws)}" for f in cf[:12]) + "\n"
            sp = ("Eres Fidel, senior 25+ anos. Tienes HERRAMIENTAS: lee, escribe, "
                  "ejecuta. ACTUA directo. Sin vueltas. Espanol.")
            # Usar memoria de contexto si existe, sino empezar desde cero
            ms = list(s._mem[-8:]) + [{"role": "user", "content": ctx + msg}]
            for _ in range(6):
                r = s.prov.chat(ms, system_prompt=sp, tools=s._get_tools())
                raw = r.raw or {}
                msg_resp = raw.get("choices", [{}])[0].get("message", {})
                tcs = msg_resp.get("tool_calls", [])
                if not tcs:
                    content = msg_resp.get("content", "") or r.content
                    if content:
                        s.root.after(0, lambda c=content: s.amsg("Fidel", c))
                    break
                ms.append({"role": "assistant",
                           "content": msg_resp.get("content", ""), "tool_calls": tcs})
                for tc in tcs:
                    fn = tc["function"]["name"]
                    try:
                        args = json.loads(tc["function"]["arguments"])
                    except (json.JSONDecodeError, TypeError):
                        args = {}
                    res = s._exec_tool(fn, args)
                    ms.append({"role": "tool", "tool_call_id": tc.get("id", ""),
                               "content": res})
                    # Mostrar detalles más específicos de la herramienta
                    tool_desc = fn
                    if fn == "read_file" and "path" in args:
                        tool_desc = f" Leyendo {args['path']}"
                    elif fn == "write_file" and "path" in args:
                        tool_desc = f" Escribiendo {args['path']}"
                    elif fn == "exec_cmd":
                        tool_desc = " Ejecutando comando"
                    elif fn == "run_code":
                        tool_desc = " Ejecutando código"
                    elif fn == "list_files":
                        tool_desc = " Listando archivos"
                    elif fn == "search_code":
                        tool_desc = " Buscando código"
                    s.root.after(0, lambda td=tool_desc, rr=str(res)[:150]: s._tmsg(td, rr))
            # código propuesto  tarjeta Aceptar/Rechazar
            content = ""
            for mr in reversed(ms):
                if mr.get("role") == "assistant" and mr.get("content"):
                    content = mr.get("content", "")
                    bs = re.findall(r"```(?:\w+)?\n(.+?)```", mr["content"], re.DOTALL)
                    if bs and bs[0].strip() != "// Nuevo archivo":
                        s.root.after(0, lambda c=bs[0].strip(): s._propose(c))
                    break
            # Guardar en memoria de contexto para próximas consultas
            if content:
                s._mem.append({"role": "user", "content": msg})
                s._mem.append({"role": "assistant", "content": content})
                s._mem = s._mem[-16:]  # mantener solo los últimos 16 turnos
            if r:
                s.root.after(0, lambda: s.st.configure(
                    text=f" {r.tokens_used}t · ${r.cost:.4f} · {r.model}"))
        except Exception as e:
            s.root.after(0, lambda e=e: s.amsg("Fidel", f" {e}"))
            s.root.after(0, lambda: s.st.configure(text="Error"))

    # ── ejecutar código ───────────────────────────────────
    def _run(s):
        c = s.ed.get("1.0", "end").strip()
        if not c or c == "// Nuevo archivo":
            return
        if not s.out.winfo_manager():
            s._toggle_term()
        lang = s.lv.get()
        s._log(f"➜ run {lang}\n", "p")
        s.st.configure(text=" Ejecutando…")

        def work():
            r = CodeRunner.run(c, lang)
            s.root.after(0, lambda: s._show(r))
        threading.Thread(target=work, daemon=True).start()

    def _show(s, r):
        if r.get("error"):
            s._log(f" {r['error']}\n", "err")
        else:
            if r["stdout"]:
                s._log(r["stdout"])
            if r["stderr"]:
                s._log(r["stderr"], "err")
            if not r["stdout"] and not r["stderr"]:
                s._log("(sin salida)\n")
            code = r.get("returncode", "?")
            s._log(f"── exit {code} ──\n", "p" if code == 0 else "err")
        s.st.configure(text="Listo")

    def _log(s, t, tag=None):
        s.out.config(state="normal")
        if tag:
            s.out.insert("end", t, tag)
        else:
            s.out.insert("end", t)
        s.out.see("end"); s.out.config(state="disabled")

    # ── comandos utilitarios ──────────────────────────────
    def _read(s, p):
        fp = Path(s.ws if s.ws else ".") / p
        if not fp.exists():
            s.amsg("system", "No existe")
            return
        s._open_tab(fp)

    def _write(s, f, c):
        fp = Path(s.ws if s.ws else ".") / f
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(c, encoding="utf-8")
        s.amsg("system", f" {fp}")

    def _exec(s, cmd):
        try:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                               timeout=30, cwd=s.ws)
            s.amsg("system", f"$ {cmd}\n{(r.stdout + r.stderr)[:2000]}")
        except Exception as e:
            s.amsg("system", f" {e}")

    def _preview(s):
        def serve():
            d = s.ws or "."
            os.chdir(d)
            with socketserver.TCPServer(("", 0), http.server.SimpleHTTPRequestHandler) as h:
                p = h.server_address[1]
                s.root.after(0, lambda: s.amsg("system", f" http://localhost:{p}"))
                webbrowser.open(f"http://localhost:{p}")
                h.serve_forever()
        threading.Thread(target=serve, daemon=True).start()

    def _ssh(s, a):
        try:
            r = subprocess.run(f"ssh {a}", shell=True, capture_output=True,
                               text=True, timeout=60)
            s.amsg("system", "[SSH]\n" + (r.stdout + r.stderr)[:2000])
        except Exception as e:
            s.amsg("system", f" {e}")

    def _upload(s, a):
        try:
            r = subprocess.run(f"scp {a}", shell=True, capture_output=True,
                               text=True, timeout=120)
            s.amsg("system", "[Upload]\n" + (r.stdout + r.stderr)[:2000])
        except Exception as e:
            s.amsg("system", f" {e}")

    def _browse(s, url):
        webbrowser.open(url)
        s.amsg("system", f" {url}")

    def _form(s, url, data):
        try:
            d = dict(p.split("=", 1) for p in data.split() if "=" in p)
            r = requests.post(url, data=d, timeout=15)
            s.amsg("system", f"[Storyboard] Form ({r.status_code})")
        except Exception as e:
            s.amsg("system", f" {e}")

    def _scrape(s, url):
        try:
            r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
            s.amsg("system", f" {url[:60]} ({len(r.text)}b)")
        except Exception as e:
            s.amsg("system", f" {e}")

    def _ws_files(s):
        if not s.ws:
            s.amsg("system", "Abre un workspace ()")
            return
        cf = [f for f in sorted(Path(s.ws).rglob("*"))
              if f.is_file() and f.suffix in CODE_EXT]
        if cf:
            s.amsg("system", "\n".join(f"  {f.relative_to(s.ws)}" for f in cf[:25]))

    def _open(s):
        p = filedialog.askopenfilename(initialdir=str(s.ws) if s.ws else None)
        if p:
            s._open_tab(p)

    def _save(s):
        tab = s.tabs.get(s.cur)
        if not tab:
            return
        p = tab["path"]
        if not p:
            p = filedialog.asksaveasfilename(initialdir=str(s.ws) if s.ws else None,
                                             defaultextension=".py")
            if not p:
                return
            old_tid = s.cur
            tab["path"] = p; tab["name"] = os.path.basename(p)
            tab["nl"].configure(text=tab["name"])
            s.tabs[p] = tab
            del s.tabs[old_tid]
            s.order[s.order.index(old_tid)] = p
            s.cur = p
        Path(p).write_text(s.ed.get("1.0", "end-1c"), encoding="utf-8")
        tab["modified"] = False
        tab["dl"].configure(text="")
        s.root.title(f"Fidel — {tab['name']}")
        s.st.configure(text=f" {os.path.basename(p)}")

    # ── búsqueda/orden rápida (Ctrl+K) ────────────────────
    def _qsend(s, e=None):
        v = s.q.get().strip()
        if not v:
            return "break"
        s.q.delete(0, "end")
        s.root.focus_set()
        if s._inp_ph:
            s.inp.delete("1.0", "end"); s._inp_ph = False
            s.inp.configure(text_color=s.T["txt"])
        else:
            s.inp.delete("1.0", "end")
        s.inp.insert("1.0", v)
        s._send()
        return "break"

    # ── configuración de APIs ─────────────────────────────
    def _set(s):
        t = s.T
        w = ctk.CTkToplevel(s.root); w.title("Configuración de APIs")
        w.configure(fg_color=t["bg"]); w.resizable(False, False)
        w.attributes("-topmost", True)
        box = ctk.CTkFrame(w, fg_color="transparent")
        box.pack(padx=20, pady=16)
        ctk.CTkLabel(box, text="API Keys", font=(s.UI, 12, "bold"),
                     text_color=t["txt"]).pack(anchor="w")
        ctk.CTkLabel(box, text=f"Se guardan en {s.cfg.path}", font=(s.UI, 8),
                     text_color=t["faint"]).pack(anchor="w", pady=(0, 10))
        es = {}
        for pr, d in s.cfg.data.get("providers", {}).items():
            row = ctk.CTkFrame(box, fg_color="transparent")
            row.pack(fill="x", pady=3)
            ctk.CTkLabel(row, text=pr, width=80, anchor="w", font=(s.MONO, 9),
                         text_color=t["mut"]).pack(side="left")
            v = tk.StringVar(value=d.get("api_key", ""))
            ctk.CTkEntry(row, textvariable=v, width=340, height=28, show="•",
                         corner_radius=8, border_width=1, font=(s.UI, 9),
                         fg_color=t["panel2"], border_color=t["line"],
                         text_color=t["txt"]).pack(side="left", padx=(8, 0))
            es[pr] = v

        def sv():
            for p, v in es.items():
                s.cfg.set_api_key(p, v.get().strip())
            s._initp(); s._update_apis()
            s.amsg("system", " Keys guardadas")
            w.destroy()
        ctk.CTkButton(box, text="Guardar", height=32, corner_radius=9,
                      font=(s.UI, 10, "bold"), fg_color=t["red"], hover_color=t["redh"],
                      text_color="#FFFFFF", command=sv).pack(pady=(14, 0), fill="x")

    # ── ciclo de vida ─────────────────────────────────────
    def _close(s):
        dirty = [t["name"] for t in s.tabs.values() if t["modified"]]
        if dirty and not messagebox.askyesno(
                "Fidel", "Hay cambios sin guardar en: " + ", ".join(dirty) + "\n¿Salir igual?"):
            return
        s.cfg.save(); s.root.destroy()

    def run(s):
        s.root.mainloop()


if __name__ == "__main__":
    Fidel().run()
