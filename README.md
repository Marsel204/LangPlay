# LangPlay

Japanese subtitle learning tools, with a developing Seanime integration for
local anime libraries and episode tracking.

## Install the desktop setup on another device

The [desktop installer](installer/README.md) packages the official Seanime app,
a private qBittorrent setup, the LangPlay companion and a development plugin
into one guided setup for Windows and Linux x64. Python and Node are not needed
on the destination device. Download built packages from the
[Desktop setup packages workflow](https://github.com/Marsel204/LangPlay/actions/workflows/desktop-setup.yml).

The full subtitle-learning interface is still in progress. The installer
currently reproduces the development setup; automatic downloads start off.

## Development

- [Japanese parser setup](PARSING.md)
- [9Router setup for companion, Seanime and extension](docs/setup/9router.md)
- [Seanime integration status and limits](integrations/seanime/BASELINE.md)
- [Installer build, configuration and checks](installer/README.md)
- [Browser extension](extension/README.md)
