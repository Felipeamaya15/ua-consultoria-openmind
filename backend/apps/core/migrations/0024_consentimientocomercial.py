from django.db import migrations, models
import django.db.models.deletion
import django.db.models.functions.text
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [('core', '0023_reconciliar_promocion_historica')]
    operations = [migrations.CreateModel(
        name='ConsentimientoComercial',
        fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('email', models.EmailField(max_length=320)),
            ('estado', models.CharField(choices=[('autorizado', 'Autorizado'), ('retirado', 'Retirado')], max_length=15)),
            ('version_texto', models.CharField(blank=True, default='', max_length=100)),
            ('referencia_evidencia', models.CharField(blank=True, default='', max_length=250)),
            ('fecha_actualizacion', models.DateTimeField(default=django.utils.timezone.now)),
            ('tienda', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='core.tienda')),
        ],
        options={'constraints': [
            models.UniqueConstraint(fields=('tienda', 'email'), name='uq_consentimiento_tienda_email'),
            models.CheckConstraint(condition=models.Q(estado='retirado') | (models.Q(estado='autorizado') & ~models.Q(version_texto='') & ~models.Q(referencia_evidencia='')), name='chk_consentimiento_evidencia'),
            models.CheckConstraint(condition=models.Q(email=django.db.models.functions.text.Lower(django.db.models.functions.text.Trim('email'))), name='chk_consentimiento_normalizado'),
        ]},
    )]
