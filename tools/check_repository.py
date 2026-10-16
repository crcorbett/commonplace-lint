"""Check the library's small workspace and documentation contract."""
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "package.json").read_text())
assert manifest["private"] is True
assert manifest["workspaces"]["packages"] == ["packages/*"]
assert sorted(path.name for path in (root / "packages").iterdir()) == ["oxlint-plugin"]
package = json.loads((root / "packages/oxlint-plugin/package.json").read_text())
assert package["name"] == "@commonplace/oxlint-plugin"
assert package["license"] == "MIT"
assert package["repository"]["url"] == "git+https://github.com/crcorbett/commonplace-lint.git"
for export in package["exports"].values():
    assert set(export) == {"types", "default"}
    for target in export.values():
        assert target.startswith("./dist/")
        assert (root / "packages/oxlint-plugin" / target).is_file(), target
assert not (root / "apps").exists()
assert not (root / "plugins").exists()
register = json.loads((root / "docs/documentation-map.json").read_text())
paths = [entry["path"] for entry in register["documents"]]
assert len(paths) == len(set(paths))
for entry in register["documents"]:
    document = root / entry["path"]
    assert document.is_file(), entry["path"]
    for destination in re.findall(r"\[[^\]]+\]\(([^)]+)\)", document.read_text()):
        if destination.startswith(("https://", "http://", "#")):
            continue
        target = destination.split("#", 1)[0]
        assert (document.parent / target).resolve().is_file(), (entry["path"], target)
print(f"Checked one package, {len(package['exports'])} exports and {len(paths)} documentation owners.")
