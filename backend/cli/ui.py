"""Hiển thị kết quả trên terminal (rich). Tiền luôn hiện VNĐ kèm số token on-chain."""
from __future__ import annotations

import json
import sys
from typing import Any

from rich.console import Console
from rich.table import Table

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (ValueError, OSError):
        pass

console = Console(highlight=False)


def money(m: dict | None) -> str:
    if not m:
        return "-"
    return f"{m['display']} ({m['token']})"


def ok(msg: str) -> None:
    console.print(f"[green]✔[/] {msg}")


def warn(msg: str) -> None:
    console.print(f"[yellow]![/] {msg}")


def fail(msg: str) -> None:
    console.print(f"[red]✘[/] {msg}")


def info(msg: str) -> None:
    console.print(msg)


def dump(obj: Any) -> None:
    console.print_json(json.dumps(obj, ensure_ascii=False, default=str))


def kv(title: str, rows: list[tuple[str, Any]]) -> None:
    t = Table(title=title, show_header=False, title_justify="left")
    t.add_column(style="cyan", no_wrap=True)
    t.add_column()
    for k, v in rows:
        t.add_row(k, str(v))
    console.print(t)


def table(title: str, headers: list[str], rows: list[list[Any]]) -> None:
    t = Table(title=title, title_justify="left")
    for h in headers:
        t.add_column(h)
    for r in rows:
        t.add_row(*[str(x) for x in r])
    console.print(t)
