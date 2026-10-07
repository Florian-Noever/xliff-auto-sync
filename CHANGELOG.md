# Changelog

All notable changes to **XLIFF Auto Sync** are documented in this file.

---

## [1.0.0] – 2026-09-24

First public release.

### Added

- Unit and integration tests running in a real VS Code instance, including end-to-end tests against a temporary Git repository
- CI: tests on every push and pull request; release pipeline that tests, packages and publishes the extension to the Visual Studio Marketplace
- Structured logging to the **XLIFF Auto Sync** output channel
- The **Commit Translations** command is only offered in the command palette when a Git repository is open

### Changed

- `xliffAutoSync.pushAfterCommit` now defaults to `never` (opt-in), and only branches that track an upstream branch are pushed
- **Commit Translations** always commits; `xliffAutoSync.commitAfterSync` only applies to the automatic sync after a commit
- The extension activates only in workspaces that contain XLIFF files, and only syncs repositories that contain XLIFF files
- Nothing is synced while non-XLIFF files are staged, a merge has unresolved conflicts or a rebase is in progress
- Progress is shown in the status bar instead of a notification
- Extension host is bundled with **esbuild**; `tsc` is used for type-checking only

### Fixed

- The `xliffAutoSync.syncCommand` setting was ignored
- A failed commit (e.g. rejected by a hook, or with nothing to commit) triggered a sync and a translation commit
- The translation commit made by **Commit Translations** triggered a second sync
- Pushing a branch without an upstream branch failed, and "Pushed" was reported even when the push failed
- Staged non-XLIFF files were included in the translation commit
- New XLIFF files were missed when `git.untrackedChanges` is set to `separate`
- Activation failed when Git is disabled
- Event listeners were not disposed when a repository was closed or the extension was deactivated

---

## [0.0.1]

### Added

- Initial development release
