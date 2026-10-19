# VimIDE Prototype

This repository contains a greenfield IDE prototype built as a small monorepo:

- frontend: React + TypeScript app for the editor UI
- backend: Rust + Axum API for file operations, git status, search, and command execution
- shared: DTOs and contracts for the UI/backend boundary

## Start the frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

## Start the Rust backend

```bash
cd backend
WORKSPACE_ROOT=/workspace cargo run
```

The frontend is set to call the Rust backend on `http://localhost:3001`.

## What is included

- vim-inspired editor shell
- file tree navigation
- tabbed editor area
- search panel
- git status summary
- command palette and terminal output
- lightweight backend API for workspace data

## Notes

This is a prototype MVP focused on editor structure and workflows, not a complete production IDE.
