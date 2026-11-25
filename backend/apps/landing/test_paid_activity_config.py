from datetime import datetime, timedelta, timezone
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from apps.landing.activities import ActivityConfigSerializer, paid_activity_details, require_paid_activity_open, validate_activity


class PaidActivityConfigTests(SimpleTestCase):
    def section(self):
        cover = '/media/landing/blocks/1/00000000-0000-0000-0000-000000000001/' + 'a' * 64 + '.png'
        serializer = ActivityConfigSerializer(data={'tipo': 'taller', 'portada': cover, 'zona_horaria': 'America/Santiago', 'cupos': 5, 'venta': {}})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        return {'tipo': 'personalizada', 'visible': True, 'titulo': 'Taller', 'actividad': serializer.validated_data,
                'componentes': [{'tipo':'precio','visible':True,'importe':'25000'},
                                {'tipo':'fecha','visible':True,'fecha':'2030-11-28'},
                                {'tipo':'horario','visible':True,'inicio':'15:00','termino':'17:00'}]}

    def test_valid_config_and_time_boundary(self):
        section = self.section()
        validate_activity(section)
        details = paid_activity_details(section)
        self.assertEqual(details['precio'], 25000)
        self.assertEqual(details['cupos'], 5)
        self.assertEqual(details['cierre'], details['inicio'] - timedelta(hours=1))
        require_paid_activity_open(section, now=details['cierre'] - timedelta(seconds=1))
        with self.assertRaises(ValidationError):
            require_paid_activity_open(section, now=details['cierre'])

    def test_paid_and_free_are_exclusive(self):
        serializer = ActivityConfigSerializer(data={'tipo':'taller','gratuito':True,'venta':{}})
        self.assertFalse(serializer.is_valid())

    def test_invalid_price_capacity_schedule_and_hidden(self):
        for change in ('zero_price','missing_capacity','equal_hours','duplicate_price','hidden','cancelled'):
            with self.subTest(change=change):
                section = self.section()
                if change == 'zero_price': section['componentes'][0]['importe'] = '0'
                if change == 'missing_capacity': section['actividad']['cupos'] = None
                if change == 'equal_hours': section['componentes'][2]['termino'] = '15:00'
                if change == 'duplicate_price': section['componentes'].append(dict(section['componentes'][0]))
                if change == 'hidden': section['visible'] = False
                if change == 'cancelled': section['actividad']['estado'] = 'cancelada'
                with self.assertRaises(ValidationError):
                    require_paid_activity_open(section, now=datetime(2029,1,1,tzinfo=timezone.utc))

    def test_legacy_activity_has_no_paid_settings(self):
        serializer = ActivityConfigSerializer(data={'tipo':'servicio'})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertIsNone(serializer.validated_data.get('venta'))
