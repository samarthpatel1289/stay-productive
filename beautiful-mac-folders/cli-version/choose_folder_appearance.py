#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = "gpt-5-mini"
RESPONSES_URL = "https://api.openai.com/v1/responses"


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_catalogs(base_dir=BASE_DIR):
    base_dir = Path(base_dir)
    options = load_json(base_dir / "folder-appearance-options.json")
    symbols = load_json(base_dir / options["symbols"]["file"])
    emojis = load_json(base_dir / options["emojis"]["file"])
    return {
        "options": options,
        "symbols": symbols,
        "emojis": emojis,
    }


def collect_finder_tags(folder_path):
    try:
        result = subprocess.run(
            ["mdls", "-raw", "-name", "kMDItemUserTags", str(folder_path)],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return []

    raw = result.stdout.strip()
    if raw in {"", "(null)", "null"}:
        return []

    tags = []
    for line in raw.splitlines():
        cleaned = line.strip().strip("(),").strip('"')
        if cleaned and cleaned not in {"(", ")"}:
            tags.append(cleaned)
    return tags


def collect_folder_context(folder_path):
    folder = Path(folder_path).expanduser().resolve()
    if not folder.is_dir():
        raise ValueError(f"Folder path is not a directory: {folder}")

    child_names = []
    file_extensions = set()
    for child in sorted(folder.iterdir(), key=lambda item: item.name.lower()):
        if child.name.startswith("."):
            continue
        child_names.append(child.name)
        if child.is_file() and child.suffix:
            file_extensions.add(child.suffix.lower())

    return {
        "name": folder.name,
        "path": str(folder),
        "parent": str(folder.parent),
        "childNames": child_names[:100],
        "childCount": len(child_names),
        "fileExtensions": sorted(file_extensions),
        "finderTags": collect_finder_tags(folder),
    }


def tokenize(value):
    text = str(value).lower()
    token = []
    tokens = []
    for char in text:
        if char.isalnum():
            token.append(char)
        else:
            if token:
                tokens.append("".join(token))
                token = []
    if token:
        tokens.append("".join(token))
    return tokens


def context_terms(folder_context):
    terms = []
    for key in ("name", "parent"):
        terms.extend(tokenize(folder_context.get(key, "")))
    for key in ("childNames", "fileExtensions", "finderTags"):
        for item in folder_context.get(key, []):
            terms.extend(tokenize(item))
    return {term for term in terms if len(term) > 2}


def catalog_value(item):
    return item.get("value") or item.get("name") or item.get("emoji") or ""


def catalog_meaning(item):
    if "meaning" in item:
        return item["meaning"]

    parts = [catalog_value(item)]
    parts.extend(item.get("categories", []))
    parts.extend(item.get("searchTerms", []))
    parts.append(item.get("name", ""))
    return " ".join(str(part) for part in parts if part)


def symbol_score(symbol, terms):
    symbol_terms = set(tokenize(catalog_meaning(symbol)))
    score = 0
    for term in terms:
        if term in symbol_terms:
            score += 10
        elif any(term in symbol_term or symbol_term in term for symbol_term in symbol_terms):
            score += 3

    name = catalog_value(symbol)
    if len(name.split(".")[0]) <= 2:
        score -= 20
    if name.endswith((".ar", ".hi")) or ".ar." in name or ".hi." in name:
        score -= 20

    # Favor filled glyphs because Finder's native picker examples use them well.
    if name.endswith(".fill"):
        score += 1

    return score


def select_symbol_candidates(folder_context, catalogs, max_symbols=250):
    symbols = catalogs["symbols"]["symbols"]
    terms = context_terms(folder_context)
    scored = [
        (symbol_score(symbol, terms), index, symbol)
        for index, symbol in enumerate(symbols)
    ]
    scored.sort(key=lambda item: (-item[0], item[1]))

    candidates = [symbol for score, _index, symbol in scored if score > 0][:max_symbols]
    if len(candidates) < max_symbols:
        selected_names = {catalog_value(symbol) for symbol in candidates}
        for symbol in symbols:
            value = catalog_value(symbol)
            if value not in selected_names:
                candidates.append(symbol)
                selected_names.add(value)
            if len(candidates) >= max_symbols:
                break

    return {
        "source": catalogs["symbols"].get("source", ""),
        "count": len(candidates),
        "totalAvailable": catalogs["symbols"].get("count", len(symbols)),
        "symbols": candidates,
    }


def build_prompt_payload(folder_context, catalogs, max_symbols=250):
    symbol_candidates = select_symbol_candidates(folder_context, catalogs, max_symbols)
    return {
        "task": "Choose a Finder folder color and icon for this folder.",
        "folder": folder_context,
        "outputContract": {
            "color": "One of options.colors[].id or options.defaultColorIds[].",
            "iconType": "Always symbol.",
            "icon": "A symbol value from options.symbols.symbols[].value.",
            "reason": "Short reason for the choice.",
        },
        "options": {
            "colors": catalogs["options"]["colors"],
            "defaultColorIds": catalogs["options"]["defaultColorIds"],
            "iconTypes": ["symbol"],
            "symbols": symbol_candidates,
        },
    }


def response_schema():
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["color", "iconType", "icon", "reason"],
        "properties": {
            "color": {"type": "string"},
            "iconType": {"type": "string", "enum": ["symbol"]},
            "icon": {"type": "string"},
            "reason": {"type": "string"},
        },
    }


def call_openai(payload, model=None, api_key=None):
    api_key = api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set.")

    model = model or os.environ.get("FOLDER_AI_MODEL", DEFAULT_MODEL)
    request_body = {
        "model": model,
        "input": [
            {
                "role": "developer",
                "content": (
                    "You choose attractive native macOS Finder folder appearances. "
                    "Return only JSON that matches the schema. Choose only from the provided options. "
                    "Use default/none/blue only when no custom color is clearly helpful. "
                    "Choose iconType symbol; emojis are not available in this workflow."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "folder_appearance_decision",
                "strict": True,
                "schema": response_schema(),
            }
        },
    }

    request = urllib.request.Request(
        RESPONSES_URL,
        data=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI request failed: HTTP {error.code}: {body}") from error

    return json.loads(extract_response_text(response_data))


def extract_response_text(response_data):
    if response_data.get("output_text"):
        return response_data["output_text"]

    for output in response_data.get("output", []):
        for content in output.get("content", []):
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                return content["text"]

    raise RuntimeError("OpenAI response did not contain output text.")


def validate_decision(decision, catalogs):
    if not isinstance(decision, dict):
        raise ValueError("AI decision must be a JSON object.")

    required = {"color", "iconType", "icon"}
    missing = required - set(decision)
    if missing:
        raise ValueError(f"AI decision missing keys: {', '.join(sorted(missing))}")

    allowed_colors = {color["id"] for color in catalogs["options"]["colors"]}
    allowed_colors.update(catalogs["options"]["defaultColorIds"])
    if decision["color"] not in allowed_colors:
        raise ValueError(f"AI selected unsupported color: {decision['color']}")

    if decision["iconType"] != "symbol":
        raise ValueError(f"AI selected unsupported iconType: {decision['iconType']}")

    allowed_symbols = {catalog_value(item) for item in catalogs["symbols"]["symbols"]}
    if decision["icon"] not in allowed_symbols:
        raise ValueError(f"AI selected unsupported SF Symbol: {decision['icon']}")

    return {
        "color": decision["color"],
        "iconType": decision["iconType"],
        "icon": decision["icon"],
        "reason": str(decision.get("reason", "")),
    }


def maybe_apply_decision(decision, folder_path, script_path=None, dry_run=False):
    if dry_run:
        return

    script = Path(script_path) if script_path is not None else BASE_DIR / "set-folder-appearance.applescript"
    subprocess.run(
        [
            "osascript",
            str(script),
            decision["color"],
            decision["icon"],
            str(Path(folder_path).expanduser().resolve()),
        ],
        check=True,
    )


def parse_decision_json(value):
    if value.startswith("@"):
        return load_json(value[1:])
    return json.loads(value)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Choose and apply a Finder-native folder appearance using OpenAI."
    )
    parser.add_argument("folder", help="Folder path to style.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=os.environ.get("FOLDER_AI_DRY_RUN") == "1",
        help="Print the validated decision without applying it.",
    )
    parser.add_argument(
        "--decision-json",
        help="Bypass OpenAI and use this JSON decision directly. Prefix with @ to read a file.",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("FOLDER_AI_MODEL", DEFAULT_MODEL),
        help=f"OpenAI model to use. Default: {DEFAULT_MODEL}",
    )
    args = parser.parse_args(argv)

    folder = Path(args.folder).expanduser().resolve()
    catalogs = load_catalogs(BASE_DIR)
    context = collect_folder_context(folder)
    payload = build_prompt_payload(context, catalogs)

    if args.decision_json:
        raw_decision = parse_decision_json(args.decision_json)
    else:
        raw_decision = call_openai(payload, model=args.model)

    decision = validate_decision(raw_decision, catalogs)
    print(json.dumps(decision, ensure_ascii=False, indent=2))
    maybe_apply_decision(decision, folder, dry_run=args.dry_run)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"choose_folder_appearance.py: {error}", file=sys.stderr)
        raise SystemExit(1)
