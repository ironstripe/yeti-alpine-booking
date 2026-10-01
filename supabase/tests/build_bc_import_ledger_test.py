#!/usr/bin/env python3
"""Builds bc_import_ledger_test.sql = template with the pending migration embedded verbatim."""
import hashlib, pathlib
root = pathlib.Path(__file__).resolve().parent
mig = (root.parent / "pending" / "bc_import_ledger.sql").read_text()
tpl = (root / "bc_import_ledger_test.template.sql").read_text()
assert tpl.count("--@@MIGRATION@@") == 1
sha = hashlib.sha256(mig.encode()).hexdigest()
out = tpl.replace("--@@MIGRATION@@", f"-- migration sha256 {sha}\n{mig}")
(root / "bc_import_ledger_test.sql").write_text(out)
print("embedded migration sha256", sha)
