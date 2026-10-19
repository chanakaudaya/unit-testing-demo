use axum::{
    extract::{DefaultBodyLimit, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use tower_http::cors::CorsLayer;

use backend::{
    ExecRequest, ExecResponse, FileContentResponse, FileNode, FileSaveRequest, GitStatusItem,
    SearchResult,
};

#[derive(Clone)]
struct AppState {
    workspace_root: String,
}

#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: String,
}

#[tokio::main]
async fn main() {
    let workspace_root = std::env::var("WORKSPACE_ROOT")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            std::env::current_dir()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string())
        });
    let state = AppState { workspace_root };

    let app = Router::new()
        .route("/api/health", get(|| async { Json(serde_json::json!({ "status": "ok" })) }))
        .route("/api/files/tree", get(list_files))
        .route("/api/files/content", get(read_file))
        .route("/api/files/save", post(save_file))
        .route("/api/git/status", get(git_status))
        .route("/api/search", get(search_files))
        .route("/api/run", post(run_command))
        .with_state(Arc::new(state))
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024))
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    println!("Backend listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn list_files(State(state): State<Arc<AppState>>) -> Result<Json<Vec<FileNode>>, StatusCode> {
    let workspace_root = std::path::Path::new(&state.workspace_root);
    let nodes = build_tree(workspace_root).unwrap_or_default();
    Ok(Json(nodes))
}

async fn read_file(
    State(_state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<FileContentResponse>, StatusCode> {
    let path = params.get("path").cloned().unwrap_or_default();
    if path.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let content = std::fs::read_to_string(&path).map_err(|_| StatusCode::NOT_FOUND)?;
    Ok(Json(FileContentResponse {
        path: path.clone(),
        content,
    }))
}

async fn save_file(
    State(_state): State<Arc<AppState>>,
    Json(payload): Json<FileSaveRequest>,
) -> Result<StatusCode, StatusCode> {
    let file_path = std::path::Path::new(&payload.path);
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    std::fs::write(file_path, payload.content).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::OK)
}

async fn git_status(State(state): State<Arc<AppState>>) -> Result<Json<Vec<GitStatusItem>>, StatusCode> {
    let status = std::process::Command::new("git")
        .arg("-C")
        .arg(&state.workspace_root)
        .arg("status")
        .arg("--short")
        .output()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut entries = Vec::new();
    if status.status.success() {
        let stdout = String::from_utf8_lossy(&status.stdout);
        for line in stdout.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let status_code = line.chars().take(2).collect::<String>();
            let path = line.chars().skip(3).collect::<String>();
            entries.push(GitStatusItem {
                path,
                status: status_code.trim().to_string(),
            });
        }
    }

    Ok(Json(entries))
}

async fn search_files(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<Vec<SearchResult>>, StatusCode> {
    if query.q.trim().is_empty() {
        return Ok(Json(Vec::new()));
    }

    let root = std::path::Path::new(&state.workspace_root);
    let mut results = Vec::new();
    if let Ok(entries) = walk_files(root) {
        for path in entries {
            if let Ok(content) = std::fs::read_to_string(&path) {
                for (idx, line) in content.lines().enumerate() {
                    if line.contains(&query.q) {
                        results.push(SearchResult {
                            path: path.to_string_lossy().to_string(),
                            line: idx + 1,
                            match_text: line.to_string(),
                        });
                    }
                }
            }
        }
    }

    Ok(Json(results))
}

async fn run_command(
    State(_state): State<Arc<AppState>>,
    Json(payload): Json<ExecRequest>,
) -> Result<Json<ExecResponse>, StatusCode> {
    let output = std::process::Command::new("sh")
        .arg("-lc")
        .arg(&payload.command)
        .current_dir(payload.cwd)
        .output()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{stdout}{stderr}");

    Ok(Json(ExecResponse {
        success: output.status.success(),
        output: combined,
        code: output.status.code(),
    }))
}

fn build_tree(path: &std::path::Path) -> std::io::Result<Vec<FileNode>> {
    let mut nodes = Vec::new();
    let mut entries = std::fs::read_dir(path)?
        .filter_map(|entry| entry.ok())
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let file_name = entry.file_name();
        let entry_path = entry.path();
        let name = file_name.to_string_lossy().to_string();
        let is_dir = entry.file_type()?.is_dir();
        if is_dir {
            let children = build_tree(&entry_path)?;
            nodes.push(FileNode {
                path: entry_path.to_string_lossy().to_string(),
                name,
                r#type: "directory".to_string(),
                children,
            });
        } else {
            nodes.push(FileNode {
                path: entry_path.to_string_lossy().to_string(),
                name,
                r#type: "file".to_string(),
                children: Vec::new(),
            });
        }
    }

    Ok(nodes)
}

fn walk_files(path: &std::path::Path) -> std::io::Result<Vec<std::path::PathBuf>> {
    let mut files = Vec::new();
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            files.extend(walk_files(&path)?);
        } else {
            files.push(path);
        }
    }
    Ok(files)
}
