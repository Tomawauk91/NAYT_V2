from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor


def set_cell_background(cell, color_hex: str):
    try:
        shading_elm = OxmlElement('w:shd')
        shading_elm.set(qn('w:fill'), color_hex)
        cell._tc.get_or_add_tcPr().append(shading_elm)
    except Exception:
        pass


def style_run(run, size=10, bold=False, color='1E293B'):
    run.bold = bold
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)


document = Document()

# Header band
header = document.add_paragraph('NAYT V2 · Rapport de Pentest')
header.alignment = WD_ALIGN_PARAGRAPH.CENTER
for run in header.runs:
    style_run(run, size=12, bold=True, color='334155')

# Main title
title = document.add_heading('{{ mission_name }}', 0)
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
for run in title.runs:
    style_run(run, size=24, bold=True, color='0F172A')

subtitle = document.add_paragraph('Rapport exécutif et technique')
subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
for run in subtitle.runs:
    style_run(run, size=11, color='475569')

document.add_paragraph()

# Executive metadata block
meta_table = document.add_table(rows=5, cols=2)
meta_table.style = 'Table Grid'
meta_rows = [
    ('Cible', '{{ target }}'),
    ('Date du rapport', '{{ date }}'),
    ('Client', '{{ client_name }} ({{ client_company }})'),
    ('Total vulnérabilités', '{{ total_vulnerabilities }}'),
    ('Score de risque global', '{{ overall_risk_score }} / 100'),
]

for i, (label, value) in enumerate(meta_rows):
    left = meta_table.rows[i].cells[0]
    right = meta_table.rows[i].cells[1]
    left.text = label
    right.text = value
    set_cell_background(left, 'E2E8F0')
    set_cell_background(right, 'F8FAFC')
    style_run(left.paragraphs[0].runs[0], size=10, bold=True, color='0F172A')
    style_run(right.paragraphs[0].runs[0], size=10, color='1E293B')

document.add_paragraph()
document.add_heading('Résumé des risques', level=1)

risk_table = document.add_table(rows=2, cols=5)
risk_table.style = 'Table Grid'
headers = ['Critique', 'Élevé', 'Moyen', 'Faible', 'Info']
counts = ['{{ critical_count }}', '{{ high_count }}', '{{ medium_count }}', '{{ low_count }}', '{{ info_count }}']
colors = ['FECACA', 'FED7AA', 'FEF08A', 'BFDBFE', 'E2E8F0']

for i in range(5):
    head = risk_table.cell(0, i)
    head.text = headers[i]
    set_cell_background(head, colors[i])
    head.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    style_run(head.paragraphs[0].runs[0], size=10, bold=True, color='0F172A')

    val = risk_table.cell(1, i)
    val.text = counts[i]
    set_cell_background(val, 'F8FAFC')
    val.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    style_run(val.paragraphs[0].runs[0], size=12, bold=True, color='1E293B')

document.add_paragraph()
document.add_heading('Détail des vulnérabilités', level=1)
document.add_paragraph('{% if total_vulnerabilities > 0 %}')
document.add_paragraph('{% for vuln in vulnerabilities %}')

vuln_title = document.add_paragraph('● {{ vuln.title }}')
for run in vuln_title.runs:
    style_run(run, size=12, bold=True, color='0F172A')

vuln_table = document.add_table(rows=5, cols=2)
vuln_table.style = 'Table Grid'
vuln_rows = [
    ('Sévérité / CVSS', '{{ vuln.severity }} ({{ vuln.cvss }})'),
    ('Statut', '{{ vuln.status }}'),
    ('CVE', '{{ vuln.cve }}'),
    ('MITRE ATT&CK', '{{ vuln.mitre_attack }}'),
    ('Description', '{{ vuln.description }}'),
]

for i, (label, value) in enumerate(vuln_rows):
    left = vuln_table.rows[i].cells[0]
    right = vuln_table.rows[i].cells[1]
    left.text = label
    right.text = value
    set_cell_background(left, 'E2E8F0')
    set_cell_background(right, 'FFFFFF')
    style_run(left.paragraphs[0].runs[0], size=10, bold=True, color='0F172A')
    style_run(right.paragraphs[0].runs[0], size=10, color='1E293B')

document.add_paragraph()
document.add_paragraph('{% endfor %}')
document.add_paragraph('{% else %}')
document.add_paragraph('Aucune vulnérabilité majeure détectée automatiquement. Des vérifications manuelles restent nécessaires.')
document.add_paragraph('{% endif %}')

document.save('/app/app/report_template.docx')
print('Enhanced report template saved')

