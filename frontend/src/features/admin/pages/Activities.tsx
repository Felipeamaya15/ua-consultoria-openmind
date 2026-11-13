import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminCard, Button, Icon, Input, Select, Tabs } from '../components/ui';
import { EmptyListState, ErrorState, LoadingState } from '../../../shared/components/states';
import { humanizeAdminError } from '../utils/humanizeError';
import {
  fetchActivityRequests,
  updateActivityState,
  updateActivityArchive,
  CONSULT_STATES,
  ENROLL_STATES,
  type ActivityRequest,
  type ActivityRequestKind,
  type ActivityRequestPage,
  type ActivityRequestState,
} from '../../landing/services/activityService';
import { formatBusinessDate } from '../services/businessTime';
import '../../landing/components/activities.css';

function getStatusBadge(record: ActivityRequest) {
  if (record.tipo === 'consulta') {
    switch (record.estado) {
      case 'nueva':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            <span className="activity-badge-dot is-new" />
            <span>Nueva consulta</span>
          </span>
        );
      case 'en_revision':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <span className="activity-badge-dot is-review" />
            <span>En revisión</span>
          </span>
        );
      case 'respondida':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="activity-badge-dot is-done" />
            <span>Respondida</span>
          </span>
        );
      case 'cerrada':
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            <span className="activity-badge-dot is-closed" />
            <span>Cerrada</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            <span>{CONSULT_STATES[record.estado as keyof typeof CONSULT_STATES] || record.estado}</span>
          </span>
        );
    }
  }

  switch (record.estado) {
    case 'pendiente':
      return (
        <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          <span className="activity-badge-dot is-review" />
          <span>Pendiente de confirmación</span>
        </span>
      );
    case 'confirmada':
      return (
        <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="activity-badge-dot is-done" />
          <span>Confirmada (Gratuita)</span>
        </span>
      );
    case 'cancelada':
      return (
        <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
          <span className="activity-badge-dot is-danger" />
          <span>Cancelada</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
          <span>{ENROLL_STATES[record.estado as keyof typeof ENROLL_STATES] || record.estado}</span>
        </span>
      );
  }
}

export default function Activities() {
  const [params, setParams] = useSearchParams();
  const kind: ActivityRequestKind = params.get('tipo') === 'inscripcion' ? 'inscripcion' : 'consulta';
  const state = params.get('estado') || '';
  const section = params.get('seccion') || '';
  const requestedPage = Number(params.get('pagina'));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const archived = kind === 'consulta' && params.get('archivada') === 'true';

  const [data, setData] = useState<ActivityRequestPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState('');
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);

  const changing = useRef(false);
  const revision = useRef(0);
  const alive = useRef(true);
  const states = kind === 'consulta' ? CONSULT_STATES : ENROLL_STATES;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const key = params.toString();
  useEffect(() => {
    const controller = new AbortController();
    const current = ++revision.current;
    setLoading(true);
    setError('');
    setData(null);

    const query = new URLSearchParams({ tipo: kind, pagina: String(page) });
    if (state) query.set('estado', state);
    if (section) query.set('seccion', section);
    // Las inscripciones siempre se consultan sin archivar.
    if (kind === 'consulta') query.set('archivada', String(archived));

    fetchActivityRequests(query, controller.signal)
      .then(result => {
        if (!controller.signal.aborted && revision.current === current) setData(result);
      })
      .catch(cause => {
        if (!controller.signal.aborted && revision.current === current) {
          setError(humanizeAdminError(cause instanceof Error ? cause.message : ''));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && revision.current === current) setLoading(false);
      });

    return () => controller.abort();
  }, [key, attempt]);

  function filter(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    next.delete('pagina');
    for (const [field, value] of Object.entries(patch)) {
      if (value) next.set(field, value);
      else next.delete(field);
    }
    setNotice('');
    setParams(next);
  }

  async function changeState(id: string, estado: ActivityRequestState) {
    if (changing.current) return;
    changing.current = true;
    setBusy(id);
    setError('');
    setNotice('');
    const current = revision.current;

    try {
      await updateActivityState(id, estado);
      if (alive.current && current === revision.current) {
        setAttempt(value => value + 1);
        const label = kind === 'consulta'
          ? (CONSULT_STATES[estado as keyof typeof CONSULT_STATES] || estado)
          : (ENROLL_STATES[estado as keyof typeof ENROLL_STATES] || estado);
        setNotice(`Estado actualizado correctamente a «${label}».`);
      }
    } catch (cause) {
      if (alive.current && current === revision.current) {
        setError(humanizeAdminError(cause instanceof Error ? cause.message : ''));
      }
    } finally {
      changing.current = false;
      if (alive.current) setBusy('');
    }
  }

  async function changeArchive(id: string, shouldArchive: boolean) {
    if (changing.current || kind !== 'consulta') return;
    changing.current = true;
    setBusy(id);
    setError('');
    setNotice('');
    const current = revision.current;

    try {
      await updateActivityArchive(id, shouldArchive);
      if (alive.current && current === revision.current) {
        if (page > 1 && data?.resultados.length === 1) {
          const next = new URLSearchParams(params);
          next.delete('pagina');
          setParams(next);
        } else {
          setAttempt(value => value + 1);
        }
        setNotice(shouldArchive
          ? 'Consulta archivada correctamente. Puedes encontrarla en la pestaña «Archivadas».'
          : 'Consulta devuelta a la bandeja de «Vigentes».');
      }
    } catch (cause) {
      if (alive.current && current === revision.current) {
        setError(humanizeAdminError(cause instanceof Error ? cause.message : ''));
      }
    } finally {
      changing.current = false;
      if (alive.current) setBusy('');
    }
  }

  return (
    <section aria-label="Servicios y talleres" className="space-y-6 max-w-6xl">
      {/* Encabezado principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">Servicios y talleres</h2>
          <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
            Bandeja de atención para consultas de clientes e inscripciones a talleres recibidas en tu tienda.
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold shadow-sm hover:opacity-95 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 shrink-0"
          to="/emprendedor/landing#secciones-tienda"
          title="Ir a Secciones de la tienda para crear o editar actividades"
        >
          <span>Gestionar actividades en Secciones</span>
          <Icon name="arrowUpRight" className="w-4 h-4" />
        </Link>
      </div>

      {/* Selector de tipo principal (Consultas vs Inscripciones) */}
      <div className="bg-white rounded-xl border border-[var(--border)] p-2 shadow-xs">
        <Tabs
          label="Solicitudes de actividades"
          tabs={[
            { id: 'consulta', label: 'Solicitudes de información' },
            { id: 'inscripcion', label: 'Inscripciones a talleres' },
          ]}
          active={kind}
          disabled={!!busy}
          onChange={tipo => filter({ tipo, estado: '', archivada: '' })}
        />
        <div className="px-2 pt-2 text-xs text-[var(--muted-foreground)]">
          {kind === 'consulta'
            ? 'Preguntas y dudas enviadas por clientes interesados en tus servicios o talleres.'
            : 'Participantes registrados en tus talleres y actividades grupales gratuitas.'}
        </div>
      </div>

      {/* Sub-pestañas para consultas (Vigentes vs Archivadas) */}
      {kind === 'consulta' && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mr-1">
            Bandeja:
          </span>
          <Button
            type="button"
            variant={!archived ? 'primary' : 'outline'}
            size="sm"
            disabled={!!busy}
            onClick={() => filter({ archivada: '' })}
            className={`text-xs px-3.5 py-1.5 rounded-full ${!archived ? 'bg-[var(--primary)] text-white' : ''}`}
            title="Consultas activas que requieren atención o seguimiento"
          >
            Vigentes (por atender)
          </Button>
          <Button
            type="button"
            variant={archived ? 'primary' : 'outline'}
            size="sm"
            disabled={!!busy}
            onClick={() => filter({ archivada: 'true' })}
            className={`text-xs px-3.5 py-1.5 rounded-full ${archived ? 'bg-[var(--primary)] text-white' : ''}`}
            title="Historial de consultas ya resueltas o archivadas"
          >
            Archivadas (historial)
          </Button>
        </div>
      )}

      {/* Barra de filtros amigable y limpia */}
      <div className="bg-white border border-[var(--border)] rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="w-full sm:w-80">
            <Select
              label="Filtrar por estado de atención"
              value={state}
              disabled={!!busy}
              options={[
                { value: '', label: kind === 'consulta' ? 'Todas las consultas' : 'Todas las inscripciones' },
                ...Object.entries(states).map(([value, label]) => ({ value, label })),
              ]}
              onChange={event => filter({ estado: event.target.value })}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || !!busy}
              onClick={() => {
                setNotice('');
                setAttempt(value => value + 1);
              }}
              className="flex items-center gap-1.5 text-xs text-[var(--foreground)]"
              title="Volver a cargar las solicitudes más recientes"
            >
              <Icon name="refresh" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar listado</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvancedFilter(v => !v)}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <span>{showAdvancedFilter ? 'Ocultar búsqueda por código' : 'Buscar por código de actividad'}</span>
            </Button>
          </div>
        </div>

        {/* Banner de filtro activo por actividad específica */}
        {section && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50/80 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-900 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-indigo-950">Filtro activo por actividad:</span>
              <span className="text-indigo-800">Mostrando únicamente las solicitudes de la actividad seleccionada.</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => filter({ seccion: '' })}
              className="bg-white border-indigo-300 text-indigo-900 hover:bg-indigo-100 text-xs px-2.5 py-1"
            >
              Mostrar todas las actividades
            </Button>
          </div>
        )}

        {/* Búsqueda por código de actividad */}
        {showAdvancedFilter && (
          <div className="pt-2 border-t border-[var(--border)] animate-fadeIn">
            <div className="max-w-md">
              <Input
                label="Código identificador de la actividad (ID)"
                placeholder="Ej. 81386c65-c014-4bda-9e4c..."
                value={section}
                maxLength={36}
                disabled={!!busy}
                onChange={event => filter({ seccion: event.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Banner informativo de privacidad y condiciones */}
      <div className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
        <Icon name="shield" className="w-4 h-4 mt-0.5 text-[var(--primary)] shrink-0" />
        <div>
          <span className="font-semibold text-slate-800">Uso seguro de datos: </span>
          <span>
            Los datos de contacto se reciben con consentimiento informado para coordinar la actividad. Las inscripciones son gratuitas y no registran cobros en la tienda.
          </span>
        </div>
      </div>

      {/* Mensajes de aviso, carga y error */}
      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center justify-between gap-2 shadow-2xs" role="status">
          <div className="flex items-center gap-2">
            <Icon name="check" className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="text-emerald-700 hover:text-emerald-950 text-xs font-semibold px-2 py-1 flex items-center"
            aria-label="Cerrar aviso"
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      )}

      {loading && <LoadingState>Cargando solicitudes…</LoadingState>}

      {error && (
        <ErrorState onRetry={() => setAttempt(value => value + 1)}>
          {humanizeAdminError(error)}
        </ErrorState>
      )}

      {/* Lista de solicitudes / inscripciones */}
      {data && !loading && (
        <>
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] px-1">
            <span>
              Total registrado:{' '}
              <strong className="text-[var(--foreground)] font-semibold">{data.total}</strong>{' '}
              {kind === 'consulta'
                ? (archived ? 'consultas archivadas' : 'consultas vigentes')
                : 'inscripciones registradas'}
            </span>
            <span>Página {data.pagina} de {data.paginas}</span>
          </div>

          {!data.resultados.length ? (
            <EmptyListState>
              <div className="text-center py-6 space-y-3">
                <p className="font-semibold text-slate-700 text-base">
                  {kind === 'consulta' && archived
                    ? 'No hay consultas archivadas con estos filtros.'
                    : 'No se encontraron solicitudes con los filtros seleccionados.'}
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Cuando los visitantes de tu tienda soliciten información o se inscriban a tus talleres, aparecerán listados aquí.
                </p>
                <div className="pt-2">
                  <Link
                    to="/emprendedor/landing#secciones-tienda"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--primary)] bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    <span>Ver mis actividades en Secciones</span>
                    <Icon name="arrowUpRight" className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </EmptyListState>
          ) : (
            <div className="activity-management-list">
              {data.resultados.map(record => {
                const isBusy = busy === record.id;
                const isCurrentSectionFiltered = section === record.seccion_id;

                return (
                  <AdminCard key={record.id} className="relative overflow-hidden transition-all hover:shadow-sm">
                    <article className="space-y-4">
                      {/* Cabecera de la tarjeta */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-[var(--border)]">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${
                                record.tipo_actividad === 'taller'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-teal-100 text-teal-800'
                              }`}
                            >
                              {record.tipo_actividad === 'taller' ? 'Taller' : 'Servicio'}
                            </span>
                            <h3 className="font-bold text-base text-[var(--foreground)] leading-snug">
                              {record.titulo_actividad}
                            </h3>
                          </div>
                          <p className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5 pt-0.5">
                            <Icon name="clock" className="w-3.5 h-3.5 shrink-0 text-[var(--muted-foreground)]" />
                            <span>Recibida el {formatBusinessDate(record.creado)}</span>
                          </p>
                        </div>

                        {/* Badge de estado de atención */}
                        <div className="flex items-center gap-2 shrink-0">
                          {getStatusBadge(record)}
                        </div>
                      </div>

                      {/* Datos del contacto / participante */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50/70 rounded-lg text-sm border border-slate-200">
                        <div className="space-y-1">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Participante / Contacto
                          </span>
                          <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <Icon name="user" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{record.nombre} {record.apellido}</span>
                          </p>
                        </div>

                        <div className="space-y-1">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Canales de comunicación
                          </span>
                          <div className="flex flex-col gap-1 text-xs">
                            <a
                              href={`mailto:${record.email}?subject=${encodeURIComponent(
                                kind === 'consulta'
                                  ? `Re: Consulta sobre ${record.titulo_actividad}`
                                  : `Confirmación de inscripción: ${record.titulo_actividad}`
                              )}`}
                              className="text-[var(--primary)] hover:underline font-medium inline-flex items-center gap-1.5 break-all"
                              title="Abrir tu aplicación de correo para escribirle"
                            >
                              <Icon name="mail" className="w-3.5 h-3.5 shrink-0" />
                              <span>{record.email}</span>
                            </a>
                            {record.telefono && (
                              <a
                                href={`tel:${record.telefono.replace(/\s+/g, '')}`}
                                className="text-slate-800 hover:underline inline-flex items-center gap-1.5"
                                title="Llamar al número telefónico"
                              >
                                <Icon name="phone" className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                <span>{record.telefono}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Mensaje de consulta / notas */}
                      {record.mensaje && (
                        <div className="activity-message-bubble text-sm space-y-1">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                            {record.tipo === 'consulta' ? 'Mensaje o duda del interesado:' : 'Comentarios de la inscripción:'}
                          </span>
                          <p className="text-slate-800 leading-relaxed whitespace-pre-wrap text-xs sm:text-sm">
                            {record.mensaje}
                          </p>
                        </div>
                      )}

                      {/* Barra de Acciones y Gestión de Estado */}
                      <div className="pt-2 border-t border-[var(--border)] flex flex-col md:flex-row md:items-center justify-between gap-3">
                        {/* Botones de acción rápida e intuitivos */}
                        <div className="flex flex-wrap items-center gap-2">
                          {record.tipo === 'consulta' ? (
                            <>
                              {record.estado !== 'respondida' && record.estado !== 'cerrada' && (
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void changeState(record.id, 'respondida')}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3 py-1.5 flex items-center gap-1.5 shadow-xs"
                                  title="Marcar como atendida una vez que te hayas comunicado con el interesado"
                                >
                                  <Icon name="check" className="w-3.5 h-3.5" />
                                  <span>Marcar como Respondida</span>
                                </Button>
                              )}
                              {record.estado === 'nueva' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void changeState(record.id, 'en_revision')}
                                  className="text-xs px-2.5 py-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
                                  title="Marcar para seguimiento antes de enviar la respuesta final"
                                >
                                  <span>Poner En revisión</span>
                                </Button>
                              )}
                              {record.estado === 'respondida' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void changeState(record.id, 'cerrada')}
                                  className="text-xs px-3 py-1.5 flex items-center gap-1 text-slate-700 border-slate-300 hover:bg-slate-50"
                                  title="Concluir el proceso de atención de esta consulta"
                                >
                                  <span>Cerrar consulta</span>
                                </Button>
                              )}
                              {record.estado === 'cerrada' && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void changeState(record.id, 'nueva')}
                                  className="text-xs px-3 py-1.5 flex items-center gap-1 text-slate-600 hover:text-slate-900"
                                  title="Reactivar esta consulta en caso de nuevas preguntas"
                                >
                                  <span>Reabrir consulta</span>
                                </Button>
                              )}
                              <a
                                href={`mailto:${record.email}?subject=${encodeURIComponent(
                                  `Re: Consulta sobre ${record.titulo_actividad}`
                                )}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white hover:bg-[var(--muted)] text-xs font-medium text-[var(--foreground)] transition-colors shadow-2xs"
                                title="Abrir tu aplicación de correo electrónico para responder al interesado"
                              >
                                <Icon name="mail" className="w-3.5 h-3.5 text-[var(--primary)]" />
                                <span>Responder por correo</span>
                              </a>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => void changeArchive(record.id, !record.archivada)}
                                className="text-xs px-2.5 py-1.5 flex items-center gap-1 text-slate-500 hover:text-slate-800"
                                title={record.archivada ? 'Devolver consulta a la bandeja de vigentes' : 'Archivar para consultar en el historial'}
                              >
                                <span>{record.archivada ? 'Desarchivar' : 'Archivar'}</span>
                              </Button>
                            </>
                          ) : (
                            <>
                              {record.estado === 'pendiente' && (
                                <>
                                  <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    disabled={isBusy}
                                    onClick={() => void changeState(record.id, 'confirmada')}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3.5 py-1.5 flex items-center gap-1.5 shadow-xs"
                                    title="Aceptar la inscripción del participante y asegurar su cupo gratuito"
                                  >
                                    <Icon name="checkCircle" className="w-4 h-4" />
                                    <span>Confirmar inscripción</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={isBusy}
                                    onClick={() => void changeState(record.id, 'cancelada')}
                                    className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs px-3 py-1.5 flex items-center gap-1"
                                    title="Rechazar o cancelar esta solicitud"
                                  >
                                    <span>Cancelar inscripción</span>
                                  </Button>
                                </>
                              )}
                              {record.estado === 'confirmada' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void changeState(record.id, 'cancelada')}
                                  className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs px-3 py-1.5 flex items-center gap-1"
                                  title="Cancelar la inscripción previamente confirmada"
                                >
                                  <span>Cancelar inscripción</span>
                                </Button>
                              )}
                              {record.estado === 'cancelada' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void changeState(record.id, 'confirmada')}
                                  className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-xs px-3 py-1.5 flex items-center gap-1"
                                  title="Reactivar el cupo e inscripción del participante"
                                >
                                  <span>Reactivar inscripción</span>
                                </Button>
                              )}
                              <a
                                href={`mailto:${record.email}?subject=${encodeURIComponent(
                                  `Inscripción a ${record.titulo_actividad}`
                                )}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white hover:bg-[var(--muted)] text-xs font-medium text-[var(--foreground)] transition-colors shadow-2xs"
                                title="Escribir un correo electrónico al participante para enviar detalles del taller"
                              >
                                <Icon name="mail" className="w-3.5 h-3.5 text-[var(--primary)]" />
                                <span>Escribir al participante</span>
                              </a>
                            </>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => filter({ seccion: isCurrentSectionFiltered ? '' : record.seccion_id })}
                            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                            title={isCurrentSectionFiltered ? 'Quitar filtro de actividad y ver todas' : 'Ver solo solicitudes recibidas de esta actividad'}
                          >
                            <span>{isCurrentSectionFiltered ? 'Ver todas las actividades' : 'Filtrar esta actividad'}</span>
                          </Button>
                        </div>

                        {/* Dropdown de cambio de estado completo */}
                        <div className="flex items-center gap-2 text-xs shrink-0 md:ml-auto">
                          {isBusy && <span className="text-[var(--primary)] font-medium animate-pulse">Guardando…</span>}
                          <div className="w-48">
                            <Select
                              label="Cambiar estado manualmente"
                              value={record.estado}
                              disabled={isBusy}
                              options={Object.entries(
                                record.tipo === 'consulta' ? CONSULT_STATES : ENROLL_STATES
                              ).map(([value, label]) => ({ value, label }))}
                              onChange={event => void changeState(
                                record.id,
                                event.target.value as ActivityRequestState
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    </article>
                  </AdminCard>
                );
              })}
            </div>
          )}

          {/* Paginación */}
          <nav aria-label="Paginación de solicitudes" className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border)]">
            <span className="text-xs text-[var(--muted-foreground)]">
              Página <strong className="text-[var(--foreground)] font-semibold">{data.pagina}</strong> de{' '}
              <strong className="text-[var(--foreground)] font-semibold">{data.paginas}</strong> ({data.total} solicitudes en total)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || !!busy}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('pagina', String(page - 1));
                  setNotice('');
                  setParams(next);
                }}
              >
                ← Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= data.paginas || !!busy}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('pagina', String(page + 1));
                  setNotice('');
                  setParams(next);
                }}
              >
                Siguiente →
              </Button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
