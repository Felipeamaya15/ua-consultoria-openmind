"""PDF vectorial A4 a partir del mismo agregado que consume la interfaz."""
from decimal import Decimal
from datetime import date
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable

from apps.core.infrastructure.reports import MESES

AZUL = colors.HexColor('#17365d')
GRIS = colors.HexColor('#edf2f7')


def clp(value):
    # Mantener centavos si existen en el modelo, sin pérdida de precisión.
    number = Decimal(value)
    text = f'{number:,.2f}' if number % 1 else f'{number:,.0f}'
    return '$ ' + text.replace(',', '_').replace('.', ',').replace('_', '.') + ' CLP'


class Barras(Flowable):
    """Barras horizontales con etiquetas y valores exactos, sin escalas ambiguas."""
    def __init__(self, rows, money=False):
        super().__init__()
        self.rows, self.money = rows, money
        self.width, self.height = 487, len(rows) * 22 + 8

    def draw(self):
        canvas = self.canv
        maximum = max((Decimal(value) for _, value in self.rows), default=Decimal(0)) or Decimal(1)
        for i, (label, value) in enumerate(self.rows):
            y = self.height - 22 * (i + 1)
            canvas.setFillColor(AZUL)
            canvas.setFont('Helvetica', 9)
            canvas.drawString(0, y + 4, label)
            canvas.setFillColor(GRIS)
            canvas.rect(100, y, 210, 16, fill=1, stroke=0)
            canvas.setFillColor(AZUL)
            canvas.rect(100, y, float(Decimal(value) / maximum) * 210, 16, fill=1, stroke=0)
            canvas.setFont('Helvetica', 8)
            canvas.drawRightString(487, y + 4, clp(value) if self.money else str(value))


def generar_pdf(data, generado):
    stream = BytesIO()
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='Store', fontName='Helvetica-Bold', fontSize=11, leading=15, textColor=AZUL, spaceAfter=12, wordWrap='CJK'))
    styles.add(ParagraphStyle(name='SmallNote', fontSize=9, leading=13, textColor=colors.HexColor('#475569'), spaceAfter=10))
    styles['Title'].textColor = AZUL
    styles['Title'].fontSize = 23
    styles['Title'].leading = 28
    styles['Title'].alignment = 0
    styles['Heading2'].textColor = AZUL
    styles['Normal'].leading = 15
    periodo = f'{MESES[data["mes"] - 1]} de {data["anio"]}' if data['mes'] else str(data['anio'])
    doc = SimpleDocTemplate(stream, pagesize=A4, rightMargin=54, leftMargin=54, topMargin=48,
                            bottomMargin=54, title='Informe de ventas y pedidos', author='OpenMind')
    story = []
    def p(text, style='Normal'):
        return Paragraph(escape(str(text)), styles[style])
    def heading(text):
        story.append(p(text, 'Heading2'))
    def table(rows, widths):
        cells = [[p(cell, 'SmallNote') for cell in row] for row in rows]
        result = Table(cells, colWidths=widths, repeatRows=1, hAlign='LEFT')
        result.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), GRIS), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
            ('LINEBELOW', (0, 0), (-1, 0), .7, AZUL),
            ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        return result
    story.extend([p(data['tienda'], 'Store'), p('Informe de ventas y pedidos', 'Title'),
                  p(f'{periodo} | {date.fromisoformat(data["fecha_desde"]):%d/%m/%Y} al {date.fromisoformat(data["fecha_hasta"]):%d/%m/%Y}'),
                  p(f'Generado: {generado:%d/%m/%Y %H:%M} | America/Santiago', 'SmallNote')])
    heading('Resumen comercial')
    story.append(table([
        ['Indicador', 'Resultado'], ['Ingresos confirmados', clp(data['total_ventas'])],
        ['Total de pedidos', data['total_pedidos']], ['Pedidos con pago confirmado', data['pedidos_pagados']],
        ['Ticket promedio confirmado', clp(data['ticket_promedio']) if data['ticket_promedio'] is not None else 'Sin pagos confirmados'],
    ], [260, 227]))
    if not data['total_pedidos']:
        story.extend([Spacer(1, 12), p('No se registraron pedidos en el período seleccionado.')])
    if not data['mes']:
        heading('Ventas y pedidos por mes')
        story.append(table([['Mes', 'Ingresos confirmados', 'Pedidos']] + [
            [row['etiqueta'], clp(row['ventas']), row['pedidos']] for row in data['meses']
        ] + [['Total', clp(data['total_ventas']), data['total_pedidos']]], [130, 240, 117]))
        story.append(PageBreak())
        if data['total_pedidos']:
            heading('Ingresos confirmados por mes (CLP)')
            story.append(Barras([(r['etiqueta'], r['ventas']) for r in data['meses']], money=True))
            heading('Cantidad de pedidos por mes')
            story.append(Barras([(r['etiqueta'], r['pedidos']) for r in data['meses']]))
            story.append(PageBreak())
    heading('Distribución de pedidos por estado')
    if data['mes'] and data['total_pedidos']:
        story.append(Barras([(r['etiqueta'], r['pedidos']) for r in data['distribucion_estados']]))
    else:
        story.append(table([['Estado actual', 'Pedidos']] + [
            [r['etiqueta'], r['pedidos']] for r in data['distribucion_estados']
        ], [340, 147]))
    heading('Lectura de los resultados')
    story.append(p(f'Se registraron {data["total_pedidos"]} pedidos; {data["pedidos_pagados"]} tienen pago confirmado. '
                   f'Los ingresos confirmados suman {clp(data["total_ventas"])}.'))
    if not data['mes']:
        for key, label in [('ventas', 'ingresos confirmados'), ('pedidos', 'cantidad de pedidos')]:
            peaks = data['mejores_meses'][key]
            story.append(p(f'Meses con mayor {label}: ' + (', '.join(MESES[m - 1] for m in peaks) if peaks else 'sin actividad') + '.'))
    story.extend([Spacer(1, 10), p(data['nota_fechas'], 'SmallNote'),
                  p('Informe comercial. No constituye un documento tributario oficial.', 'SmallNote')])
    def footer(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(GRIS)
        canvas.line(54, 42, A4[0] - 54, 42)
        canvas.setFillColor(AZUL)
        canvas.setFont('Helvetica', 8)
        canvas.drawString(54, 29, 'OpenMind | Informe comercial')
        canvas.drawRightString(A4[0] - 54, 29, f'Página {document.page}')
        canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return stream.getvalue()
