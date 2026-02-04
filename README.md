# Newma Desktop

**Newma Desktop** is a cross-platform desktop application that provides a native experience for the Newma AI chat system. It packages the Expo web application and Gateway server into a single, easy-to-use desktop app.

## ✨ Features

- ✅ **Cross-Platform Support**: macOS (Intel + Apple Silicon), Windows, Linux
- ✅ **Offline Mode**: Fully functional without internet connection
- ✅ **Integrated Gateway**: Local Gateway server bundled with the app
- ✅ **Newma CLI Integration**: AI chat capabilities powered by newma CLI
- ✅ **Modern UI**: React Native web interface
- ✅ **Native Features**: System tray, notifications, auto-updater

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3 (for node-gyp, if building native modules)

### Installation

```bash
# Clone or navigate to the project
cd /Users/mac/desktopnewma

# Install dependencies
npm install

# Build Gateway (will be done automatically in postinstall)
npm run build:gateway

# Build Expo Web app
npm run build:web

# Run in development mode
npm run dev
```

### Development

```bash
# Build main process (watch mode)
npm run watch

# Build web app from source
npm run build:web

# Rebuild Gateway
npm run build:gateway

# Start development server
npm run dev
```

### Building for Distribution

```bash
# Build for current platform
npm run dist

# macOS (Universal - Intel + Apple Silicon)
npm run dist:mac

# macOS (ARM64 only)
npm run dist:mac:arm

# macOS (x64 only)
npm run dist:mac:intel

# Windows
npm run dist:win

# Linux
npm run dist:linux
```

## 📁 Project Structure

```
desktopnewma/
├── src/
│   ├── main/              # Electron main process
│   │   ├── gateway/       # Gateway management
│   │   ├── config/        # Configuration management
│   │   ├── tray/          # System tray
│   │   └── index.ts       # Main entry point
│   ├── preload/           # Preload scripts
│   └── renderer/          # Expo web build
│       └── build/         # Web app output
├── gateway-source/        # Gateway source (symlink)
├── scripts/               # Build scripts
│   ├── build-gateway.js
│   └── build-web.js
└── resources/             # Resources (icons, etc.)
```

## 🔧 Configuration

Configuration is stored in:
- **macOS**: `~/Library/Application Support/Newma Desktop/config.json`
- **Windows**: `%APPDATA%/Newma Desktop/config.json`
- **Linux**: `~/.config/Newma Desktop/config.json`

### Default Configuration

```json
{
  "version": "1.0.0",
  "mode": "local",
  "gateway": {
    "type": "embedded",
    "port": 18789,
    "autoStart": true
  },
  "newma": {
    "enabled": true,
    "backend": "newma"
  }
}
```

## 🌤️ Cloud Mode (Future)

The application is designed to support cloud mode in the future. See [ELECTRON_ARCHITECTURE.md](./ELECTRON_ARCHITECTURE.md) for details on cloud migration.

## 📚 Documentation

- [ELECTRON_ARCHITECTURE.md](./ELECTRON_ARCHITECTURE.md) - Complete architecture design and cloud migration guide
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - Implementation details and code templates

## 🛠️ Troubleshooting

### Gateway won't start

1. Check if Gateway is built:
   ```bash
   npm run build:gateway
   ```

2. Check Gateway logs in the console

3. Verify port 18789 is not in use

### Web app not loading

1. Rebuild the web app:
   ```bash
   npm run build:web
   ```

2. Check if `src/renderer/build/index.html` exists

### Build fails on macOS

If you see code signing errors:

```bash
# Disable code signing for development
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run dist
```

## 🔐 Security

- Gateway only listens on 127.0.0.1 (localhost)
- Context isolation enabled in Electron
- Node integration disabled in renderer
- Safe process spawning using `spawn` instead of `exec`

## 📝 License

MIT

## 🤝 Contributing

This is part of the Newma project. For contributions, please ensure:

1. Code follows existing style
2. TypeScript types are properly defined
3. Changes are tested on all target platforms
4. Documentation is updated

---

**Version**: 1.0.0
**Status**: Development
**Last Updated**: 2025-03-02
