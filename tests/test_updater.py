import importlib.util
import tempfile
import unittest
import zipfile
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


if __name__ == "__main__":
    unittest.main()
