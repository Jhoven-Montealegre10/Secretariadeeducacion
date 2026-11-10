#!/usr/bin/env python3
"""Genera las páginas HTML del sitio uniendo encabezado + contenido + pie.

Uso:  python3 build.py

Cada archivo de src/pages/ empieza con un bloque de metadatos:
    ---
    title: Título de la página
    description: Descripción para buscadores
    nav: inicio | transparencia | atencion | noticias | contacto (opcional)
    ---
El resultado se escribe en la raíz del proyecto con el mismo nombre.
"""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
NAV_KEYS = ["inicio", "transparencia", "atencion", "noticias", "contacto"]


def parse(text):
    meta, body = {}, text
    if text.startswith("---"):
        _, head, body = text.split("---", 2)
        for line in head.strip().splitlines():
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
    return meta, body.strip("\n")


def main():
    header = (SRC / "partials" / "header.html").read_text(encoding="utf-8")
    footer = (SRC / "partials" / "footer.html").read_text(encoding="utf-8")
    for page in sorted((SRC / "pages").glob("*.html")):
        meta, body = parse(page.read_text(encoding="utf-8"))
        head = header.replace("{{title}}", meta.get("title", "")).replace(
            "{{description}}", meta.get("description", ""))
        for key in NAV_KEYS:
            mark = 'aria-current="page"' if meta.get("nav") == key else ""
            head = head.replace("{{nav_%s}}" % key, mark)
        (ROOT / page.name).write_text(head + body + "\n" + footer, encoding="utf-8")
        print("generado:", page.name)


if __name__ == "__main__":
    main()
