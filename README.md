# <img src="./assets/icon.png" alt="" height="32"> XLIFF Auto Sync

Keep your XLIFF translation files in sync without thinking about it. After every commit you make in VS Code, XLIFF Auto Sync runs [XLIFF Sync](https://marketplace.visualstudio.com/items?itemName=rvanbekkum.xliff-sync) and commits the updated `.xlf` / `.xliff` files as a separate `Xliff Translations` commit. It is built for AL / Business Central projects and works with any command that updates XLIFF files.

---

## ✨ Features

- **Sync after every commit** — each commit made through VS Code's Git integration runs the XLIFF Sync command (by default **XLIFF Sync: Build with Translations**)
- **Separate translation commit** — only XLIFF files (`.xlf`, `.xliff`) are staged and committed; all other changes in your working tree stay untouched
- **Manual command** — **XLIFF Auto Sync: Commit Translations** syncs and commits the translations on demand
- **Optional push** — push the branch after the translation commit (opt-in)
- **Safe by default** — failed commits, repositories without XLIFF files, merge conflicts, rebases and staged non-XLIFF changes never trigger a sync or a commit
- **Multi-repository aware** — every Git repository open in VS Code that contains XLIFF files is handled

---

## 🧰 Usage

### Automatic

Commit as usual from the Source Control view. XLIFF Auto Sync then:

1. runs the configured sync command (`xliffAutoSync.syncCommand`)
2. stages all changed XLIFF files and commits them as `Xliff Translations`
3. pushes the branch if `xliffAutoSync.pushAfterCommit` is set to `always`

Progress is shown in the status bar; details are logged to the **XLIFF Auto Sync** output channel.

### Manual

Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **XLIFF Auto Sync: Commit Translations**. The command syncs and commits the translations of the active repository. It always commits, regardless of `xliffAutoSync.commitAfterSync`.

---

## ⚙️ Extension Settings

| Setting                         | Default                           | Description                                                                                                                |
| ------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `xliffAutoSync.syncCommand`     | `xliffSync.buildWithTranslations` | Command that syncs the XLIFF translation files                                                                             |
| `xliffAutoSync.commitAfterSync` | `always`                          | Commit the synced translation files after a commit made in VS Code (`always` / `never`). The manual command always commits |
| `xliffAutoSync.pushAfterCommit` | `never`                           | Push the branch after the translation commit (`always` / `never`). Only branches that track an upstream branch are pushed  |

---

## 🧠 Requirements

- [XLIFF Sync](https://marketplace.visualstudio.com/items?itemName=rvanbekkum.xliff-sync) by Rob van Bekkum (installed automatically as a dependency)
- Git, with VS Code's built-in Git extension enabled

> **Notes**
>
> - Only commits made through VS Code's Git integration (Source Control view, Git commands, other extensions using the Git API) trigger the sync. Commits made in a terminal or another Git client don't.
> - All modified XLIFF files are included in the translation commit, not only the ones changed by the sync.
> - Nothing is synced or committed while non-XLIFF files are staged, a merge has unresolved conflicts or a rebase is in progress.
> - With `git.untrackedChanges` set to `hidden`, new XLIFF files are invisible to VS Code and therefore not committed.

---

## 🧩 Repository

GitHub: [Florian-Noever/xliff-auto-sync](https://github.com/Florian-Noever/xliff-auto-sync)

Bug reports and feature requests are welcome via [Issues](https://github.com/Florian-Noever/xliff-auto-sync/issues).

---

## 🛠️ Developer Notes

### Build Commands

```bash
# Type-check, lint and bundle the extension (out/extension.js)
npm run compile

# Compile in watch mode: esbuild + tsc in parallel (default build task)
npm run watch

# Run the unit and integration tests in a VS Code instance
npm test

# Package the extension as a .vsix
npm run package
```

### Release

1. Bump `version` in `package.json` and add an entry to `CHANGELOG.md`
2. Publish a GitHub release tagged `v<version>`
3. **Build and Package Extension** runs the tests and attaches the `.vsix` to the release, then **Publish Extension** publishes it to the Visual Studio Marketplace

---

## 📜 License

Licensed under the [MIT License](./LICENSE).

<br>
<br>

[!["Buy me a coffee"](https://raw.githubusercontent.com/Florian-Noever/Florian-Noever/refs/heads/main/_meta/BuyMeACoffee/Buttons%20%26%20Icons/orange-button-x180.png)](https://www.buymeacoffee.com/florian_noever)
