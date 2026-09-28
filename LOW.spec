# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
datas=[('providers', 'providers'), ('code_runner', 'code_runner'), ('config.py', '.'),
       ('low.ico', '.'), ('ui', 'ui'), ('tools', 'tools'), ('low_anim.py', '.'),
       ('self_improvement.py', '.'), ('animation_engine', 'animation_engine'),
       ('social', 'social')],
    hiddenimports=['providers', 'providers.transport', 'providers.nvidia_provider',
                   'code_runner', 'webview.platforms.winforms',
                   'webview.platforms.edgechromium', 'webview.platforms.cocoa',
                   'webview.platforms.qt',
                   'low_anim', 'self_improvement',
                   'animation_engine', 'animation_engine.nodes',
                   'animation_engine.project', 'animation_engine.renderer',
                   'animation_engine.rigging', 'animation_engine.storyboard',
                   'tools', 'tools.animation', 'tools.animation.core',
                   'tools.animation.timeline', 'tools.animation.exporter',
                   'tools.animation.rigging', 'tools.animation.nodes',
                   'tools.animation.ai_pipeline', 'vtracer',
                   # pythonnet → clr_loader → cffi (necesario para .NET runtime)
                   'cffi', 'clr_loader', 'clr_loader.hostfxr', 'clr_loader.ffi'],
    hookspath=['.'],
    hooksconfig={},
    runtime_hooks=['pyi_rth_pythonnet.py'],
    excludes=[
        # Modulos pesados que LOW no usa -> build mas rapido
        # numpy NO se excluye: el motor de animacion (tools/animation) lo necesita
        'matplotlib', 'scipy', 'pandas',
        'unittest', 'test', 'pydoc',
        # distutils NO se excluye — PyInstaller 6.x + Python 3.13 lo necesita
        'setuptools',
        'sqlalchemy',
        'pytest', 'coverage', 'tox',
        'Cython',
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='LOW',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='low.ico',
)
