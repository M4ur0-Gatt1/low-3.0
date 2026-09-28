"""StepFun Provider (阶跃星辰, API compatible OpenAI).

DOS ENDPOINTS, Y NO DAN LO MISMO. StepFun publica el de chat corriente y otro
aparte para «Step Plan», su producto de planificación:

    chat        https://api.stepfun.ai/v1            (internacional)
                https://api.stepfun.com/v1           (China)
    Step Plan   https://api.stepfun.ai/step_plan/v1

Se usa el INTERNACIONAL por defecto, que es el que responde desde acá; el de
China queda a un campo de distancia (Base URL en la tarjeta del proveedor)
para quien lo necesite.

SOBRE LOS IDs DE MODELO. La lista de abajo es sólo el RESPALDO: con la clave
puesta, `list_models()` de `OpenAICompatProvider` consulta `/models` en vivo y
usa lo que StepFun conteste. Los que están acá se tomaron de la
documentación de integración de StepFun (step-3.5-flash y step-3.7-flash en el
endpoint de chat; step-5-preview vive en el de Step Plan, así que no entra en
esta lista). Si alguno cambió de nombre, el botón «Comprobar catálogo» de la
tarjeta lo va a decir con la clave de quien lo use, que es más confiable que
una lista escrita a mano.
"""
from providers.base import OpenAICompatProvider


class StepFunProvider(OpenAICompatProvider):
    BASE_URL = "https://api.stepfun.ai/v1"
    MODELS = [
        "step-3.7-flash",
        "step-3.5-flash",
    ]

    @staticmethod
    def provider_name(): return "StepFun"
    @staticmethod
    def default_model(): return "step-3.7-flash"
