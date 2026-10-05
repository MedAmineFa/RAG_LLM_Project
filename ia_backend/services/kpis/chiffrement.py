from __future__ import annotations
import copy
from dataclasses import dataclass, field


# ── Token registry ─────────────────────────────────────────────────────────

@dataclass
class TokenMap:
    _tok_to_val: dict[str, float] = field(default_factory=dict)
    _scoped_to_tok: dict[tuple, str] = field(default_factory=dict)  # (scope, value) → token
    _val_to_tok: dict[float, str] = field(default_factory=dict)      # valeur brute → token (non-scopé)
    _counter: int = 0

    def _new_token(self, value: float) -> str:
        self._counter += 1
        token = f"TOK_{self._counter:04d}"
        self._tok_to_val[token] = value
        return token

    def get_or_create_scoped(self, value: float, scope: str) -> str:
        key = (scope, value)
        if key in self._scoped_to_tok:
            return self._scoped_to_tok[key]
        token = self._new_token(value)
        self._scoped_to_tok[key] = token
        return token

    def get_or_create(self, value: float) -> str:
        if value in self._val_to_tok:
            return self._val_to_tok[value]
        token = self._new_token(value)
        self._val_to_tok[value] = token
        return token

    def to_dict(self) -> dict[str, float]:
        return dict(self._tok_to_val)


# ── Helpers ────────────────────────────────────────────────────────────────

def _calc_variation(current: float, previous: float) -> float:
    if previous == 0:
        return -100.0
    return round(((current - previous) / abs(previous)) * 100, 2)


def _find_kpi(kpis: list[dict], *name_fragments: str) -> dict | None:
    for kpi in kpis:
        name_lower = kpi["name"].lower()
        if any(frag.lower() in name_lower for frag in name_fragments):
            return kpi
    return None


def _safe_ratio(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator == 0:
        return None
    return round(numerator / denominator, 4)


# ── Ordinal relations builder ──────────────────────────────────────────────

def _build_relations(kpis: list[dict], tok: TokenMap) -> list[str]:
    relations: list[str] = []

    vals: dict[str, float] = {k["name"]: k["currentAmount"] for k in kpis}
    toks: dict[str, str]   = {}

    for k in kpis:
        t = tok.get_or_create_scoped(k["currentAmount"], f"{k['name']}:cur")
        toks[k["name"]] = t

    ca     = _find_kpi(kpis, "chiffre d'affaires", "ca total")
    ca_exp = _find_kpi(kpis, "export", "ca export")
    mb     = _find_kpi(kpis, "marge brute")
    ebitda = _find_kpi(kpis, "ebitda")
    rn     = _find_kpi(kpis, "résultat net")
    treso  = _find_kpi(kpis, "trésorerie")
    dette  = _find_kpi(kpis, "dette nette")
    endet  = _find_kpi(kpis, "endettement net")
    cp     = _find_kpi(kpis, "capitaux propres")
    ci     = _find_kpi(kpis, "charges d'intérêts", "charges intérêts")
    capex  = _find_kpi(kpis, "investissements", "capex")
    eff    = _find_kpi(kpis, "effectifs")

    def add_ordinal(a: dict | None, b: dict | None, label_a: str, label_b: str) -> None:
        if a is None or b is None:
            return
        va, vb = a["currentAmount"], b["currentAmount"]
        ta, tb = toks[a["name"]], toks[b["name"]]
        sym = ">" if va > vb else ("<" if va < vb else "=")
        relations.append(f"{ta} {sym} {tb}  [{label_a} {sym} {label_b}]")

    add_ordinal(ca,     mb,     "CA", "Marge Brute")
    add_ordinal(ca,     ebitda, "CA", "EBITDA")
    add_ordinal(ca,     rn,     "CA", "Résultat Net")
    add_ordinal(mb,     ebitda, "Marge Brute", "EBITDA")
    add_ordinal(ebitda, rn,     "EBITDA", "Résultat Net")
    add_ordinal(ca,     ca_exp, "CA Total", "CA Export")

    if treso is not None:
        sym = ">" if treso["currentAmount"] > 0 else "<"
        relations.append(f"{toks[treso['name']]} {sym} 0  [Trésorerie {sym} 0]")

    if rn is not None:
        sym = ">" if rn["currentAmount"] > 0 else "<"
        relations.append(f"{toks[rn['name']]} {sym} 0  [Résultat Net {sym} 0]")

    if cp is not None:
        sym = ">" if cp["currentAmount"] > 0 else "<"
        relations.append(f"{toks[cp['name']]} {sym} 0  [Capitaux Propres {sym} 0]")

    ratio_dette_ebitda = _safe_ratio(
        vals.get(dette["name"]) if dette else None,
        vals.get(ebitda["name"]) if ebitda else None,
    )
    if ratio_dette_ebitda is not None:
        relations.append(f"ratio Dette_Nette/EBITDA = {ratio_dette_ebitda:.2f}x")

    ratio_ci_ebitda = _safe_ratio(
        vals.get(ci["name"]) if ci else None,
        vals.get(ebitda["name"]) if ebitda else None,
    )
    if ratio_ci_ebitda is not None:
        pct = round(ratio_ci_ebitda * 100, 1)
        relations.append(f"ratio Charges_Intérêts/EBITDA = {pct}%")

    ratio_endet_cp = _safe_ratio(
        vals.get(endet["name"]) if endet else None,
        vals.get(cp["name"]) if cp else None,
    )
    if ratio_endet_cp is not None:
        relations.append(f"ratio Endettement_Net/Capitaux_Propres = {ratio_endet_cp:.2f}x")

    ratio_mb_ca = _safe_ratio(
        vals.get(mb["name"]) if mb else None,
        vals.get(ca["name"]) if ca else None,
    )
    if ratio_mb_ca is not None:
        pct = round(ratio_mb_ca * 100, 1)
        relations.append(f"taux Marge_Brute/CA = {pct}%")

    ratio_ebitda_ca = _safe_ratio(
        vals.get(ebitda["name"]) if ebitda else None,
        vals.get(ca["name"]) if ca else None,
    )
    if ratio_ebitda_ca is not None:
        pct = round(ratio_ebitda_ca * 100, 1)
        relations.append(f"taux EBITDA/CA = {pct}%")

    ratio_ca_exp_ca = _safe_ratio(
        vals.get(ca_exp["name"]) if ca_exp else None,
        vals.get(ca["name"]) if ca else None,
    )
    if ratio_ca_exp_ca is not None:
        pct = round(ratio_ca_exp_ca * 100, 1)
        relations.append(f"taux CA_Export/CA = {pct}%")

    if treso and ca and ca["currentAmount"] != 0:
        mois = round(treso["currentAmount"] / (ca["currentAmount"] / 12), 2)
        relations.append(f"Trésorerie = {mois} mois de CA")

    if ca and eff and eff["currentAmount"] != 0:
        prod = round(ca["currentAmount"] / eff["currentAmount"], 2)
        t_prod = tok.get_or_create(prod)
        relations.append(f"productivité CA/ETP = {t_prod} {ca.get('unit','')}/ETP")

    for k in kpis:
        variation = k.get("variation", _calc_variation(k["currentAmount"], k["previousAmount"]))
        sens = "hausse" if variation > 0 else ("stable" if variation == 0 else "baisse")
        relations.append(
            f"{toks[k['name']]} variation N/N-1 : {sens} ({variation:+.2f}%)  [{k['name']}]"
        )

    return relations


# ── KPI tokenizer ──────────────────────────────────────────────────────────

def _tokenize_kpi_base(kpi: dict, tok: TokenMap) -> dict:
    name   = kpi["name"]
    t_cur  = tok.get_or_create_scoped(kpi["currentAmount"],  f"{name}:cur")
    t_prev = tok.get_or_create_scoped(kpi["previousAmount"], f"{name}:prev")

    var = kpi.get("variation", _calc_variation(kpi["currentAmount"], kpi["previousAmount"]))

    delta = kpi["currentAmount"] - kpi["previousAmount"]
    delta_sign = "+" if delta >= 0 else ""
    t_delta = tok.get_or_create(abs(delta))
    delta_token = f"{delta_sign}{t_delta}" if delta >= 0 else f"-{t_delta}"

    return {
        "name":           kpi["name"],
        "unit":           kpi["unit"],
        "currentAmount":  t_cur,
        "previousAmount": t_prev,
        "deltaAbsolute":  delta_token,
        "variation":      var,
    }


def _tokenize_detail(detail: dict, tok: TokenMap) -> dict:
    t_n   = tok.get_or_create(detail["fluxN"])
    t_nm1 = tok.get_or_create(detail["fluxNMinus1"])

    delta = detail["fluxN"] - detail["fluxNMinus1"]
    delta_sign = "+" if delta >= 0 else ""
    t_delta = tok.get_or_create(abs(delta))
    delta_token = f"{delta_sign}{t_delta}" if delta >= 0 else f"-{t_delta}"

    var = detail.get("variation", _calc_variation(detail["fluxN"], detail["fluxNMinus1"]))

    return {
        "codeANC":       detail["codeANC"],
        "codeIFRS":      detail["codeIFRS"],
        "description":   detail["description"],
        "fluxN":         t_n,
        "fluxNMinus1":   t_nm1,
        "deltaAbsolute": delta_token,
        "variation":     var,
        "unit":          detail["unit"],
    }


def _tokenize_kpi_full(kpi: dict, tok: TokenMap) -> dict:
    base = _tokenize_kpi_base(kpi, tok)
    base["details"] = [_tokenize_detail(d, tok) for d in kpi.get("details", [])]
    return base


# ── Format variants ────────────────────────────────────────────────────────

def _format_variants(value: float) -> list[str]:
    variants = set()
    v_int = int(value) if value == int(value) else value
    variants.add(str(v_int))
    variants.add(f"{v_int:,}".replace(",", " "))
    variants.add(f"{v_int:,}".replace(",", "\u202f"))
    variants.add(f"{v_int:,}")
    if value != int(value):
        variants.add(str(value))
        variants.add(f"{value:.2f}")
    return [v for v in variants if v]


# ── Re-tokenize previous analysis ─────────────────────────────────────────

def retokenize_previous_analysis(
    analysis_text: str,
    kpis_raw: list[dict],
    tok: TokenMap,
) -> str:
    import re as _re

    existing_tokens: list[str] = _re.findall(r'[+\-]?TOK_\d{4}', analysis_text)
    placeholders: dict[str, str] = {}
    protected_text = analysis_text
    for i, tok_str in enumerate(existing_tokens):
        ph = f"\x00PH{i:04d}\x00"
        placeholders[ph] = tok_str
        protected_text = protected_text.replace(tok_str, ph, 1)

    values_to_mask: list[tuple[str, str]] = []

    for k in kpis_raw:
        name = k["name"]
        for val, scope_suffix in [
            (k["currentAmount"],  "cur"),
            (k["previousAmount"], "prev"),
        ]:
            token = tok.get_or_create_scoped(val, f"{name}:{scope_suffix}")
            for fmt in _format_variants(val):
                values_to_mask.append((fmt, token))

        for d in k.get("details", []):
            for val in [d["fluxN"], d["fluxNMinus1"]]:
                token = tok.get_or_create(val)
                for fmt in _format_variants(val):
                    values_to_mask.append((fmt, token))

    values_to_mask.sort(key=lambda x: len(x[0]), reverse=True)

    text = protected_text
    for string_val, token in values_to_mask:
        escaped = _re.escape(string_val)
        # Ne remplacer que si le motif n'est pas précédé/suivi d'un chiffre
        pattern = r'(?<!\d)' + escaped + r'(?!\d)'
        text = _re.sub(pattern, token, text)

    for ph, tok_str in placeholders.items():
        text = text.replace(ph, tok_str)

    return text


# ── Public API ─────────────────────────────────────────────────────────────

def tokenize_payload(payload: dict) -> tuple[dict, dict[str, float]]:
    tok    = TokenMap()
    result = copy.deepcopy(payload)

    kpis_raw = payload.get("kpis", [])

    
    result["kpis"] = [_tokenize_kpi_base(k, tok) for k in kpis_raw]

    if payload.get("selectedKpi"):
        result["selectedKpi"] = _tokenize_kpi_full(payload["selectedKpi"], tok)

    if payload.get("mentionedKpisDetails"):
        result["mentionedKpisDetails"] = [
            _tokenize_kpi_full(k, tok) for k in payload["mentionedKpisDetails"]
        ]

    if payload.get("previousAnalysis"):
        result["previousAnalysis"] = retokenize_previous_analysis(
            payload["previousAnalysis"], kpis_raw, tok
        )

    result["financial_relations"] = _build_relations(kpis_raw, tok)

    return result, tok.to_dict()