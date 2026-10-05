from __future__ import annotations
import math
import re


# ── Formatage des valeurs réelles ──────────────────────────────────────────

def _format_value(value: float, unit: str = "") -> str:
    if not math.isfinite(value):
        return str(value)
    if value == int(value):
        return f"{int(value):,}".replace(",", "\u202f")  # espace fine
    return f"{value:,.2f}".replace(",", "\u202f").replace(".", ",")


# ── Token pattern ──────────────────────────────────────────────────────────

_TOKEN_RE = re.compile(r'([+\-]?)TOK_(\d{4})')


def _replace_token(match: re.Match, token_map: dict[str, float]) -> str:
    sign   = match.group(1)   # "", "+", ou "-"
    number = match.group(2)   # "0001"
    token  = f"TOK_{number}"

    if token not in token_map:
        return match.group(0)

    raw_value = token_map[token]  

    if sign == "+":
        return f"+{_format_value(abs(raw_value))}"
    elif sign == "-":
        return f"-{_format_value(abs(raw_value))}"
    else:
        if raw_value < 0:
            return f"-{_format_value(abs(raw_value))}"
        return _format_value(raw_value)


def decrypt_text(text: str, token_map: dict[str, float]) -> str:
    return _TOKEN_RE.sub(lambda m: _replace_token(m, token_map), text)


# ── Stream decryptor ───────────────────────────────────────────────────────

class StreamDecryptor:
    _MAX_TOKEN_LEN = 9

    def __init__(self, token_map: dict[str, float]):
        self._token_map = token_map
        self._buffer    = ""

    def feed(self, chunk: str) -> str:
        if not chunk:
            return ""

        self._buffer += chunk

        safe_end = max(0, len(self._buffer) - self._MAX_TOKEN_LEN)

        safety_window = self._buffer[safe_end:]
        partial_match = re.search(
            r'[+\-]?T(?:O(?:K(?:_(?:\d{0,4})?)?)?)?$',
            safety_window,
        )
        if partial_match:
            safe_end = safe_end + partial_match.start()

        if safe_end > 0:
            region = self._buffer[:safe_end]
            tail_partial = re.search(r'[+\-]?T(?:O(?:K(?:_\d{0,4})?)?)?$', region)
            if tail_partial:
                if not re.fullmatch(r'[+\-]?TOK_\d{4}', tail_partial.group()):
                    safe_end = tail_partial.start()

        safe_end = max(0, safe_end)

        to_release   = self._buffer[:safe_end]
        self._buffer = self._buffer[safe_end:]

        return decrypt_text(to_release, self._token_map)

    def flush(self) -> str:
        remaining    = self._buffer
        self._buffer = ""
        return decrypt_text(remaining, self._token_map)


# ── Intégration avec le générateur SSE ────────────────────────────────────

def decrypt_sse_stream(raw_stream, token_map: dict[str, float]):
    decryptor = StreamDecryptor(token_map)

    for raw_line in raw_stream:
        if not raw_line.startswith("data: "):
            continue

        content = raw_line[6:].rstrip("\n")

        if content == "[DONE]":
            residual = decryptor.flush()
            if residual:
                yield f"data: {residual}\n\n"
            yield "data: [DONE]\n\n"
            return

        decrypted = decryptor.feed(content)
        if decrypted:
            yield f"data: {decrypted}\n\n"

    residual = decryptor.flush()
    if residual:
        yield f"data: {residual}\n\n"