"""Conservative suggestions from explicit OCR labels; always require review."""

import re


NAME_LABEL = r"(?:nombres?\s+y\s+apellidos|apellidos\s+y\s+nombres|nombre(?:s)?(?:\s+(?:completo|del\s+paciente))?|paciente)"
ID_LABEL = r"(?:c[eé]dula(?:\s+de\s+(?:identidad|ciudadan[ií]a))?|c\.?\s*i\.?)"
OTHER_LABEL = r"(?:fecha|edad|tel[eé]fono|celular|direcci[oó]n|orden|doctor|profesional|observaciones)"
ALL_LABELS = f"(?:{NAME_LABEL}|{ID_LABEL}|{OTHER_LABEL})"
LABEL_BOUNDARY = re.compile(rf"\s+{ALL_LABELS}\s*(?:[:=]|\s{{2,}})", re.IGNORECASE)


def labeled_values(text, label):
    pattern = re.compile(rf"(?<!\w){label}\s*(?:n[º°o]?\.?\s*)?[:=]\s*([^\r\n]*)", re.IGNORECASE)
    for match in pattern.finditer(text):
        value = LABEL_BOUNDARY.split(match.group(1), maxsplit=1)[0]
        value = value.split("|", 1)[0].strip()
        if value and not re.match(rf"{ALL_LABELS}\s*[:=]", value, re.IGNORECASE):
            yield value


def extract_fields(text):
    if not isinstance(text, str):
        raise TypeError("OCR text must be a string")

    names = []
    ids = []
    warnings = []
    for value in labeled_values(text, NAME_LABEL):
        name = " ".join(value.split()).strip(" .-")
        if len(name) <= 160 and sum(char.isalpha() for char in name) >= 3 and not any(char.isdigit() for char in name):
            if name.casefold() not in [existing.casefold() for existing in names]:
                names.append(name)

    for value in labeled_values(text, ID_LABEL):
        digits = re.sub(r"[\s.-]", "", value)
        if re.fullmatch(r"[0-9]{10}", digits):
            if digits not in ids:
                ids.append(digits)
        else:
            warnings.append("La cédula detectada necesita revisión de formato.")

    if len(names) != 1:
        warnings.append("Nombre ausente o ambiguo; completa el campo manualmente.")
    if len(ids) != 1:
        warnings.append("Cédula ausente o ambigua; completa el campo manualmente.")
    return {
        "name": names[0] if len(names) == 1 else None,
        "cedula": ids[0] if len(ids) == 1 else None,
        "review_required": True,
        "extraction": {
            "name_candidates": names,
            "cedula_candidates": ids,
            "warnings": list(dict.fromkeys(warnings)),
            "parser_version": "1",
        },
    }
