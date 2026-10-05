import re
import json
import logging
import time
import os
import requests
from dataclasses import dataclass, field
from dotenv import load_dotenv

# ── Configuration ─────────────────────────────────────────────────────────
load_dotenv()

MODEL   = "meta-llama/llama-4-scout-17b-16e-instruct"
API_URL = "https://api.groq.com/openai/v1/chat/completions"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ── Typage fort ───────────────────────────────────────────────────────────
@dataclass
class KpiDetail:
    codeANC: str
    codeIFRS: str
    description: str
    fluxN: float
    fluxNMinus1: float
    unit: str
    variation: float = 0.0 


@dataclass
class Kpi:
    name: str
    currentAmount: float
    previousAmount: float
    unit: str
    variation: float
    details: list[KpiDetail] = field(default_factory=list)

    @staticmethod
    def from_dict(d: dict) -> "Kpi":
        return Kpi(
            name=d["name"],
            currentAmount=d["currentAmount"],
            previousAmount=d["previousAmount"],
            unit=d["unit"],
            variation=d["variation"],
            details=[KpiDetail(**det) for det in d.get("details", [])],
        )


@dataclass
class ClassificationResult:
    is_off_topic: bool = False
    is_structure_violation: bool = False
    structure_violation_reason: str = ""
    is_scope_too_broad: bool = False
    type: str = "correction"
    targeted_kpis: list[str] = field(default_factory=list)
    targeted_sections: list[str] = field(default_factory=list)

    @property
    def is_blocked(self) -> bool:
        return self.is_off_topic or self.is_structure_violation or self.is_scope_too_broad


# ── API Key ────────────────────────────────────────────────────────────────
def _get_api_key() -> str:
    key = os.getenv("API_KEY")
    if not key:
        raise EnvironmentError(
            "La variable d'environnement API_KEY est manquante ou vide. "
            "Vérifiez votre fichier .env."
        )
    return key


# ── HTTP helper with retry/backoff ────────────────────────────────────────
def _post_with_retry(
    payload: dict,
    stream: bool = False,
    timeout: int = 30,
    max_retries: int = 3,
):
    headers = {
        "Authorization": f"Bearer {_get_api_key()}",
        "Content-Type": "application/json",
    }

    for attempt in range(max_retries):
        try:
            response = requests.post(
                API_URL,
                headers=headers,
                json={**payload, "stream": stream},
                stream=stream,
                timeout=timeout,
            )
            if response.status_code in (429, 500, 502, 503, 504):
                wait = 2 ** attempt
                logger.warning(
                    "Groq API returned %s — retry %d/%d in %ds",
                    response.status_code, attempt + 1, max_retries, wait,
                )
                time.sleep(wait)
                continue
            return response

        except requests.exceptions.Timeout:
            logger.error("Request timed out (attempt %d/%d)", attempt + 1, max_retries)
            if attempt == max_retries - 1:
                raise
            time.sleep(2 ** attempt)

        except requests.exceptions.RequestException as exc:
            logger.error("Request error: %s", exc)
            raise

    raise RuntimeError(f"Groq API unavailable after {max_retries} retries")


# ── JSON parser robuste ───────────────────────────────────────────────────
def _parse_llm_json(raw: str) -> dict:
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Impossible de parser le JSON LLM. Contenu brut : {raw[:300]}")


# ── KPI Thresholds ────────────────────────────────────────────────────────
KPI_THRESHOLDS = {
    "Chiffre d'Affaires":        1.0,
    "Résultat Net":             10.0,
    "EBITDA":                    3.0,
    "Investissements":          15.0,
    "Effectifs Total":           2.0,
    "Trésorerie":                5.0,
    "Marge Brute":               2.0,
    "Dette Nette":               5.0,
    "Capitaux Propres Groupe":   5.0,
    "Endettement Net":          10.0,
    "Charges d'Intérêts":        3.0,
    "Chiffre d'Affaires Export": 5.0,
}

def get_threshold(kpi_name: str) -> float:
    return KPI_THRESHOLDS.get(kpi_name, 2.0)


# ── Prompt builder — Mode Global ──────────────────────────────────────────
def build_global_prompt(
    period: str,
    perimetre: str,
    kpis: list[dict],
    financial_relations: list[str] | None = None,
) -> str:
    lines = []
    for k in kpis:
        variation = k.get("variation") or 0.0 
        lines.append(
            f"- {k['name']} : {k['currentAmount']} {k['unit']} "
            f"(période précédente : {k['previousAmount']} {k['unit']}, "
            f"variation absolue : {k['deltaAbsolute']} {k['unit']}, "
            f"variation en % : {variation:+.2f}%)"
        )
    kpi_block = "\n".join(lines)
    kpi_count = len(kpis)

    relations_block = ""
    if financial_relations:
        relations_block = (
            "\nRELATIONS FINANCIÈRES STRUCTURELLES (calculées sur les données réelles) :\n"
            + "\n".join(f"  {r}" for r in financial_relations)
            + "\n"
        )

    return f"""Tu es un Directeur Administratif et Financier (DAF) senior mandaté pour rédiger une note de synthèse financière destinée au Comité de Direction (CODIR). Ton analyse doit être rigoureuse, factuelle, incisive, et immédiatement exploitable par un dirigeant.

NOTE TECHNIQUE : Les valeurs numériques sont représentées par des identifiants TOK_XXXX pour des raisons de confidentialité. Traite chaque TOK_XXXX comme la valeur numérique réelle qu'il représente. Les variations en % sont toujours en clair. Les relations financières ci-dessous sont calculées sur les données réelles et sont fiables.

═══════════════════════════════════════════
MISSION : Analyse financière globale — {kpi_count} KPIs
Période : {period} | Périmètre : {perimetre}
═══════════════════════════════════════════

DONNÉES :
{kpi_block}
{relations_block}
═══════════════════════════════════════════
BLOC A — CONTRÔLE DE COHÉRENCE OBLIGATOIRE
Exécuter AVANT toute analyse. Ne pas sauter cette étape.
═══════════════════════════════════════════
── GROUPE A1 : IMPOSSIBILITÉS MATHÉMATIQUES ABSOLUES ──
Ces cas sont toujours des erreurs. Si détectés → signaler comme ANOMALIE BLOQUANTE et ne pas interpréter le KPI concerné.

R01 : Marge Brute > CA → impossible. Taux de marge ne peut pas dépasser 100%.
R02 : CA Export > CA Total → impossible. La part ne peut pas dépasser le tout.
R03 : EBITDA > CA → impossible sauf erreur de périmètre. Signaler.
R04 : Résultat Net > EBITDA → impossible sans produits financiers exceptionnels majeurs. Signaler.
R05 : Charges Intérêts > Dette Nette → taux implicite supérieur à 100%, impossible. Signaler.
R06 : Trésorerie négative affichée comme positive → vérifier le signe. Signaler si incohérent.

── GROUPE A2 : SEUILS CRITIQUES CHIFFRÉS ──
Ces seuils doivent être vérifiés pour chaque KPI concerné et signalés dans les Points de Vigilance avec le niveau d'urgence exact.

R07 : Résultat Net < 0 → Critique absolu. Perte nette.
R08 : Trésorerie < 0 → Critique absolu. Découvert bancaire.
R09 : Trésorerie < (CA / 12) → Urgence. Moins d'un mois de CA en caisse.
R10 : Capitaux Propres < 0 → Critique absolu. Insolvabilité technique légale.
R11 : Capitaux Propres < (Dette Nette x 10%) → Bilan très fragile. A traiter rapidement.
R12 : EBITDA < 0 → Critique absolu. Destruction de valeur opérationnelle.
R13 : Dette Nette / EBITDA > 3x → Surendettement. A traiter rapidement.
R14 : Dette Nette / EBITDA > 5x → Seuil covenant bancaire. Critique.
R15 : Charges Intérêts / EBITDA > 30% → Pression financière forte. A traiter rapidement.
R16 : Charges Intérêts / EBITDA > 50% → Danger de solvabilité. Critique.
R17 : Endettement Net / Capitaux Propres > 1 → Effet ciseau. A traiter rapidement.
R18 : Endettement Net / Capitaux Propres > 2 → Critique.

── GROUPE A3 : INCOHÉRENCES INTER-KPIs ──
Ces contradictions logiques entre deux KPIs doivent être expliquées dans l'analyse, pas ignorées.

R19 : EBITDA en hausse + Résultat Net en baisse forte → chiffrer l'écart résiduel inexpliqué = EBITDA - Résultat Net - Charges Intérêts connues. Si écart résiduel > 20% de l'EBITDA → signaler comme charge non identifiée.
R20 : CA stable ou en baisse + Marge Brute en hausse forte → vérifier si changement de périmètre ou de définition. Signaler si l'écart est supérieur à 15 points.
R21 : CA en baisse + Effectifs en hausse → productivité en chute mécanique. Calculer et signaler la perte de productivité par ETP.
R22 : Trésorerie en hausse + Résultat Net négatif → le cash ne vient pas de l'exploitation. Identifier la source probable : cession d'actif, nouvelle dette, apport en capital.
R23 : Dette Nette en baisse + Endettement Net en hausse → définitions différentes ou périmètres différents. Expliquer l'écart obligatoirement.
R24 : Capex en baisse de plus de 70% + CA stable → risque de sous-investissement. Signaler comme signal structurel.
R25 : Capex en hausse forte + Trésorerie en baisse → vérifier le financement du Capex. Source identifiée ?
R26 : Charges Intérêts stables + Dette Nette en baisse forte → taux implicite en hausse. Anomalie ou renégociation à expliquer.
R27 : Capitaux Propres en baisse + Résultat Net positif → dividendes excessifs ou retraitement comptable. Signaler.
R28 : Endettement Net = 0 ou proche de zéro + Dette Nette > 0 → définitions incohérentes entre les deux KPIs. Signaler et ne pas interpréter l'Endettement Net sans réserve.
R29 : CA Export progresse fortement + CA Total stable → le marché domestique recule. Calculer et signaler la part implicite du marché domestique.
R30 : Effectifs en hausse + EBITDA en baisse → les charges de personnel absorbent la marge. Signaler comme pression structurelle sur la rentabilité.

── FORMAT DU RAPPORT DE COHÉRENCE ──
Si au moins une règle est déclenchée → ouvrir l'analyse par :

> **Note préliminaire sur la qualité des données**
> *[Liste des règles déclenchées avec le KPI concerné, la valeur observée, et le niveau : ANOMALIE BLOQUANTE / A traiter rapidement / A surveiller]*

Si aucune règle n'est déclenchée → ne pas mentionner ce bloc. Passer directement à la Synthèse Exécutive.

═══════════════════════════════════════════
BLOC B — RÉFÉRENTIEL MÉTIER PAR KPI
═══════════════════════════════════════════

Lire avant d'analyser chaque KPI :

- Chiffre d'Affaires : moteur commercial. Calculer la productivité implicite CA / ETP si les effectifs sont disponibles. Analyser la cohérence avec le CA Export.
- CA Export : calculer le ratio CA Export / CA Total. Si ratio > 100% → R02 déclenchée. Si ratio progresse → diversification géographique positive.
- Marge Brute : calculer le taux Marge Brute / CA. Si taux > 100% → R01 déclenchée. Analyser l'évolution du taux, pas seulement la valeur absolue.
- EBITDA : calculer le taux EBITDA / CA. Comparer à la Marge Brute pour évaluer le poids des charges d'exploitation hors coût des ventes.
- Résultat Net : calculer l'écart avec l'EBITDA. Identifier les composantes de l'écart : Charges Intérêts + amortissements estimés + éléments exceptionnels. Chiffrer le résiduel inexpliqué.
- Trésorerie : exprimer en mois de CA (Trésorerie / (CA / 12)). Vérifier R08 et R09.
- Dette Nette : calculer le ratio Dette Nette / EBITDA. Vérifier R13 et R14.
- Endettement Net : calculer le ratio Endettement Net / Capitaux Propres. Vérifier R17 et R18. Comparer à la Dette Nette pour vérifier R28.
- Capitaux Propres Groupe : vérifier R10 et R11. Analyser la cause de la variation : pertes, distributions, apports.
- Charges Intérêts : calculer le ratio Charges Intérêts / EBITDA. Vérifier R15 et R16. Relier à la variation de la Dette Nette.
- Investissements (Capex) : contextualiser selon la phase stratégique détectable dans les données. Vérifier R24 et R25. Relier à la variation de Trésorerie.
- Effectifs Total : calculer la productivité implicite CA / ETP. Vérifier R21 et R30.

═══════════════════════════════════════════
BLOC C — RÈGLES DE RÉDACTION ABSOLUES
═══════════════════════════════════════════

C1 — SYMBOLES INTERDITS :
Interdiction absolue du symbole triangle sous toute forme. Utiliser exclusivement : "variation absolue de", "en hausse de", "en baisse de", "écart de", "progression de", "recul de".

C2 — ANNÉES INTERDITES :
Ne jamais écrire d'année (2023, 2024, etc.). Toujours écrire "période actuelle" et "période précédente".

C3 — QUALITÉ D'ANALYSE :
Chaque KPI doit être interprété, pas seulement décrit. Interdiction des formules creuses : "la situation est contrastée", "les KPIs montrent des tendances variées", "certains indicateurs progressent". Ces formules n'ont aucune valeur analytique.

C4 — CONNEXIONS INTER-KPIs :
Minimum 3 connexions explicites dans l'analyse globale. Utiliser : "ce qui s'explique par", "en cohérence avec", "à mettre en regard de", "confirmé par", "ce qui implique".

C5 — RATIOS OBLIGATOIRES :
Calculer et mentionner dans l'analyse tous les ratios rendus possibles par les données disponibles parmi : taux de marge brute, taux EBITDA/CA, Dette Nette/EBITDA, Charges Intérêts/EBITDA, Endettement Net/Capitaux Propres, CA Export/CA, CA/ETP, Trésorerie en mois de CA.

═══════════════════════════════════════════
BLOC D — FORMAT MARKDOWN OBLIGATOIRE
═══════════════════════════════════════════


## Synthèse Exécutive

[FORMAT IMPÉRATIF : UN SEUL PARAGRAPHE EN PROSE CONTINUE. AUCUN TIRET, AUCUN BULLET, AUCUNE LISTE, AUCUN SAUT DE LIGNE ENTRE LES PHRASES.
Le paragraphe enchaîne dans l'ordre, en prose fluide :
Phrase 1 : Diagnostic en un mot ou expression (Solide / Fragilisée / En tension / En redressement / En dégradation) suivi du contexte général.
Phrase 2 : Les 2 signaux positifs majeurs avec les chiffres, reliés par "tandis que" ou "et".
Phrase 3 : Le signal d'alerte principal avec les chiffres.
Phrase 4 : La tendance structurelle sous-jacente.
Phrase 5 (si applicable) : Mention des anomalies détectées.
INTERDIT dans cette section : tirets "-", puces, numérotation, sous-titres, saut de ligne entre les phrases.]


## Performance Opérationnelle

- **[Nom KPI]** : [valeur période actuelle] [unité] contre [valeur période précédente] [unité] en période précédente (variation absolue de [signe][valeur] [unité], soit [variation]%). [Interprétation business en 2 à 3 phrases. Ratios calculés. Connexions inter-KPIs.]

[KPIs de cette section : CA, CA Export, Marge Brute, Effectifs Total]


## Rentabilité

- **[Nom KPI]** : [même structure]. [Écart EBITDA/Résultat Net obligatoirement chiffré et expliqué.]

[KPIs de cette section : EBITDA, Résultat Net, Charges Intérêts]


## Cash et Liquidité

- **[Nom KPI]** : [même structure]. [Trésorerie exprimée en mois de CA. Capex contextualisé.]

[KPIs de cette section : Trésorerie, Investissements]


## Structure Financière

- **[Nom KPI]** : [même structure]. [Triangle Dette Nette / Endettement Net / Capitaux Propres analysé.]

[KPIs de cette section : Capitaux Propres Groupe, Dette Nette, Endettement Net]


## Points de Vigilance

[Uniquement les KPIs avec signal préoccupant ou règle déclenchée.]

- **[Nom KPI]**
  - Nature : [Conjoncturel / Structurel / Donnée à vérifier]
  - Valeur actuelle : [X] — Seuil critique : [Y] — Règle déclenchée : [RXX]
  - Impact potentiel : [sur quels KPIs ou décisions]
  - Urgence : [A surveiller / A traiter rapidement / Critique]

  
## Recommandations Stratégiques

[2 à 4 recommandations. Chacune avec verbe d'action + KPI/levier + objectif mesurable + horizon temporel.]

- **[Verbe]** — [Levier] : [objectif + indicateur de suivi + horizon]


═══════════════════════════════════════════
BLOC E — CHECKLIST AVANT RÉDACTION
═══════════════════════════════════════════

Vérifier dans l'ordre avant d'écrire la première phrase :

[ ] E01 : Toutes les règles R01 à R30 ont été vérifiées sur les données
[ ] E02 : Les anomalies détectées sont listées dans la Note préliminaire
[ ] E03 : Tous les {kpi_count} KPIs sont couverts dans la bonne section
[ ] E04 : Aucun symbole triangle utilisé
[ ] E05 : Aucune année inventée
[ ] E06 : Chaque KPI contient valeur actuelle, valeur précédente, variation absolue en mots, variation en %
[ ] E07 : Chaque KPI est interprété avec au moins une connexion à un autre KPI
[ ] E08 : Tous les ratios possibles sont calculés
[ ] E09 : L'écart EBITDA / Résultat Net est chiffré et expliqué
[ ] E10 : La Trésorerie est exprimée en mois de CA
[ ] E11 : Points de Vigilance contiennent la règle déclenchée (RXX)
[ ] E12 : Recommandations : 2 à 4 maximum, toutes avec verbe d'action et horizon temporel
[ ] E13 : Titres respectent exactement ## et ### du format indiqué
[ ] E14 : Aucune formule creuse dans la Synthèse Exécutive
"""


# ── Prompt builder — Mode KPI Spécifique ──────────────────────────────────
def build_specific_kpi_prompt(
    period: str, perimetre: str, selected_kpi: dict, kpis: list[dict]
) -> str:
    kpi_name = selected_kpi['name']
    kpi_unit = selected_kpi['unit']
    variation_globale = selected_kpi['variation']

    threshold = get_threshold(kpi_name)

    positifs = [d for d in selected_kpi.get('details', []) if d['variation'] > threshold]
    negatifs = [d for d in selected_kpi.get('details', []) if d['variation'] < -threshold]
    stables  = [d for d in selected_kpi.get('details', []) if -threshold <= d['variation'] <= threshold]

    def fmt_detail(d: dict) -> str:
        return (
            f" · [{d['codeANC']} | {d['codeIFRS']}] {d['description']}\n"
            f"   N = {d['fluxN']} {d['unit']} | N-1 = {d['fluxNMinus1']} {d['unit']} "
            f"| Δ = {d['deltaAbsolute']} {d['unit']} ({d['variation']:+.2f}%)"
        )

    pos_block    = "\n".join(fmt_detail(d) for d in positifs) if positifs else " (aucun)"
    neg_block    = "\n".join(fmt_detail(d) for d in negatifs) if negatifs else " (aucun)"
    stable_block = "\n".join(fmt_detail(d) for d in stables)  if stables  else " (aucun)"

    global_lines = [
        f"- {k['name']} : {k['currentAmount']} {k['unit']} "
        f"(N-1 : {k['previousAmount']} {k['unit']}, variation : {k['variation']:+.2f}%)"
        for k in kpis
        if k['name'] != kpi_name
    ]
    global_block = "\n".join(global_lines)
    tendance = "en hausse" if variation_globale > 0 else ("stable" if variation_globale == 0 else "en baisse")

    return f"""Tu es un Directeur Administratif et Financier senior (DAF) qui produit une note d'analyse interne destinée au Comité de Direction.

MISSION : Analyse approfondie du KPI "{kpi_name}"
Période : {period} | Périmètre : {perimetre}

DONNÉES DU KPI :
- Valeur période actuelle (N) : {selected_kpi['currentAmount']} {kpi_unit}
- Valeur période précédente (N-1) : {selected_kpi['previousAmount']} {kpi_unit}
- Variation globale : {variation_globale:+.2f}% ({tendance})
- Seuil de significativité appliqué : ±{threshold}%

COMPOSANTES — CONTRIBUTEURS POSITIFS (variation > +{threshold}%) :
{pos_block}

COMPOSANTES — CONTRIBUTEURS NÉGATIFS (variation < -{threshold}%) :
{neg_block}

COMPOSANTES — ÉLÉMENTS STABLES (variation entre -{threshold}% et +{threshold}%) :
{stable_block}

CONTEXTE FINANCIER GLOBAL (autres indicateurs) :
{global_block}

INSTRUCTIONS D'ANALYSE — LIS ATTENTIVEMENT AVANT DE RÉDIGER

**SECTION 1 — Synthèse**

Répondre en 3 phrases précises :
- Phrase 1 : état du KPI "{kpi_name}" (variation globale, niveau période actuelle vs période précédente, en chiffres)
- Phrase 2 : interprétation métier — quel mécanisme explique ce chiffre ? (pas juste "a augmenté")
- Phrase 3 : enjeu business — ce que ça implique concrètement pour la direction

**SECTION 2 — Analyse des Composantes**
C'est le CŒUR de l'analyse. Pour chaque composante de la matrice :
- Cite la ligne par son libellé métier (pas le code comptable)
- Donne N, N-1 et la variation en Δ absolu ET en %
- Qualifie l'impact : Fort | Modéré | Faible
- Explique la CAUSE métier probable (pas juste constater)
- Distingue : effet structurel (tendance de fond) vs ponctuel (événement one-shot)
Organise en 3 sous-sections :
- "Moteurs de croissance" (variation > +{threshold}%)
- "Freins identifiés" (variation < -{threshold}%)
- "Éléments neutres / stables" (variation entre -{threshold}% et +{threshold}%)

**SECTION 3 — Points Positifs**
2 à 3 insights actionnables extraits de l'analyse.
Formulés comme des conclusions pour un dirigeant, pas comme des descriptions.

**SECTION 4 — Signaux d'Alerte**
2 à 3 risques identifiés, avec pour chacun :
- La nature du risque (conjoncturel ou structurel)
- L'impact potentiel sur d'autres KPIs
- Le niveau d'urgence (À surveiller / À traiter rapidement / Critique)

**SECTION 5 — Mise en Perspective**
Connecter "{kpi_name}" avec au moins 2 autres KPIs du contexte global.

**SECTION 6 — Recommandations**
3 recommandations maximum, formulées avec un verbe d'action.
Ton : conseiller s'adressant au dirigeant. Pas d'auditeur, pas de compliance.

FORMAT MARKDOWN OBLIGATOIRE — NE PAS DÉVIER


## Synthèse

[paragraphe de 3 phrases]


## Analyse des Composantes

### Moteurs de croissance
- **[Libellé]** : [ — N = X {kpi_unit} | N-1 = Y {kpi_unit} | Variation = +Z {kpi_unit} (+X.XX%) — Impact : 🟢 Fort — ] — [Explication métier. Effet structurel / ponctuel.]

### Freins identifiés
- **[Libellé]** : [ — N = X {kpi_unit} | N-1 = Y {kpi_unit} | Variation = -Z {kpi_unit} (-X.XX%) — Impact : 🟡 Modéré — ] — [Explication métier. Effet structurel / ponctuel.]

### Éléments neutres / stables
- **[Libellé]** : [ — N = X {kpi_unit} | N-1 = Y {kpi_unit} | Variation = ~0 — Impact : 🔴 Faible — ] — [Commentaire synthétique.]

## Points Positifs
- **[Point 1*]** — Nature : [Insight 1 formulé côté business impact]
- **[Point 2*]** — Nature : [Insight 2]

## Signaux d'Alerte
- **[Risque 1]** — Nature : [conjoncturel/structurel] — Impact potentiel : [description] — Urgence : [niveau]
- **[Risque 2]** — Nature : [conjoncturel/structurel] — Impact potentiel : [description] — Urgence : [niveau]

## Mise en Perspective
- **[Mise en Perspective 1]** : Lien avec un autre KPI (lecture cohérente)
- **[Mise en Perspective 2]** : Interprétation globale

## Recommandations
- **[Recommandation 1]** : [Action 1 avec verbe + objectif]
- **[Recommandation 2]** : [Action 2 avec verbe + objectif]
- **[Recommandation 3]** : [Action 3 optionnelle]


RÈGLES ABSOLUES
1. JAMAIS d'année inventée.
   - Pour les KPIs : utiliser "Période actuelle" / "Période précédente"
   - Pour les détails et analyses : utiliser "N" / "N-1"
2. Titres EXACTEMENT au format indiqué.
3. Gras ** uniquement sur les libellés métier.
4. Chaque ligne de la matrice dans une des 3 sous-sections.
5. Ne JAMAIS reproduire les codes ANC/IFRS dans le texte final.
6. Si une sous-section est vide, écrire **[AUCUN]** : Aucun élément significatif.
7. Utiliser TOUJOURS le tiret - pour les items bullet. Ne JAMAIS utiliser > (blockquote).

"""


# ── Helpers ────────────────────────────────────────────────────────────────

def _extract_structure(analysis: str) -> dict:
    sections = re.findall(r'^#{2,3} .+', analysis, re.MULTILINE)
    known_kpi_names = set(KPI_THRESHOLDS.keys())
    all_bold = re.findall(r'\*\*([^*]+)\*\*', analysis)
    seen = set()
    unique_kpis = []
    for k in all_bold:
        k_stripped = k.strip()
        if k_stripped in known_kpi_names and k_stripped not in seen:
            seen.add(k_stripped)
            unique_kpis.append(k_stripped)
    return {"sections": sections, "kpi_names": unique_kpis}


def _llm_classify_instruction(instruction: str, kpi_names: list[str], section_titles: list[str]) -> dict:
    kpi_list_str     = ", ".join(f'"{k}"' for k in kpi_names)
    section_list_str = ", ".join(f'"{s}"' for s in section_titles)

    classification_prompt = f"""Tu es un classificateur strict pour un système d'analyse financière professionnelle.

Tu reçois une instruction d'un utilisateur qui souhaite modifier une analyse financière existante.

KPIs présents dans l'analyse : {kpi_list_str}
Sections présentes dans l'analyse : {section_list_str}

INSTRUCTION DE L'UTILISATEUR :
"{instruction}"

Ta tâche : analyser cette instruction et répondre UNIQUEMENT en JSON valide, sans aucun texte avant ou après.

━━━ RÈGLES DE CLASSIFICATION ━━━

1. "is_off_topic" = true SI l'instruction n'a AUCUN lien avec :
   - La modification, l'amélioration, la reformulation ou la correction de l'analyse financière
   - Les KPIs financiers listés ci-dessus
   - Le contenu, le ton, la structure ou le wording du document financier
   Exemples hors-sujet : salutations, blagues, météo, politique, sport, cuisine, religion.
   Exemples dans le sujet : "développe le CA", "reformule en anglais", "le résultat net est faux".

2. "is_structure_violation" = true SI l'instruction demande EXPLICITEMENT ou IMPLICITEMENT :
   - D'ajouter une nouvelle section (ex: "ajoute une section sur les risques", "crée une partie synthèse")
   - De supprimer une section existante (ex: "enlève la partie X", "supprime la section Y")
   - De renommer une section (ex: "appelle ça 'Résumé exécutif' plutôt")
   - De fusionner deux sections (ex: "regroupe X et Y ensemble")
   - De réorganiser l'ordre des sections (ex: "mets la conclusion en premier")
   - De créer un nouveau document / une nouvelle analyse from scratch
   Si true, renseigne "structure_violation_reason" avec une explication courte (max 15 mots).

3. "is_scope_too_broad" = true SI l'instruction demande de modifier des éléments SANS RAPPORT entre eux
   dans une seule instruction (ex: "change le ton ET corrige le résultat net ET ajoute des détails sur l'EBITDA").
   Une instruction globale de reformulation (ex: "traduis en anglais", "rends plus concis") n'est PAS trop large.

4. "type" (si is_off_topic = false ET is_structure_violation = false) :
   - "enrichissement" : l'utilisateur veut plus de détails, d'explications ou de développement sur un KPI
   - "wording" : l'utilisateur veut changer le ton, la langue, la longueur ou le registre du texte
   - "correction" : l'utilisateur veut corriger, modifier ou ajuster un élément précis

5. "targeted_kpis" : liste des KPIs de l'analyse explicitement mentionnés dans l'instruction.
   Ne mettre que les KPIs qui figurent exactement dans la liste fournie.
   Si aucun KPI précis n'est mentionné, retourner [].

6. "targeted_sections" : liste des TITRES DE SECTIONS de l'analyse explicitement mentionnés ou visés.
   Ne mettre que les titres qui figurent exactement dans la liste fournie.
   Si aucune section précise n'est mentionnée, retourner [].

Réponds UNIQUEMENT avec ce JSON (rien d'autre) :
{{
  "is_off_topic": true ou false,
  "is_structure_violation": true ou false,
  "structure_violation_reason": "..." ou null,
  "is_scope_too_broad": true ou false,
  "type": "enrichissement" ou "wording" ou "correction" ou null,
  "targeted_kpis": [],
  "targeted_sections": []
}}"""

    try:
        response = _post_with_retry(
            payload={
                "model": MODEL,
                "messages": [{"role": "user", "content": classification_prompt}],
                "temperature": 0.0,
                "max_tokens": 200,
            },
            stream=False,
            timeout=10,
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"].strip()
        result = _parse_llm_json(raw)
        return {
            "is_off_topic":               bool(result.get("is_off_topic", False)),
            "is_structure_violation":     bool(result.get("is_structure_violation", False)),
            "structure_violation_reason": result.get("structure_violation_reason") or "",
            "is_scope_too_broad":         bool(result.get("is_scope_too_broad", False)),
            "type":                       result.get("type") or "correction",
            "targeted_kpis":              result.get("targeted_kpis", []),
            "targeted_sections":          result.get("targeted_sections", []),
        }
    except (requests.exceptions.RequestException, ValueError, KeyError) as exc:
        logger.error("Classification LLM failed (%s) — defaulting to safe 'correction'", exc)
        return {
            "is_off_topic":               False,
            "is_structure_violation":     False,
            "structure_violation_reason": "",
            "is_scope_too_broad":         False,
            "type":                       "correction",
            "targeted_kpis":              [],
            "targeted_sections":          [],
        }


def _format_kpi_reference(kpi: dict) -> str:

    lines = [
        f"► {kpi['name']}",
        f"  N : {kpi['currentAmount']} {kpi['unit']} | "
        f"N-1 : {kpi['previousAmount']} {kpi['unit']} | "
        f"Δ = {kpi['deltaAbsolute']} {kpi['unit']} | "
        f"Variation : {kpi['variation']:+.2f}%",
    ]
    if kpi.get('details'):
        lines.append("  Composantes :")
        for d in kpi['details']:
            lines.append(
                f"    · {d['description']} : "
                f"N = {d['fluxN']} {d['unit']}, "
                f"N-1 = {d['fluxNMinus1']} {d['unit']}, "
                f"Δ = {d['deltaAbsolute']} {d['unit']} ({d['variation']:+.2f}%)"
            )
    return "\n".join(lines)


# ── Refinement prompt builder ──────────────────────────────────────────────

def build_refinement_prompt(
    period: str,
    perimetre: str,
    selected_kpi: dict | None,
    kpis: list[dict],
    previous_analysis: str,
    refinement_prompt: str,
    mentioned_kpis_details: list[dict],
) -> tuple[str, dict]:

    structure      = _extract_structure(previous_analysis)
    exact_sections = structure["sections"]
    exact_kpis     = structure["kpi_names"]

    sections_list = "\n".join(f'  "{s}"' for s in exact_sections)
    kpis_list     = "\n".join(f'  "{k}"' for k in exact_kpis)

    classification = _llm_classify_instruction(refinement_prompt, exact_kpis, exact_sections)

    is_off_topic           = classification["is_off_topic"]
    is_structure_violation = classification["is_structure_violation"]
    is_scope_too_broad     = classification["is_scope_too_broad"]
    inst_type              = classification["type"]
    targeted_kpis          = classification["targeted_kpis"]
    targeted_sections      = classification["targeted_sections"]

    def _blocked_reason() -> str:
        if is_off_topic:
            return (
                "L'instruction reçue ne concerne pas l'analyse financière fournie.\n"
                "Raison du blocage : instruction hors-sujet."
            )
        if is_structure_violation:
            reason = classification.get("structure_violation_reason", "modification de structure détectée")
            return (
                f"L'instruction tente de modifier la structure du document ({reason}).\n"
                "Raison du blocage : la structure de l'analyse est figée et ne peut pas être modifiée.\n"
                "Seul le contenu textuel des sections existantes peut être ajusté."
            )
        if is_scope_too_broad:
            return (
                "L'instruction demande trop de modifications non liées en une seule fois.\n"
                "Raison du blocage : portée trop large.\n"
                "Merci de soumettre une instruction ciblée (un KPI, une section, ou un type de transformation à la fois)."
            )
        return ""

    if is_off_topic or is_structure_violation or is_scope_too_broad:
        blocked_prompt = f"""Tu es un assistant financier strict.

{_blocked_reason()}

RÈGLE ABSOLUE : Retourne le texte ci-dessous EXACTEMENT tel quel, sans aucune modification, sans commentaire, sans note explicative. Commence directement par le premier titre.

{previous_analysis}"""
        return blocked_prompt, classification

    reference_block = ""
    if mentioned_kpis_details:
        ref_parts = [_format_kpi_reference(k) for k in mentioned_kpis_details]
        reference_block = (
            "\n\nDONNÉES DE RÉFÉRENCE POUR ENRICHISSEMENT :\n"
            "(Utiliser ces chiffres dans la prose analytique — NE PAS copier les libellés bruts, "
            "NE PAS créer de listes ou tableaux à partir de ces données)\n\n"
            + "\n\n".join(ref_parts)
        )

    mode_label = f"KPI spécifique ({selected_kpi['name']})" if selected_kpi else "Analyse globale"

    if targeted_kpis:
        targeted_kpis_str = ", ".join(f'"{k}"' for k in targeted_kpis)
        scope_kpi_directive = (
            f"PÉRIMÈTRE KPI — Modification autorisée UNIQUEMENT sur : {targeted_kpis_str}\n\n"
            "    Tous les autres KPIs non ciblés dans ta réponse restent IDENTIQUES mot pour mot à l'analyse existante."
        )
    else:
        scope_kpi_directive = "PÉRIMÈTRE KPI — Instruction globale. Applique uniformément sans cibler un KPI spécifique."

    if targeted_sections:
        targeted_sections_str = ", ".join(f'"{s}"' for s in targeted_sections)
        scope_section_directive = (
            f"PÉRIMÈTRE SECTION — Modification autorisée UNIQUEMENT dans : {targeted_sections_str}\n\n"
            "Toutes les autres sections non ciblées dans ta réponse restent IDENTIQUES mot pour mot à l'analyse existante."
        )
    else:
        scope_section_directive = "PÉRIMÈTRE SECTION — Aucune section précise ciblée. Applique uniformément si instruction globale."

    if inst_type == "enrichissement":
        type_directive = f"""TYPE D'INSTRUCTION : ENRICHISSEMENT

Pour chaque KPI ciblé ({', '.join(targeted_kpis) if targeted_kpis else 'tous'}) :
1. Localise l'item bullet correspondant dans l'analyse existante
2. Remplace cet item bullet par un PARAGRAPHE EN PROSE de 4 à 6 phrases
3. Ce paragraphe doit :
   - Intégrer naturellement les valeurs N et N-1 dans la phrase (jamais en liste)
   - Expliquer le mécanisme métier (pas juste constater la variation)
   - Distinguer effet structurel vs ponctuel
   - Relier à au moins un autre KPI si pertinent
   - Utiliser les données de référence fournies si disponibles
4. JAMAIS de sous-liste, tableau, ou liste imbriquée dans un enrichissement
5. Les codes ANC/IFRS ne doivent JAMAIS apparaître dans le texte final"""

    elif inst_type == "wording":
        type_directive = """TYPE D'INSTRUCTION : REFORMULATION / TON

Appliquer la transformation de registre UNIFORMÉMENT sur les sections autorisées :
- Ne pas toucher aux chiffres (valeurs N, N-1, variations)
- Ne pas modifier la structure (sections, ordre, titres)
- Ne pas ajouter ni supprimer d'information
- Appliquer le nouveau registre sur TOUTES les sections ciblées"""

    else:  # correction
        type_directive = """TYPE D'INSTRUCTION : CORRECTION / MODIFICATION CIBLÉE

Appliquer uniquement la correction demandée :
- Ne modifier QUE ce qui est explicitement demandé
- Laisser tout le reste identique mot pour mot
- Si la demande est ambiguë, faire la modification minimale possible
- Ne pas "améliorer" des parties non concernées par l'instruction"""

    prompt = f"""Tu es un conseiller financier expert. Tu dois modifier une analyse financière professionnelle selon des règles de contrôle strictes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Période : {period} | Périmètre : {perimetre}
Mode d'analyse : {mode_label}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRUCTURE OFFICIELLE DE L'ANALYSE — IMMUABLE ET DÉFINITIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
La structure ci-dessous est FIGÉE. Elle représente le squelette intouchable du document.

Tu NE PEUX PAS :
  ✗ Ajouter une section (même si l'instruction le demande)
  ✗ Supprimer une section (même si l'instruction le demande)
  ✗ Renommer un titre de section (même légèrement, même pour "améliorer")
  ✗ Changer l'ordre des sections
  ✗ Fusionner deux sections
  ✗ Créer une sous-section qui n'existe pas dans la liste ci-dessous

SECTIONS AUTORISÉES (exactement ces titres, dans cet ordre) :
{sections_list}

KPIs PRÉSENTS DANS L'ANALYSE :
{kpis_list}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANALYSE EXISTANTE À MODIFIER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{previous_analysis}
{reference_block}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUCTION DE RAFFINEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{refinement_prompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PÉRIMÈTRE AUTORISÉ DE MODIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{scope_kpi_directive}

{scope_section_directive}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{type_directive}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERDICTIONS ABSOLUES — VIOLATION = RÉPONSE INVALIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 ✗ STRUCTURE (INTERDIT MÊME SI L'INSTRUCTION LE DEMANDE) :
  - Créer une section inexistante dans la liste officielle
  - Supprimer une section existante
  - Renommer un titre de section (même légèrement)
  - Changer l'ordre des sections
  - Fusionner deux sections
  - Ajouter une introduction ou conclusion globale hors des sections existantes

 ✗ CONTENU :
  - Modifier un KPI non mentionné dans l'instruction (si l'instruction cible des KPIs précis)
  - Modifier une section non mentionnée dans l'instruction (si l'instruction cible des sections précises)
  - Inventer une année (utiliser uniquement "N", "N-1", "période actuelle", "période précédente")
  - Reproduire les codes ANC ou IFRS dans le texte final
  - Ajouter des informations qui ne proviennent pas des données fournies
  - Supprimer des valeurs chiffrées existantes (N, N-1, Δ, %)

 ✗ FORMAT :
  - Utiliser > (blockquote) pour les items
  - Créer des listes imbriquées dans une analyse globale
  - Changer le formatage Markdown (## → ###, ** → *, etc.)
  - Ajouter une note ou commentaire en dehors du document (ex: "Voici la version modifiée...")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VÉRIFICATION OBLIGATOIRE AVANT DE RÉPONDRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Avant de produire ta réponse, vérifie mentalement :
[ ] Le nombre de sections ## et ### est IDENTIQUE à l'analyse originale ({len(exact_sections)} sections)
[ ] Les titres des sections sont mot pour mot identiques à la liste officielle
[ ] Seuls les KPIs/sections ciblés ont été modifiés
[ ] Aucun code ANC/IFRS n'apparaît dans le texte
[ ] Aucune année réelle n'a été inventée
[ ] Le document commence directement par le premier titre ## (pas de phrase introductive)
[ ] Aucune section n'a été ajoutée, même si l'instruction le demandait

Produis uniquement le document complet mis à jour, en commençant directement par le premier titre de section. Aucune phrase d'introduction, aucun commentaire en dehors du document."""

    return prompt, classification


# ── Stream function ────────────────────────────────────────────────────────

def _stream_from_prompt(prompt: str):
    response = _post_with_retry(
        payload={
            "model": MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 8000,
        },
        stream=True,
        timeout=30,
    )
    response.raise_for_status()

    for line in response.iter_lines():
        if not line:
            continue
        decoded = line.decode("utf-8")
        if decoded.startswith("data: "):
            chunk = decoded[6:]
            if chunk == "[DONE]":
                yield "data: [DONE]\n\n"
                return
            try:
                delta = json.loads(chunk)["choices"][0]["delta"].get("content", "")
                if delta:
                    yield f"data: {delta}\n\n"
            except (json.JSONDecodeError, KeyError):
                continue


# ── Entry point ────────────────────────────────────────────────────────────

def generate_kpi_analysis_stream(
    period: str,
    perimetre: str,
    kpis: list[dict],
    selected_kpi: dict | None = None,
    refinement_prompt: str | None = None,
    previous_analysis: str | None = None,
    mentioned_kpis_details: list[dict] | None = None,
    financial_relations: list[str] | None = None,
):
    mentioned = mentioned_kpis_details or []

    logger.info("generate_kpi_analysis_stream — %d KPIs reçus (pré-tokenisés)", len(kpis))

    # ── Dispatch vers le bon mode ─────────────────────────────────────────
    if refinement_prompt and previous_analysis:
        prompt, classification = build_refinement_prompt(
            period=period,
            perimetre=perimetre,
            selected_kpi=selected_kpi,
            kpis=kpis,
            previous_analysis=previous_analysis,
            refinement_prompt=refinement_prompt,
            mentioned_kpis_details=mentioned,
        )
        yield from _stream_from_prompt(prompt)

    elif selected_kpi:
        prompt = build_specific_kpi_prompt(
            period=period,
            perimetre=perimetre,
            selected_kpi=selected_kpi,
            kpis=kpis,
        )
        yield from _stream_from_prompt(prompt)

    else:
        prompt = build_global_prompt(
            period=period,
            perimetre=perimetre,
            kpis=kpis,
            financial_relations=financial_relations,
        )
        yield from _stream_from_prompt(prompt)