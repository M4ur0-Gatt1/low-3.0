# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

LOW's Windows installers and executables published on the [releases page](https://github.com/M4ur0-Gatt1/low-3.0/releases) are built from this repository by GitHub Actions (`.github/workflows/build.yml`), and every signing request is approved manually by the project's approver. Only binaries built from this repository's own source code are signed. Third-party open source components included in the installer (Python runtime, three.js, CodeMirror, MediaPipe, etc.) keep their own licenses and are not signed with this certificate.

## Team roles

- Committers and reviewers: [Mauro Gatti (@M4ur0-Gatt1)](https://github.com/M4ur0-Gatt1)
- Approvers: [Mauro Gatti (@M4ur0-Gatt1)](https://github.com/M4ur0-Gatt1)

Changes proposed by anyone who is not a committer (for example, pull requests) are reviewed by a committer before they are merged.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

In detail:

- **No telemetry, no analytics.** LOW does not send usage data. Crash reports are written to a local file (`%APPDATA%\LOW`) and are never uploaded.
- **AI providers you configure.** If you add an API key for an AI provider (for example Anthropic, OpenAI, DeepSeek, Groq or others listed in the provider settings), the text, images or files you send in the chat are transmitted to that provider, under that provider's own privacy policy. Without a key, nothing is sent.
- **Web search and publishing, when you ask.** Web searches requested in the chat go to the search engine in use (DuckDuckGo, Bing or Mojeek), and publishing to a social network only happens when you connect your account and publish.
- **Your files stay on your computer.** Projects, drawings and settings are stored locally.

---

# Política de firma de código (español)

Firma de código gratuita provista por SignPath.io, certificado de SignPath Foundation.

Los instaladores y ejecutables de Windows del [listado de versiones](https://github.com/M4ur0-Gatt1/low-3.0/releases) se compilan desde este repositorio con GitHub Actions, y cada firma la aprueba a mano el responsable del proyecto. Sólo se firman binarios compilados desde el código propio de este repositorio.

- Autores y revisores: Mauro Gatti (@M4ur0-Gatt1)
- Aprobación de firmas: Mauro Gatti (@M4ur0-Gatt1)

**Privacidad:** este programa no transfiere información a otros sistemas de la red salvo que lo pida expresamente quien lo instala o lo usa. No hay telemetría ni analítica; los informes de error quedan en la PC. Lo que mandás en el chat va sólo al proveedor de IA que vos configuraste, y las búsquedas web y las publicaciones en redes sólo ocurren cuando las pedís.
