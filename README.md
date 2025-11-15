# Terminal Command Trigger

Automatically trigger VSCode commands when terminal commands are executed.

## 🎯 Use Case

Perfect for solving the **clangd + xmake C++ modules** issue:
- `clangd` memory-maps `std.pcm` for language support
- `clang` compiler cannot access `std.pcm` when it's memory-mapped
- This extension auto-restarts `clangd` before builds to release the file lock

## ✨ Features

- 🔍 **Auto-detect terminal commands** via Shell Integration
- ⚡ **Trigger any VSCode command** based on regex patterns
- 📊 **Visual feedback** via temporary status bar notifications
- 🛡️ **Smart detection** warns if Shell Integration is unavailable

## 🔧 Configuration

Go to **Settings** → **Extensions** → **Terminal Command Trigger**

### Action Syntax

Actions support two formats:

#### 1. VSCode Commands
```json
{
  "onStart": "clangd.restart"
}
```

#### 2. Extension API Calls
```json
{
  "onStart": "ext:extensionId:api.path"
}
```

**Example:**
```json
{
  "onStart": "ext:llvm-vs-code-extensions.vscode-clangd:client.stop"
}
```

This calls `api.client.stop()` on the clangd extension.

### Complete Example (clangd + xmake)

```json
{
  "terminalCommandTrigger.triggers": [
    {
      "pattern": "^xmake\\b",
      "onStart": "ext:llvm-vs-code-extensions.vscode-clangd:client.stop",
      "onEnd": "ext:llvm-vs-code-extensions.vscode-clangd:client.start",
      "description": "Stop clangd before xmake build, restart after"
    }
  ]
}
```

**How it works:**
1. You run `xmake build` in terminal
2. Extension detects it and calls `client.stop()` → releases std.pcm lock
3. xmake compiles successfully
4. Extension calls `client.start()` → clangd resumes language support

## ⚠️ Requirements

- **VSCode 1.88+** (Shell Integration API)
- **Supported shells**: PowerShell, bash, zsh, fish
- The extension will warn you once if Shell Integration is not available

## 🐛 Troubleshooting

### "Shell Integration not detected"

Make sure you're using a supported shell:
- Windows: PowerShell (not cmd.exe)
- macOS/Linux: bash, zsh, or fish

See [VSCode Shell Integration docs](https://code.visualstudio.com/docs/terminal/shell-integration)

### Commands not triggering

1. Check your regex pattern in settings
2. Open **Output** → **Terminal Command Trigger** for debug logs
3. Verify the target command exists (e.g., `clangd.restart` requires clangd extension)

## 📝 License

MIT

## 🙏 Credits

Inspired by the real-world pain of C++ modules + clangd development.
