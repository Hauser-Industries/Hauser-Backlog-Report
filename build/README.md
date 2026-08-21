# Application icon

`icon-placeholder.svg` is a temporary development asset, not the official Hauser artwork.

Before a branded release:

1. obtain the approved Hauser source artwork;
2. create a multi-resolution Windows icon containing, at minimum, 16, 24, 32, 48, 64, 128, and 256 pixel images;
3. save it as `build/icon.ico`; and
4. build and inspect the executable, installer, Start menu entry, desktop shortcut, taskbar, and Windows Apps list.

The package config declares `build/` as electron-builder's `buildResources` directory. electron-builder recognizes `icon.ico` there for Windows builds. Until that file exists, development installers may display Electron's default icon.

Do not commit a signing certificate, private key, or certificate password. Code-signing configuration and credentials will be added separately when the approved certificate is available.
