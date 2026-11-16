from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from apps.landing.paid_availability import sale_snapshot, sale_version, occupied_seats, availability
from apps.landing.activities import paid_activity_details


class AvailabilityTests(SimpleTestCase):
    def section(self):
        return {'tipo':'personalizada','visible':True,'titulo':'Taller','actividad':{'tipo':'taller','estado':'activa',
            'zona_horaria':'America/Santiago','cupos':5,'gratuito':False,'inscripciones':False,'enlace_reunion':'https://example.com/privado',
            'venta':{'cierre_minutos':60,'tolerancia_minutos':15,'cancelacion':'evaluacion','cancelacion_horas':48}},
            'componentes':[{'tipo':'precio','visible':True,'importe':'25000'}, {'tipo':'fecha','visible':True,'fecha':'2030-11-28'},
                {'tipo':'horario','visible':True,'inicio':'15:00','termino':'17:00'}, {'tipo':'condiciones','visible':True,'texto':'Llegar a tiempo'}]}

    def test_terms_hash_changes_and_never_contains_private_link(self):
        section = self.section()
        first = sale_snapshot(section, paid_activity_details(section))
        self.assertNotIn('privado', str(first))
        section['componentes'][-1]['texto'] = 'Nueva condición'
        second = sale_snapshot(section, paid_activity_details(section))
        self.assertNotEqual(sale_version(first), sale_version(second))

    @patch('apps.landing.paid_availability.ConfiguracionLanding')
    @patch('apps.landing.paid_availability.find_activity')
    @patch('apps.landing.paid_availability.occupied_seats')
    def test_status_boundaries(self, occupied, find, config):
        section = self.section(); find.return_value = section
        details = paid_activity_details(section); occupied.return_value = 2
        for now, expected in [(details['cierre']-timedelta(seconds=1),'disponible'),(details['cierre'],'cerrada'),
                              (details['inicio'],'iniciada'),(details['termino'],'finalizada')]:
            result = availability(object(), 'section', now=now)
            self.assertEqual(result['estado'], expected)
            self.assertEqual(result['cupos_disponibles'], 3)
            self.assertFalse(result['compra_habilitada'])
        occupied.return_value = 5
        self.assertEqual(availability(object(),'section',now=details['cierre']-timedelta(seconds=1))['estado'],'agotada')

    @patch('apps.landing.paid_availability.ReservaActividadPagada')
    @patch('apps.landing.paid_availability.SolicitudActividad')
    def test_counts_paid_and_existing_free_seats(self, free, paid):
        paid.objects.filter.return_value.filter.return_value.aggregate.return_value = {'total': 3}
        free.objects.filter.return_value.exclude.return_value.count.return_value = 2
        self.assertEqual(occupied_seats(object(),'section',datetime.now(timezone.utc)), 5)
