"""Abre y valida los archivos realmente descargados por commercial-browser.cjs."""
from pathlib import Path
from decimal import Decimal
import json
import hashlib
import zipfile
from openpyxl import load_workbook
from pypdf import PdfReader

root = Path(__file__).resolve().parents[2] / 'docs/sprint6-reportes-clientes/browser'
results = []
for path in sorted(root.glob('*.xlsx')):
    workbook = load_workbook(path, data_only=False)
    rows = {sheet.title: list(sheet.values)[3:] for sheet in workbook}
    for sheet in workbook:
        assert sheet.freeze_panes == 'A4' and sheet.auto_filter.ref
        assert all(cell.data_type != 'f' for row in sheet for cell in row)
    with zipfile.ZipFile(path) as archive:
        assert not any('vbaProject' in name or 'externalLinks' in name for name in archive.namelist())
    if path.name.startswith(('ventas-', 'dashboard-')):
        assert Decimal(str(dict(rows['Resumen'])['Importe con pago confirmado'])) == Decimal('19400.75')
    if path.name.startswith('dashboard-'):
        assert len(rows['Pedidos']) == 4 and len(rows['Comparación mensual']) == 1
    if path.name.startswith('ventas-'):
        assert len(rows['Pedidos']) == 2 and sum(row[5] for row in rows['Líneas']) == 3
    if path.name.startswith('pedidos-antiguos'):
        assert len(rows['Pedidos']) == 25 and all(row[0].startswith('OLD-') for row in rows['Pedidos'])
    if path.name == 'contactos-operativos.xlsx':
        emails = [row[0] for row in rows['Contactos']]
        assert len(emails) == len(set(emails)) and emails.count('cliente@example.test') == 1
        assert next(row[1] for row in rows['Contactos'] if row[0] == 'historico@example.test') == 25
    if path.name == 'contactos-marketing-autorizados.xlsx':
        assert [row[0] for row in rows['Contactos']] == ['cliente@example.test']
    if path.name == 'marketing-sin-autorizados.xlsx':
        assert rows['Contactos'] == []
    results.append({'file': path.name, 'sheets': {key: len(value) for key, value in rows.items()},
                    'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'valid': True})
    workbook.close()
assert len(results) == 7
pdf = PdfReader(root / 'dashboard-2025-10.pdf')
text = '\n'.join(page.extract_text() for page in pdf.pages)
assert len(pdf.pages) == 1 and '01/10/2025' in text and '31/10/2025' in text
report = {'xlsx': results, 'pdf': {'pages': len(pdf.pages), 'chilean_dates': True}}
(root.parent / 'archivos-validados.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
print(f'PASS {len(results)} XLSX descargados abiertos y validados; PDF mensual de {len(pdf.pages)} página compatible.')
