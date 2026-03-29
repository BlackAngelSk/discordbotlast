#!/usr/bin/env python3
"""
GitHub file downloader + program updater.

Usage examples:
  python updater.py download-url \
      --url https://raw.githubusercontent.com/owner/repo/main/app.py \
      --output /tmp/app.py

  python updater.py download-release-asset \
      --repo owner/repo \
      --asset-name my-app-linux-x64 \
      --output /tmp/my-app

  python updater.py update-file \
      --source /tmp/my-app \
      --target /opt/myapp/my-app \
      --backup

  python updater.py update-from-github \
      --repo owner/repo \
      --asset-name my-app-linux-x64 \
      --target /opt/myapp/my-app \
      --backup
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import shutil
import ssl
import stat
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Dict, Optional

GITHUB_API = "https://api.github.com"
FIXED_REPO = "BlackAngelSk/discordbotlast"
TLS_INSECURE = False
TLS_CAFILE: Optional[str] = None
PROTECTED_LOCAL_PATTERNS = {
    ".env",
    ".env.*",
    "config.json",
    "settings.json",
    "token.txt",
    "tokens.json",
}


class UpdaterError(Exception):
    """Raised for updater-specific failures."""


def _print(msg: str) -> None:
    print(f"[updater] {msg}")


def _normalize_argv_start_cmd(argv: list[str]) -> list[str]:
    normalized: list[str] = []
    index = 0

    while index < len(argv):
        arg = argv[index]

        if arg == "--start-cmd":
            normalized.append(arg)
            index += 1

            parts: list[str] = []
            while index < len(argv):
                current = argv[index]
                if current.startswith("--"):
                    break
                parts.append(current)
                index += 1

            normalized.append(" ".join(parts).strip())
            continue

        if arg.startswith("--start-cmd="):
            _, value = arg.split("=", 1)
            normalized.append(f"--start-cmd={value.strip()}")
            index += 1
            continue

        normalized.append(arg)
        index += 1

    return normalized


def _normalize_repo(repo: str) -> str:
    value = repo.strip()
    if value.startswith("https://github.com/"):
        value = value[len("https://github.com/") :]
    value = value.strip("/")
    if value.endswith(".git"):
        value = value[:-4]
    return value


def _ensure_fixed_repo(repo: str) -> str:
    normalized = _normalize_repo(repo)
    if normalized.lower() != FIXED_REPO.lower():
        raise UpdaterError(
            f"This updater is locked to https://github.com/{FIXED_REPO}"
        )
    return FIXED_REPO


def _build_ssl_context() -> ssl.SSLContext:
    if TLS_INSECURE:
        return ssl._create_unverified_context()

    cafile = TLS_CAFILE or os.getenv("UPDATER_CAFILE")
    if cafile:
        return ssl.create_default_context(cafile=cafile)

    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _cert_error_hint() -> str:
    return (
        "TLS certificate verification failed. Try one of: "
        "(1) install certifi package, "
        "(2) pass --cacert <path-to-ca-bundle>, "
        "(3) set UPDATER_CAFILE env var, "
        "or (4) use --insecure (not recommended)."
    )


def _stop_process(stop_process: Optional[str]) -> None:
    if not stop_process:
        return

    _print(f"Stopping process: {stop_process}")
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/IM", stop_process],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        subprocess.run(
            ["pkill", "-f", stop_process],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def _start_command(start_cmd: Optional[str]) -> None:
    if not start_cmd:
        return

    _print(f"Starting command: {start_cmd}")
    try:
        if os.name == "nt":
            subprocess.Popen(["cmd", "/c", start_cmd], shell=False)
        else:
            subprocess.Popen(start_cmd, shell=True, start_new_session=True)
    except Exception as e:
        raise UpdaterError(f"Failed to start command: {e}") from e


def _normalize_start_cmd_arg(start_cmd: Any) -> Optional[str]:
    if start_cmd is None:
        return None
    if isinstance(start_cmd, str):
        value = start_cmd.strip().strip('"').strip("'")
        return value or None
    value = str(start_cmd).strip().strip('"').strip("'")
    return value or None


def _start_bat_file(start_bat: Optional[str]) -> None:
    if not start_bat:
        return

    bat_path = start_bat.strip().strip('"').strip("'")
    _print(f"Starting .bat: {bat_path}")

    bat_file = Path(bat_path)
    if not bat_file.exists():
        raise UpdaterError(f"Start .bat not found: {bat_path}")

    env_file = bat_file.parent / ".env"
    if env_file.exists():
        try:
            token_value: Optional[str] = None
            for line in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or "=" not in stripped:
                    continue
                key, value = stripped.split("=", 1)
                if key.strip() == "DISCORD_TOKEN":
                    token_value = value.strip().strip('"').strip("'")
                    break

            if token_value is None or token_value == "":
                raise UpdaterError(f"DISCORD_TOKEN is missing in {env_file}")

            lowered = token_value.lower()
            if "your" in lowered and "token" in lowered:
                raise UpdaterError(f"DISCORD_TOKEN looks like a placeholder in {env_file}")
        except UpdaterError:
            raise
        except Exception as e:
            raise UpdaterError(f"Failed to read {env_file}: {e}") from e

    if os.name == "nt":
        try:
            subprocess.Popen(
                ["cmd", "/c", "call", str(bat_file)],
                cwd=str(bat_file.parent),
                shell=False,
            )
        except Exception as e:
            raise UpdaterError(f"Failed to start .bat: {e}") from e
    else:
        _print("Ignored --start-bat on non-Windows OS")


def _stop_then_start_if_changed(
    changed: bool,
    stop_process: Optional[str] = None,
    start_cmd: Optional[str] = None,
    start_bat: Optional[str] = None,
) -> None:
    if not changed:
        return
    _stop_process(stop_process)
    if start_bat:
        _start_bat_file(start_bat)
    else:
        _start_command(start_cmd)


def _request_json(url: str, token: Optional[str] = None) -> Dict[str, Any]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "simple-github-updater",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30, context=_build_ssl_context()) as resp:
            data = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise UpdaterError(f"GitHub API HTTP {e.code}: {body or e.reason}") from e
    except urllib.error.URLError as e:
        if isinstance(e.reason, ssl.SSLCertVerificationError):
            raise UpdaterError(_cert_error_hint()) from e
        raise UpdaterError(f"Network error while calling GitHub API: {e.reason}") from e

    try:
        return json.loads(data)
    except json.JSONDecodeError as e:
        raise UpdaterError("Invalid JSON response from GitHub API") from e


def _download_to_file(url: str, output: Path, token: Optional[str] = None) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)

    headers = {"User-Agent": "simple-github-updater"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=120, context=_build_ssl_context()) as resp, output.open("wb") as f:
            shutil.copyfileobj(resp, f)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise UpdaterError(f"Download failed (HTTP {e.code}): {body or e.reason}") from e
    except urllib.error.URLError as e:
        if isinstance(e.reason, ssl.SSLCertVerificationError):
            raise UpdaterError(_cert_error_hint()) from e
        raise UpdaterError(f"Download failed: {e.reason}") from e

    if output.stat().st_size == 0:
        raise UpdaterError("Downloaded file is empty")

    return output


def _get_release_data(repo: str, tag: str, token: Optional[str]) -> Dict[str, Any]:
    repo = _ensure_fixed_repo(repo)
    if "/" not in repo:
        raise UpdaterError("--repo must be in format owner/repo")

    owner, name = repo.split("/", 1)
    safe_owner = urllib.parse.quote(owner)
    safe_name = urllib.parse.quote(name)

    if tag.lower() == "latest":
        url = f"{GITHUB_API}/repos/{safe_owner}/{safe_name}/releases/latest"
    else:
        safe_tag = urllib.parse.quote(tag)
        url = f"{GITHUB_API}/repos/{safe_owner}/{safe_name}/releases/tags/{safe_tag}"

    return _request_json(url, token=token)


def download_repo_source_archive(
    repo: str,
    output: Path,
    ref: str = "main",
    token: Optional[str] = None,
) -> Path:
    repo = _ensure_fixed_repo(repo)
    owner, name = repo.split("/", 1)
    safe_owner = urllib.parse.quote(owner)
    safe_name = urllib.parse.quote(name)
    safe_ref = urllib.parse.quote(ref)
    url = f"{GITHUB_API}/repos/{safe_owner}/{safe_name}/zipball/{safe_ref}"
    _print(f"Downloading source archive: {repo}@{ref}")
    return _download_to_file(url, output, token=token)


def get_repo_commit_sha(repo: str, ref: str = "main", token: Optional[str] = None) -> str:
    repo = _ensure_fixed_repo(repo)
    owner, name = repo.split("/", 1)
    safe_owner = urllib.parse.quote(owner)
    safe_name = urllib.parse.quote(name)
    safe_ref = urllib.parse.quote(ref)
    url = f"{GITHUB_API}/repos/{safe_owner}/{safe_name}/commits/{safe_ref}"
    data = _request_json(url, token=token)
    sha = data.get("sha")
    if not isinstance(sha, str) or not sha:
        raise UpdaterError("Could not determine latest commit SHA from GitHub")
    return sha


def _state_file_for_target(target: Path) -> Path:
    return target / ".updater_state.json"


def _load_target_state(target: Path) -> Dict[str, Any]:
    state_file = _state_file_for_target(target)
    if not state_file.exists():
        return {}
    try:
        raw = state_file.read_text(encoding="utf-8")
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}


def _save_target_state(target: Path, data: Dict[str, Any]) -> None:
    target.mkdir(parents=True, exist_ok=True)
    state_file = _state_file_for_target(target)
    temp_file = state_file.with_suffix(state_file.suffix + ".tmp")
    payload = json.dumps(data, indent=2, sort_keys=True)
    temp_file.write_text(payload, encoding="utf-8")
    os.replace(temp_file, state_file)


def _state_key_for_repo_ref(repo: str, ref: str) -> str:
    return f"{repo}@{ref}"


def download_release_asset(
    repo: str,
    asset_name: str,
    output: Path,
    tag: str = "latest",
    token: Optional[str] = None,
) -> Path:
    release = _get_release_data(repo, tag=tag, token=token)

    assets = release.get("assets", [])
    for asset in assets:
        if asset.get("name") == asset_name:
            url = asset.get("browser_download_url")
            if not url:
                raise UpdaterError("Asset has no browser_download_url")
            _print(f"Downloading release asset: {asset_name}")
            return _download_to_file(url, output, token=token)

    available = ", ".join(a.get("name", "<unnamed>") for a in assets) or "<none>"
    raise UpdaterError(
        f"Asset '{asset_name}' not found in release '{release.get('tag_name', tag)}'. "
        f"Available assets: {available}"
    )


def download_url(url: str, output: Path, token: Optional[str] = None) -> Path:
    _print(f"Downloading URL: {url}")
    return _download_to_file(url, output, token=token)


def _copy_permissions(source: Path, target: Path) -> None:
    try:
        source_mode = source.stat().st_mode
        os.chmod(target, stat.S_IMODE(source_mode))
    except OSError:
        # Permission sync is best effort.
        pass


def _files_are_equal(file_a: Path, file_b: Path) -> bool:
    if not file_a.exists() or not file_b.exists():
        return False
    if file_a.stat().st_size != file_b.stat().st_size:
        return False

    chunk_size = 1024 * 1024
    with file_a.open("rb") as fa, file_b.open("rb") as fb:
        while True:
            a_chunk = fa.read(chunk_size)
            b_chunk = fb.read(chunk_size)
            if a_chunk != b_chunk:
                return False
            if not a_chunk:
                return True


def _detect_extracted_root(extract_dir: Path) -> Path:
    children = [p for p in extract_dir.iterdir() if p.name != "__MACOSX"]
    if len(children) == 1 and children[0].is_dir():
        return children[0]
    return extract_dir


def _is_within_directory(base_dir: Path, target_path: Path) -> bool:
    try:
        base_real = os.path.realpath(base_dir)
        target_real = os.path.realpath(target_path)
        return os.path.commonpath([base_real, target_real]) == base_real
    except Exception:
        return False


def _extract_asset_to_dir(asset_path: Path, extract_dir: Path) -> Optional[Path]:
    if zipfile.is_zipfile(asset_path):
        with zipfile.ZipFile(asset_path, "r") as zf:
            for member in zf.infolist():
                member_path = extract_dir / member.filename
                if not _is_within_directory(extract_dir, member_path):
                    raise UpdaterError(f"Unsafe zip member path: {member.filename}")
            zf.extractall(extract_dir)
        return _detect_extracted_root(extract_dir)

    if tarfile.is_tarfile(asset_path):
        with tarfile.open(asset_path, "r:*") as tf:
            safe_members = []
            for member in tf.getmembers():
                member_path = extract_dir / member.name
                if not _is_within_directory(extract_dir, member_path):
                    raise UpdaterError(f"Unsafe tar member path: {member.name}")
                if member.issym() or member.islnk():
                    _print(f"Skipping archive link member: {member.name}")
                    continue
                safe_members.append(member)
            tf.extractall(extract_dir, members=safe_members)
        return _detect_extracted_root(extract_dir)

    return None


def _is_protected_local_file(rel_path: Path) -> bool:
    name = rel_path.name.lower()
    for pattern in PROTECTED_LOCAL_PATTERNS:
        if fnmatch.fnmatch(name, pattern.lower()):
            return True
    return False


def _sync_directory(
    source_dir: Path,
    target_dir: Path,
    backup: bool = False,
    delete_missing: bool = False,
) -> bool:
    if not source_dir.exists() or not source_dir.is_dir():
        raise UpdaterError(f"Extracted source directory not found: {source_dir}")

    target_dir.mkdir(parents=True, exist_ok=True)

    source_files: set[Path] = set()
    replaced = 0
    added = 0
    skipped = 0

    for src in source_dir.rglob("*"):
        if not src.is_file():
            continue

        rel = src.relative_to(source_dir)
        if _is_protected_local_file(rel):
            continue
        source_files.add(rel)

        dst = target_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)

        if dst.exists() and _files_are_equal(src, dst):
            skipped += 1
            continue

        if dst.exists() and backup:
            backup_path = dst.with_suffix(dst.suffix + ".bak")
            shutil.copy2(dst, backup_path)

        if dst.exists():
            replaced += 1
        else:
            added += 1

        shutil.copy2(src, dst)

    removed = 0
    if delete_missing:
        for dst in list(target_dir.rglob("*")):
            if not dst.is_file():
                continue
            rel = dst.relative_to(target_dir)
            if _is_protected_local_file(rel):
                continue
            if rel not in source_files:
                if backup:
                    backup_path = dst.with_suffix(dst.suffix + ".bak")
                    shutil.copy2(dst, backup_path)
                dst.unlink(missing_ok=True)
                removed += 1

        for directory in sorted(target_dir.rglob("*"), key=lambda p: len(p.parts), reverse=True):
            if directory.is_dir():
                try:
                    directory.rmdir()
                except OSError:
                    pass

    _print(
        f"Directory install complete: added={added}, replaced={replaced}, "
        f"unchanged={skipped}, removed={removed}"
    )
    return (added + replaced + removed) > 0


def update_program_file(source: Path, target: Path, backup: bool = False) -> bool:
    if not source.exists() or not source.is_file():
        raise UpdaterError(f"Source file not found: {source}")

    target.parent.mkdir(parents=True, exist_ok=True)

    if target.exists() and _files_are_equal(source, target):
        _print("No changes detected. Target is already up to date.")
        return False

    backup_path = target.with_suffix(target.suffix + ".bak")

    if target.exists() and backup:
        _print(f"Creating backup: {backup_path}")
        shutil.copy2(target, backup_path)

    temp_target = target.with_suffix(target.suffix + ".new")
    shutil.copy2(source, temp_target)

    if target.exists():
        _copy_permissions(target, temp_target)

    _print(f"Replacing target: {target}")
    os.replace(temp_target, target)
    return True



def update_from_github(
    repo: str,
    asset_name: str,
    target: Path,
    tag: str = "latest",
    backup: bool = False,
    delete_missing: bool = False,
    token: Optional[str] = None,
) -> bool:
    with tempfile.TemporaryDirectory(prefix="updater-") as tmp:
        downloaded = Path(tmp) / asset_name
        download_release_asset(
            repo=repo,
            asset_name=asset_name,
            output=downloaded,
            tag=tag,
            token=token,
        )

        extract_dir = Path(tmp) / "extract"
        extract_dir.mkdir(parents=True, exist_ok=True)
        extracted_root = _extract_asset_to_dir(downloaded, extract_dir)

        if extracted_root is None:
            _print("Installing single-file update")
            return update_program_file(downloaded, target, backup=backup)
        else:
            _print("Installing archive update (add/replace files)")
            return _sync_directory(
                source_dir=extracted_root,
                target_dir=target,
                backup=backup,
                delete_missing=delete_missing,
            )


def redo_fixed_repo(
    target: Path,
    ref: str = "main",
    backup: bool = False,
    delete_missing: bool = False,
    token: Optional[str] = None,
) -> bool:
    with tempfile.TemporaryDirectory(prefix="updater-redo-") as tmp:
        downloaded = Path(tmp) / "repo.zip"
        download_repo_source_archive(
            repo=FIXED_REPO,
            output=downloaded,
            ref=ref,
            token=token,
        )

        extract_dir = Path(tmp) / "extract"
        extract_dir.mkdir(parents=True, exist_ok=True)
        extracted_root = _extract_asset_to_dir(downloaded, extract_dir)
        if extracted_root is None:
            raise UpdaterError("Failed to extract repository archive")

        _print(f"Redo install from https://github.com/{FIXED_REPO}")
        return _sync_directory(
            source_dir=extracted_root,
            target_dir=target,
            backup=backup,
            delete_missing=delete_missing,
        )


def redo_fixed_repo_loop(
    target: Path,
    interval: int,
    ref: str = "main",
    backup: bool = False,
    delete_missing: bool = False,
    stop_process: Optional[str] = None,
    start_cmd: Optional[str] = None,
    start_bat: Optional[str] = None,
    start_on_launch: bool = False,
    restart_each_cycle: bool = False,
    token: Optional[str] = None,
) -> None:
    if interval < 1:
        raise UpdaterError("--interval must be at least 1 second")

    _print(f"Starting nonstop repo watch mode (every {interval} seconds). Press Ctrl+C to stop.")

    if start_on_launch:
        _print("start_on_launch is enabled. Starting target process once before update checks.")
        try:
            if start_bat:
                _start_bat_file(start_bat)
            else:
                _start_command(start_cmd)
        except UpdaterError as e:
            _print(f"Initial start warning: {e}")

    repo_key = _state_key_for_repo_ref(FIXED_REPO, ref)
    while True:
        _print("Checking repository for updates...")
        try:
            state = _load_target_state(target)
            last_sha = state.get(repo_key)
            latest_sha = get_repo_commit_sha(FIXED_REPO, ref=ref, token=token)

            if isinstance(last_sha, str) and last_sha == latest_sha:
                _print(f"No repository change detected ({latest_sha[:8]}).")
                if restart_each_cycle:
                    _print("restart_each_cycle is enabled.")
                    _stop_then_start_if_changed(
                        changed=True,
                        stop_process=stop_process,
                        start_cmd=start_cmd,
                        start_bat=start_bat,
                    )
                _print(f"Waiting {interval} seconds for next check.")
                time.sleep(interval)
                continue

            _print(f"Repository changed: {str(last_sha)[:8]} -> {latest_sha[:8]}")
            changed = redo_fixed_repo(
                target=target,
                ref=ref,
                backup=backup,
                delete_missing=delete_missing,
                token=token,
            )

            state[repo_key] = latest_sha
            _save_target_state(target, state)

            should_restart = changed or restart_each_cycle
            if restart_each_cycle and not changed:
                _print("No file changes, but restart_each_cycle is enabled.")

            _stop_then_start_if_changed(
                changed=should_restart,
                stop_process=stop_process,
                start_cmd=start_cmd,
                start_bat=start_bat,
            )
        except UpdaterError as e:
            _print(f"Cycle error: {e}")

        _print(f"Waiting {interval} seconds for next check.")
        time.sleep(interval)


def update_from_github_loop(
    repo: str,
    asset_name: str,
    target: Path,
    interval: int,
    tag: str = "latest",
    backup: bool = False,
    delete_missing: bool = False,
    stop_process: Optional[str] = None,
    start_cmd: Optional[str] = None,
    start_bat: Optional[str] = None,
    start_on_launch: bool = False,
    token: Optional[str] = None,
) -> None:
    if interval < 1:
        raise UpdaterError("--interval must be at least 1 second")

    _print(f"Starting nonstop update mode (every {interval} seconds). Press Ctrl+C to stop.")

    if start_on_launch:
        _print("start_on_launch is enabled. Starting target process once before update checks.")
        try:
            if start_bat:
                _start_bat_file(start_bat)
            else:
                _start_command(start_cmd)
        except UpdaterError as e:
            _print(f"Initial start warning: {e}")

    while True:
        _print("Checking for updates...")
        try:
            changed = update_from_github(
                repo=repo,
                asset_name=asset_name,
                target=target,
                tag=tag,
                backup=backup,
                delete_missing=delete_missing,
                token=token,
            )
            _stop_then_start_if_changed(
                changed=changed,
                stop_process=stop_process,
                start_cmd=start_cmd,
                start_bat=start_bat,
            )
        except UpdaterError as e:
            _print(f"Cycle error: {e}")

        _print(f"Waiting {interval} seconds for next check.")
        time.sleep(interval)


def run_ui() -> None:
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox
        from tkinter.scrolledtext import ScrolledText
    except Exception as e:
        raise UpdaterError(
            "Tkinter UI is not available on this system. Install python3-tk package."
        ) from e

    root = tk.Tk()
    root.title("GitHub Updater")
    root.geometry("860x620")

    vars_map = {
        "repo": tk.StringVar(value=FIXED_REPO),
        "asset": tk.StringVar(),
        "tag": tk.StringVar(value="latest"),
        "target": tk.StringVar(),
        "interval": tk.StringVar(value="300"),
        "token": tk.StringVar(value=os.getenv("GITHUB_TOKEN", "")),
        "stop_process": tk.StringVar(),
        "start_cmd": tk.StringVar(),
        "backup": tk.BooleanVar(value=True),
        "delete_missing": tk.BooleanVar(value=False),
        "redo": tk.BooleanVar(value=False),
        "loop": tk.BooleanVar(value=False),
    }

    worker = {"thread": None, "stop": threading.Event()}

    def add_row(parent: "tk.Widget", row: int, label: str, var: "tk.Variable", width: int = 60) -> None:
        tk.Label(parent, text=label).grid(row=row, column=0, sticky="w", padx=8, pady=5)
        tk.Entry(parent, textvariable=var, width=width).grid(
            row=row, column=1, sticky="ew", padx=8, pady=5
        )

    def log(msg: str) -> None:
        log_box.configure(state="normal")
        log_box.insert("end", f"[ui] {msg}\n")
        log_box.see("end")
        log_box.configure(state="disabled")

    def browse_target() -> None:
        selected = filedialog.asksaveasfilename(title="Select target program file")
        if selected:
            vars_map["target"].set(selected)

    def validate() -> tuple[str, str, str, Path, int, Optional[str], bool, bool, bool, bool, Optional[str], Optional[str]]:
        repo = vars_map["repo"].get().strip()
        asset_name = vars_map["asset"].get().strip()
        redo_mode = vars_map["redo"].get()
        tag = vars_map["tag"].get().strip() or ("main" if redo_mode else "latest")
        target_str = vars_map["target"].get().strip()
        interval_str = vars_map["interval"].get().strip()
        token = vars_map["token"].get().strip() or None
        stop_process = vars_map["stop_process"].get().strip() or None
        start_cmd = vars_map["start_cmd"].get().strip() or None
        backup = vars_map["backup"].get()
        delete_missing = vars_map["delete_missing"].get()
        loop_mode = vars_map["loop"].get()

        repo = _ensure_fixed_repo(repo or FIXED_REPO)
        if not redo_mode and not asset_name:
            raise UpdaterError("Asset name is required")
        if not target_str:
            raise UpdaterError("Target path is required")
        try:
            interval = int(interval_str)
        except ValueError as e:
            raise UpdaterError("Interval must be an integer") from e
        if interval < 1:
            raise UpdaterError("Interval must be at least 1 second")

        return (
            repo,
            asset_name,
            tag,
            Path(target_str),
            interval,
            token,
            backup,
            delete_missing,
            redo_mode,
            loop_mode,
            stop_process,
            start_cmd,
        )

    def set_controls(enabled: bool) -> None:
        state = "normal" if enabled else "disabled"
        for widget in control_widgets:
            try:
                widget.configure(state=state)
            except tk.TclError:
                pass
        stop_btn.configure(state="normal" if not enabled else "disabled")

    def run_once_or_loop() -> None:
        try:
            (
                repo,
                asset_name,
                tag,
                target,
                interval,
                token,
                backup,
                delete_missing,
                redo_mode,
                loop_mode,
                stop_process,
                start_cmd,
            ) = validate()
        except UpdaterError as e:
            messagebox.showerror("Validation Error", str(e))
            return

        if worker["thread"] and worker["thread"].is_alive():
            messagebox.showinfo("Updater", "Updater is already running")
            return

        worker["stop"].clear()

        def task() -> None:
            try:
                if redo_mode:
                    changed = redo_fixed_repo(
                        target=target,
                        ref=tag,
                        backup=backup,
                        delete_missing=delete_missing,
                        token=token,
                    )
                    _stop_then_start_if_changed(
                        changed=changed,
                        stop_process=stop_process,
                        start_cmd=start_cmd,
                    )
                    log("Redo complete")
                elif loop_mode:
                    log(f"Started nonstop mode (every {interval}s)")
                    while not worker["stop"].is_set():
                        try:
                            changed = update_from_github(
                                repo=repo,
                                asset_name=asset_name,
                                target=target,
                                tag=tag,
                                backup=backup,
                                delete_missing=delete_missing,
                                token=token,
                            )
                            _stop_then_start_if_changed(
                                changed=changed,
                                stop_process=stop_process,
                                start_cmd=start_cmd,
                            )
                            log("Cycle done")
                        except UpdaterError as e:
                            log(f"Cycle error: {e}")

                        if worker["stop"].wait(interval):
                            break
                    log("Nonstop mode stopped")
                else:
                    changed = update_from_github(
                        repo=repo,
                        asset_name=asset_name,
                        target=target,
                        tag=tag,
                        backup=backup,
                        delete_missing=delete_missing,
                        token=token,
                    )
                    _stop_then_start_if_changed(
                        changed=changed,
                        stop_process=stop_process,
                        start_cmd=start_cmd,
                    )
                    log("Update complete")
            except Exception as e:
                log(f"Unexpected error: {e}")
            finally:
                root.after(0, lambda: set_controls(True))

        set_controls(False)
        thread = threading.Thread(target=task, daemon=True)
        worker["thread"] = thread
        thread.start()

    def stop_loop() -> None:
        worker["stop"].set()
        log("Stop requested")

    frame = tk.Frame(root)
    frame.pack(fill="x", padx=12, pady=8)
    frame.columnconfigure(1, weight=1)

    add_row(frame, 0, "Repo (locked)", vars_map["repo"])
    add_row(frame, 1, "Asset name", vars_map["asset"])
    add_row(frame, 2, "Tag", vars_map["tag"])
    add_row(frame, 3, "Target file", vars_map["target"])
    add_row(frame, 4, "Interval seconds", vars_map["interval"])
    add_row(frame, 5, "GitHub token (optional)", vars_map["token"])
    add_row(frame, 6, "Stop process name (optional)", vars_map["stop_process"])
    add_row(frame, 7, "Start command (optional)", vars_map["start_cmd"])

    browse_btn = tk.Button(frame, text="Browse...", command=browse_target)
    browse_btn.grid(row=3, column=2, sticky="w", padx=8, pady=5)

    options = tk.Frame(root)
    options.pack(fill="x", padx=12, pady=(0, 8))
    backup_cb = tk.Checkbutton(options, text="Create backup (.bak)", variable=vars_map["backup"])
    backup_cb.pack(side="left", padx=(0, 12))
    delete_missing_cb = tk.Checkbutton(
        options,
        text="Delete files missing in update",
        variable=vars_map["delete_missing"],
    )
    delete_missing_cb.pack(side="left", padx=(0, 12))
    redo_cb = tk.Checkbutton(options, text="Redo full repo install", variable=vars_map["redo"])
    redo_cb.pack(side="left", padx=(0, 12))
    loop_cb = tk.Checkbutton(options, text="Run nonstop", variable=vars_map["loop"])
    loop_cb.pack(side="left")

    actions = tk.Frame(root)
    actions.pack(fill="x", padx=12, pady=(0, 8))
    start_btn = tk.Button(actions, text="Start", command=run_once_or_loop)
    start_btn.pack(side="left")
    stop_btn = tk.Button(actions, text="Stop", command=stop_loop, state="disabled")
    stop_btn.pack(side="left", padx=8)

    log_box = ScrolledText(root, wrap="word", height=22, state="disabled")
    log_box.pack(fill="both", expand=True, padx=12, pady=(0, 12))

    control_widgets = [
        start_btn,
        browse_btn,
        backup_cb,
        delete_missing_cb,
        redo_cb,
        loop_cb,
    ]

    def on_close() -> None:
        worker["stop"].set()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_close)
    root.mainloop()


def run_terminal_ui() -> None:
    _print("Tkinter is unavailable. Starting terminal UI.")
    _print("Press Ctrl+C anytime to stop.")
    _print(f"Repository is locked to https://github.com/{FIXED_REPO}")

    try:
        repo = FIXED_REPO

        redo_answer = input("Redo full repo install (from source archive)? [y/N]: ").strip().lower()
        redo_mode = redo_answer in {"y", "yes"}

        if redo_mode:
            tag = input("Branch/commit ref [main]: ").strip() or "main"
        else:
            tag = input("Release tag [latest]: ").strip() or "latest"

        asset_name = ""
        if not redo_mode:
            asset_name = input("Asset name: ").strip()
            if not asset_name:
                raise UpdaterError("Asset name is required")

        target_str = input("Target file path: ").strip()
        if not target_str:
            raise UpdaterError("Target path is required")
        target = Path(target_str)

        interval_raw = input("Interval seconds [300]: ").strip() or "300"
        try:
            interval = int(interval_raw)
        except ValueError as e:
            raise UpdaterError("Interval must be an integer") from e
        if interval < 1:
            raise UpdaterError("Interval must be at least 1 second")

        backup_answer = input("Create backup (.bak)? [Y/n]: ").strip().lower()
        backup = backup_answer not in {"n", "no"}

        delete_missing_answer = input("Delete files not in update package? [y/N]: ").strip().lower()
        delete_missing = delete_missing_answer in {"y", "yes"}

        loop_mode = False
        if not redo_mode:
            loop_answer = input("Run nonstop mode? [y/N]: ").strip().lower()
            loop_mode = loop_answer in {"y", "yes"}

        token_input = input("GitHub token (optional, Enter to skip): ").strip()
        token = token_input or os.getenv("GITHUB_TOKEN")

        stop_process_input = input("Stop process name after update (optional, e.g. bot.bat): ").strip()
        stop_process = stop_process_input or None
        start_cmd_input = input("Start command after update (optional, e.g. cmd /c bot.bat): ").strip()
        start_cmd = start_cmd_input or None

        if redo_mode:
            changed = redo_fixed_repo(
                target=target,
                ref=tag,
                backup=backup,
                delete_missing=delete_missing,
                token=token,
            )
            _stop_then_start_if_changed(
                changed=changed,
                stop_process=stop_process,
                start_cmd=start_cmd,
            )
            _print("Redo complete")
        elif loop_mode:
            update_from_github_loop(
                repo=repo,
                asset_name=asset_name,
                target=target,
                interval=interval,
                tag=tag,
                backup=backup,
                delete_missing=delete_missing,
                stop_process=stop_process,
                start_cmd=start_cmd,
                token=token,
            )
        else:
            changed = update_from_github(
                repo=repo,
                asset_name=asset_name,
                target=target,
                tag=tag,
                backup=backup,
                delete_missing=delete_missing,
                token=token,
            )
            _stop_then_start_if_changed(
                changed=changed,
                stop_process=stop_process,
                start_cmd=start_cmd,
            )
            _print("Update complete")
    except KeyboardInterrupt:
        _print("Stopped by user")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Download files from GitHub and update another program file."
    )

    parser.add_argument(
        "--token",
        default=os.getenv("GITHUB_TOKEN"),
        help="GitHub token (defaults to GITHUB_TOKEN env var)",
    )
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="Disable TLS certificate verification (not recommended)",
    )
    parser.add_argument(
        "--cacert",
        help="Path to CA bundle file for TLS verification",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    p_download_url = sub.add_parser("download-url", help="Download any URL to a local file")
    p_download_url.add_argument("--url", required=True, help="File URL")
    p_download_url.add_argument("--output", required=True, help="Output file path")

    p_download_asset = sub.add_parser(
        "download-release-asset",
        help="Download a GitHub release asset by name",
    )
    p_download_asset.add_argument("--repo", default=FIXED_REPO, help="owner/repo (locked)")
    p_download_asset.add_argument("--asset-name", required=True, help="Asset filename in release")
    p_download_asset.add_argument("--tag", default="latest", help="Release tag or 'latest'")
    p_download_asset.add_argument("--output", required=True, help="Output file path")

    p_update = sub.add_parser("update-file", help="Replace target file with source file")
    p_update.add_argument("--source", required=True, help="Downloaded file path")
    p_update.add_argument("--target", required=True, help="Program file path to replace")
    p_update.add_argument("--backup", action="store_true", help="Create .bak backup")

    p_update_github = sub.add_parser(
        "update-from-github",
        help="Download release asset from GitHub and replace target file",
    )
    p_update_github.add_argument("--repo", default=FIXED_REPO, help="owner/repo (locked)")
    p_update_github.add_argument("--asset-name", required=True, help="Asset filename in release")
    p_update_github.add_argument("--tag", default="latest", help="Release tag or 'latest'")
    p_update_github.add_argument("--target", required=True, help="Program file path or directory to install")
    p_update_github.add_argument("--backup", action="store_true", help="Create .bak backup")
    p_update_github.add_argument(
        "--stop-process",
        help="Process name/pattern to stop after update install (example: bot.bat or python)",
    )
    p_update_github.add_argument(
        "--start-cmd",
        help="Command to start after update install (example: cmd /c bot.bat)",
    )
    p_update_github.add_argument(
        "--start-bat",
        help="Windows .bat file path to start after update install",
    )
    p_update_github.add_argument(
        "--delete-missing",
        action="store_true",
        help="When installing archive updates, remove files not present in the update",
    )

    p_update_github_loop = sub.add_parser(
        "update-from-github-loop",
        help="Nonstop mode: repeatedly check GitHub release and update target",
    )
    p_update_github_loop.add_argument("--repo", default=FIXED_REPO, help="owner/repo (locked)")
    p_update_github_loop.add_argument(
        "--asset-name", required=True, help="Asset filename in release"
    )
    p_update_github_loop.add_argument("--tag", default="latest", help="Release tag or 'latest'")
    p_update_github_loop.add_argument(
        "--target", required=True, help="Program file path or directory to install"
    )
    p_update_github_loop.add_argument(
        "--interval", type=int, default=300, help="Check interval in seconds (default: 300)"
    )
    p_update_github_loop.add_argument(
        "--backup", action="store_true", help="Create .bak backup"
    )
    p_update_github_loop.add_argument(
        "--stop-process",
        help="Process name/pattern to stop after update install (example: bot.bat or python)",
    )
    p_update_github_loop.add_argument(
        "--start-cmd",
        help="Command to start after update install (example: cmd /c bot.bat)",
    )
    p_update_github_loop.add_argument(
        "--start-bat",
        help="Windows .bat file path to start after update install",
    )
    p_update_github_loop.add_argument(
        "--start-on-launch",
        action="store_true",
        help="Start target process once before entering nonstop update checks",
    )
    p_update_github_loop.add_argument(
        "--delete-missing",
        action="store_true",
        help="When installing archive updates, remove files not present in the update",
    )

    sub.add_parser("ui", help="Open desktop UI")

    p_redo = sub.add_parser(
        "redo",
        help="Redo full install from https://github.com/BlackAngelSk/discordbotlast",
    )
    p_redo.add_argument(
        "--target", required=True, help="Target directory where repository files are installed"
    )
    p_redo.add_argument("--ref", default="main", help="Branch or commit (default: main)")
    p_redo.add_argument("--backup", action="store_true", help="Create .bak backups")
    p_redo.add_argument(
        "--stop-process",
        help="Process name/pattern to stop after update install (example: bot.bat or python)",
    )
    p_redo.add_argument(
        "--start-cmd",
        help="Command to start after update install (example: cmd /c bot.bat)",
    )
    p_redo.add_argument(
        "--start-bat",
        help="Windows .bat file path to start after update install",
    )
    p_redo.add_argument(
        "--delete-missing",
        action="store_true",
        default=False,
        help="Remove files not present in repository snapshot",
    )

    p_redo_loop = sub.add_parser(
        "redo-loop",
        help="Nonstop full install watch for https://github.com/BlackAngelSk/discordbotlast",
    )
    p_redo_loop.add_argument(
        "--target", required=True, help="Target directory where repository files are installed"
    )
    p_redo_loop.add_argument("--ref", default="main", help="Branch or commit (default: main)")
    p_redo_loop.add_argument(
        "--interval", type=int, default=300, help="Check interval in seconds (default: 300)"
    )
    p_redo_loop.add_argument("--backup", action="store_true", help="Create .bak backups")
    p_redo_loop.add_argument(
        "--stop-process",
        help="Process name/pattern to stop after update install (example: bot.bat or python)",
    )
    p_redo_loop.add_argument(
        "--start-cmd",
        help="Command to start after update install (example: cmd /c bot.bat)",
    )
    p_redo_loop.add_argument(
        "--start-bat",
        help="Windows .bat file path to start after update install",
    )
    p_redo_loop.add_argument(
        "--start-on-launch",
        action="store_true",
        help="Start target process once before entering nonstop update checks",
    )
    p_redo_loop.add_argument(
        "--restart-each-cycle",
        action="store_true",
        help="Force stop/start on every interval cycle (keeps single bot instance)",
    )
    p_redo_loop.add_argument(
        "--delete-missing",
        action="store_true",
        default=False,
        help="Remove files not present in repository snapshot",
    )

    return parser


def main() -> int:
    if len(sys.argv) == 1:
        try:
            run_ui()
            return 0
        except UpdaterError as e:
            _print(f"UI unavailable: {e}")
            try:
                run_terminal_ui()
                return 0
            except UpdaterError as inner:
                _print(f"ERROR: {inner}")
                return 1

    parser = build_parser()
    args = parser.parse_args(_normalize_argv_start_cmd(sys.argv[1:]))

    global TLS_INSECURE, TLS_CAFILE
    TLS_INSECURE = bool(args.insecure)
    TLS_CAFILE = args.cacert

    try:
        cmd = args.command
        token = args.token

        if cmd == "download-url":
            out = download_url(args.url, Path(args.output), token=token)
            _print(f"Saved: {out}")
        elif cmd == "download-release-asset":
            out = download_release_asset(
                repo=args.repo,
                asset_name=args.asset_name,
                output=Path(args.output),
                tag=args.tag,
                token=token,
            )
            _print(f"Saved: {out}")
        elif cmd == "update-file":
            update_program_file(Path(args.source), Path(args.target), backup=args.backup)
            _print("Update complete")
        elif cmd == "update-from-github":
            changed = update_from_github(
                repo=args.repo,
                asset_name=args.asset_name,
                target=Path(args.target),
                tag=args.tag,
                backup=args.backup,
                delete_missing=args.delete_missing,
                token=token,
            )
            _stop_then_start_if_changed(
                changed=changed,
                stop_process=args.stop_process,
                start_cmd=_normalize_start_cmd_arg(args.start_cmd),
                start_bat=args.start_bat,
            )
            _print("Update complete")
        elif cmd == "update-from-github-loop":
            try:
                update_from_github_loop(
                    repo=args.repo,
                    asset_name=args.asset_name,
                    target=Path(args.target),
                    interval=args.interval,
                    tag=args.tag,
                    backup=args.backup,
                    delete_missing=args.delete_missing,
                    stop_process=args.stop_process,
                    start_cmd=_normalize_start_cmd_arg(args.start_cmd),
                    start_bat=args.start_bat,
                    start_on_launch=args.start_on_launch,
                    token=token,
                )
            except KeyboardInterrupt:
                _print("Stopped by user")
        elif cmd == "ui":
            try:
                run_ui()
            except UpdaterError as e:
                _print(f"UI unavailable: {e}")
                run_terminal_ui()
        elif cmd == "redo":
            changed = redo_fixed_repo(
                target=Path(args.target),
                ref=args.ref,
                backup=args.backup,
                delete_missing=args.delete_missing,
                token=token,
            )
            _stop_then_start_if_changed(
                changed=changed,
                stop_process=args.stop_process,
                start_cmd=_normalize_start_cmd_arg(args.start_cmd),
                start_bat=args.start_bat,
            )
            _print("Redo complete")
        elif cmd == "redo-loop":
            try:
                redo_fixed_repo_loop(
                    target=Path(args.target),
                    interval=args.interval,
                    ref=args.ref,
                    backup=args.backup,
                    delete_missing=args.delete_missing,
                    stop_process=args.stop_process,
                    start_cmd=_normalize_start_cmd_arg(args.start_cmd),
                    start_bat=args.start_bat,
                    start_on_launch=args.start_on_launch,
                    restart_each_cycle=args.restart_each_cycle,
                    token=token,
                )
            except KeyboardInterrupt:
                _print("Stopped by user")
        else:
            parser.print_help()
            return 2

        return 0
    except UpdaterError as e:
        _print(f"ERROR: {e}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
