from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def reasignar_propietarios(apps, schema_editor, *, inversa=False):
    """Concilia por correo único; nunca interpreta IDs de tablas distintas como identidad."""
    alias = schema_editor.connection.alias
    Tienda = apps.get_model('core', 'Tienda')
    UsuarioLegacy = apps.get_model('core', 'Usuario')
    UsuarioAuth = apps.get_model(*settings.AUTH_USER_MODEL.split('.'))
    origen, destino = (UsuarioAuth, UsuarioLegacy) if inversa else (UsuarioLegacy, UsuarioAuth)
    correo_origen, correo_destino = ('email', 'correo') if inversa else ('correo', 'email')

    tiendas = list(Tienda.objects.using(alias).values_list('pk', 'id_usuario_propietario_id'))
    correspondencias = {}
    destinos_asignados = set()
    for propietario_id in sorted({propietario_id for _, propietario_id in tiendas}):
        propietario = origen.objects.using(alias).get(pk=propietario_id)
        correo = getattr(propietario, correo_origen).strip()
        candidatos = list(destino.objects.using(alias).filter(
            **{f'{correo_destino}__iexact': correo}
        ).values_list('pk', flat=True)[:2]) if correo else []
        # Exigimos unicidad en ambos lados, también para permitir una reversión segura.
        origenes = origen.objects.using(alias).filter(
            **{f'{correo_origen}__iexact': correo}
        ).count() if correo else 0
        if origenes != 1 or len(candidatos) != 1 or candidatos[0] in destinos_asignados:
            raise RuntimeError(
                f'SCRUM-137: no se puede conciliar el propietario {propietario_id}. '
                'Revise la correspondencia de correos entre core.Usuario y AUTH_USER_MODEL: '
                'debe existir una única cuenta en cada tabla. No se reasignaron tiendas.'
            )
        correspondencias[propietario_id] = candidatos[0]
        destinos_asignados.add(candidatos[0])

    # Se valida todo antes de escribir; actualizar por tienda evita confundir IDs cruzados.
    for tienda_id, propietario_id in tiendas:
        Tienda.objects.using(alias).filter(pk=tienda_id).update(
            id_usuario_propietario_id=correspondencias[propietario_id]
        )


def forwards(apps, schema_editor):
    reasignar_propietarios(apps, schema_editor)


def backwards(apps, schema_editor):
    reasignar_propietarios(apps, schema_editor, inversa=True)


class Migration(migrations.Migration):
    atomic = True

    dependencies = [
        ('core', '0003_itempedido_id_variante'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Retirar temporalmente la FK permite remapear IDs sin borrar filas ni columnas.
        migrations.AlterField(
            model_name='tienda',
            name='id_usuario_propietario',
            field=models.ForeignKey(
                to='core.usuario',
                on_delete=django.db.models.deletion.CASCADE,
                db_column='id_usuario_propietario',
                db_constraint=False,
            ),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.AlterField(
            model_name='tienda',
            name='id_usuario_propietario',
            field=models.ForeignKey(
                to=settings.AUTH_USER_MODEL,
                on_delete=django.db.models.deletion.PROTECT,
                db_column='id_usuario_propietario',
                related_name='tiendas_propias',
            ),
        ),
    ]
