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
import hashlib
import json
import os
import socket
import shlex
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
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Iterator, Optional

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

RELEASE_CHANNEL_TAGS: Dict[str, str] = {
    "stable": "latest",
    "beta": "beta",
    "nightly": "nightly",
}

NETWORK_RETRY_ATTEMPTS = 3
NETWORK_RETRY_BASE_DELAY_SECONDS = 2

LOG_JSON = False
LOG_FILE: Optional[Path] = None
DRY_RUN = False


def _init_logging(log_json: bool = False, log_file: Optional[str] = None) -> None:
    global LOG_JSON, LOG_FILE
    LOG_JSON = bool(log_json)
    LOG_FILE = Path(log_file).expanduser().resolve() if log_file else None


def _emit_log_line(line: str) -> None:
    print(line)
    if LOG_FILE:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")


def _log_event(message: str, **fields: Any) -> None:
    if LOG_JSON:
        payload: Dict[str, Any] = {
            "ts": int(time.time()),
            "level": "info",
            "message": message,
        }
        payload.update(fields)
        _emit_log_line(json.dumps(payload, ensure_ascii=True, sort_keys=True))
        return

    if fields:
        details = " ".join(f"{k}={v}" for k, v in sorted(fields.items()))
        _emit_log_line(f"[updater] {message} ({details})")
    else:
        _emit_log_line(f"[updater] {message}")


class UpdaterError(Exception):
    """Raised for updater-specific failures."""


def _print(msg: str) -> None:
    _log_event(msg)


def _set_dry_run(enabled: bool) -> None:
    global DRY_RUN
    DRY_RUN = bool(enabled)


def _dry_run_note(action: str, **fields: Any) -> None:
    data = {"dry_run": True}
    data.update(fields)
    _log_event(f"DRY-RUN: {action}", **data)


def _compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _verify_sha256(path: Path, expected_sha256: Optional[str]) -> None:
    if not expected_sha256:
        return
    actual = _compute_sha256(path)
    expected = expected_sha256.lower().strip()
    if actual.lower() != expected:
        raise UpdaterError(
            f"Checksum mismatch for {path.name}: expected {expected}, got {actual}"
        )
    _log_event("Checksum verified", path=str(path), sha256=actual)


def _read_pid_file(pid_file: Path) -> Optional[int]:
    if not pid_file.exists():
        return None
    try:
        raw = pid_file.read_text(encoding="utf-8", errors="ignore").strip()
        if not raw:
            return None
        return int(raw)
    except Exception:
        return None


def _is_pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _wait_for_startup(
    started_proc: Optional[subprocess.Popen[Any]],
    verify_seconds: int,
    pid_file: Optional[Path] = None,
    health_cmd: Optional[str] = None,
) -> bool:
    if verify_seconds <= 0:
        return True

    deadline = time.time() + verify_seconds
    while time.time() < deadline:
        if health_cmd:
            result = subprocess.run(
                health_cmd,
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            if result.returncode == 0:
                return True

        if pid_file:
            pid = _read_pid_file(pid_file)
            if pid is not None and _is_pid_alive(pid):
                return True

        if started_proc is not None and started_proc.poll() is None:
            return True

        time.sleep(1)

    return False


def _snapshot_target(target: Path) -> Optional[Path]:
    if not target.exists():
        return None
    snapshot_dir = Path(tempfile.mkdtemp(prefix="updater-snapshot-"))
    snapshot_path = snapshot_dir / target.name
    if target.is_dir():
        shutil.copytree(target, snapshot_path, dirs_exist_ok=True)
    else:
        shutil.copy2(target, snapshot_path)
    return snapshot_path


def _restore_snapshot(target: Path, snapshot_path: Path) -> None:
    _log_event("Restoring snapshot", target=str(target), snapshot=str(snapshot_path))
    if DRY_RUN:
        _dry_run_note("restore snapshot", target=str(target), snapshot=str(snapshot_path))
        return

    if target.exists():
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink(missing_ok=True)

    if snapshot_path.is_dir():
        shutil.copytree(snapshot_path, target, dirs_exist_ok=True)
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(snapshot_path, target)


@contextmanager
def _acquire_single_instance_lock(lock_file: Optional[Path]) -> Iterator[None]:
    if not lock_file:
        yield
        return

    lock_file.parent.mkdir(parents=True, exist_ok=True)
    f = lock_file.open("a+", encoding="utf-8")

    try:
        if os.name == "nt":
            import msvcrt  # type: ignore

            try:
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as e:
                raise UpdaterError(f"Another updater instance is already running ({lock_file})") from e
        else:
            import fcntl

            try:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as e:
                raise UpdaterError(f"Another updater instance is already running ({lock_file})") from e

        f.seek(0)
        f.truncate()
        f.write(str(os.getpid()))
        f.flush()
        _log_event("Lock acquired", lock_file=str(lock_file), pid=os.getpid())
        yield
    finally:
        try:
            if os.name == "nt":
                import msvcrt  # type: ignore

                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        finally:
            f.close()


def _repair_embedded_windows_args(argv: list[str]) -> list[str]:
    repaired: list[str] = []

    for arg in argv:
        if '" --' not in arg:
            repaired.append(arg)
            continue

        value, remainder = arg.split('"', 1)
        repaired.append(value)

        extra = remainder.strip()
        if extra:
            try:
                repaired.extend(shlex.split(extra, posix=False))
            except ValueError:
                repaired.extend(extra.split())

    return repaired


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


def _stop_process(
    stop_process: Optional[str],
    pid_file: Optional[Path] = None,
    exact_match: bool = False,
    grace_seconds: int = 5,
) -> None:
    stopped = False

    if pid_file:
        pid = _read_pid_file(pid_file)
        if pid is not None:
            _print(f"Stopping PID from file: {pid}")
            if DRY_RUN:
                _dry_run_note("stop pid", pid=pid)
            else:
                try:
                    os.kill(pid, 15)
                except OSError:
                    pass
                deadline = time.time() + max(0, grace_seconds)
                while time.time() < deadline and _is_pid_alive(pid):
                    time.sleep(0.5)
                if _is_pid_alive(pid):
                    try:
                        os.kill(pid, 9)
                    except OSError:
                        pass
                stopped = True

    if not stop_process:
        return

    _print(f"Stopping process pattern: {stop_process}")
    if DRY_RUN:
        _dry_run_note("stop process", process=stop_process, exact_match=exact_match)
        return

    if os.name == "nt":
        cmd = ["taskkill", "/F", "/IM", stop_process]
    else:
        cmd = ["pkill", "-x" if exact_match else "-f", stop_process]
    subprocess.run(cmd, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not stopped:
        time.sleep(0.5)


def _start_command(start_cmd: Optional[str]) -> Optional[subprocess.Popen[Any]]:
    if not start_cmd:
        return None

    _print(f"Starting command: {start_cmd}")
    if DRY_RUN:
        _dry_run_note("start command", command=start_cmd)
        return None

    try:
        if os.name == "nt":
            return subprocess.Popen(["cmd", "/c", start_cmd], shell=False)
        else:
            return subprocess.Popen(start_cmd, shell=True, start_new_session=True)
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


def _start_bat_file(start_bat: Optional[str]) -> Optional[subprocess.Popen[Any]]:
    if not start_bat:
        return None

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
        if DRY_RUN:
            _dry_run_note("start bat", path=str(bat_file))
            return None
        try:
            return subprocess.Popen(
                ["cmd", "/c", "call", str(bat_file)],
                cwd=str(bat_file.parent),
                shell=False,
            )
        except Exception as e:
            raise UpdaterError(f"Failed to start .bat: {e}") from e
    else:
        _print("Ignored --start-bat on non-Windows OS")
        return None


def _stop_then_start_if_changed(
    changed: bool,
    stop_process: Optional[str] = None,
    start_cmd: Optional[str] = None,
    start_bat: Optional[str] = None,
    pid_file: Optional[Path] = None,
    exact_match: bool = False,
    grace_seconds: int = 5,
    verify_startup_seconds: int = 0,
    health_cmd: Optional[str] = None,
    rollback_target: Optional[Path] = None,
    rollback_snapshot: Optional[Path] = None,
) -> None:
    if not changed:
        return

    _stop_process(
        stop_process=stop_process,
        pid_file=pid_file,
        exact_match=exact_match,
        grace_seconds=grace_seconds,
    )

    proc: Optional[subprocess.Popen[Any]] = None
    if start_bat:
        proc = _start_bat_file(start_bat)
    else:
        proc = _start_command(start_cmd)

    should_verify = verify_startup_seconds > 0 and (
        start_bat is not None or start_cmd is not None or pid_file is not None or health_cmd is not None
    )
    startup_ok = True
    if should_verify:
        startup_ok = _wait_for_startup(
            started_proc=proc,
            verify_seconds=verify_startup_seconds,
            pid_file=pid_file,
            health_cmd=health_cmd,
        )
    if verify_startup_seconds > 0 and not startup_ok:
        if rollback_target is not None and rollback_snapshot is not None:
            _print("Startup check failed. Rolling back to previous version.")
            _restore_snapshot(rollback_target, rollback_snapshot)
            _stop_process(
                stop_process=stop_process,
                pid_file=pid_file,
                exact_match=exact_match,
                grace_seconds=grace_seconds,
            )
            if start_bat:
                _start_bat_file(start_bat)
            else:
                _start_command(start_cmd)
        raise UpdaterError("Startup verification failed")


def _run_update_with_snapshot(
    target: Path,
    update_action: Callable[[], bool],
    stop_process: Optional[str] = None,
    start_cmd: Optional[str] = None,
    start_bat: Optional[str] = None,
    pid_file: Optional[Path] = None,
    exact_match: bool = False,
    grace_seconds: int = 5,
    verify_startup_seconds: int = 0,
    health_cmd: Optional[str] = None,
) -> bool:
    snapshot = _snapshot_target(target)
    changed = update_action()
    _stop_then_start_if_changed(
        changed=changed,
        stop_process=stop_process,
        start_cmd=start_cmd,
        start_bat=start_bat,
        pid_file=pid_file,
        exact_match=exact_match,
        grace_seconds=grace_seconds,
        verify_startup_seconds=verify_startup_seconds,
        health_cmd=health_cmd,
        rollback_target=target if snapshot else None,
        rollback_snapshot=snapshot,
    )
    return changed


def _request_json(url: str, token: Optional[str] = None) -> Dict[str, Any]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "simple-github-updater",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    last_error: Optional[Exception] = None

    for attempt in range(1, NETWORK_RETRY_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(req, timeout=30, context=_build_ssl_context()) as resp:
                data = resp.read().decode("utf-8")
            break
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore")
            raise UpdaterError(f"GitHub API HTTP {e.code}: {body or e.reason}") from e
        except urllib.error.URLError as e:
            if isinstance(e.reason, ssl.SSLCertVerificationError):
                raise UpdaterError(_cert_error_hint()) from e

            last_error = e
            is_timeout = isinstance(e.reason, TimeoutError) or isinstance(e.reason, socket.timeout)
            if not is_timeout or attempt >= NETWORK_RETRY_ATTEMPTS:
                raise UpdaterError(f"Network error while calling GitHub API: {e.reason}") from e

            delay = NETWORK_RETRY_BASE_DELAY_SECONDS * attempt
            _print(f"GitHub API timeout, retrying in {delay}s (attempt {attempt}/{NETWORK_RETRY_ATTEMPTS})")
            time.sleep(delay)
        except (TimeoutError, socket.timeout) as e:
            last_error = e
            if attempt >= NETWORK_RETRY_ATTEMPTS:
                raise UpdaterError("GitHub API request timed out") from e

            delay = NETWORK_RETRY_BASE_DELAY_SECONDS * attempt
            _print(f"GitHub API timeout, retrying in {delay}s (attempt {attempt}/{NETWORK_RETRY_ATTEMPTS})")
            time.sleep(delay)
    else:
        raise UpdaterError("GitHub API request failed after retries") from last_error

    try:
        return json.loads(data)
    except json.JSONDecodeError as e:
        raise UpdaterError("Invalid JSON response from GitHub API") from e


def _request_json_conditional(
    url: str,
    token: Optional[str] = None,
    etag: Optional[str] = None,
) -> tuple[Optional[Dict[str, Any]], Optional[str], bool]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "simple-github-updater",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if etag:
        headers["If-None-Match"] = etag

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30, context=_build_ssl_context()) as resp:
            data = resp.read().decode("utf-8")
            new_etag = resp.headers.get("ETag")
    except urllib.error.HTTPError as e:
        if e.code == 304:
            return None, etag, True
        body = e.read().decode("utf-8", errors="ignore")
        raise UpdaterError(f"GitHub API HTTP {e.code}: {body or e.reason}") from e
    except urllib.error.URLError as e:
        if isinstance(e.reason, ssl.SSLCertVerificationError):
            raise UpdaterError(_cert_error_hint()) from e
        raise UpdaterError(f"Network error while calling GitHub API: {e.reason}") from e

    try:
        return json.loads(data), new_etag, False
    except json.JSONDecodeError as e:
        raise UpdaterError("Invalid JSON response from GitHub API") from e


def _download_to_file(url: str, output: Path, token: Optional[str] = None) -> Path:
    if DRY_RUN:
        _dry_run_note("download file", url=url, output=str(output))
        return output

    output.parent.mkdir(parents=True, exist_ok=True)

    headers = {"User-Agent": "simple-github-updater"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    last_error: Optional[Exception] = None

    for attempt in range(1, NETWORK_RETRY_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(req, timeout=120, context=_build_ssl_context()) as resp, output.open("wb") as f:
                shutil.copyfileobj(resp, f)
            break
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore")
            raise UpdaterError(f"Download failed (HTTP {e.code}): {body or e.reason}") from e
        except urllib.error.URLError as e:
            if isinstance(e.reason, ssl.SSLCertVerificationError):
                raise UpdaterError(_cert_error_hint()) from e

            last_error = e
            is_timeout = isinstance(e.reason, TimeoutError) or isinstance(e.reason, socket.timeout)
            if not is_timeout or attempt >= NETWORK_RETRY_ATTEMPTS:
                raise UpdaterError(f"Download failed: {e.reason}") from e

            delay = NETWORK_RETRY_BASE_DELAY_SECONDS * attempt
            _print(f"Download timeout, retrying in {delay}s (attempt {attempt}/{NETWORK_RETRY_ATTEMPTS})")
            time.sleep(delay)
        except (TimeoutError, socket.timeout) as e:
            last_error = e
            if attempt >= NETWORK_RETRY_ATTEMPTS:
                raise UpdaterError("Download request timed out") from e

            delay = NETWORK_RETRY_BASE_DELAY_SECONDS * attempt
            _print(f"Download timeout, retrying in {delay}s (attempt {attempt}/{NETWORK_RETRY_ATTEMPTS})")
            time.sleep(delay)
    else:
        raise UpdaterError("Download failed after retries") from last_error

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


def _get_release_data_conditional(
    repo: str,
    tag: str,
    token: Optional[str],
    etag: Optional[str],
) -> tuple[Optional[Dict[str, Any]], Optional[str], bool]:
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

    return _request_json_conditional(url, token=token, etag=etag)


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
    root = target if target.is_dir() or target.suffix == "" else target.parent
    return root / ".updater_state.json"


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
    if DRY_RUN:
        _dry_run_note("save state", target=str(target))
        return

    state_file = _state_file_for_target(target)
    state_file.parent.mkdir(parents=True, exist_ok=True)
    temp_file = state_file.with_suffix(state_file.suffix + ".tmp")
    payload = json.dumps(data, indent=2, sort_keys=True)
    temp_file.write_text(payload, encoding="utf-8")
    os.replace(temp_file, state_file)


def _state_key_for_repo_ref(repo: str, ref: str) -> str:
    return f"{repo}@{ref}"


def _state_key_for_release_etag(repo: str, tag: str) -> str:
    return f"release_etag:{repo}@{tag}"


def _resolve_release_tag(tag: Optional[str], channel: Optional[str]) -> str:
    if tag:
        return tag
    if channel:
        mapped = RELEASE_CHANNEL_TAGS.get(channel.lower())
        if mapped:
            return mapped
    return "latest"


def download_release_asset(
    repo: str,
    asset_name: str,
    output: Path,
    tag: str = "latest",
    token: Optional[str] = None,
    expected_sha256: Optional[str] = None,
) -> Path:
    release = _get_release_data(repo, tag=tag, token=token)

    assets = release.get("assets", [])
    for asset in assets:
        if asset.get("name") == asset_name:
            url = asset.get("browser_download_url")
            if not url:
                raise UpdaterError("Asset has no browser_download_url")
            _print(f"Downloading release asset: {asset_name}")
            downloaded = _download_to_file(url, output, token=token)
            _verify_sha256(downloaded, expected_sha256)
            return downloaded

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


def _matches_pattern(rel_path: Path, patterns: Iterable[str]) -> bool:
    rel_value = rel_path.as_posix().lower()
    name_value = rel_path.name.lower()
    for pattern in patterns:
        p = pattern.strip().lower()
        if not p:
            continue
        if fnmatch.fnmatch(rel_value, p) or fnmatch.fnmatch(name_value, p):
            return True
    return False


def _should_sync_file(
    rel_path: Path,
    include_patterns: Optional[list[str]],
    exclude_patterns: Optional[list[str]],
) -> bool:
    if _is_protected_local_file(rel_path):
        return False
    if exclude_patterns and _matches_pattern(rel_path, exclude_patterns):
        return False
    if include_patterns:
        return _matches_pattern(rel_path, include_patterns)
    return True


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
    include_patterns: Optional[list[str]] = None,
    exclude_patterns: Optional[list[str]] = None,
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
        if not _should_sync_file(rel, include_patterns, exclude_patterns):
            continue
        source_files.add(rel)

        dst = target_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)

        if dst.exists() and _files_are_equal(src, dst):
            skipped += 1
            continue

        if dst.exists() and backup:
            backup_path = dst.with_suffix(dst.suffix + ".bak")
            if DRY_RUN:
                _dry_run_note("backup file", source=str(dst), backup=str(backup_path))
            else:
                shutil.copy2(dst, backup_path)

        if dst.exists():
            replaced += 1
        else:
            added += 1

        if DRY_RUN:
            _dry_run_note("sync file", source=str(src), target=str(dst))
        else:
            shutil.copy2(src, dst)

    removed = 0
    if delete_missing:
        for dst in list(target_dir.rglob("*")):
            if not dst.is_file():
                continue
            rel = dst.relative_to(target_dir)
            if not _should_sync_file(rel, include_patterns, exclude_patterns):
                continue
            if rel not in source_files:
                if backup:
                    backup_path = dst.with_suffix(dst.suffix + ".bak")
                    if DRY_RUN:
                        _dry_run_note("backup file", source=str(dst), backup=str(backup_path))
                    else:
                        shutil.copy2(dst, backup_path)
                if DRY_RUN:
                    _dry_run_note("remove file", target=str(dst))
                else:
                    dst.unlink(missing_ok=True)
                removed += 1

        if not DRY_RUN:
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
        if DRY_RUN:
            _dry_run_note("backup file", source=str(target), backup=str(backup_path))
        else:
            shutil.copy2(target, backup_path)

    temp_target = target.with_suffix(target.suffix + ".new")
    if DRY_RUN:
        _dry_run_note("replace file", source=str(source), target=str(target))
        return True

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
    expected_sha256: Optional[str] = None,
    include_patterns: Optional[list[str]] = None,
    exclude_patterns: Optional[list[str]] = None,
) -> bool:
    with tempfile.TemporaryDirectory(prefix="updater-") as tmp:
        downloaded = Path(tmp) / asset_name
        download_release_asset(
            repo=repo,
            asset_name=asset_name,
            output=downloaded,
            tag=tag,
            token=token,
            expected_sha256=expected_sha256,
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
                include_patterns=include_patterns,
                exclude_patterns=exclude_patterns,
            )


def redo_fixed_repo(
    target: Path,
    ref: str = "main",
    backup: bool = False,
    delete_missing: bool = False,
    token: Optional[str] = None,
    include_patterns: Optional[list[str]] = None,
    exclude_patterns: Optional[list[str]] = None,
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
            include_patterns=include_patterns,
            exclude_patterns=exclude_patterns,
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
    include_patterns: Optional[list[str]] = None,
    exclude_patterns: Optional[list[str]] = None,
    pid_file: Optional[Path] = None,
    exact_match: bool = False,
    grace_seconds: int = 5,
    verify_startup_seconds: int = 0,
    health_cmd: Optional[str] = None,
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
                        pid_file=pid_file,
                        exact_match=exact_match,
                        grace_seconds=grace_seconds,
                        verify_startup_seconds=verify_startup_seconds,
                        health_cmd=health_cmd,
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
                include_patterns=include_patterns,
                exclude_patterns=exclude_patterns,
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
                pid_file=pid_file,
                exact_match=exact_match,
                grace_seconds=grace_seconds,
                verify_startup_seconds=verify_startup_seconds,
                health_cmd=health_cmd,
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
    expected_sha256: Optional[str] = None,
    include_patterns: Optional[list[str]] = None,
    exclude_patterns: Optional[list[str]] = None,
    pid_file: Optional[Path] = None,
    exact_match: bool = False,
    grace_seconds: int = 5,
    verify_startup_seconds: int = 0,
    health_cmd: Optional[str] = None,
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
            state = _load_target_state(target)
            etag_key = _state_key_for_release_etag(repo, tag)
            prev_etag = state.get(etag_key)
            release_data, new_etag, not_modified = _get_release_data_conditional(
                repo=repo,
                tag=tag,
                token=token,
                etag=prev_etag if isinstance(prev_etag, str) else None,
            )

            if not_modified:
                _print("Release metadata unchanged (ETag). Skipping download.")
                _print(f"Waiting {interval} seconds for next check.")
                time.sleep(interval)
                continue

            if new_etag:
                state[etag_key] = new_etag
                _save_target_state(target, state)

            # release_data is fetched to support conditional checks; update flow still resolves assets safely.
            if release_data is not None and release_data.get("tag_name"):
                _log_event("Release metadata changed", tag_name=release_data.get("tag_name"))

            changed = update_from_github(
                repo=repo,
                asset_name=asset_name,
                target=target,
                tag=tag,
                backup=backup,
                delete_missing=delete_missing,
                token=token,
                expected_sha256=expected_sha256,
                include_patterns=include_patterns,
                exclude_patterns=exclude_patterns,
            )
            _stop_then_start_if_changed(
                changed=changed,
                stop_process=stop_process,
                start_cmd=start_cmd,
                start_bat=start_bat,
                pid_file=pid_file,
                exact_match=exact_match,
                grace_seconds=grace_seconds,
                verify_startup_seconds=verify_startup_seconds,
                health_cmd=health_cmd,
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
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview actions without changing files or processes",
    )
    parser.add_argument(
        "--log-json",
        action="store_true",
        help="Emit structured JSON logs",
    )
    parser.add_argument(
        "--log-file",
        help="Append logs to this file",
    )
    parser.add_argument(
        "--lock-file",
        help="Path to lock file for single updater instance protection",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    p_download_url = sub.add_parser("download-url", help="Download any URL to a local file")
    p_download_url.add_argument("--url", required=True, help="File URL")
    p_download_url.add_argument("--output", required=True, help="Output file path")
    p_download_url.add_argument("--sha256", help="Expected SHA-256 of downloaded file")

    p_download_asset = sub.add_parser(
        "download-release-asset",
        help="Download a GitHub release asset by name",
    )
    p_download_asset.add_argument("--repo", default=FIXED_REPO, help="owner/repo (locked)")
    p_download_asset.add_argument("--asset-name", required=True, help="Asset filename in release")
    p_download_asset.add_argument("--tag", default="latest", help="Release tag or 'latest'")
    p_download_asset.add_argument(
        "--channel",
        choices=sorted(RELEASE_CHANNEL_TAGS.keys()),
        help="Release channel shortcut (maps to a tag)",
    )
    p_download_asset.add_argument("--output", required=True, help="Output file path")
    p_download_asset.add_argument("--sha256", help="Expected SHA-256 of downloaded asset")

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
    p_update_github.add_argument("--tag", help="Release tag (overrides --channel)")
    p_update_github.add_argument(
        "--channel",
        choices=sorted(RELEASE_CHANNEL_TAGS.keys()),
        help="Release channel shortcut (maps to a tag)",
    )
    p_update_github.add_argument("--target", required=True, help="Program file path or directory to install")
    p_update_github.add_argument("--backup", action="store_true", help="Create .bak backup")
    p_update_github.add_argument("--sha256", help="Expected SHA-256 of downloaded asset")
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
    p_update_github.add_argument(
        "--pid-file",
        help="PID file to stop/verify process lifecycle",
    )
    p_update_github.add_argument(
        "--stop-exact",
        action="store_true",
        help="Use exact process name matching when stopping",
    )
    p_update_github.add_argument(
        "--stop-grace-seconds",
        type=int,
        default=5,
        help="Grace period before force-kill (default: 5)",
    )
    p_update_github.add_argument(
        "--verify-startup-seconds",
        type=int,
        default=0,
        help="Verify restart health for this many seconds (default: disabled)",
    )
    p_update_github.add_argument(
        "--health-cmd",
        help="Health-check command (exit 0 means healthy)",
    )
    p_update_github.add_argument(
        "--include",
        action="append",
        default=[],
        help="Include glob for archive sync (can repeat)",
    )
    p_update_github.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Exclude glob for archive sync (can repeat)",
    )

    p_update_github_loop = sub.add_parser(
        "update-from-github-loop",
        help="Nonstop mode: repeatedly check GitHub release and update target",
    )
    p_update_github_loop.add_argument("--repo", default=FIXED_REPO, help="owner/repo (locked)")
    p_update_github_loop.add_argument(
        "--asset-name", required=True, help="Asset filename in release"
    )
    p_update_github_loop.add_argument("--tag", help="Release tag (overrides --channel)")
    p_update_github_loop.add_argument(
        "--channel",
        choices=sorted(RELEASE_CHANNEL_TAGS.keys()),
        help="Release channel shortcut (maps to a tag)",
    )
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
    p_update_github_loop.add_argument("--sha256", help="Expected SHA-256 of downloaded asset")
    p_update_github_loop.add_argument("--pid-file", help="PID file to stop/verify process lifecycle")
    p_update_github_loop.add_argument(
        "--stop-exact",
        action="store_true",
        help="Use exact process name matching when stopping",
    )
    p_update_github_loop.add_argument(
        "--stop-grace-seconds",
        type=int,
        default=5,
        help="Grace period before force-kill (default: 5)",
    )
    p_update_github_loop.add_argument(
        "--verify-startup-seconds",
        type=int,
        default=0,
        help="Verify restart health for this many seconds (default: disabled)",
    )
    p_update_github_loop.add_argument(
        "--health-cmd",
        help="Health-check command (exit 0 means healthy)",
    )
    p_update_github_loop.add_argument(
        "--include",
        action="append",
        default=[],
        help="Include glob for archive sync (can repeat)",
    )
    p_update_github_loop.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Exclude glob for archive sync (can repeat)",
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
    p_redo.add_argument("--pid-file", help="PID file to stop/verify process lifecycle")
    p_redo.add_argument(
        "--stop-exact",
        action="store_true",
        help="Use exact process name matching when stopping",
    )
    p_redo.add_argument(
        "--stop-grace-seconds",
        type=int,
        default=5,
        help="Grace period before force-kill (default: 5)",
    )
    p_redo.add_argument(
        "--verify-startup-seconds",
        type=int,
        default=0,
        help="Verify restart health for this many seconds (default: disabled)",
    )
    p_redo.add_argument(
        "--health-cmd",
        help="Health-check command (exit 0 means healthy)",
    )
    p_redo.add_argument(
        "--include",
        action="append",
        default=[],
        help="Include glob for repo sync (can repeat)",
    )
    p_redo.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Exclude glob for repo sync (can repeat)",
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
    p_redo_loop.add_argument("--pid-file", help="PID file to stop/verify process lifecycle")
    p_redo_loop.add_argument(
        "--stop-exact",
        action="store_true",
        help="Use exact process name matching when stopping",
    )
    p_redo_loop.add_argument(
        "--stop-grace-seconds",
        type=int,
        default=5,
        help="Grace period before force-kill (default: 5)",
    )
    p_redo_loop.add_argument(
        "--verify-startup-seconds",
        type=int,
        default=0,
        help="Verify restart health for this many seconds (default: disabled)",
    )
    p_redo_loop.add_argument(
        "--health-cmd",
        help="Health-check command (exit 0 means healthy)",
    )
    p_redo_loop.add_argument(
        "--include",
        action="append",
        default=[],
        help="Include glob for repo sync (can repeat)",
    )
    p_redo_loop.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Exclude glob for repo sync (can repeat)",
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
    normalized_argv = _normalize_argv_start_cmd(_repair_embedded_windows_args(sys.argv[1:]))
    args = parser.parse_args(normalized_argv)

    global TLS_INSECURE, TLS_CAFILE
    TLS_INSECURE = bool(args.insecure)
    TLS_CAFILE = args.cacert

    _init_logging(log_json=bool(args.log_json), log_file=args.log_file)
    _set_dry_run(bool(args.dry_run))

    lock_path = Path(args.lock_file).expanduser().resolve() if args.lock_file else None

    try:
        with _acquire_single_instance_lock(lock_path):
            cmd = args.command
            token = args.token

            if cmd == "download-url":
                out = download_url(args.url, Path(args.output), token=token)
                _verify_sha256(out, args.sha256)
                _print(f"Saved: {out}")
            elif cmd == "download-release-asset":
                resolved_tag = _resolve_release_tag(args.tag, args.channel)
                out = download_release_asset(
                    repo=args.repo,
                    asset_name=args.asset_name,
                    output=Path(args.output),
                    tag=resolved_tag,
                    token=token,
                    expected_sha256=args.sha256,
                )
                _print(f"Saved: {out}")
            elif cmd == "update-file":
                changed = _run_update_with_snapshot(
                    target=Path(args.target),
                    update_action=lambda: update_program_file(Path(args.source), Path(args.target), backup=args.backup),
                )
                if changed:
                    _print("Update complete")
            elif cmd == "update-from-github":
                resolved_tag = _resolve_release_tag(args.tag, args.channel)
                changed = _run_update_with_snapshot(
                    target=Path(args.target),
                    update_action=lambda: update_from_github(
                        repo=args.repo,
                        asset_name=args.asset_name,
                        target=Path(args.target),
                        tag=resolved_tag,
                        backup=args.backup,
                        delete_missing=args.delete_missing,
                        token=token,
                        expected_sha256=args.sha256,
                        include_patterns=args.include,
                        exclude_patterns=args.exclude,
                    ),
                    stop_process=args.stop_process,
                    start_cmd=_normalize_start_cmd_arg(args.start_cmd),
                    start_bat=args.start_bat,
                    pid_file=Path(args.pid_file).expanduser().resolve() if args.pid_file else None,
                    exact_match=bool(args.stop_exact),
                    grace_seconds=max(0, args.stop_grace_seconds),
                    verify_startup_seconds=max(0, args.verify_startup_seconds),
                    health_cmd=_normalize_start_cmd_arg(args.health_cmd),
                )
                if changed:
                    _print("Update complete")
            elif cmd == "update-from-github-loop":
                resolved_tag = _resolve_release_tag(args.tag, args.channel)
                try:
                    update_from_github_loop(
                        repo=args.repo,
                        asset_name=args.asset_name,
                        target=Path(args.target),
                        interval=args.interval,
                        tag=resolved_tag,
                        backup=args.backup,
                        delete_missing=args.delete_missing,
                        stop_process=args.stop_process,
                        start_cmd=_normalize_start_cmd_arg(args.start_cmd),
                        start_bat=args.start_bat,
                        start_on_launch=args.start_on_launch,
                        token=token,
                        expected_sha256=args.sha256,
                        include_patterns=args.include,
                        exclude_patterns=args.exclude,
                        pid_file=Path(args.pid_file).expanduser().resolve() if args.pid_file else None,
                        exact_match=bool(args.stop_exact),
                        grace_seconds=max(0, args.stop_grace_seconds),
                        verify_startup_seconds=max(0, args.verify_startup_seconds),
                        health_cmd=_normalize_start_cmd_arg(args.health_cmd),
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
                changed = _run_update_with_snapshot(
                    target=Path(args.target),
                    update_action=lambda: redo_fixed_repo(
                        target=Path(args.target),
                        ref=args.ref,
                        backup=args.backup,
                        delete_missing=args.delete_missing,
                        token=token,
                        include_patterns=args.include,
                        exclude_patterns=args.exclude,
                    ),
                    stop_process=args.stop_process,
                    start_cmd=_normalize_start_cmd_arg(args.start_cmd),
                    start_bat=args.start_bat,
                    pid_file=Path(args.pid_file).expanduser().resolve() if args.pid_file else None,
                    exact_match=bool(args.stop_exact),
                    grace_seconds=max(0, args.stop_grace_seconds),
                    verify_startup_seconds=max(0, args.verify_startup_seconds),
                    health_cmd=_normalize_start_cmd_arg(args.health_cmd),
                )
                if changed:
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
                        include_patterns=args.include,
                        exclude_patterns=args.exclude,
                        pid_file=Path(args.pid_file).expanduser().resolve() if args.pid_file else None,
                        exact_match=bool(args.stop_exact),
                        grace_seconds=max(0, args.stop_grace_seconds),
                        verify_startup_seconds=max(0, args.verify_startup_seconds),
                        health_cmd=_normalize_start_cmd_arg(args.health_cmd),
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
