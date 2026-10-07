from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.fonts import addMapping
from reportlab.pdfgen import canvas
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, KeepTogether, PageBreak, CondPageBreak)

F = "/home/claude/fonts/"
pdfmetrics.registerFont(TTFont("Plex", F + "IBMPlexSans-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Plex-SemiBold", F + "IBMPlexSans-SemiBold.ttf"))
pdfmetrics.registerFont(TTFont("Plex-Italic", F + "IBMPlexSans-Italic.ttf"))
pdfmetrics.registerFont(TTFont("PlexMono", F + "IBMPlexMono-Regular.ttf"))
pdfmetrics.registerFont(TTFont("PlexMono-Medium", F + "IBMPlexMono-Medium.ttf"))
addMapping("Plex", 0, 0, "Plex")
addMapping("Plex", 1, 0, "Plex-SemiBold")
addMapping("Plex", 0, 1, "Plex-Italic")
addMapping("Plex", 1, 1, "Plex-SemiBold")
addMapping("PlexMono", 0, 0, "PlexMono")
addMapping("PlexMono", 1, 0, "PlexMono-Medium")
addMapping("PlexMono", 0, 1, "PlexMono")
addMapping("PlexMono", 1, 1, "PlexMono-Medium")

INK = colors.HexColor("#15171C")
MUTED = colors.HexColor("#4A4F5A")
RULE = colors.HexColor("#D5D9E0")
PANEL = colors.HexColor("#F3F5F8")
ACCENT = colors.HexColor("#1E4FD8")
WARN_BG = colors.HexColor("#FBEEDF")
WARN_INK = colors.HexColor("#7A3306")
WARN_LINE = colors.HexColor("#E3C29C")

PAGE_W, PAGE_H = A4
LM = RM = 50
TM, BM = 64, 66
CW = PAGE_W - LM - RM

TEMPLATE_VERSION = "Template v1.0 · schema deflow-evidence/1.0"

def S(name, **kw):
    base = dict(fontName="Plex", fontSize=9, leading=13, textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)

st = {
    "title": S("title", fontName="Plex-SemiBold", fontSize=24, leading=28),
    "subtitle": S("subtitle", fontSize=10.5, leading=15, textColor=MUTED),
    "h2": S("h2", fontName="Plex-SemiBold", fontSize=12.5, leading=16),
    "label": S("label", fontName="PlexMono-Medium", fontSize=7.5, leading=10, textColor=ACCENT),
    "small": S("small", fontSize=8, leading=11, textColor=MUTED),
    "smallmono": S("smallmono", fontName="PlexMono", fontSize=7.5, leading=10.5, textColor=MUTED),
    "body": S("body", fontSize=9, leading=13),
    "field": S("field", fontSize=8.5, leading=12, textColor=MUTED),
    "value": S("value", fontSize=8.5, leading=12),
    "valuesm": S("valuesm", fontSize=7.8, leading=11),
    "src": S("src", fontName="PlexMono", fontSize=7, leading=12, textColor=MUTED),
    "th": S("th", fontName="PlexMono-Medium", fontSize=7.5, leading=10, textColor=MUTED),
    "big": S("big", fontName="PlexMono-Medium", fontSize=13, leading=17, textColor=ACCENT),
    "note": S("note", fontSize=8, leading=11.5, textColor=INK),
    "warn": S("warn", fontSize=8.5, leading=12, textColor=WARN_INK),
    "matrix": S("matrix", fontSize=8, leading=11),
}

def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def ph(path):
    """Placeholder bound to a JSON path."""
    return f'<font name="PlexMono" color="#1E4FD8">{{{{{esc(path)}}}}}</font>'

def enum(*vals):
    return '<font name="PlexMono" color="#4A4F5A" size="7.5">' + " · ".join(esc(v) for v in vals) + "</font>"

def P(text, style="body"):
    return Paragraph(text, style if isinstance(style, ParagraphStyle) else st[style])

# ---------------------------------------------------------------- page furniture
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self.draw_furniture(total)
            super().showPage()
        super().save()

    def draw_furniture(self, total):
        n = self._pageNumber
        # header
        self.setFont("PlexMono-Medium", 7.5)
        self.setFillColor(INK)
        self.setFillColor(ACCENT)
        self.rect(LM, PAGE_H - 41.5, 6.5, 6.5, stroke=0, fill=1)
        self.setFillColor(INK)
        self.drawString(LM + 11, PAGE_H - 41, "DEFLOW · EVIDENCE PACK · PAYMENT PASSPORT")
        self.setFont("PlexMono", 7.5)
        self.setFillColor(MUTED)
        self.drawRightString(PAGE_W - RM, PAGE_H - 41, TEMPLATE_VERSION)
        self.setStrokeColor(RULE)
        self.setLineWidth(0.7)
        self.line(LM, PAGE_H - 49, PAGE_W - RM, PAGE_H - 49)
        # footer
        self.line(LM, 50, PAGE_W - RM, 50)
        self.setFont("PlexMono", 7.5)
        self.setFillColor(MUTED)
        self.drawString(LM, 39, "Profile {{profile}} · Pack {{pack_id}}")
        self.drawRightString(PAGE_W - RM, 39, f"Page {n} of {total}")
        self.setFont("Plex", 7)
        self.drawString(LM, 28, "Rendering of the signed JSON {{integrity.json_filename}}; if they differ, the JSON prevails. "
                                "Not a certification that funds are legitimate.")


# ---------------------------------------------------------------- building blocks
def source_tag(s):
    return Paragraph(esc(s), st["src"])

def field_table(rows, widths=(140, CW - 140 - 62, 62)):
    data = []
    for r in rows:
        label, value, src = r
        row = [P(label, "field"), P(value, "value")]
        if len(widths) == 3:
            row.append(source_tag(src))
        data.append(row)
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.6, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (-1, 0), (-1, -1), 0),
        ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
    ]))
    return t

def grid_table(header, rows, widths, align_right_cols=()):
    data = [[P(esc(h), "th") for h in header]]
    for r in rows:
        data.append([c if not isinstance(c, str) else P(c, "value") for c in r])
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.9, INK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.6, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]
    for c in align_right_cols:
        style.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
    t.setStyle(TableStyle(style))
    return t

def rule_box(text, label="RENDERING RULE"):
    inner = [P(label, "label"), P(text, "note")]
    t = Table([[inner]], colWidths=[CW])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#8A909C"), None, (2.5, 2)),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t

def panel(flowables, bg=PANEL, line=None):
    t = Table([[flowables]], colWidths=[CW])
    s = [("BACKGROUND", (0, 0), (-1, -1), bg),
         ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
         ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]
    if line:
        s.append(("BOX", (0, 0), (-1, -1), 0.8, line))
    t.setStyle(TableStyle(s))
    return t

PROFILES = ["Off-ramp", "Bank", "FIU / supervisor", "Auditor"]
DISCLOSURE = {
    "Summary": ["Full", "Full", "Full", "Full"],
    "A": ["Full", "Full", "Full", "Full"],
    "B": ["Name and country; rest on request", "Withheld; on request", "Full", "Pseudonymised"],
    "C": ["Method, result, signature", "Result only", "Full", "Full"],
    "D": ["Risk level and categories", "Risk level and categories", "Full + raw reference", "Full + raw hash"],
    "E": ["Result, lists and versions", "Result, lists and versions", "Full, incl. alert analysis", "Full"],
    "F": ["Result only", "Result only", "Full", "Full"],
    "G": ["Full", "Full", "Full", "Full"],
    "H": ["Version and hash", "Version and hash", "Full", "Full + replay"],
    "I": ["On-chain statuses only", "On-chain statuses only", "Full", "Full"],
    "J": ["Outcome only", "Outcome only", "Full, incl. officers", "Full"],
    "K": ["Full", "Full", "Full", "Full"],
    "Annex 3": ["Omit entirely", "Omit entirely", "Full", "Per legal advice"],
}

def section(letter, title, intro, key=None):
    key = key or letter
    badge = Table([[Paragraph(f'<font name="PlexMono-Medium" color="#FFFFFF">{letter}</font>',
                              S("b", fontSize=10, leading=12, alignment=1))]],
                  colWidths=[18], rowHeights=[18])
    badge.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT),
                               ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                               ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                               ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    head = Table([[badge, P(esc(title), "h2")]], colWidths=[26, CW - 26])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                              ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    d = DISCLOSURE[key]
    disc = " · ".join(f"{p}: {v}" for p, v in zip(PROFILES, d))
    return [head, Spacer(1, 4), P(intro, "small"), Spacer(1, 2),
            P("Disclosure — " + esc(disc), "smallmono"), Spacer(1, 6)]

def block(letter, title, intro, rows, extra_after=None, key=None):
    items = section(letter, title, intro, key)
    out = [CondPageBreak(160)] + items
    if rows:
        out.append(field_table(rows))
    if extra_after:
        for e in extra_after:
            out += [Spacer(1, 8), e]
    out.append(Spacer(1, 18))
    return out


# ---------------------------------------------------------------- content
story = []

# ---- Page 1: summary
title_left = [P("Payment Passport", "title"), Spacer(1, 4),
              P("Evidence pack for one incoming payment: which checks were performed, "
                "with which data and rule versions, and which decision the processor signed and executed.", "subtitle")]
profile_box = Table([[[P("DISCLOSURE PROFILE", "label"), Spacer(1, 3),
                       P(ph("profile"), S("pv", fontSize=11, leading=14)), Spacer(1, 3),
                       P(enum("MASTER", "FIU_SUPERVISOR", "AUDITOR", "OFF_RAMP", "BANK"), "small")]]],
                    colWidths=[150])
profile_box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 1, ACCENT),
                                 ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                                 ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
top = Table([[title_left, profile_box]], colWidths=[CW - 162, 162])
top.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                         ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, -1), 16),
                         ("RIGHTPADDING", (1, 0), (1, -1), 0), ("ALIGN", (1, 0), (1, -1), "RIGHT")]))
story += [top, Spacer(1, 12)]

# outcome panel
def cell(label, value, sub=None, style="value"):
    c = [P(esc(label).upper(), "th"), Spacer(1, 2), P(value, style)]
    if sub:
        c += [Spacer(1, 1), P(sub, "small")]
    return c

ow = (CW - 20) / 3
outcome = Table([
    [cell("Decision", ph("decision.decision"), enum("CREDIT", "HOLD", "FREEZE", "RETURN"), "big"),
     cell("Amount", f'{ph("onchain.amount")} {ph("onchain.token")}', f'≈ {ph("onchain.amount_eur")} EUR at receipt'),
     cell("Network", f'{ph("onchain.chain_name")} · chain ID {ph("onchain.chain_id")}')],
    [cell("Payment transaction", ph("onchain.tx_hash")),
     cell("Decided (UTC)", ph("decision.decided_at"), f'by {ph("decision.mode")}'),
     cell("Execution transaction", ph("decision.execution_tx"))],
], colWidths=[195, (CW - 195) / 2, (CW - 195) / 2])
outcome.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), PANEL),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
]))
story += [outcome, Spacer(1, 12)]

# identification: pack + processor side by side
half = (CW - 16) / 2
def kv(rows):
    data = [[P(esc(k), "field"), P(v, "valuesm")] for k, v in rows]
    t = Table(data, colWidths=[86, half - 86])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LINEBELOW", (0, 0), (-1, -1), 0.6, RULE),
                           ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 6)]))
    return t

pack_id = [P("PACK", "label"), Spacer(1, 4), kv([
    ("Pack ID", ph("pack_id")),
    ("Version · schema", f'{ph("pack_version")} · {ph("schema_version")}'),
    ("Created (UTC)", ph("created_at")),
    ("Payment ref.", ph("payment_ref")),
    ("Merchant", f'{ph("merchant_id")} (pseudonymous)'),
])]
proc_id = [P("PROCESSOR (BENEFICIARY CASP)", "label"), Spacer(1, 4), kv([
    ("Legal name", ph("processor.legal_name")),
    ("LEI", ph("processor.lei")),
    ("MiCA authorisation", ph("processor.casp_id")),
    ("Home NCA", ph("processor.nca")),
    ("RFI channel", ph("processor.rfi_channel")),
])]
ids = Table([[pack_id, proc_id]], colWidths=[half + 16, half])
ids.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                         ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, -1), 16),
                         ("RIGHTPADDING", (1, 0), (1, -1), 0)]))
story += [ids, Spacer(1, 12)]

# checks summary
def res(path, *vals):
    return [P(ph(path), "value"), P(enum(*vals), "small")] if vals else P(ph(path), "value")

story += [P("CHECKS SUMMARY", "label"), Spacer(1, 4)]
def R(path, *vals):
    return P(ph(path), "valuesm")

summary_rows = [
    ["Travel Rule data · B", R("summary.travel_rule", "COMPLETE", "INCOMPLETE"), P(ph("travel_rule.collected_at"), "valuesm"), source_tag("PAYER")],
    ["Wallet ownership · C", R("summary.wallet_ownership", "VERIFIED", "NOT_REQUIRED", "FAILED"), P(ph("wallet_ownership.verified_at"), "valuesm"), source_tag("DEFLOW")],
    ["KYT screening · D", R("kyt.risk_level", "provider scale"), P(ph("kyt.screened_at"), "valuesm"), source_tag("PROVIDER")],
    ["Sanctions screening · E", R("sanctions.result", "NO_MATCH", "POTENTIAL_MATCH", "TRUE_MATCH"), P(ph("sanctions.screened_at"), "valuesm"), source_tag("DEFLOW")],
    ["Structuring detector · F", R("structuring.result", "PASS", "FLAG"), P(ph("structuring.evaluated_at"), "valuesm"), source_tag("DEFLOW")],
    ["Issuer blocklist · G", R("issuer.result", "NOT_LISTED", "LISTED"), P(ph("issuer.checked_at"), "valuesm"), source_tag("CHAIN")],
    ["Rules applied · H", R("rules.rules_version"), P(ph("rules.effective_from"), "valuesm"), source_tag("PROCESSOR")],
]
story += [grid_table(["Check · section", "Result", "Performed (UTC)", "Source"], summary_rows,
                     [118, 150, 172, 55], align_right_cols=(3,)), Spacer(1, 12)]

story += [panel([P("SCOPE OF THIS DOCUMENT", "label"), Spacer(1, 3),
                 P("This pack records which checks were performed on one payment, with which data, list versions and "
                   "rule versions, and which decision the processor signed and executed on-chain. It does not certify that "
                   "the funds are legitimate and is not legal advice. Deflow is a technology provider: it holds no keys and "
                   "no client funds, and every decision in this pack was taken and signed by the processor.", "note")]),
          Spacer(1, 10)]

legend = ("<b>Source codes</b> — "
          '<font name="PlexMono">CHAIN</font> public on-chain data · '
          '<font name="PlexMono">PAYER</font> supplied by the payer at checkout · '
          '<font name="PlexMono">PROVIDER</font> external provider (KYT, sanctions lists, timestamp authority), reproduced unmodified · '
          '<font name="PlexMono">DEFLOW</font> computed by the Deflow engine · '
          '<font name="PlexMono">PROCESSOR</font> data or decision of the processor.')
story += [P(legend, "small"), PageBreak()]

# ---- Sections A–K
story += block("A", "Payment identification",
               "The on-chain transfer this pack refers to. Every other section is bound to this transaction hash.",
               [
                   ("Network", f'{ph("onchain.chain_name")} · EIP-155 chain ID {ph("onchain.chain_id")}', "CHAIN"),
                   ("Token and contract", f'{ph("onchain.token")} · {ph("onchain.token_contract")}', "CHAIN"),
                   ("Amount", f'{ph("onchain.amount")} {ph("onchain.token")}', "CHAIN"),
                   ("EUR equivalent", f'{ph("onchain.amount_eur")} EUR at {ph("onchain.fx_rate_eur")} '
                                      f'({ph("onchain.fx_source")}, {ph("onchain.fx_at")}); rate at receipt, fees excluded', "DEFLOW"),
                   ("Payer address", ph("onchain.payer_address"), "CHAIN"),
                   ("Deposit contract", f'{ph("onchain.deposit_contract")} (payer-specific, owned by the processor)', "CHAIN"),
                   ("Transaction hash", ph("onchain.tx_hash"), "CHAIN"),
                   ("Block · timestamp (UTC)", f'{ph("onchain.block_number")} · {ph("onchain.block_timestamp")}', "CHAIN"),
                   ("Log index · confirmations", f'{ph("onchain.log_index")} · {ph("onchain.confirmations")}', "CHAIN"),
                   ("Payment reference", ph("payment_ref"), "PROCESSOR"),
                   ("Merchant", f'{ph("merchant_id")} (pseudonymous)', "PROCESSOR"),
               ])

story += block("B", "Travel Rule data",
               "Originator and beneficiary information under Regulation (EU) 2023/1113, structured as IVMS101.2023 "
               "and collected at checkout before payment.",
               [
                   ("Collected (UTC)", f'{ph("travel_rule.collected_at")} · before payment: {ph("travel_rule.collected_before_payment")}', "DEFLOW"),
                   ("Originator type", f'{ph("travel_rule.originator.type")}<br/>{enum("NATURAL_PERSON", "LEGAL_PERSON")}', "PAYER"),
                   ("Originator name (LEGL)", ph("travel_rule.originator.name"), "PAYER"),
                   ("Identifier", f'{ph("travel_rule.originator.identifier")} ({ph("travel_rule.originator.identifier_type")})<br/>'
                                  f'{enum("GEOGRAPHIC_ADDRESS", "NATIONAL_ID", "DATE_PLACE_OF_BIRTH", "CUSTOMER_ID")}', "PAYER"),
                   ("Country", ph("travel_rule.originator.country"), "PAYER"),
                   ("Originator account", ph("travel_rule.originator.account"), "PAYER"),
                   ("Originator CASP", f'{ph("travel_rule.originator_vasp")} · protocol {ph("travel_rule.protocol")} (CASP-hosted only)', "PROVIDER"),
                   ("Beneficiary", f'{ph("travel_rule.beneficiary.name")} · merchant {ph("merchant_id")}', "PROCESSOR"),
                   ("Beneficiary CASP", f'{ph("processor.legal_name")} · LEI {ph("processor.lei")}', "PROCESSOR"),
                   ("Wallet type", f'{ph("travel_rule.wallet_type")} — determined by {ph("travel_rule.wallet_type_method")}<br/>'
                                   f'{enum("SELF_HOSTED", "CASP_HOSTED")}', "DEFLOW"),
                   ("Completeness check", f'{ph("travel_rule.completeness")} — missing or meaningless values are treated as missing', "DEFLOW"),
               ],
               extra_after=[rule_box("Off-ramp profile: show originator name and country only; replace every other originator "
                                     "field with the withheld marker. Bank profile: withhold all originator fields. "
                                     "Auditor profile: pseudonymise; the re-identification key stays with the processor.")])

story += block("C", "Wallet ownership evidence",
               "Proof that the payer controlled the sending address at the time of payment. Required for self-hosted "
               "addresses above EUR 1,000; may be applied at lower amounts by policy.",
               [
                   ("Required", f'{ph("wallet_ownership.required")} — reason: {ph("wallet_ownership.reason")}', "DEFLOW"),
                   ("Method", f'{ph("wallet_ownership.method")}<br/>{enum("EIP-191", "EIP-712", "EIP-4361 (SIWE)", "ERC-1271", "TEST_TRANSFER")}', "DEFLOW"),
                   ("Signed message digest", ph("wallet_ownership.message_digest"), "PAYER"),
                   ("Domain · nonce · chain ID", f'{ph("wallet_ownership.domain")} · {ph("wallet_ownership.nonce")} · {ph("wallet_ownership.chain_id")}', "DEFLOW"),
                   ("Issued · expires (UTC)", f'{ph("wallet_ownership.issued_at")} · {ph("wallet_ownership.expires_at")}', "DEFLOW"),
                   ("Signature", ph("wallet_ownership.signature"), "PAYER"),
                   ("Verification result", f'{ph("wallet_ownership.result")}<br/>{enum("VALID", "INVALID", "NOT_REQUIRED")}', "DEFLOW"),
                   ("Verified at block", f'{ph("wallet_ownership.verified_block")} (ERC-1271 smart-contract wallets only)', "CHAIN"),
                   ("Prior verification", f'{ph("wallet_ownership.prior_pack_id")} (address already verified; reuse documented)', "DEFLOW"),
               ],
               extra_after=[rule_box("State only what the signature shows: control of the address by the payer. "
                                     "Where the payer is not the processor's customer, how this evidence is used is set by "
                                     "the processor's policy; do not describe it as completing a specific legal requirement.")])

exposure = grid_table(["Category", "Exposure", "Direction", "Share", "Value (USD)"], [
    [ph("e.category"), ph("e.exposure_type"), ph("e.direction"), f'{ph("e.share_pct")} %', ph("e.value_usd")],
    [ph("e.category"), ph("e.exposure_type"), ph("e.direction"), f'{ph("e.share_pct")} %', ph("e.value_usd")],
    [P(enum("one row per item in kyt.exposures"), "small"), P(enum("DIRECT", "INDIRECT"), "small"),
     P(enum("SENT", "RECEIVED"), "small"), "", ""],
], [150, 95, 85, 70, CW - 400], align_right_cols=(3, 4))

story += block("D", "Transaction screening (KYT)",
               "Result returned by the processor's blockchain-analytics provider, reproduced without modification.",
               [
                   ("Provider · product · API", f'{ph("kyt.provider")} · {ph("kyt.product")} · {ph("kyt.api_version")}', "PROVIDER"),
                   ("Provider reference", ph("kyt.external_ref"), "PROVIDER"),
                   ("Screened (UTC)", ph("kyt.screened_at"), "PROVIDER"),
                   ("Risk level", f'{ph("kyt.risk_level")} (provider\'s own scale)', "PROVIDER"),
                   ("Alerts", ph("kyt.alerts"), "PROVIDER"),
                   ("Raw response hash", f'sha256:{ph("kyt.raw_response_sha256")} (raw response kept in the master pack)', "DEFLOW"),
               ],
               extra_after=[KeepTogether([P("EXPOSURE", "label"), Spacer(1, 3), exposure])])

lists = grid_table(["List", "Version / published", "Loaded (UTC)"], [
    ["EU Consolidated Financial Sanctions List", ph("l.eu.published_at"), ph("l.eu.loaded_at")],
    [f'National list(s): {ph("l.national.name")}', ph("l.national.published_at"), ph("l.national.loaded_at")],
    ["UN Security Council Consolidated List", ph("l.un.published_at"), ph("l.un.loaded_at")],
    ["OFAC SDN incl. digital currency addresses (where a US nexus applies)", ph("l.ofac.published_at"), ph("l.ofac.loaded_at")],
], [250, 125, CW - 375])

story += block("E", "Sanctions screening",
               "Names and wallet addresses screened against restrictive-measures lists in force at the time of screening.",
               [
                   ("Fields screened", "Originator name, date of birth, country; payer address and direct counterparties", "DEFLOW"),
                   ("Matching", f'{ph("sanctions.algorithm")} · fuzzy threshold {ph("sanctions.threshold")} · '
                                f'calibration {ph("sanctions.calibration_version")}', "DEFLOW"),
                   ("Result", f'{ph("sanctions.result")}<br/>{enum("NO_MATCH", "POTENTIAL_MATCH", "TRUE_MATCH")}', "DEFLOW"),
                   ("Alert analysis", f'{ph("sanctions.alert_analysis")} (only where an alert was raised)', "PROCESSOR"),
                   ("Reviewed by", f'{ph("sanctions.reviewer")} · second reviewer {ph("sanctions.second_reviewer")}', "PROCESSOR"),
               ],
               extra_after=[KeepTogether([P("LISTS", "label"), Spacer(1, 3), lists])])

story += block("F", "Structuring detector",
               "Checks whether this payment is part of a pattern of split payments from linked sources.",
               [
                   ("Rule · window", f'{ph("structuring.rule_id")} · {ph("structuring.window")}', "DEFLOW"),
                   ("Thresholds", ph("structuring.thresholds"), "DEFLOW"),
                   ("Linked payments", f'{ph("structuring.linked_count")} — packs {ph("structuring.linked_pack_ids")}', "DEFLOW"),
                   ("Features", ph("structuring.features"), "DEFLOW"),
                   ("Score · result", f'{ph("structuring.score")} · {ph("structuring.result")}<br/>{enum("PASS", "FLAG")}', "DEFLOW"),
               ])

story += block("G", "Issuer controls",
               "Whether the token issuer has blocked the payer address or the deposit contract.",
               [
                   ("Checked", f'Payer address and deposit contract on {ph("onchain.token_contract")} at block {ph("issuer.block")}', "CHAIN"),
                   ("Result", f'{ph("issuer.result")}<br/>{enum("NOT_LISTED", "LISTED")}', "CHAIN"),
               ])

story += block("H", "Rules and versions",
               "The processor-approved rule set that produced the recommendation, so the decision can be reproduced.",
               [
                   ("Rules version", ph("rules.rules_version"), "DEFLOW"),
                   ("Ruleset hash", f'sha256:{ph("rules.ruleset_hash")}', "DEFLOW"),
                   ("Approved by · effective", f'{ph("rules.approved_by")} · from {ph("rules.effective_from")}', "PROCESSOR"),
                   ("Engine version", f'deflow-core@{ph("rules.engine_version")}', "DEFLOW"),
                   ("Thresholds applied", ph("rules.thresholds"), "DEFLOW"),
                   ("Recommendation", f'{ph("rules.recommendation")}<br/>{enum("CREDIT", "HOLD", "FREEZE", "RETURN")}', "DEFLOW"),
               ])

timeline = grid_table(["Time (UTC)", "Event", "On-chain status", "Reference", "Source"], [
    [ph("t"), "Travel Rule data received", "—", ph("travel_rule.ref"), source_tag("PAYER")],
    [ph("t"), "Wallet signature verified", "—", "—", source_tag("DEFLOW")],
    [ph("t"), "Payment received in deposit contract", "PENDING", ph("onchain.tx_hash"), source_tag("CHAIN")],
    [ph("t"), "KYT result received", "—", ph("kyt.external_ref"), source_tag("PROVIDER")],
    [ph("t"), "Sanctions and structuring checks completed", "—", "—", source_tag("DEFLOW")],
    [ph("t"), "Decision signed by processor", "—", ph("decision.signature_ref"), source_tag("PROCESSOR")],
    [ph("t"), "Decision executed by contract", ph("status"), ph("decision.execution_tx"), source_tag("CHAIN")],
], [92, 168, 78, 107, CW - 445], align_right_cols=(4,))

story += block("I", "Timeline", "Every state change of the payment, on-chain and off-chain, in order.", [],
               extra_after=[timeline,
                            rule_box("On-chain statuses are deliberately neutral: PENDING, HELD, CREDITED, RETURNED. "
                                     "A freeze and an ordinary review both appear on-chain as HELD; never expose the reason on-chain.")])

story += block("J", "Decision",
               "The decision taken and signed by the processor, and its on-chain execution.",
               [
                   ("Decision", f'{ph("decision.decision")}<br/>{enum("CREDIT", "HOLD", "FREEZE", "RETURN")}', "PROCESSOR"),
                   ("Mode", f'{ph("decision.mode")} — policy {ph("decision.policy_ref")}<br/>{enum("AUTO_BY_POLICY", "OFFICER_REVIEW")}', "PROCESSOR"),
                   ("Reason codes", ph("decision.reason_codes"), "PROCESSOR"),
                   ("Rationale", ph("decision.rationale"), "PROCESSOR"),
                   ("Decided by", f'{ph("decision.officer_id")} (pseudonymous)', "PROCESSOR"),
                   ("Second reviewer", ph("decision.second_reviewer"), "PROCESSOR"),
                   ("Decided (UTC)", ph("decision.decided_at"), "PROCESSOR"),
                   ("Decision signature", f'EIP-712 over {{payment_id, decision, pack_hash}} by {ph("decision.signer_address")}', "PROCESSOR"),
                   ("Execution transaction", ph("decision.execution_tx"), "CHAIN"),
               ],
               extra_after=[rule_box("FREEZE has no technical path to RETURN. Funds stay in the deposit contract until the "
                                     "competent authority gives instructions. Off-ramp and bank profiles show the outcome only.")])

verify_steps = [
    f'1. Verify the processor\'s signature over the embedded JSON using the certificate published at {ph("processor.cert_url")}.',
    "2. Validate the RFC 3161 timestamp token against the timestamp authority's certificate.",
    f'3. Look up {ph("onchain.tx_hash")} and {ph("decision.execution_tx")} in any block explorer for chain ID {ph("onchain.chain_id")}.',
    f'4. Recompute SHA-256 over the canonical JSON (RFC 8785) and check its inclusion in the anchored root using the attached proof. '
    f'Open-source verifier: {ph("verifier_url")}.',
]
story += block("K", "Integrity and verification",
               "How the recipient can check that this pack is authentic, complete and unchanged — without trusting Deflow.",
               [
                   ("Pack hash", f'sha256:{ph("integrity.pack_hash")} over RFC 8785 canonical JSON', "DEFLOW"),
                   ("Machine-readable pack", f'{ph("integrity.json_filename")}, embedded in this PDF (PDF/A-3)', "DEFLOW"),
                   ("Processor signature", f'{ph("integrity.sig_alg")} · key {ph("integrity.key_id")} · certificate {ph("integrity.cert_fingerprint")}', "PROCESSOR"),
                   ("Timestamp", f'{ph("integrity.tsa")} · {ph("integrity.ts_time")} · serial {ph("integrity.ts_serial")} (RFC 3161, qualified)', "PROVIDER"),
                   ("Anchor", f'Merkle root {ph("integrity.anchor_root")} in tx {ph("integrity.anchor_tx")}; no personal data on-chain', "CHAIN"),
                   ("Previous pack hash", f'sha256:{ph("integrity.prev_pack_hash")} (processor journal)', "DEFLOW"),
                   ("Retention", f'until {ph("retention.until")} · legal hold {ph("retention.legal_hold")}', "PROCESSOR"),
               ],
               extra_after=[KeepTogether([P("HOW TO VERIFY", "label"), Spacer(1, 3)] + [P(s, "value") for s in verify_steps])])

# ---- Annex 1: disclosure matrix
story += [PageBreak(), P("Annex 1 · Disclosure profiles", "h2"), Spacer(1, 4),
          P("One master pack is kept unredacted by the processor. Each recipient receives a projection generated from it; "
            "the master record itself is never edited.", "small"), Spacer(1, 10)]
names = {"Summary": "Summary page", "A": "A  Payment identification", "B": "B  Travel Rule data",
         "C": "C  Wallet ownership", "D": "D  KYT", "E": "E  Sanctions", "F": "F  Structuring",
         "G": "G  Issuer controls", "H": "H  Rules and versions", "I": "I  Timeline", "J": "J  Decision",
         "K": "K  Integrity", "Annex 3": "Annex 3  Reporting"}
mrows = []
for k, label in names.items():
    mrows.append([P(esc(label), "matrix")] + [P(esc(v), "matrix") for v in DISCLOSURE[k]])
mw = (CW - 120) / 4
matrix = grid_table(["Section"] + PROFILES, mrows, [120, mw, mw, mw, mw])
story += [matrix, Spacer(1, 12)]
story += [grid_table(["Profile", "Recipient and purpose"], [
    [P("MASTER", "smallmono"), "Internal record of the processor. Unredacted, never edited, retained for the full retention period."],
    [P("FIU_SUPERVISOR", "smallmono"), "Financial intelligence unit or competent authority. Full content, including Annex 3."],
    [P("AUDITOR", "smallmono"), "Internal or external audit. Personal data pseudonymised; rules replayable."],
    [P("OFF_RAMP", "smallmono"), "Exchange or fiat gateway answering a source-of-funds request on a specific deposit."],
    [P("BANK", "smallmono"), "Bank reviewing a sample of payments; personal data withheld unless requested."],
], [100, CW - 100]), Spacer(1, 16)]

# ---- Annex 2: rendering conventions
story += [CondPageBreak(260), P("Annex 2 · Rendering conventions", "h2"), Spacer(1, 8)]
conv = [
    ("Placeholders", f'{ph("path")} maps one-to-one to a field of the JSON schema deflow-evidence/1.0.'),
    ("Times", "UTC, ISO 8601 with seconds (2026-09-15T10:42:17Z)."),
    ("Amounts", "Decimal strings in token units; EUR to two decimals with the rate and its source."),
    ("Hashes and addresses", "Full hex in sections A–K; shortened forms only on the summary page."),
    ("Withheld marker", f'[withheld · available on reasoned request via {ph("processor.rfi_channel")}]'),
    ("Not applicable", "“n/a” followed by the reason, never an empty cell."),
    ("Wording", "Describe checks and results. Never “clean”, “compliant”, “safe” or “approved by Deflow”."),
    ("File", "PDF/A-3 with the signed JSON embedded; PAdES signature by the processor."),
    ("Language", "English; the processor may add a local-language summary page."),
]
story += [field_table([(a, b, "") for a, b in conv], widths=(130, CW - 130))]

# ---- Annex 3: reporting (FIU / supervisor only) — last, so its omission leaves no gap
story += [PageBreak(), P("Annex 3 · Reporting", "h2"), Spacer(1, 6)]
story += [panel([P("FIU / SUPERVISOR PROFILE ONLY", S("wl", fontName="PlexMono-Medium", fontSize=7.5, leading=10, textColor=WARN_INK)),
                 Spacer(1, 3),
                 P("Include this annex only in the FIU_SUPERVISOR and MASTER profiles. In every other profile omit it entirely — "
                   "heading, page and any reference — so that its absence cannot be inferred. Disclosing that a report was made, "
                   "or that an analysis is under way, is prohibited.", "warn")], bg=WARN_BG, line=WARN_LINE),
          Spacer(1, 12)]
story += [field_table([
    ("Restrictive-measures report", f'{ph("reporting.freeze.authority")} · submitted {ph("reporting.freeze.submitted_at")} · ref {ph("reporting.freeze.ref")}', "PROCESSOR"),
    ("Suspicious transaction report", f'{ph("reporting.str.fiu")} · submitted {ph("reporting.str.submitted_at")} · ref {ph("reporting.str.ref")}', "PROCESSOR"),
    ("Authority instructions", f'{ph("reporting.instructions")} · received {ph("reporting.instructions_at")}', "PROCESSOR"),
    ("Funds status", f'Held in {ph("onchain.deposit_contract")} since {ph("reporting.held_since")}', "CHAIN"),
])]


# ---------------------------------------------------------------- build
out = "/mnt/user-data/outputs/Deflow_Evidence_Pack_Template.pdf"
doc = BaseDocTemplate(out, pagesize=A4, leftMargin=LM, rightMargin=RM, topMargin=TM, bottomMargin=BM,
                      title="Deflow Evidence Pack — Payment Passport (template)", author="Deflow",
                      subject="Template v1.0 · schema deflow-evidence/1.0")
frame = Frame(LM, BM, CW, PAGE_H - TM - BM, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
doc.addPageTemplates([PageTemplate(id="p", frames=[frame])])
doc.build(story, canvasmaker=NumberedCanvas)
print("ok", out)
