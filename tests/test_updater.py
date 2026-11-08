import contextlib
import importlib.util
import io
import tempfile
import threading
import unittest
import unittest.mock
import zipfile
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "self updater" / "updater.py"
spec = importlib.util.spec_from_file_location("updater_module", MODULE_PATH)
updater = importlib.util.module_from_spec(spec)
assert spec is not None and spec.loader is not None
spec.loader.exec_module(updater)


class UpdaterTests(unittest.TestCase):
    def test_normalize_argv_start_cmd(self) -> None:
        argv = [
            "update-from-github",
            "--start-cmd",
            "python",
            "index.js",
            "--backup",
        ]
        normalized = updater._normalize_argv_start_cmd(argv)
        self.assertEqual(
            normalized,
            ["update-from-github", "--start-cmd", "python index.js", "--backup"],
        )

    def test_resolve_release_tag(self) -> None:
        self.assertEqual(updater._resolve_release_tag(None, "stable"), "latest")
        self.assertEqual(updater._resolve_release_tag(None, "nightly"), "nightly")
        self.assertEqual(updater._resolve_release_tag("v1.2.3", "beta"), "v1.2.3")

    def test_state_file_for_file_target_uses_parent(self) -> None:
        file_target = Path("/tmp/test-program.bin")
        state_path = updater._state_file_for_target(file_target)
        self.assertEqual(state_path, Path("/tmp/.updater_state.json"))

    def test_verify_sha256_mismatch_raises(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "file.txt"
            p.write_text("hello", encoding="utf-8")
            with self.assertRaises(updater.UpdaterError):
                updater._verify_sha256(p, "deadbeef")

    def test_extract_zip_path_traversal_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            zip_path = base / "bad.zip"
            extract_dir = base / "extract"
            extract_dir.mkdir(parents=True, exist_ok=True)

            with zipfile.ZipFile(zip_path, "w") as zf:
                zf.writestr("../escape.txt", "nope")

            with self.assertRaises(updater.UpdaterError):
                updater._extract_asset_to_dir(zip_path, extract_dir)

    def test_sync_directory_include_exclude_and_protected(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "source"
            target = root / "target"
            source.mkdir(parents=True)
            target.mkdir(parents=True)

            (source / "keep.py").write_text("print('x')", encoding="utf-8")
            (source / "ignore.log").write_text("log", encoding="utf-8")
            (source / ".env").write_text("SHOULD_NOT_COPY=1", encoding="utf-8")

            changed = updater._sync_directory(
                source_dir=source,
                target_dir=target,
                backup=False,
                delete_missing=True,
                include_patterns=["*.py", ".env"],
                exclude_patterns=["*.log"],
            )

            self.assertTrue(changed)
            self.assertTrue((target / "keep.py").exists())
            self.assertFalse((target / "ignore.log").exists())
            self.assertFalse((target / ".env").exists())

    # ── download resilience ──────────────────────────────────────────────────
    def test_summarize_error_body_strips_html_and_caps_length(self) -> None:
        page = (
            b"<!DOCTYPE html><html><head><style>body{}</style></head><body>"
            b"<h1>Unicorn!</h1><p>GitHub is temporarily unavailable.</p>"
            + b"<p>filler</p>" * 500
            + b"</body></html>"
        )

        summary = updater._summarize_error_body(page)

        self.assertNotIn("<", summary)
        self.assertIn("Unicorn!", summary)
        self.assertLessEqual(len(summary), updater.ERROR_BODY_PREVIEW_CHARS + 1)

    def test_is_html_payload(self) -> None:
        self.assertTrue(updater._is_html_payload(b"<!DOCTYPE html><html></html>"))
        self.assertTrue(updater._is_html_payload(b"  <html><body>oops</body></html>"))
        self.assertFalse(updater._is_html_payload(updater.ZIP_MAGIC + b"rest"))

    def test_source_archive_urls_include_codeload_fallback(self) -> None:
        urls = updater._source_archive_urls("owner", "repo", "main")

        self.assertGreaterEqual(len(urls), 2)
        self.assertIn("/zipball/main", urls[0])
        self.assertTrue(any("codeload.github.com" in url for url in urls))
        self.assertTrue(any(url.endswith(".zip") for url in urls))

    def test_download_retries_transient_500_and_returns_zip(self) -> None:
        zip_bytes = self._make_zip_bytes()

        with self._serve([(504, b"<html>upstream timeout</html>"), (200, zip_bytes)]) as base_url:
            output = Path(tempfile.mkdtemp()) / "archive.zip"

            with self._no_retry_sleep():
                result = updater._download_to_file(
                    f"{base_url}/archive.zip", output, expect_zip=True
                )

            self.assertEqual(result, output)
            self.assertEqual(output.read_bytes(), zip_bytes)

    def test_download_rejects_html_error_page_after_retries(self) -> None:
        page = b"<!DOCTYPE html><html><body><h1>Unicorn!</h1></body></html>"

        with self._serve([(200, page), (200, page), (200, page)]) as base_url:
            output = Path(tempfile.mkdtemp()) / "archive.zip"

            with self._no_retry_sleep():
                with self.assertRaises(updater.UpdaterError) as ctx:
                    updater._download_to_file(f"{base_url}/archive.zip", output, expect_zip=True)

            message = str(ctx.exception)
            self.assertIn("HTML error page", message)
            self.assertLess(len(message), 300)
            self.assertFalse(output.exists(), "no partial archive left behind")

    def test_download_falls_back_to_next_mirror(self) -> None:
        calls: list[str] = []
        zip_bytes = self._make_zip_bytes()

        def fake_download(url: str, output: Path, token=None, *, expect_zip: bool = False) -> Path:
            calls.append(url)
            if len(calls) == 1:
                raise updater.UpdaterError("Download failed (HTTP 504): Unicorn!")
            output.write_bytes(zip_bytes)
            return output

        output = Path(tempfile.mkdtemp()) / "archive.zip"

        with unittest.mock.patch.object(updater, "_download_to_file", side_effect=fake_download):
            result = updater.download_repo_source_archive(updater.FIXED_REPO, output, ref="main")

        self.assertEqual(result, output)
        self.assertEqual(len(calls), 2, "second mirror used after the first failed")
        self.assertIn("api.github.com", calls[0])
        self.assertIn("codeload.github.com", calls[1])

    def test_download_reports_all_mirrors_failing(self) -> None:
        def always_fail(url: str, output: Path, token=None, *, expect_zip: bool = False) -> Path:
            raise updater.UpdaterError("Download failed (HTTP 503): down")

        output = Path(tempfile.mkdtemp()) / "archive.zip"

        with unittest.mock.patch.object(updater, "_download_to_file", side_effect=always_fail):
            with self.assertRaises(updater.UpdaterError) as ctx:
                updater.download_repo_source_archive(updater.FIXED_REPO, output, ref="main")

        self.assertIn("every mirror", str(ctx.exception))

    # ── helpers ──────────────────────────────────────────────────────────────
    @staticmethod
    def _make_zip_bytes() -> bytes:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as zf:
            zf.writestr("file.txt", "ok")
        return buffer.getvalue()

    @staticmethod
    def _no_retry_sleep():
        return unittest.mock.patch.multiple(
            updater,
            NETWORK_RETRY_BASE_DELAY_SECONDS=0,
            time=unittest.mock.MagicMock(sleep=lambda *_: None),
        )

    @staticmethod
    @contextlib.contextmanager
    def _serve(responses):
        pending = list(responses)

        class Handler(SimpleHTTPRequestHandler):
            def do_GET(self):
                status, body = pending.pop(0) if pending else (500, b"no response")
                self.send_response(status)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        try:
            yield f"http://127.0.0.1:{server.server_address[1]}"
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
