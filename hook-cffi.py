"""PyInstaller hook para cffi — incluye el .pyd compilado (_cffi_backend).

Sin esto, pythonnet → clr_loader → cffi falla con:
    ModuleNotFoundError: No module named 'cffi'

No usamos collect_submodules() porque dispara imports circulares con PyInstaller 6.x.
"""
hiddenimports = ['cffi', '_cffi_backend']
